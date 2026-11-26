'use strict';

/**
 * Sends plain-text emails (sign-up codes, "forgot password" codes) through BQuee's own mailbox over
 * SMTP – no outside email service and no package: Node's own `net`/`tls`.
 *
 *   SMTP_HOST=smtp.hostinger.com  SMTP_PORT=465  SMTP_USER=info@bquee.com  SMTP_PASSWORD=…
 *
 * The connection is always encrypted and the server's certificate is checked (port 465: from the start;
 * 587: STARTTLS, refused if the server doesn't offer it). SMTP_SECURITY=none is accepted only for a
 * test server on this machine. Addresses and subjects are checked for line breaks, so a visitor can
 * never add headers or recipients.
 *
 * Without SMTP_HOST (development, tests) each email is appended to MAIL_LOG_FILE as one JSON line, or
 * printed to the log, so the code can still be read. In production that fallback is off: `ready` is
 * false and the routes say email isn't set up.
 */

const net = require('net');
const tls = require('tls');
const fs = require('fs');
const crypto = require('crypto');
const os = require('os');

const TIMEOUT_MS = 15_000;
const LOCAL = ['localhost', '127.0.0.1', '::1'];
const ADDRESS = /^[^\s<>()"',;:\\@]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
/** Subject in UTF-8 that any mail program shows correctly (RFC 2047). */
const header = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap = (s) => s.replace(/.{1,76}/g, '$&\r\n');

function assertAddress(a) {
  if (typeof a !== 'string' || !ADDRESS.test(a) || /[\r\n]/.test(a)) throw new Error('Bad email address');
  return a;
}

/** The whole message, ready for DATA (the body is base64, so no line can be a lone "."). */
function buildMessage({ from, fromName, to, subject, text }) {
  const domain = from.split('@')[1];
  const lines = [
    `From: ${fromName ? `${header(fromName)} ` : ''}<${from}>`,
    `To: <${to}>`,
    `Subject: ${header(String(subject).replace(/[\r\n]+/g, ' '))}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomBytes(12).toString('hex')}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap(b64(String(text).replace(/\r?\n/g, '\r\n'))),
  ];
  return lines.join('\r\n');
}

/** One SMTP conversation: reads whole (multi-line) replies and checks their code. */
function conversation(socket) {
  let buffer = '';
  let waiting = null;
  let failure = null;
  const take = () => {
    // A reply ends with a line "NNN text" (a space after the code, not a dash).
    const m = buffer.match(/^(?:\d{3}-[^\n]*\n)*(\d{3})(?: [^\n]*)?\r?\n/);
    if (!m || !waiting) return;
    buffer = buffer.slice(m[0].length);
    const w = waiting;
    waiting = null;
    w.resolve({ code: Number(m[1]), text: m[0] });
  };
  const attach = (s) => {
    s.setEncoding('utf8');
    s.on('data', (d) => {
      buffer += d;
      take();
    });
    s.on('error', (err) => fail(err));
    s.on('close', () => fail(new Error('The mail server closed the connection')));
  };
  const fail = (err) => {
    failure = failure || err;
    if (waiting) {
      const w = waiting;
      waiting = null;
      w.reject(failure);
    }
  };
  attach(socket);
  return {
    attach,
    reply(expect) {
      return new Promise((resolve, reject) => {
        if (failure) return reject(failure);
        waiting = { resolve, reject };
        take();
      }).then((r) => {
        if (!expect.includes(r.code))
          throw new Error(`Mail server said ${r.code}: ${r.text.trim().split('\n').pop().slice(0, 200)}`);
        return r;
      });
    },
  };
}

function createMailer(mail, log = console) {
  const configured = !mail.off && !!mail.host;
  const ready = !mail.off && (configured || !!mail.logFile || process.env.NODE_ENV !== 'production');

  async function sendSmtp(message, to) {
    const { host, port, user, password, security } = mail;
    if (security === 'none' && !LOCAL.includes(host)) throw new Error('SMTP without encryption is only for tests');
    const from = assertAddress(mail.from);
    let socket =
      security === 'tls'
        ? tls.connect({ host, port, servername: host, rejectUnauthorized: true })
        : net.connect({ host, port });
    socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('The mail server did not answer in time')));
    const c = conversation(socket);
    const send = (line, expect) => {
      socket.write(line + '\r\n');
      return c.reply(expect);
    };
    try {
      await c.reply([220]);
      const name = os.hostname().replace(/[^A-Za-z0-9.-]/g, '') || 'bquee';
      let hello = await send(`EHLO ${name}`, [250]);
      if (security === 'starttls') {
        if (!/STARTTLS/i.test(hello.text)) throw new Error('The mail server does not offer encryption (STARTTLS)');
        await send('STARTTLS', [220]);
        socket.removeAllListeners('data');
        socket.removeAllListeners('close');
        socket.removeAllListeners('error');
        socket = tls.connect({ socket, servername: host, rejectUnauthorized: true });
        socket.setTimeout(TIMEOUT_MS, () => socket.destroy(new Error('The mail server did not answer in time')));
        c.attach(socket);
        await new Promise((resolve, reject) => {
          socket.once('secureConnect', resolve);
          socket.once('error', reject);
        });
        hello = await send(`EHLO ${name}`, [250]);
      }
      if (user) await send(`AUTH PLAIN ${b64(`\0${user}\0${password}`)}`, [235]);
      await send(`MAIL FROM:<${from}>`, [250]);
      await send(`RCPT TO:<${to}>`, [250, 251]);
      await send('DATA', [354]);
      await send(message + '\r\n.', [250]);
      await send('QUIT', [221]).catch(() => {});
    } finally {
      socket.destroy();
    }
  }

  return {
    /** True when emails can go out (always in development and tests, where they go to a file/the log). */
    ready,
    configured,

    /** Sends one email. Throws when it could not be handed to the mail server. */
    async send({ to, subject, text }) {
      assertAddress(to);
      if (!configured) {
        if (!ready) throw new Error('Email is not set up on this server');
        const line = JSON.stringify({ to, subject, text, at: new Date().toISOString() });
        if (mail.logFile) fs.appendFileSync(mail.logFile, line + '\n');
        else log.warn('[email not sent – no SMTP_HOST]', line);
        return;
      }
      const message = buildMessage({ from: mail.from, fromName: 'BQuee', to, subject, text });
      try {
        await sendSmtp(message, to);
      } catch (err) {
        log.error(JSON.stringify({ alert: 'email_failed', error: String(err.message).slice(0, 200) }));
        throw err;
      }
    },
  };
}

module.exports = { createMailer, buildMessage, assertAddress };
