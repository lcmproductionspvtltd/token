'use strict';

/**
 * Queue maths – pure functions, no database.
 *
 * Every staff member has their own queue, in booking order (an appointment token takes its place in line
 * at its appointment time). For each service a customer is
 * waiting for, the wait is the work left on that staff member's queue ahead of them (a running
 * service counts only its remaining minutes). A customer is called as soon as ANY of their
 * services can start, so their wait is the shortest of those – but never before their own
 * running service (with another staff member) has finished.
 */

const OPEN_STATUSES = ['waiting', 'serving'];
const FINAL_STATUSES = ['done', 'cancelled', 'missed'];

/** A running service that is over its planned time still keeps the staff member busy ~1 more minute. */
const OVERRUN_MINUTES = 1;

/** Minutes of work left on one token item. */
function remainingMinutes(item, now = Date.now()) {
  if (item.status === 'in_progress') return Math.max(OVERRUN_MINUTES, item.duration - (now - item.startedAt) / 60_000);
  if (item.status === 'waiting') return item.duration;
  return 0;
}

/** A token's place in line: its appointment time, or when it was booked. */
const lineTime = (t) => (t.queueAt != null ? t.queueAt : t.createdAt);

/** True when token `a` is ahead of token `b` in line (place-in-line time, then token number). */
const bookedBefore = (a, b) =>
  lineTime(a) < lineTime(b) || (lineTime(a) === lineTime(b) && a.number < b.number);

/** Token status derived from its items. */
function statusFromItems(items) {
  if (items.every((i) => i.status === 'done')) return 'done';
  if (items.some((i) => i.status === 'in_progress')) return 'serving';
  return 'waiting';
}

/** Total minutes of work currently queued for one staff member. */
function staffLoad(staffId, openTokens, now = Date.now()) {
  let load = 0;
  for (const token of openTokens) {
    for (const item of token.items) if (item.staffId === staffId) load += remainingMinutes(item, now);
  }
  return load;
}

/**
 * Estimated wait (minutes) until this customer's next service starts, and how many
 * customers are ahead of them. `openTokens` are today's waiting/serving tokens of the branch.
 */
function estimateWait(token, openTokens, now = Date.now()) {
  if (FINAL_STATUSES.includes(token.status)) return { wait: 0, ahead: 0 };
  // An appointment that hasn't joined the queue yet: the wait is the time until the appointment.
  if (token.upcoming && token.appointmentAt) return { wait: Math.max(0, Math.ceil((token.appointmentAt - now) / 60_000)), ahead: 0 };

  // The customer can't start another service while one of theirs is running.
  let busyUntil = 0;
  for (const own of token.items)
    if (own.status === 'in_progress') busyUntil = Math.max(busyUntil, remainingMinutes(own, now));

  let best = null; // { wait, ahead } of the service that can start soonest
  for (const item of token.items) {
    if (item.status !== 'waiting') continue;
    let load = 0;
    const ahead = new Set();
    for (const other of openTokens) {
      if (other.id === token.id) continue;
      const earlier = bookedBefore(other, token);
      for (const o of other.items) {
        if (o.staffId !== item.staffId) continue;
        if (earlier && (o.status === 'waiting' || o.status === 'in_progress')) {
          load += remainingMinutes(o, now);
          ahead.add(other.id);
        } else if (!earlier && o.status === 'in_progress') {
          load += remainingMinutes(o, now); // staff is busy with someone who came later
        }
      }
    }
    const wait = Math.max(load, busyUntil);
    if (!best || wait < best.wait) best = { wait, ahead: ahead.size };
  }
  if (!best) return { wait: 0, ahead: 0 }; // nothing left to wait for (all running or done)
  return { wait: Math.ceil(best.wait), ahead: best.ahead };
}

/** True while the staff member is in the middle of a service (a token was scanned to start). */
function staffBusy(staffId, openTokens) {
  return openTokens.some((t) => t.items.some((i) => i.staffId === staffId && i.status === 'in_progress'));
}

module.exports = { OPEN_STATUSES, statusFromItems, staffLoad, staffBusy, estimateWait };
