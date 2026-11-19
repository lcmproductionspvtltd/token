'use strict';

/**
 * Image uploads (logos, covers, staff/service photos, offers, reviews).
 * The web and the apps redraw every picture into a fresh JPG before sending it as a data URL.
 * The server still checks every upload fully (see image-check.js): real PNG / JPEG / WEBP structure,
 * no hidden code, pixel and byte limits. Files are stored under a new random name.
 *
 * Two storage options (UPLOADS_STORAGE):
 *   disk      files in UPLOADS_DIR (default)
 *   database  the `images` table – for hosts whose disk is wiped on restart
 */

const fs = require('fs');
const path = require('path');
const { badRequest } = require('../http/errors');
const { newId } = require('../utils/ids');
const { inspectImage } = require('./image-check');

/** Largest file allowed for each kind of picture (bytes). */
const LIMITS = {
  photo: 600_000, // profile pictures: staff, customers, reviews
  item: 800_000, // service, offer and default-service pictures
  logo: 1_000_000,
  screenshot: 2_000_000, // support ticket screenshots
  cover: 2_500_000,
};

const URL_PREFIX = '/uploads/';
const fileNameOf = (url) => (url && url.startsWith(URL_PREFIX) ? path.basename(url) : '');

function diskStore(uploadsDir) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  return {
    save: (name, bytes) => fs.promises.writeFile(path.join(uploadsDir, name), bytes),
    delete: (name) => fs.promises.unlink(path.join(uploadsDir, name)).catch(() => {}),
    load: null, // served by the static file handler
    copy: (from, to) => fs.promises.copyFile(path.join(uploadsDir, from), path.join(uploadsDir, to)),
  };
}

function databaseStore(db) {
  return {
    save: (name, bytes, type) =>
      db.query('INSERT INTO images (name, mime_type, data_base64) VALUES ($1, $2, $3)', [
        name,
        type.mime,
        bytes.toString('base64'),
      ]),
    delete: (name) => db.query('DELETE FROM images WHERE name = $1', [name]),
    copy: (from, to) =>
      db.query(
        'INSERT INTO images (name, mime_type, data_base64) SELECT $2, mime_type, data_base64 FROM images WHERE name = $1',
        [from, to],
      ),
    async load(name) {
      const { rows } = await db.query('SELECT mime_type, data_base64 FROM images WHERE name = $1', [name]);
      return rows[0] ? { type: rows[0].mime_type, bytes: Buffer.from(rows[0].data_base64, 'base64') } : null;
    },
  };
}

function createUploadService({ storage = 'disk', uploadsDir, db }) {
  const store = storage === 'database' ? databaseStore(db) : diskStore(uploadsDir);

  async function remove(url) {
    const name = fileNameOf(url);
    if (name) await store.delete(name);
  }

  /**
   * Decides the new image URL for a field:
   *   undefined   → field not sent, keep the current image
   *   ''          → remove the image
   *   same URL    → unchanged
   *   data:image… → store the new image and delete the old one
   */
  async function replace(input, currentUrl = '', maxBytes = LIMITS.item) {
    if (input === undefined || input === currentUrl) return currentUrl;
    if (!input) {
      await remove(currentUrl);
      return '';
    }

    const text = String(input);
    // Size check on the text first, so a huge upload is refused before it is decoded.
    if (text.length > Math.ceil(maxBytes / 3) * 4 + 40)
      throw badRequest(`Image is too large (max ${Math.round(maxBytes / 1000)} KB)`);
    const match = /^data:image\/(?:png|jpeg|jpg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(text);
    if (!match) throw badRequest('Images must be PNG, JPG or WEBP');
    const bytes = Buffer.from(match[1], 'base64');
    if (bytes.length > maxBytes) throw badRequest(`Image is too large (max ${Math.round(maxBytes / 1000)} KB)`);
    let type;
    try {
      type = inspectImage(bytes);
    } catch (err) {
      throw badRequest(err.message);
    }

    const name = newId(12) + type.ext;
    await store.save(name, bytes, type);
    await remove(currentUrl);
    return URL_PREFIX + name;
  }

  /** Duplicates a stored image so two records never share (and later delete) one file. '' if it fails. */
  async function copy(url) {
    const name = fileNameOf(url);
    if (!name) return '';
    const to = newId(12) + path.extname(name);
    try {
      await store.copy(name, to);
      return URL_PREFIX + to;
    } catch {
      return '';
    }
  }

  /** Image from database storage, or null (disk images are served as static files). */
  const load = (url) => (store.load ? store.load(fileNameOf(url)) : Promise.resolve(null));

  return { replace, remove, copy, load, servesFromDatabase: !!store.load };
}

module.exports = { createUploadService, LIMITS };
