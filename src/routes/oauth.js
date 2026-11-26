'use strict';

/**
 * "Continue with Google / Apple" for business owners (see src/services/oauth.js).
 *
 *   GET  /api/oauth/:provider/start?client=web            website: a cookie ties the sign-in to this browser
 *   GET  /api/oauth/:provider/start?client=app&challenge=  BQuee Biz app (PKCE: SHA-256 of its verifier)
 *   GET  /api/oauth/google/callback   POST /api/oauth/apple/callback   (from Google / Apple)
 *        → website: /login?social=<ticket>     app: bqueebiz://oauth?ticket=<ticket>
 *   POST /api/oauth/exchange { ticket, verifier? }  → a session / two-step step, or { signup: details }
 */

const crypto = require('crypto');
const { badRequest } = require('../http/errors');
const { parseCookies, cookie, addCookies } = require('../http/cookies');

const COOKIE = 'bq_oauth';

module.exports = function oauthRoutes(router, { auth, oauth, limiter }) {
  const isSecure = (req) => !!(req.socket && req.socket.encrypted) || process.env.NODE_ENV === 'production';
  const redirect = (res, location) => {
    res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
    res.end();
  };
  const back = (client, params) =>
    client === 'app' ? `${oauth.APP_RETURN}?${new URLSearchParams(params)}` : `/login?${new URLSearchParams(params)}`;

  router.get('/api/oauth/:provider/start', async ({ req, res, params, query, ip }) => {
    await limiter.check('oauth', ip, 60, 10 * 60_000);
    const client = query.client === 'app' ? 'app' : 'web';
    let binding;
    if (client === 'app') {
      binding = String(query.challenge || '');
      if (!/^[A-Za-z0-9_-]{43}$/.test(binding)) throw badRequest('Update the BQuee Biz app and try again.');
    } else {
      binding = crypto.randomBytes(24).toString('base64url');
      addCookies(res, [cookie(COOKIE, binding, { maxAge: 15 * 60, secure: isSecure(req) })]);
    }
    try {
      redirect(res, await oauth.start(params.provider, { client, binding }, req));
    } catch (err) {
      redirect(res, back(client, { social_error: err.message }));
    }
  });

  const callback = async ({ req, res, params, query, body }) => {
    const answer = { ...query, ...body };
    let client = 'web';
    try {
      const r = await oauth.callback(
        params.provider,
        { code: answer.code, state: answer.state, user: answer.user, error: answer.error },
        req,
      );
      client = r.client;
      redirect(res, back(client, { social: r.ticket }));
    } catch (err) {
      if (err.client) client = err.client;
      redirect(
        res,
        back(client, {
          social_error:
            answer.error === 'access_denied' || answer.error === 'user_cancelled_authorize'
              ? 'Sign-in was cancelled.'
              : err.message,
        }),
      );
    }
  };
  router.get('/api/oauth/:provider/callback', callback);
  router.post('/api/oauth/:provider/callback', callback);

  /** The website or app picks up its ticket: signed in, a two-step code, or details for signing up. */
  router.post('/api/oauth/exchange', async ({ req, res, body, ip }) => {
    await limiter.check('oauth', ip, 60, 10 * 60_000);
    const binding = body.verifier ? oauth.pkce(body.verifier) : parseCookies(req)[COOKIE];
    const t = await oauth.ticket(body.ticket, binding);
    if (t.kind === 'signup')
      return { signup: { ticket: String(body.ticket), provider: t.provider, email: t.email, name: t.name } };
    await oauth.ticket(body.ticket, binding, { use: true });
    addCookies(res, [cookie(COOKIE, '', { maxAge: 0, secure: isSecure(req) })]);
    return auth.loginLinked(t.user_id, req, res);
  });
};
