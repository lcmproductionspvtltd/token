'use strict';

/** Date helpers. "Today" follows the server time zone (set TZ, e.g. Asia/Kolkata). */

const pad = (n) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD. */
function today(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date | null → epoch milliseconds | null (what the browser app expects). */
const toMillis = (value) => (value ? new Date(value).getTime() : null);

module.exports = { today, toMillis };
