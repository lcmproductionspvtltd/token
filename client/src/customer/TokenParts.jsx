/* The parts of the customer's token page (TokenPage.jsx keeps the data, refreshing and actions):
   status banner, ticket picture, download buttons, the staff start/finish bar and the live services panel. */

import { FINAL, clock, money, statusLabel, tokenNo } from '../core/format.js';
import { Avatar, Button, Icon, LinkButton, Pill, Spinner } from '../core/ui.jsx';

/** Headline for each token status. */
const HEADLINES = {
  waiting: 'You’re in the queue',
  serving: 'You’re being served',
  done: 'All done – thank you!',
  cancelled: 'This token was cancelled',
  missed: 'This token has expired',
};

/** Status, estimated wait and people ahead. */
export function StatusBanner({ t, d, fresh, sub, waitValue }) {
  return (
    <section className={'tp-banner ' + t.status + (fresh ? ' fresh' : '')}>
      <div className="tp-banner-text">
        <span className="tp-banner-icon" aria-hidden="true">
          <Icon
            name={
              fresh || t.status === 'done'
                ? 'check'
                : t.status === 'serving'
                  ? 'play'
                  : t.status === 'waiting'
                    ? 'clock'
                    : 'x'
            }
          />
        </span>
        <div>
          <h1>{fresh ? 'Your token is booked' : HEADLINES[t.status]}</h1>
          <p>{sub}</p>
        </div>
      </div>
      <dl className="tp-banner-stats">
        <div>
          <dt>Estimated wait</dt>
          <dd className="num">{waitValue}</dd>
        </div>
        <div>
          <dt>People ahead</dt>
          <dd className="num">{t.status === 'waiting' ? d.ahead : 0}</dd>
        </div>
      </dl>
    </section>
  );
}

/** The drawn ticket (with its QR code); tap to see it full screen. */
export function TicketPreview({ t, s, preview, onZoom }) {
  return (
    <div className="tp-ticket-area">
      {preview ? (
        <button type="button" className="tp-preview" onClick={onZoom} aria-label="Show token full screen">
          <img
            src={preview}
            alt={`Token ${tokenNo(t)} for ${t.customer.name} at ${s.name}, ${statusLabel(t.status)}. QR code included.`}
          />
          <span className="tp-zoom-hint">
            <Icon name="search" /> Tap to enlarge
          </span>
        </button>
      ) : (
        <div className="tp-preview-loading">{preview === '' ? 'Could not draw the token' : <Spinner />}</div>
      )}
      <p className="tt-tip">
        <Icon name="qr" /> Show this QR to staff when you arrive – they scan it to start your service.
      </p>
    </div>
  );
}

/** Save the ticket as JPG / PDF, book another, back to the business. */
export function TicketActions({ t, saving, onSave }) {
  return (
    <div className="tp-actions">
      <Button
        variant="primary"
        size="lg"
        icon="download"
        className="tp-download"
        busy={saving === 'jpg'}
        onClick={() => onSave('jpg')}
      >
        {saving === 'jpg' ? 'Saving…' : 'Download JPG'}
      </Button>
      <Button
        variant="primary"
        size="lg"
        icon="pdf"
        className="tp-download pdf"
        busy={saving === 'pdf'}
        onClick={() => onSave('pdf')}
      >
        {saving === 'pdf' ? 'Saving…' : 'Download PDF'}
      </Button>
      <LinkButton to={'/b/' + t.branchId + '/book'} size="lg" icon="plus" className="tp-another">
        Book another
      </LinkButton>
      <LinkButton to={'/b/' + t.branchId} size="lg" icon="home" className="tp-home">
        Back to home
      </LinkButton>
    </div>
  );
}

/** For the business's own staff: start or finish their next service on this token. */
export function StaffActionBar({ t, user, running, nextUp, busy, act }) {
  return (
    <div className="staff-act">
      <span className="staff-act-label">
        <Icon name="user" /> Staff · {user.name}
      </span>
      <div>
        <span>
          <b>{(running || nextUp).serviceName}</b>
          <small>
            {t.customer.name} · {t.customer.mobile}
          </small>
        </span>
        {running ? (
          <Button variant="danger" size="lg" icon="stop" busy={busy} onClick={() => act('finish')}>
            Finish
          </Button>
        ) : (
          <Button variant="go" size="lg" icon="play" busy={busy} onClick={() => act('start')}>
            Start
          </Button>
        )}
      </div>
    </div>
  );
}

