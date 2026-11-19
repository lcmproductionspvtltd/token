/* Pieces shared by the customer pages: ticket shell, offer coupons, reviews, saved tokens. */

import { useState } from 'react';
import { myTokens } from '../core/api.js';
import { categoryIcon, dayText, hashHue, offerLabel, todayStr } from '../core/format.js';
import { navigate } from '../core/router.jsx';
import { Avatar, Field, FormDialog, Icon, copyText } from '../core/ui.jsx';

export const DEFAULT_COVER = '/img/default-cover.svg';

/**
 * The ticket: a top and a bottom half joined by a perforation with round notches.
 *   <Ticket top={…} bottom={…} />
 */
export function Ticket({ top, bottom, className = '', ...rest }) {
  return (
    <div className={'ticket ' + className} {...rest}>
      <div className="ticket-top">{top}</div>
      {bottom && <div className="ticket-bottom">{bottom}</div>}
    </div>
  );
}

export function Stars({ value, className = '' }) {
  return (
    <span className={'stars ' + className} role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" className={i <= value ? 'on' : ''} />
      ))}
    </span>
  );
}

/* Offer colour themes (owner picks one per offer). */
export const OFFER_THEMES = [
  ['#5b1a73', '#a3289f'],
  ['#9d174d', '#e0603a'],
  ['#0f5f58', '#1f9d63'],
  ['#1e3a8a', '#6b3fd4'],
  ['#7a3a0c', '#d48612'],
  ['#1d1924', '#5e2a7e'],
];

export function OfferCoupon({ offer, onBook, currency }) {
  const [copied, setCopied] = useState(false);
  const theme = OFFER_THEMES[offer.theme] || OFFER_THEMES[0];
  const saving = offerLabel(offer, currency);
  const copy = () => {
    copyText(offer.code, 'Code copied');
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <article className="coupon v2" style={{ '--c1': theme[0], '--c2': theme[1] }}>
      <div className="coupon-hero" style={offer.image ? { '--img': `url("${offer.image}")` } : undefined}>
        <span className="coupon-rings" aria-hidden="true" />
        <span className="coupon-gift" aria-hidden="true">
          <Icon name="gift" />
        </span>
        <b className="coupon-big">{offer.badge || saving || 'Offer'}</b>
        {saving && offer.badge && <span className="coupon-save">{saving} when you book</span>}
      </div>
      <div className="coupon-body">
        <h3>{offer.title}</h3>
        {offer.description && <p>{offer.description}</p>}
        <span className="coupon-valid">
          <Icon name="calendar" />
          {offer.validTill ? 'Valid till ' + dayText(offer.validTill) : 'No end date'}
        </span>
      </div>
      <div className="coupon-tear" aria-hidden="true" />
      <div className="coupon-foot">
        {offer.code ? (
          <button
            type="button"
            className={'coupon-code' + (copied ? ' copied' : '')}
            onClick={copy}
            aria-label={`Copy code ${offer.code}`}
          >
            <span className="coupon-code-label">{copied ? 'Copied!' : 'Code'}</span>
            <b>{offer.code}</b>
            <Icon name={copied ? 'check' : 'copy'} />
          </button>
        ) : (
          <span className="coupon-code plain">
            <span className="coupon-code-label">No code needed</span>
            <b>{saving ? 'Applied when you book' : 'Mention it at the desk'}</b>
          </span>
        )}
        {onBook && (
          <button
            type="button"
            className="coupon-book"
            onClick={() => onBook(offer)}
            aria-label={'Book with offer ' + offer.title}
          >
            Book with this offer <Icon name="arrow" />
          </button>
        )}
      </div>
    </article>
  );
}

export function ReviewCard({ review }) {
  return (
    <figure className="review">
      <div className="review-top">
        <Stars value={review.rating} />
        <Icon name="quote" className="review-quote" />
      </div>
      <blockquote>{review.text}</blockquote>
      <figcaption>
        <Avatar name={review.name} photo={review.photo} size="sm" />
        <span>
          <b>{review.name}</b>
          {review.label && <small>{review.label}</small>}
        </span>
      </figcaption>
    </figure>
  );
}

/** Today's tokens booked on this device, optionally for one salon. */
export const todaysTokens = (salonId) =>
  myTokens().filter((t) => t.date === todayStr() && (!salonId || t.salonId === salonId));

export function CheckTokenDialog({ onClose }) {
  const [id, setId] = useState('');
  return (
    <FormDialog
      title="Find your token"
      submit="Open token"
      width={420}
      onClose={onClose}
      onSubmit={async () => {
        const value = id.trim();
        const m = value.match(/\/t\/([A-Za-z0-9]+)/);
        navigate('/t/' + encodeURIComponent(m ? m[1] : value));
      }}
    >
      <Field label="Token ID" hint="It’s printed under the QR code on your token.">
        <input
          value={id}
          onChange={(e) => setId(e.target.value)}
          required
          autoComplete="off"
          placeholder="e.g. 9cd20bf84563"
        />
      </Field>
    </FormDialog>
  );
}

/** Service image, or an icon tile tinted from the category. */
export function ServiceThumb({ service, className = '' }) {
  if (service.image) return <img className={'svc-thumb ' + className} src={service.image} alt="" loading="lazy" />;
  const hue = [292, 330, 268, 200, 28, 160, 248, 350][hashHue(service.category || service.name) % 8];
  return (
    <span className={'svc-thumb ph ' + className} style={{ '--h': hue }} aria-hidden="true">
      <Icon name={categoryIcon((service.category || '') + ' ' + service.name)} />
    </span>
  );
}
