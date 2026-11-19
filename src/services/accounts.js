'use strict';

/**
 * Login accounts. A username and an email can both be used to sign in,
 * so each value must be unique across both columns of every user.
 */

const { badRequest } = require('../http/errors');

async function assertLoginAvailable(client, value, exceptUserId = null) {
  if (!value) return;
  const { rows } = await client.query(
    'SELECT 1 FROM users WHERE (username = $1 OR email = $1) AND id IS DISTINCT FROM $2 LIMIT 1',
    [value, exceptUserId],
  );
  if (rows.length) throw badRequest(`"${value}" is already used by another login`);
}

module.exports = { assertLoginAvailable };
