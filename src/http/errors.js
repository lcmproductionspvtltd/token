'use strict';

/** An error that is safe to show to the user, with an HTTP status code. */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

module.exports = {
  HttpError,
  badRequest: (message) => new HttpError(400, message),
  unauthorized: (message = 'Please sign in') => new HttpError(401, message),
  forbidden: (message = 'You are not allowed to do this') => new HttpError(403, message),
  notFound: (message = 'Not found') => new HttpError(404, message),
  tooManyRequests: (message = 'Too many attempts. Please wait a few minutes and try again.') =>
    new HttpError(429, message),
  serviceUnavailable: (message = 'The server is busy – please try again in a moment.') => new HttpError(503, message),
};
