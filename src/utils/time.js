'use strict';

/**
 * Date helpers. BQuee keeps one clock for every business: UTC. "Today" (the business day, daily token
 * numbers) is the UTC date, so it changes at UTC midnight – 5:30 am in India, 4:00 am in the UAE –
 * after closing time everywhere. Times themselves are exact moments and each phone or browser shows
 * them in its own local time. The server's TZ setting does not matter.
 */

/** Today's UTC date as YYYY-MM-DD (offsetDays: days before/after). */
function today(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/** Date | null → epoch milliseconds | null (what the browser app expects). */
const toMillis = (value) => (value ? new Date(value).getTime() : null);

module.exports = { today, toMillis };
