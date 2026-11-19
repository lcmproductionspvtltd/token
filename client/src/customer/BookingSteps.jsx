/*
 * The parts of the booking flow (Booking.jsx keeps the state and the order of the steps):
 * the offer bar, the "booking closed" notice, the three steps, the bottom bar on phones and the
 * token preview that fills in as the customer chooses.
 */

import { categoryIcon, money, offerLabel, tokenNo, waitText } from '../core/format.js';
import { navigate } from '../core/router.jsx';
import { Avatar, Button, Field, Icon } from '../core/ui.jsx';
import { ServiceThumb, Ticket } from './parts.jsx';

/** A service's category, or "Other". */
export const catOf = (x) => x.category || 'Other';

/** Adds or removes `id` in a Set held in React state. */
function toggleIn(setFn, id) {
  setFn((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
}

/** The offer the customer tapped "Book" on, with a button to remove it. */
export function OfferBar({ offer, cur, onRemove }) {
  return (
    <div className="offer-applied" role="status">
      <span className="offer-applied-ico">
        <Icon name="gift" />
      </span>
      <span className="offer-applied-text">
        <b>
          {offer.title}
          {offerLabel(offer, cur) && <em>{offerLabel(offer, cur)}</em>}
        </b>
        <small>
          {offer.discountType && offer.discountType !== 'none'
            ? 'Offer applied – the discount is taken off your total.'
            : 'Offer added to your token – show it at the desk.'}
          {offer.code ? ' Code ' + offer.code + '.' : ''}
        </small>
      </span>
      <button type="button" className="offer-applied-x" onClick={onRemove} aria-label="Remove offer">
        <Icon name="x" />
      </button>
    </div>
  );
}

/** Shown instead of the steps when the branch isn't taking bookings (or has no services yet). */
export function BookingClosed({ d, branchId }) {
  const s = d.salon;
  return (
    <div className="flow-closed">
      <Icon name="clock" />
      <h1>{d.open ? 'Booking opens soon' : 'Online booking is paused'}</h1>
      <p>
        {d.open ? 'This branch hasn’t added its services yet.' : 'You can’t book a token online right now.'}
        {s.phone ? ` Call ${s.phone} to book.` : ''}
      </p>
      <Button variant="primary" onClick={() => navigate('/b/' + branchId)}>
        Back to {s.name}
      </Button>
    </div>
  );
}

/** Step 1: choose services (search and category filter). */
export function ServicesStep({
  services,
  cats,
  sel,
  setSel,
  singleService,
  availableFor,
  query,
  setQuery,
  cat,
  setCat,
  cur,
  stepChip,
}) {
  const ql = query.trim().toLowerCase();
  const shown = services.filter(
    (x) =>
      (cat === 'all' || catOf(x) === cat) &&
      (!ql || (x.name + ' ' + (x.description || '') + ' ' + catOf(x)).toLowerCase().includes(ql)),
  );
  return (
    <>
      <div className="flow-title">
        <span className="step-chip">{stepChip}</span>
        <h1>What would you like?</h1>
        <p>
          {singleService ? 'Pick a service.' : 'Pick one or more services.'} You’ll see the total and waiting time as
          you go.
        </p>
      </div>
      <div className="svc-tools">
        <label className="search">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services"
            aria-label="Search services"
          />
        </label>
        {cats.length > 1 && (
          <div className="seg" role="tablist" aria-label="Categories">
            {['all', ...cats].map((c) => {
              const count = services.filter((x) => sel.has(x.id) && (c === 'all' || catOf(x) === c)).length;
              return (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={c === cat}
                  className={c === cat ? 'on' : ''}
                  onClick={() => setCat(c)}
                >
                  {c !== 'all' && <Icon name={categoryIcon(c)} />}
                  {c === 'all' ? 'All' : c}
                  {count > 0 && <em className="num">{count}</em>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {shown.length ? (
        <ul className="svc-list">
          {shown.map((x) => {
            const on = sel.has(x.id);
            const none = !availableFor(x.id).length;
            return (
              <li key={x.id}>
                <button
                  type="button"
                  className={'svc' + (on ? ' on' : '') + (none ? ' unavailable' : '')}
                  role={singleService ? 'radio' : 'checkbox'}
                  aria-checked={on}
                  disabled={none}
                  onClick={() => (singleService ? setSel(new Set([x.id])) : toggleIn(setSel, x.id))}
                >
                  <ServiceThumb service={x} />
                  <span className="svc-text">
                    <b>{x.name}</b>
                    <small>
                      {none
                        ? 'No staff member available right now'
                        : x.duration + ' min' + (x.description ? ' · ' + x.description : '')}
                    </small>
                  </span>
                  <span className="svc-price num">{money(x.price, cur)}</span>
                  <span className="tick" aria-hidden="true">
                    <Icon name={on ? 'check' : 'plus'} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="flow-none">
          <p>No services match “{query}”.</p>
          <Button
            size="sm"
            onClick={() => {
              setQuery('');
              setCat('all');
            }}
          >
            Show all services
          </Button>
        </div>
      )}
    </>
  );
}

/** Step 2: optionally choose staff members (otherwise each service goes to whoever is free first). */
export function StaffStep({ d, services, sel, stSel, setStSel, stCat, setStCat, wait, stepChip }) {
  const relevant = d.staff.filter((st) => services.some((x) => sel.has(x.id) && st.serviceIds.includes(x.id)));
  const selCats = [...new Set(services.filter((x) => sel.has(x.id)).map(catOf))];
  const activeStCat = selCats.includes(stCat) ? stCat : 'all';
  const shownStaff = relevant
    .slice()
    .sort((a, b) => (a.online === false) - (b.online === false) || a.wait - b.wait)
    .filter(
      (st) =>
        activeStCat === 'all' ||
        services.some((x) => sel.has(x.id) && catOf(x) === activeStCat && st.serviceIds.includes(x.id)),
    );
  return (
    <>
      <div className="flow-title">
        <span className="step-chip">{stepChip}</span>
        <h1>Any preferred staff member?</h1>
        <p>Optional. Skip this and we’ll give each service to whoever is free first.</p>
      </div>
      {selCats.length > 1 && (
        <div className="seg" role="tablist" aria-label="Filter by category">
          {['all', ...selCats].map((c) => (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={c === activeStCat}
              className={c === activeStCat ? 'on' : ''}
              onClick={() => setStCat(c)}
            >
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
      )}
      <ul className="staff-list">
        <li>
          <button
            type="button"
            className={'stylist any' + (stSel.size ? '' : ' on')}
            role="checkbox"
            aria-checked={!stSel.size}
            onClick={() => setStSel(new Set())}
          >
            <span className="any-icon" aria-hidden="true">
              <Icon name="bolt" />
            </span>
            <span className="stylist-text">
              <b>No preference – fastest</b>
              <small>We give each service to the first free staff member</small>
            </span>
            <span className={'wait-tag' + (wait ? '' : ' free')}>{wait ? '~' + waitText(wait) : 'Free now'}</span>
            <span className="tick" aria-hidden="true">
              <Icon name={stSel.size ? 'plus' : 'check'} />
            </span>
          </button>
        </li>
        {shownStaff.map((st) => {
          const offline = st.online === false;
          const on = stSel.has(st.id) && !offline;
          const does = services.filter((x) => sel.has(x.id) && st.serviceIds.includes(x.id)).map((x) => x.name);
          return (
            <li key={st.id}>
              <button
                type="button"
                className={'stylist' + (on ? ' on' : '') + (offline ? ' offline' : '')}
                role="checkbox"
                aria-checked={on}
                disabled={offline}
                aria-label={offline ? st.name + ' – offline' : undefined}
                onClick={() => toggleIn(setStSel, st.id)}
              >
                <span className={'presence ' + (offline ? 'off' : st.busy ? 'busy' : 'on')}>
                  <Avatar name={st.name} photo={st.photo} size="lg" />
                </span>
                <span className="stylist-text">
                  <b>{st.name}</b>
                  {st.title && <small>{st.title}</small>}
                  <em>{does.join(', ')}</em>
                </span>
                {offline ? (
                  <span className="wait-tag off">Offline</span>
                ) : st.busy ? (
                  <span className="wait-tag busy">Busy · ~{waitText(st.wait)}</span>
                ) : (
                  <span className={'wait-tag' + (st.wait ? '' : ' free')}>
                    {st.wait ? '~' + waitText(st.wait) : 'Free now'}
                  </span>
                )}
                <span className="tick" aria-hidden="true">
                  <Icon name={offline ? 'minus' : on ? 'check' : 'plus'} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="flow-hint">
        <Icon name="sparkle" />
        {stSel.size
          ? 'Services your chosen staff member doesn’t offer go to the first free expert.'
          : 'No preference? We’ll assign the first free expert.'}
      </p>
    </>
  );
}

/** Step 3: the customer's name, mobile and email. */
export function DetailsStep({ formRef, cust, setCust, flowLength, onSubmit }) {
  const bindCust = (name) => ({
    name,
    value: cust[name] || '',
    onChange: (e) => setCust((c) => ({ ...c, [name]: e.target.value })),
  });
  return (
    <>
      <div className="flow-title">
        <span className="step-chip">{flowLength > 1 ? 'Last step' : 'One quick step'}</span>
        <h1>Who is the token for?</h1>
        <p>We only use these details to reach you about this visit.</p>
      </div>
      <form
        ref={formRef}
        className="form-stack details-form"
        autoComplete="on"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <Field label="Full name" className="with-icon">
          <Icon name="user" className="field-icon" />
          <input {...bindCust('name')} required maxLength={60} autoComplete="name" placeholder="Your name" />
        </Field>
        <Field label="Mobile number" className="with-icon">
          <Icon name="phone" className="field-icon" />
          <input
            {...bindCust('mobile')}
            required
            inputMode="tel"
            maxLength={20}
            autoComplete="tel"
            placeholder="+91 98765 43210"
          />
        </Field>
        <Field label="Email (optional)" className="with-icon">
          <Icon name="mail" className="field-icon" />
          <input
            {...bindCust('email')}
            type="email"
            maxLength={80}
            autoComplete="email"
            placeholder="you@example.com"
          />
        </Field>
        <button type="submit" hidden />
      </form>
      <ul className="trust">
        <li>
          <Icon name="check" /> No sign-up or payment needed
        </li>
        <li>
          <Icon name="check" /> Your details are saved on this phone for next time
        </li>
        <li>
          <Icon name="check" /> Live waiting time after booking
        </li>
      </ul>
    </>
  );
}

/** Phones: the total and the next button, fixed at the bottom of the screen. */
export function BookingBar({ sel, total, minutes, wait, cur, isLast, busy, onNext }) {
  return (
    <div className="flow-bar">
      <span>
        {sel.size ? (
          <>
            <b className="num">
              {money(total, cur)} · {minutes} min
            </b>
            <small>
              {sel.size} {sel.size === 1 ? 'service' : 'services'} · {wait ? '~' + waitText(wait) + ' wait' : 'no wait'}
            </small>
          </>
        ) : (
          <small>Choose at least one service</small>
        )}
      </span>
      <Button
        variant="primary"
        iconRight={isLast ? 'check' : 'arrow'}
        onClick={onNext}
        disabled={!sel.size}
        busy={busy}
      >
        {isLast ? (busy ? 'Booking…' : 'Book token') : 'Continue'}
      </Button>
    </div>
  );
}

/** The token being built: fills in with each service, stylist and the total. */
export function DraftTicket({
  d,
  plan,
  total,
  subtotal,
  discount,
  offer,
  minutes,
  wait,
  step,
  cust,
  nextNumber,
  singleStaff,
}) {
  const cur = d.salon.currency;
  return (
    <Ticket
      className="draft"
      top={
        <>
          <div className="draft-head">
            <span>
              Your token number
              <small>Confirmed when you book</small>
            </span>
            <b className="num">
              {nextNumber
                ? tokenNo({ prefix: d.branch.prefix, number: nextNumber })
                : d.branch.prefix
                  ? d.branch.prefix + '-···'
                  : '#···'}
            </b>
          </div>
          {plan.length ? (
            <ul className="draft-items">
              {plan.map((x) => (
                <li key={x.s.id}>
                  <Avatar name={x.st.name} photo={x.st.photo} size="xs" />
                  <span>
                    <b>{x.s.name}</b>
                    <small>
                      {step > 1 ? x.st.name + (x.pref || singleStaff ? '' : ' (first free)') : x.s.duration + ' min'}
                    </small>
                  </span>
                  <em className="num">{money(x.s.price, cur)}</em>
                </li>
              ))}
            </ul>
          ) : (
            <p className="draft-empty">Services you pick appear here.</p>
          )}
          {offer && (
            <p className="draft-offer">
              <Icon name="gift" />
              <span>{offer.title}</span>
              {discount > 0 && <em className="num">−{money(discount, cur)}</em>}
            </p>
          )}
          {step === 3 && cust.name && <p className="draft-for">For {cust.name}</p>}
        </>
      }
      bottom={
        <dl className="draft-sum">
          <div>
            <dt>Total</dt>
            <dd className="num">
              {discount > 0 && <s className="draft-was">{money(subtotal, cur)}</s>}
              {money(total, cur)}
            </dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd className="num">{minutes ? minutes + ' min' : '—'}</dd>
          </div>
          <div>
            <dt>Wait</dt>
            <dd className="num">{plan.length ? (wait ? '~' + waitText(wait) : 'None') : '—'}</dd>
          </div>
        </dl>
      }
    />
  );
}
