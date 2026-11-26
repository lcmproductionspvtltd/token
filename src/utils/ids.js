'use strict';

const crypto = require('crypto');

/** Random, URL-safe identifier (hex). 6 bytes → 12 characters. */
const newId = (bytes = 6) => crypto.randomBytes(bytes).toString('hex');

module.exports = { newId };
