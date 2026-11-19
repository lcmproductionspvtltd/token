'use strict';

const { HttpError } = require('./errors');

/**
 * Tiny path router: `router.get('/api/tokens/:id', handler)`.
 * Handlers receive a context object and return the JSON response body.
 */
class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    const keys = [];
    const regex = new RegExp(
      '^' +
        pattern.replace(/:(\w+)/g, (_, key) => {
          keys.push(key);
          return '([^/]+)';
        }) +
        '$',
    );
    this.routes.push({ method, regex, keys, handler });
    return this;
  }

  get(pattern, handler) {
    return this.add('GET', pattern, handler);
  }
  post(pattern, handler) {
    return this.add('POST', pattern, handler);
  }
  put(pattern, handler) {
    return this.add('PUT', pattern, handler);
  }
  delete(pattern, handler) {
    return this.add('DELETE', pattern, handler);
  }

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const m = pathname.match(route.regex);
      if (!m) continue;
      const params = {};
      try {
        route.keys.forEach((key, i) => {
          params[key] = decodeURIComponent(m[i + 1]);
        });
      } catch (err) {
        // Broken %-encoding (e.g. "/api/tokens/%E0%A4") is the caller's mistake: 400, not 500 (audit F-09).
        throw new HttpError(400, 'Invalid address');
      }
      return { handler: route.handler, params };
    }
    return null;
  }
}

module.exports = { Router };
