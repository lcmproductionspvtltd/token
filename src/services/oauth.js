'use strict';

/**
 * "Continue with Google" / "Continue with Apple" for business owners – written with Node's own
 * crypto, no packages.
 *
 *   1. start     the browser (or the BQuee Biz app, through the phone's browser) goes to Google/Apple
 *                with a random `state` and `nonce`; the state is remembered for 10 minutes, tied to a
 *                cookie in that browser (web) or to the app's secret verifier (PKCE).
 *   2. callback  Google/Apple sends the person back with a one-time code; the server swaps it for a
 *                signed ID token, checks the signature against the provider's published keys, the
 *                issuer, the audience (our client id), the expiry and the nonce, and reads the
 *                verified email and the provider's fixed id for the person.
 *   3. ticket    a one-time ticket (15 minutes) says what happens next: sign in to the linked owner
 *                account, or sign up a new business with that name and email. Only the same browser
 *                (cookie) or app (verifier) can use it.
 *
 * An owner account is found by its linked Google/Apple id, else by the same verified email (and then
 * linked). Staff, the BQuee team and the super admin keep signing in with their password.
 *
 * Settings (all optional – a button only shows when its provider is set up):
 *   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET            Google Cloud → APIs & Services → Credentials (Web)
 *   APPLE_SERVICES_ID, APPLE_TEAM_ID, APPLE_KEY_ID,   Apple Developer → Identifiers (Services ID) and
 *   APPLE_PRIVATE_KEY                                  Keys (Sign in with Apple, the .p8 file's text)
 * Return addresses to register: <PUBLIC_URL>/api/oauth/google/callback and …/apple/callback.
 */

const crypto = require('crypto');
const { badRequest, forbidden, unauthorized } = require('../http/errors');

const PROVIDERS = {
  google: {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    scope: 'openid email profile',
  },
  apple: {
    auth: 'https://appleid.apple.com/auth/authorize',
    token: 'https://appleid.apple.com/auth/token',
    jwks: 'https://appleid.apple.com/auth/keys',
    issuers: ['https://appleid.apple.com'],
    scope: 'name email',
  },
};
const STATE_MINUTES = 10;
const TICKET_MINUTES = 15;
const APP_RETURN = 'bqueebiz://oauth'; // the BQuee Biz app opens on this address

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
/** PKCE: the app sends SHA-256(verifier) when starting and the verifier itself when picking up. */
const pkce = (verifier) => b64url(crypto.createHash('sha256').update(String(verifier)).digest());

function decodePart(part) {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch (err) {
    return null;
  }
}

