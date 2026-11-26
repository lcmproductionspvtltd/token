'use strict';

/**
 * What the website or app sending a request can do, from its X-BQuee-Features header.
 * "email-code": it can show the "enter the code we emailed you" step (the website, and the apps from
 * 1.0.0 build 3 on). Older app versions don't send it, so they keep working without email codes.
 */
const canEmailCode = (req) =>
  String((req && req.headers && req.headers['x-bquee-features']) || '')
    .split(',')
    .map((x) => x.trim())
    .includes('email-code');

module.exports = { canEmailCode };
