'use strict';

/**
 * src/services/mailer.js against a stand-in mail server on this machine (plain connection, which the
 * mailer allows only for localhost): the SMTP conversation, sign-in, the message itself, and refusals
 * (line breaks in addresses, unencrypted connections to other hosts, no email set up in production).
 */

const net = require('net');
const { createMailer, buildMessage, assertAddress } = require('../src/services/mailer');

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) passed++;
  else failures.push(name + (detail ? ` – ${detail}` : ''));
  console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : ' – ' + detail}`);
}

/** A tiny SMTP server that records what it is told. `rejectRcpt` answers 550 to RCPT. */
function fakeSmtp({ rejectRcpt = false } = {}) {
  const seen = [];
  const server = net.createServer((sock) => {
    const conv = { lines: [], data: '' };
    seen.push(conv);
    let inData = false;
    let buf = '';
    sock.write('220 test ESMTP ready\r\n');
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            sock.write('250 queued\r\n');
          } else conv.data += line + '\r\n';
          continue;
        }
        conv.lines.push(line);
        if (/^EHLO/i.test(line)) sock.write('250-test\r\n250-AUTH PLAIN LOGIN\r\n250 SIZE 1000000\r\n');
        else if (/^AUTH PLAIN/i.test(line)) sock.write('235 ok\r\n');
        else if (/^MAIL FROM/i.test(line)) sock.write('250 ok\r\n');
        else if (/^RCPT TO/i.test(line)) sock.write(rejectRcpt ? '550 no such user\r\n' : '250 ok\r\n');
        else if (/^DATA/i.test(line)) {
          inData = true;
          sock.write('354 go ahead\r\n');
        } else if (/^QUIT/i.test(line)) {
          sock.write('221 bye\r\n');
          sock.end();
        } else sock.write('500 what\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, port: server.address().port })));
}

(async () => {
  const quiet = { warn() {}, error() {}, log() {} };
  const smtp = await fakeSmtp();
  const mail = {
    host: '127.0.0.1',
    port: smtp.port,
    user: 'info@bquee.com',
    password: 'p@ss word',
    from: 'info@bquee.com',
    security: 'none',
  };
  const mailer = createMailer(mail, quiet);
  await mailer.send({ to: 'Owner@Example.com', subject: 'Your BQuee sign-up code – ✓', text: 'Code:\n\n  123456\n.' });
  const c = smtp.seen[0];
  check('says hello, signs in, sender, recipient, data, quit', c && /^EHLO /.test(c.lines[0]) && c.lines.includes('QUIT'));
  const auth = c.lines.find((l) => l.startsWith('AUTH PLAIN '));
  check(
    'signs in with the mailbox user and password (AUTH PLAIN)',
    auth && Buffer.from(auth.slice(11), 'base64').toString() === '\0info@bquee.com\0p@ss word',
  );
  check('the sender is the mailbox', c.lines.includes('MAIL FROM:<info@bquee.com>'));
  check('the recipient is exactly the one given', c.lines.includes('RCPT TO:<Owner@Example.com>'));
  const [head, body] = c.data.split('\r\n\r\n');
  check('From shows BQuee', /^From: BQuee <info@bquee\.com>$/m.test(head));
  check('non-English subjects are encoded (=?UTF-8?B?…?=)', /^Subject: =\?UTF-8\?B\?/m.test(head));
  check('the text is sent as base64 (no line can end the message early)', /Content-Transfer-Encoding: base64/.test(head));
  check(
    'the text arrives unchanged',
    Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString() === 'Code:\r\n\r\n  123456\r\n.',
  );

  // Refusals
  let refused = 0;
  for (const bad of ['a@b.com\r\nBcc: x@y.com', 'a@b.com>,<x@y.com', 'no-at-sign', '']) {
    try {
      assertAddress(bad);
    } catch (err) {
      refused++;
    }
  }
  check('addresses with line breaks or extra recipients are refused', refused === 4);
  const msg = buildMessage({ from: 'info@bquee.com', to: 'a@b.com', subject: 'Hi\r\nBcc: x@y.com', text: 'x' });
  check('a line break in a subject can’t add a header', !/^Bcc:/m.test(msg));

  let plainElsewhere = '';
  try {
    await createMailer({ ...mail, host: 'smtp.example.com' }, quiet).send({ to: 'a@b.com', subject: 's', text: 't' });
  } catch (err) {
    plainElsewhere = err.message;
  }
  check('an unencrypted connection is only for a test server on this machine', /only for tests/.test(plainElsewhere));

  const rejecting = await fakeSmtp({ rejectRcpt: true });
  let failed = '';
  try {
    await createMailer({ ...mail, port: rejecting.port }, quiet).send({ to: 'x@y.com', subject: 's', text: 't' });
  } catch (err) {
    failed = err.message;
  }
  check('a refused recipient is reported as a failure', /550/.test(failed));

  const before = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const none = createMailer({ host: '', logFile: '' }, quiet);
  process.env.NODE_ENV = before;
  check('in production without SMTP_HOST email is "not ready" (codes are never only logged)', none.ready === false);
  const off = createMailer({ ...mail, off: true }, quiet);
  check('EMAIL_CODES=off: never ready, even with a mailbox set', off.ready === false && off.configured === false);

  smtp.server.close();
  rejecting.server.close();
  console.log(`Email sending: ${passed} passed, ${failures.length} failed`);
  process.exit(failures.length ? 1 : 0);
})().catch((err) => {
  console.error('Email sending test crashed:', err);
  process.exit(1);
});
