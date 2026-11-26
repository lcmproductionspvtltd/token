/**
 * Waiting-time accuracy: hand-worked queue scenarios with exact expected minutes.
 * Run: node tests/queue.test.js   (also part of `npm test`)
 */

const queue = require('../src/services/queue');

const NOW = Date.UTC(2026, 10, 18, 6, 0, 0);
const MIN = 60_000;
let passed = 0;
const failures = [];

function expect(label, actual, wanted) {
  if (JSON.stringify(actual) === JSON.stringify(wanted)) passed++;
  else failures.push(`${label}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`);
}

/** token(n, [[staff, minutes, status, startedMinutesAgo]...]) – booked n minutes after opening. */
function token(n, items, status) {
  const list = items.map(([staffId, duration, st = 'waiting', ago = 0]) => ({
    staffId,
    duration,
    status: st,
    startedAt: st === 'in_progress' ? NOW - ago * MIN : null,
  }));
  return {
    id: 't' + n,
    number: n,
    createdAt: NOW - 600 * MIN + n * MIN,
    status: status || queue.statusFromItems(list),
    items: list,
  };
}

const wait = (t, all) => queue.estimateWait(t, all, NOW);

// 1. Empty queue: no wait.
{
  const a = token(1, [['anna', 30]]);
  expect('first customer, free stylist', wait(a, [a]), { wait: 0, ahead: 0 });
}

// 2. Two people ahead with the same stylist: 30 + 20 = 50 minutes, 2 ahead.
{
  const a = token(1, [['anna', 30]]),
    b = token(2, [['anna', 20]]),
    c = token(3, [['anna', 15]]);
  expect('third in line', wait(c, [a, b, c]), { wait: 50, ahead: 2 });
  expect('second in line', wait(b, [a, b, c]), { wait: 30, ahead: 1 });
}

// 3. Running service counts only what is left: 30-min service started 12 min ago → 18 left.
{
  const a = token(1, [['anna', 30, 'in_progress', 12]]),
    b = token(2, [['anna', 20]]);
  expect('running service, remaining time', wait(b, [a, b]), { wait: 18, ahead: 1 });
}

// 4. Overrun: 30-min service started 45 min ago is still running → at least 1 more minute, not 0.
{
  const a = token(1, [['anna', 30, 'in_progress', 45]]),
    b = token(2, [['anna', 20]]);
  expect('overrunning service still blocks', wait(b, [a, b]), { wait: 1, ahead: 1 });
}

// 5. Other stylists' queues don't count.
{
  const a = token(1, [['ravi', 40]]),
    b = token(2, [['anna', 20]]);
  expect('different stylist queue ignored', wait(b, [a, b]), { wait: 0, ahead: 0 });
}

// 6. Two services with two stylists: called when the FIRST one is free (Anna free, Ravi busy 30).
{
  const a = token(1, [['ravi', 30]]),
    b = token(2, [
      ['anna', 20],
      ['ravi', 15],
    ]);
  expect('two services: shortest queue wins', wait(b, [a, b]), { wait: 0, ahead: 0 });
}

// 7. Customer mid-service with Anna (10 left) also waits for Ravi (free): wait = 10, not 0.
{
  const b = token(2, [
    ['anna', 25, 'in_progress', 15],
    ['ravi', 15],
  ]);
  expect('own running service comes first', wait(b, [b]), { wait: 10, ahead: 0 });
}

// 8. Stylist busy with someone who booked later (walk-in served first): still counts.
{
  const later = token(5, [['anna', 20, 'in_progress', 5]]),
    me = token(3, [['anna', 30]]);
  expect('stylist busy with a later customer', wait(me, [me, later]), { wait: 15, ahead: 0 });
}

// 9. Finished, cancelled and missed tokens wait 0.
for (const st of ['done', 'cancelled', 'missed']) {
  const t = token(1, [['anna', 30, 'done']], st);
  expect('final status ' + st, wait(t, []), { wait: 0, ahead: 0 });
}

// 10. Completed items ahead don't count; partially finished earlier customer counts only what is left.
{
  const a = token(1, [
      ['anna', 30, 'done'],
      ['anna', 10],
    ]),
    b = token(2, [['anna', 20]]);
  expect('done items ignored', wait(b, [a, b]), { wait: 10, ahead: 1 });
}

// 11. Same booking minute: lower token number goes first.
{
  const a = token(1, [['anna', 30]]),
    b = { ...token(2, [['anna', 20]]), createdAt: a.createdAt };
  expect('tie broken by token number', [wait(a, [a, b]).wait, wait(b, [a, b]).wait], [0, 30]);
}

// 12. Fractions round up: 30-min service started 10.5 min ago → 19.5 → 20.
{
  const a = token(1, [['anna', 30, 'in_progress', 10.5]]),
    b = token(2, [['anna', 20]]);
  expect('rounds up to whole minutes', wait(b, [a, b]).wait, 20);
}

// 13. Stylist load (used for "any stylist" and branch wait): queued + remaining.
{
  const a = token(1, [['anna', 30, 'in_progress', 10]]),
    b = token(2, [
      ['anna', 20],
      ['ravi', 15],
    ]);
  expect('staff load anna', queue.staffLoad('anna', [a, b], NOW), 40);
  expect('staff load ravi', queue.staffLoad('ravi', [a, b], NOW), 15);
  expect('staff busy', [queue.staffBusy('anna', [a, b]), queue.staffBusy('ravi', [a, b])], [true, false]);
}

// 14. Token status from items.
expect('status: all done', queue.statusFromItems([{ status: 'done' }, { status: 'done' }]), 'done');
expect('status: one running', queue.statusFromItems([{ status: 'done' }, { status: 'in_progress' }]), 'serving');
expect('status: waiting', queue.statusFromItems([{ status: 'done' }, { status: 'waiting' }]), 'waiting');

// 15. An appointment that joined the queue lines up by its appointment time (queueAt), not when it was booked.
{
  const a = token(1, [['anna', 30]]), // booked first, for an appointment 15 min before "now"
    b = token(2, [['anna', 20]]);
  a.queueAt = NOW - 15 * MIN; // joins the queue 15 minutes before its time
  b.createdAt = NOW - 30 * MIN; // walked in earlier than that
  expect('walk-in before the appointment goes first', [wait(b, [a, b]).wait, wait(a, [a, b]).wait], [0, 20]);
}

// 16. An upcoming appointment: its wait is the time until the appointment, nobody ahead.
{
  const a = { ...token(1, [['anna', 30]]), upcoming: true, appointmentAt: NOW + 90 * MIN };
  expect('upcoming wait = time until the appointment', queue.estimateWait(a, [a], NOW), { wait: 90, ahead: 0 });
}

console.log(`Waiting time: ${passed} passed, ${failures.length} failed`);
failures.forEach((f) => console.log(`  ✗ ${f}`));
process.exitCode = failures.length ? 1 : 0;