/** The services on the token, with start / finish / remove for staff, the offer and the total. */
export function ServicesPanel({
  t,
  d,
  s,
  busy,
  act,
  mineItem,
  editable,
  removeItem,
  onAdd,
  discount,
  subtotal,
  total,
  updatedAt,
}) {
  return (
    <div className="live-panel">
      <div className="live-panel-head">
        <b>Your services</b>
        <span className="num">{t.items.length}</span>
      </div>
      <ul className="live-items">
        {t.items.map((it, i) => (
          <li key={i}>
            <Avatar name={it.staffName} photo={(d.staffPhotos || {})[it.staffId]} size="sm" />
            <span>
              <b>{it.serviceName}</b>
              <small>
                {it.staffName} · {it.duration} min
                {it.startedAt ? ' · started ' + clock(it.startedAt) : ''}
                {it.endedAt ? ' · done ' + clock(it.endedAt) : ''}
              </small>
            </span>
            <span className="live-item-end">
              {mineItem(it) && t.status !== 'cancelled' && it.status === 'waiting' ? (
                <Button size="sm" variant="go" icon="play" busy={busy} onClick={() => act('start', i)}>
                  Start
                </Button>
              ) : mineItem(it) && it.status === 'in_progress' ? (
                <Button size="sm" variant="danger" icon="stop" busy={busy} onClick={() => act('finish', i)}>
                  Finish
                </Button>
              ) : (
                <Pill status={it.status} />
              )}
              {editable && it.status === 'waiting' && t.items.length > 1 && mineItem(it) && (
                <Button
                  size="sm"
                  variant="danger-quiet"
                  className="icon-only"
                  icon="x"
                  aria-label={'Remove ' + it.serviceName}
                  title="Remove this service"
                  busy={busy}
                  onClick={() => removeItem(i)}
                />
              )}
            </span>
          </li>
        ))}
      </ul>
      {editable && (
        <div className="live-add">
          <Button size="sm" variant="soft" icon="plus" onClick={onAdd}>
            Add services
          </Button>
          <small>Customer wants more? Add it to this token.</small>
        </div>
      )}
      {t.offer && (
        <div className="live-offer">
          <span className="live-offer-ico">
            <Icon name="gift" />
          </span>
          <span>
            <b>{t.offer.title}</b>
            <small>
              {t.offer.code ? 'Code ' + t.offer.code + ' · ' : ''}
              {discount > 0 ? 'Discount applied' : 'Show this offer at the desk'}
            </small>
          </span>
          {discount > 0 && <em className="num">−{money(discount, s.currency)}</em>}
        </div>
      )}
      <div className="live-total">
        <span>Total</span>
        <b className="num">
          {discount > 0 && <s className="live-was">{money(subtotal, s.currency)}</s>}
          {money(total, s.currency)}
        </b>
      </div>
      <p className="live-updated">
        <Icon name="refresh" />
        {FINAL.includes(t.status) ? 'Final status' : 'Updates every 15 seconds'} · last checked {clock(updatedAt)}
      </p>
    </div>
  );
}

/** A short burst of brand-coloured confetti when a token has just been booked. */
export function Confetti() {
  const colors = ['var(--brand)', 'var(--tone-rose)', 'var(--tone-amber)', 'var(--tone-teal)', 'var(--brand-line)'];
  const bits = Array.from({ length: 36 }, (_, i) => ({
    left: (i * 37) % 100,
    delay: ((i * 53) % 60) / 100,
    x: ((i * 71) % 120) - 60 + 'px',
    r: ((i * 97) % 720) - 360 + 'deg',
    color: colors[i % colors.length],
    round: i % 3 === 0,
  }));
  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i
          key={i}
          style={{
            left: b.left + '%',
            background: b.color,
            borderRadius: b.round ? '50%' : undefined,
            '--d': b.delay + 's',
            '--x': b.x,
            '--r': b.r,
          }}
        />
      ))}
    </div>
  );
}