function createOAuth(db, config, { fetchFn = fetch, log = console } = {}) {
  const settings = config.oauth || {};
  // Tests point the providers at a local stand-in (never in production).
  const fake = !config.production && settings.fakeBase;
  const endpoints = (p) =>
    fake
      ? {
          ...PROVIDERS[p],
          auth: `${fake}/${p}/auth`,
          token: `${fake}/${p}/token`,
          jwks: `${fake}/${p}/jwks`,
          issuers: [`${fake}/${p}`],
        }
      : PROVIDERS[p];
  const clientId = (p) => (p === 'google' ? settings.google.clientId : settings.apple.servicesId);

  function enabled() {
    const g = settings.google || {};
    const a = settings.apple || {};
    return {
      google: !!(g.clientId && g.clientSecret),
      apple: !!(a.servicesId && a.teamId && a.keyId && a.privateKey),
    };
  }
  function need(provider) {
    if (!PROVIDERS[provider]) throw badRequest('Unknown sign-in provider');
    if (!enabled()[provider])
      throw badRequest(`Sign in with ${provider === 'google' ? 'Google' : 'Apple'} isn’t set up on this server yet.`);
  }
  const callbackUrl = (provider, req) => {
    const base =
      config.publicUrl ||
      `${req.socket && req.socket.encrypted ? 'https' : 'http'}://${String(req.headers.host || 'localhost')}`;
    return `${base}/api/oauth/${provider}/callback`;
  };

  /** Apple wants a short JWT signed with the .p8 key (ES256) as its client secret. */
  function appleClientSecret() {
    const a = settings.apple;
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'ES256', kid: a.keyId }));
    const body = b64url(
      JSON.stringify({ iss: a.teamId, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: a.servicesId }),
    );
    const key = crypto.createPrivateKey(String(a.privateKey).replace(/\\n/g, '\n'));
    const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' });
    return `${head}.${body}.${b64url(sig)}`;
  }

  // The providers' public keys, kept for an hour (fetched again when a new key id appears).
  const keyCache = new Map(); // provider → { at, keys }
  async function keysFor(provider, kid) {
    const cached = keyCache.get(provider);
    if (cached && Date.now() - cached.at < 3600_000 && cached.keys.some((k) => k.kid === kid)) return cached.keys;
    const res = await fetchFn(endpoints(provider).jwks, { signal: AbortSignal.timeout(10_000) });
    const body = await res.json();
    const keys = Array.isArray(body && body.keys) ? body.keys : [];
    keyCache.set(provider, { at: Date.now(), keys });
    return keys;
  }

  /** Checks a provider's signed ID token; returns its claims. */
  async function verifyIdToken(provider, idToken, nonce) {
    const parts = String(idToken || '').split('.');
    if (parts.length !== 3) throw unauthorized('The sign-in answer was not valid. Please try again.');
    const head = decodePart(parts[0]);
    const claims = decodePart(parts[1]);
    if (!head || !claims || head.alg !== 'RS256')
      throw unauthorized('The sign-in answer was not valid. Please try again.');
    const jwk = (await keysFor(provider, head.kid)).find((k) => k.kid === head.kid && k.kty === 'RSA');
    if (!jwk) throw unauthorized('The sign-in answer was signed with an unknown key. Please try again.');
    const ok = crypto.verify(
      'RSA-SHA256',
      Buffer.from(`${parts[0]}.${parts[1]}`),
      crypto.createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(parts[2], 'base64url'),
    );
    const now = Math.floor(Date.now() / 1000);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (
      !ok ||
      !endpoints(provider).issuers.includes(claims.iss) ||
      !aud.includes(clientId(provider)) ||
      !(claims.exp > now - 60) ||
      claims.nonce !== nonce ||
      !claims.sub
    )
      throw unauthorized('The sign-in answer could not be checked. Please try again.');
    return claims;
  }

  const api = {
    enabled,
    pkce,
    APP_RETURN,

    /**
     * Where to send the person: the provider's sign-in page. `binding` = the browser's cookie value (web)
     * or SHA-256 of the app's verifier (app, PKCE).
     */
    async start(provider, { client, binding }, req) {
      need(provider);
      const state = randomToken();
      const nonce = randomToken();
      await db.query('DELETE FROM oauth_states WHERE expires_at < now()');
      await db.query(
        `INSERT INTO oauth_states (id, provider, client, nonce, binding, expires_at)
         VALUES ($1, $2, $3, $4, $5, now() + make_interval(mins => $6))`,
        [sha256(state), provider, client, nonce, sha256(binding), STATE_MINUTES],
      );
      const q = new URLSearchParams({
        client_id: clientId(provider),
        redirect_uri: callbackUrl(provider, req),
        response_type: 'code',
        scope: endpoints(provider).scope,
        state,
        nonce,
      });
      if (provider === 'google') q.set('prompt', 'select_account');
      if (provider === 'apple') q.set('response_mode', 'form_post'); // Apple sends name/email only this way
      return `${endpoints(provider).auth}?${q}`;
    },

    /** The person is back: check everything, then make the one-time ticket. Returns { ticket, client }. */
    async callback(provider, { code, state, user }, req) {
      need(provider);
      const {
        rows: [st],
      } = await db.query('DELETE FROM oauth_states WHERE id = $1 AND provider = $2 RETURNING *', [
        sha256(String(state || '')),
        provider,
      ]);
      if (!st || new Date(st.expires_at) < new Date())
        throw unauthorized('This sign-in took too long or was already used. Please start again.');
      try {
        return await finish(provider, st, { code, user }, req);
      } catch (err) {
        err.client = st.client; // so the person is sent back to the app or website they came from
        throw err;
      }
    },
  };

  async function finish(provider, st, { code, user }, req) {
    {
      if (!code) throw unauthorized('Sign-in was cancelled.');

      const form = new URLSearchParams({
        client_id: clientId(provider),
        client_secret: provider === 'google' ? settings.google.clientSecret : appleClientSecret(),
        code: String(code),
        grant_type: 'authorization_code',
        redirect_uri: callbackUrl(provider, req),
      });
      let answer;
      try {
        const res = await fetchFn(endpoints(provider).token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: form.toString(),
          signal: AbortSignal.timeout(10_000),
        });
        answer = await res.json();
      } catch (err) {
        log.error(JSON.stringify({ alert: 'oauth_token_failed', provider, error: String(err.message).slice(0, 120) }));
        throw unauthorized(`Couldn’t reach ${provider === 'google' ? 'Google' : 'Apple'}. Please try again.`);
      }
      if (!answer || !answer.id_token) throw unauthorized('Sign-in was refused. Please try again.');
      const claims = await verifyIdToken(provider, answer.id_token, st.nonce);

      const email = String(claims.email || '')
        .trim()
        .toLowerCase();
      const verified = claims.email_verified === true || claims.email_verified === 'true';
      // Apple sends the name only the very first time, outside the token.
      let name = String(claims.name || '').trim();
      if (!name && user) {
        let u = user;
        try {
          if (typeof u === 'string') u = JSON.parse(u);
        } catch (err) {
          u = null;
        }
        if (u && u.name) name = [u.name.firstName, u.name.lastName].filter(Boolean).join(' ');
      }

      // Which BQuee account? Linked id first, then the same verified email (an owner only).
      let {
        rows: [account],
      } = await db.query(
        `SELECT u.id, u.role FROM user_identities i JOIN users u ON u.id = i.user_id WHERE i.provider = $1 AND i.subject = $2`,
        [provider, claims.sub],
      );
      if (!account && email && verified) {
        ({
          rows: [account],
        } = await db.query('SELECT id, role FROM users WHERE lower(email) = $1', [email]));
        if (account && account.role === 'owner')
          await db.query(
            `INSERT INTO user_identities (provider, subject, user_id, email) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
            [provider, claims.sub, account.id, email],
          );
      }
      if (account && account.role !== 'owner')
        throw forbidden(
          'This email belongs to a staff or BQuee team account. Sign in with your username and password.',
        );
      if (!account && !(email && verified))
        throw unauthorized('Your Google/Apple account didn’t share a verified email, so we can’t sign you up with it.');

      const ticket = randomToken();
      await db.query('DELETE FROM oauth_tickets WHERE expires_at < now()');
      await db.query(
        `INSERT INTO oauth_tickets (id, kind, provider, subject, email, name, user_id, client, binding, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + make_interval(mins => $10))`,
        [
          sha256(ticket),
          account ? 'login' : 'signup',
          provider,
          claims.sub,
          email,
          name.slice(0, 80),
          account ? account.id : null,
          st.client,
          st.binding,
          TICKET_MINUTES,
        ],
      );
      return { ticket, client: st.client };
    }
  }

  return {
    ...api,

    /**
     * Reads a ticket for the browser/app that started the sign-in (`binding` = cookie or verifier hash).
     * `use: true` spends it.
     */
    async ticket(ticket, binding, { use = false } = {}) {
      const q = use
        ? 'DELETE FROM oauth_tickets WHERE id = $1 AND binding = $2 AND expires_at > now() RETURNING *'
        : 'SELECT * FROM oauth_tickets WHERE id = $1 AND binding = $2 AND expires_at > now()';
      const {
        rows: [t],
      } = await db.query(q, [sha256(String(ticket || '')), sha256(String(binding || ''))]);
      if (!t) throw unauthorized('This Google/Apple sign-in has expired. Please start again.');
      return t;
    },

    /** After a sign-up with a ticket: the new owner is linked to that Google/Apple account. */
    async link(t, userId) {
      await db.query(
        `INSERT INTO user_identities (provider, subject, user_id, email) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [t.provider, t.subject, userId, t.email],
      );
    },
  };
}

module.exports = { createOAuth, pkce, sha256 };
