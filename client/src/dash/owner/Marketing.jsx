/* Owner: offers (shown as coupons on the landing page) and client reviews. */

import { useState } from 'react';
import { api } from '../../core/api.js';
import { dayText, plural } from '../../core/format.js';
import {
  Avatar,
  Button,
  Empty,
  Field,
  FormDialog,
  ImagePicker,
  Pill,
  Switch,
  confirmAction,
  toast,
  useForm,
  usePaged,
  SearchInput,
  searchList,
  NoMatches,
} from '../../core/ui.jsx';
import { OFFER_THEMES, OfferCoupon, Stars } from '../../customer/parts.jsx';
import { Panel, handleError } from '../Shell.jsx';

async function remove(title, url, done, reload) {
  if (!(await confirmAction({ title, message: 'It will be removed from your landing page.', confirm: 'Delete' })))
    return;
  try {
    await api('DELETE', url);
    toast(done);
    reload();
  } catch (err) {
    handleError(err);
  }
}

/* ================= offers ================= */

export function OffersTab({ d, reload }) {
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const shownOffers = searchList(d.offers, q, (x) => [x.title, x.code, x.badge, x.description]);
  const { items, pager, reset } = usePaged('owner-offers', shownOffers);
  return (
    <Panel
      title={plural(d.offers.length, 'offer')}
      sub="Active offers appear on your landing page. Expired ones hide by themselves."
      actions={
        <>
          {d.offers.length > 0 && <SearchInput value={q} onChange={(v) => (setQ(v), reset())} label="Search offers" />}
          <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing({})}>
            Add offer
          </Button>
        </>
      }
    >
      {d.offers.length ? (
        <>
          <div className="offer-grid">
            {items.map((o) => (
              <div key={o.id} className={'offer-item' + (o.active && !o.expired ? '' : ' faded')}>
                <OfferCoupon offer={o} />
                <div className="offer-meta">
                  {o.expired ? (
                    <Pill status="bad">Expired</Pill>
                  ) : o.active ? (
                    <Pill status="on">Showing</Pill>
                  ) : (
                    <Pill>Hidden</Pill>
                  )}
                  {o.validTill && <small>till {dayText(o.validTill)}</small>}
                  <span className="grow" />
                  <Button size="sm" variant="quiet" icon="edit" onClick={() => setEditing(o)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="danger-quiet"
                    className="icon-only"
                    icon="trash"
                    aria-label={'Delete ' + o.title}
                    onClick={() =>
                      remove('Delete “' + o.title + '”?', '/api/owner/offers/' + o.id, 'Offer deleted', reload)
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          {q && !items.length && <NoMatches />}
          {pager}
        </>
      ) : (
        <Empty
          icon="gift"
          title="No offers yet"
          action={
            <Button variant="primary" icon="plus" onClick={() => setEditing({})}>
              Create an offer
            </Button>
          }
        >
          A discount or package with an optional promo code. It shows as a coupon customers can copy.
        </Empty>
      )}
      {editing && <OfferDialog offer={editing} onClose={() => setEditing(null)} reload={reload} />}
    </Panel>
  );
}

function OfferDialog({ offer, onClose, reload }) {
  const isNew = !offer.id;
  const [v, bind, set] = useForm({
    title: offer.title || '',
    badge: offer.badge || '',
    description: offer.description || '',
    code: offer.code || '',
    validTill: offer.validTill || '',
    theme: offer.theme || 0,
    image: offer.image || '',
    active: offer.active !== false,
    discountType: offer.discountType || 'none',
    discountValue: offer.discountValue || '',
  });
  return (
    <FormDialog
      title={isNew ? 'New offer' : 'Edit offer'}
      submit={isNew ? 'Add offer' : 'Save changes'}
      width={640}
      onClose={onClose}
      onSubmit={async () => {
        await api(isNew ? 'POST' : 'PUT', '/api/owner/offers' + (isNew ? '' : '/' + offer.id), v);
        toast(isNew ? 'Offer added' : 'Offer saved');
        reload();
      }}
    >
      <div className="offer-preview">
        <OfferCoupon offer={{ ...v, title: v.title || 'Your offer title', code: v.code.toUpperCase() }} />
      </div>
      <div className="form-row">
        <Field label="Offer title">
          <input {...bind('title')} required maxLength={80} placeholder="e.g. Weekday glow" />
        </Field>
        <Field label="Headline" hint="Short and big, e.g. 20% OFF">
          <input {...bind('badge')} maxLength={20} />
        </Field>
      </div>
      <Field label="Details">
        <textarea {...bind('description')} maxLength={240} rows={2} placeholder="What’s included and when it applies" />
      </Field>
      <div className="form-row">
        <Field label="Promo code" hint="Optional">
          <input {...bind('code')} maxLength={20} style={{ textTransform: 'uppercase' }} />
        </Field>
        <Field label="Valid till" hint="Leave blank for no end date">
          <input {...bind('validTill')} type="date" />
        </Field>
      </div>
      <fieldset className="fieldset">
        <legend>When a customer books with this offer</legend>
        <p className="field-hint">
          Customers tap Book on the offer card; the offer is saved on their token for your staff to see.
        </p>
        <div className="seg disc-seg" role="radiogroup" aria-label="Discount">
          {[
            ['none', 'No discount', 'Staff apply it at the desk'],
            ['percent', '% off', 'Percentage off the total'],
            ['flat', 'Amount off', 'Fixed amount off the total'],
          ].map(([k, label, hint]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={v.discountType === k}
              className={v.discountType === k ? 'on' : ''}
              onClick={() => set('discountType', k)}
              title={hint}
            >
              {label}
            </button>
          ))}
        </div>
        {v.discountType !== 'none' && (
          <Field
            label={v.discountType === 'percent' ? 'Percent off' : 'Amount off'}
            hint={
              v.discountType === 'percent'
                ? 'e.g. 20 for 20% off the token total'
                : 'Taken off the token total (never below zero)'
            }
          >
            <input
              {...bind('discountValue')}
              type="number"
              min="1"
              max={v.discountType === 'percent' ? 100 : undefined}
              step="any"
              required
              inputMode="decimal"
            />
          </Field>
        )}
      </fieldset>
      <div className="field">
        <span className="field-label">Colour</span>
        <div className="swatches" role="radiogroup" aria-label="Coupon colour">
          {OFFER_THEMES.map((t, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={Number(v.theme) === i}
              aria-label={'Colour ' + (i + 1)}
              className={'swatch' + (Number(v.theme) === i ? ' on' : '')}
              style={{ background: `linear-gradient(135deg, ${t[0]}, ${t[1]})` }}
              onClick={() => set('theme', i)}
            />
          ))}
        </div>
      </div>
      <ImagePicker
        label="Background photo"
        value={v.image}
        onChange={(x) => set('image', x)}
        max={900}
        shape="wide"
        hint="Optional. The colour is laid over it."
      />
      <Switch checked={v.active} onChange={(x) => set('active', x)} label="Show on landing page" />
    </FormDialog>
  );
}

/* ================= reviews ================= */

export function ReviewsTab({ d, reload }) {
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const shownReviews = searchList(d.testimonials, q, (x) => [x.name, x.label, x.text]);
  const { items, pager, reset } = usePaged('owner-reviews', shownReviews);
  return (
    <Panel
      title={plural(d.testimonials.length, 'review')}
      sub="Add genuine reviews from your clients. Visible ones appear on every branch page, newest first."
      actions={
        <>
          {d.testimonials.length > 0 && (
            <SearchInput value={q} onChange={(v) => (setQ(v), reset())} label="Search reviews" />
          )}
          <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing({})}>
            Add review
          </Button>
        </>
      }
    >
      {d.testimonials.length ? (
        <>
          <ul className="review-list">
            {items.map((r) => (
              <li key={r.id} className={r.active ? '' : 'faded'}>
                <Avatar name={r.name} photo={r.photo} />
                <div className="review-body">
                  <div className="review-top">
                    <b>{r.name}</b>
                    {r.label && <small>{r.label}</small>}
                    <Stars value={r.rating} />
                    {!r.active && <Pill>Hidden</Pill>}
                  </div>
                  <p>{r.text}</p>
                </div>
                <div className="actions">
                  <Button
                    size="sm"
                    variant="quiet"
                    className="icon-only"
                    icon="edit"
                    aria-label={'Edit review by ' + r.name}
                    onClick={() => setEditing(r)}
                  />
                  <Button
                    size="sm"
                    variant="danger-quiet"
                    className="icon-only"
                    icon="trash"
                    aria-label={'Delete review by ' + r.name}
                    onClick={() =>
                      remove('Delete this review?', '/api/owner/testimonials/' + r.id, 'Review deleted', reload)
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
          {q && !items.length && <NoMatches />}
          {pager}
        </>
      ) : (
        <Empty
          icon="star"
          title="No reviews yet"
          action={
            <Button variant="primary" icon="plus" onClick={() => setEditing({})}>
              Add a review
            </Button>
          }
        >
          Reviews from real clients help new customers decide to book.
        </Empty>
      )}
      {editing && <ReviewDialog review={editing} onClose={() => setEditing(null)} reload={reload} />}
    </Panel>
  );
}

function ReviewDialog({ review, onClose, reload }) {
  const isNew = !review.id;
  const [v, bind, set] = useForm({
    name: review.name || '',
    label: review.label || '',
    text: review.text || '',
    rating: review.rating || 5,
    photo: review.photo || '',
    active: review.active !== false,
  });
  return (
    <FormDialog
      title={isNew ? 'Add review' : 'Edit review'}
      submit={isNew ? 'Add review' : 'Save changes'}
      onClose={onClose}
      onSubmit={async () => {
        await api(isNew ? 'POST' : 'PUT', '/api/owner/testimonials' + (isNew ? '' : '/' + review.id), v);
        toast(isNew ? 'Review added' : 'Review saved');
        reload();
      }}
    >
      <div className="form-row">
        <Field label="Client name">
          <input {...bind('name')} required maxLength={60} />
        </Field>
        <Field label="Service or label" hint="e.g. Bridal makeup, Regular client">
          <input {...bind('label')} maxLength={60} />
        </Field>
      </div>
      <Field label="What they said">
        <textarea {...bind('text')} required maxLength={400} rows={3} />
      </Field>
      <div className="field">
        <span className="field-label">Rating</span>
        <div className="rating-pick" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={Number(v.rating) === n}
              aria-label={n + ' stars'}
              className={n <= v.rating ? 'on' : ''}
              onClick={() => set('rating', n)}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <ImagePicker
        label="Photo"
        value={v.photo}
        onChange={(x) => set('photo', x)}
        max={160}
        square
        shape="round"
        hint="Optional"
      />
      <Switch checked={v.active} onChange={(x) => set('active', x)} label="Show on landing page" />
    </FormDialog>
  );
}
