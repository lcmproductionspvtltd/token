/* Super admin → Businesses: platform figures, the business list with filters, and each business's
   actions (sign-in links, edit, menus & features, on/off, delete). Also the new / edit business and
   links dialogs. AdminApp.jsx holds the menu and passes the shared data in. */

import { useState } from 'react';
import { api } from '../core/api.js';
import { FeaturesDialog, menusOff } from './FeaturesDialog.jsx';
import { BulkBusinessDialog } from './BulkBusinessDialog.jsx';
import { ReferralDialog, onboardText } from './ReferralDialog.jsx';
import { CategoryChip } from './CategoriesTab.jsx';
import { addYears, dayText, money, plural, waLink } from '../core/format.js';
import {
  Button,
  Dialog,
  Empty,
  Field,
  Icon,
  Pill,
  RevealPassword,
  SalonMark,
  Switch,
  confirmAction,
  copyText,
  toast,
  useForm,
  usePaged,
} from '../core/ui.jsx';
import { BookingModes } from '../core/BookingModes.jsx';
import { StepFormDialog } from '../core/Steps.jsx';
import { MfaResetRow } from './MfaReset.jsx';
import { Figures, Panel, handleError } from './Shell.jsx';

export function BusinessesTab({ d, reload, may, editing, setEditing, showRef, setShowRef }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('');
  const [links, setLinks] = useState(null); // { salon, password? }
  const [featuresFor, setFeaturesFor] = useState(null);
  const [obFilter, setObFilter] = useState('');
  const [picked, setPicked] = useState(() => new Set()); // ids ticked for a bulk change
  const [bulk, setBulk] = useState(false);
  const all = d ? d.salons : [];
  const ql = q.trim().toLowerCase();
  const shown = all.filter(
    (x) =>
      (filter === 'all' ||
        (filter === 'active' && x.active && !x.expired) ||
        (filter === 'expired' && x.expired) ||
        (filter === 'disabled' && !x.active)) &&
      (!catFilter || (catFilter === 'none' ? !x.categoryId : x.categoryId === catFilter)) &&
      (!obFilter ||
        (obFilter.startsWith('by:')
          ? x.onboard.byId === obFilter.slice(3)
          : obFilter.startsWith('label:')
            ? x.onboard.label === obFilter.slice(6)
            : x.onboard.source === obFilter)) &&
      (!ql ||
        [x.name, x.slug, x.ownerName, x.ownerEmail, x.ownerMobile, x.ownerUsername]
          .join(' ')
          .toLowerCase()
          .includes(ql)),
  );
  const paged = usePaged('admin-salons', shown);

  // Bulk change: tick businesses (or all shown), then change their settings together.
  const canBulk = may('salons.edit') || may('salons.toggle');
  const selected = all.filter((x) => picked.has(x.id)).map((x) => x.id);
  const pick = (ids, on) =>
    setPicked((cur) => {
      const next = new Set(cur);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  const pageIds = paged.items.map((x) => x.id);
  const pageAll = pageIds.length > 0 && pageIds.every((id) => picked.has(id));

  const s = d.stats;

  const toggle = async (x) => {
    try {
      await api('PUT', '/api/admin/salons/' + x.id, { active: !x.active });
      toast(x.active ? x.name + ' disabled' : x.name + ' enabled');
      reload();
    } catch (err) {
      handleError(err);
    }
  };
  const del = async (x) => {
    const ok = await confirmAction({
      title: 'Delete ' + x.name + '?',
      message:
        'This deletes the business with all its branches, staff, tokens, sign-ins and images. It can’t be undone.',
      confirm: 'Delete business',
    });
    if (!ok) return;
    try {
      await api('DELETE', '/api/admin/salons/' + x.id);
      toast('Business deleted');
      reload();
    } catch (err) {
      handleError(err);
    }
  };

  const setSearch = (value) => {
    setQ(value);
    paged.reset();
  };

  return (
    <>
      <div className="stack">
        <Figures
          items={[
            ['Businesses', s.salons],
            ['Active', s.active, 'done'],
            ['Expired', s.expired, s.expired ? 'wait' : ''],
            ['Disabled', s.disabled],
            ['Tokens today', s.tokensToday],
            ...(s.revenue != null ? [['Plan revenue', money(s.revenue)]] : []),
          ]}
        />
        <Panel
          flush
          title={plural(shown.length, 'business', 'businesses')}
          actions={
            <div className="filters">
              <label className="search sm">
                <Icon name="search" />
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search business, owner, phone"
                  aria-label="Search businesses"
                />
              </label>
              <select
                className="input sm"
                value={filter}
                onChange={(e) => (setFilter(e.target.value), paged.reset())}
                aria-label="Status"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="disabled">Disabled</option>
              </select>
              {d.categories.length > 0 && (
                <select
                  className="input sm"
                  value={catFilter}
                  onChange={(e) => (setCatFilter(e.target.value), paged.reset())}
                  aria-label="Category"
                >
                  <option value="">All categories</option>
                  {d.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="none">No category</option>
                </select>
              )}
              <select
                className="input sm"
                value={obFilter}
                onChange={(e) => (setObFilter(e.target.value), paged.reset())}
                aria-label="Onboarded by"
              >
                <option value="">All onboarding</option>
                <option value="signup">Direct sign-up</option>
                <option value="admin">Created by admin / team</option>
                <option value="referral">Referral links</option>
                {[
                  ...new Map(
                    all.filter((x) => x.onboard.byId).map((x) => [x.onboard.byId, x.onboard.byName]),
                  ).entries(),
                ].map(([id, name]) => (
                  <option key={id} value={'by:' + id}>
                    By {name}
                  </option>
                ))}
                {[...new Set(all.map((x) => x.onboard.label).filter(Boolean))].map((l) => (
                  <option key={'l' + l} value={'label:' + l}>
                    Link: {l}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          {selected.length > 0 && (
            <div className="bulk-bar" role="region" aria-label="Selected businesses">
              <b>{plural(selected.length, 'business', 'businesses')} selected</b>
              {shown.some((x) => !picked.has(x.id)) && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() =>
                    pick(
                      shown.map((x) => x.id),
                      true,
                    )
                  }
                >
                  Select all {shown.length} shown
                </button>
              )}
              <span className="bulk-bar-actions">
                <Button size="sm" variant="quiet" icon="x" onClick={() => setPicked(new Set())}>
                  Clear
                </Button>
                <Button size="sm" variant="primary" icon="shield" onClick={() => setBulk(true)}>
                  Change settings
                </Button>
              </span>
            </div>
          )}
          {shown.length ? (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>
                        {canBulk ? (
                          <label className="pick-box">
                            <input
                              type="checkbox"
                              checked={pageAll}
                              onChange={(e) => pick(pageIds, e.target.checked)}
                              aria-label="Select all businesses on this page"
                            />
                            Business
                          </label>
                        ) : (
                          'Business'
                        )}
                      </th>
                      <th>Owner</th>
                      <th>Plan</th>
                      <th>Activity</th>
                      <th>Status</th>
                      <th className="r">
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.items.map((x) => (
                      <tr key={x.id}>
                        <td data-label="Business">
                          <div className="cell-with-thumb">
                            {canBulk && (
                              <input
                                type="checkbox"
                                className="pick-one"
                                checked={picked.has(x.id)}
                                onChange={(e) => pick([x.id], e.target.checked)}
                                aria-label={'Select ' + x.name}
                              />
                            )}
                            <SalonMark salon={x} size="sm" />
                            <span className="biz-cell">
                              <b>{x.name}</b>
                              <span className="biz-meta">
                                <CategoryChip category={d.categories.find((c) => c.id === x.categoryId)} />
                                <a href={'/s/' + x.slug} target="_blank" rel="noopener" className="dim-link">
                                  /s/{x.slug}
                                </a>
                              </span>
                            </span>
                          </div>
                        </td>
                        <td data-label="Owner">
                          <b>{x.ownerName || '—'}</b>
                          {x.ownerUsername && <small>@{x.ownerUsername}</small>}
                          {x.ownerMobile && <small className="num">{x.ownerMobile}</small>}
                          <span className={'onboard-chip ' + x.onboard.source} title={onboardText(x.onboard).how}>
                            <Icon
                              name={
                                x.onboard.source === 'signup'
                                  ? 'globe'
                                  : x.onboard.source === 'referral'
                                    ? 'share'
                                    : 'user'
                              }
                            />
                            {x.onboard.source === 'signup'
                              ? 'Direct sign-up'
                              : (x.onboard.source === 'referral' ? 'Referred by ' : 'By ') + onboardText(x.onboard).who}
                            {x.onboard.label && <em>{x.onboard.label}</em>}
                            {x.onboard.channel === 'app' && <em>app</em>}
                          </span>
                        </td>
                        <td data-label="Plan">
                          <b>{x.plan || 'No plan'}</b>
                          {x.amount != null && <small className="num">{money(x.amount, x.currency)}</small>}
                          <small>{x.expiresAt ? 'Till ' + dayText(x.expiresAt) : 'No expiry'}</small>
                        </td>
                        <td data-label="Activity">
                          <span className="activity">
                            <span title="Branches">
                              <Icon name="qr" /> <b className="num">{x.branches}</b>
                            </span>
                            <span title="Staff">
                              <Icon name="users" /> <b className="num">{x.staff}</b>
                            </span>
                            <span title="Tokens today">
                              <Icon name="ticket" /> <b className="num">{x.tokensToday}</b>
                            </span>
                          </span>
                          <small className="num">{x.tokensTotal} tokens in total</small>
                        </td>
                        <td data-label="Status">
                          <div className="status-pills">
                            {!x.active ? (
                              <Pill status="bad">Disabled</Pill>
                            ) : x.expired ? (
                              <Pill status="waiting">Expired</Pill>
                            ) : (
                              <Pill status="on">Active</Pill>
                            )}
                            {x.selfSignup && <Pill status="off">Signed up</Pill>}
                            {x.features && x.features.maskContacts && <Pill status="waiting">Contacts hidden</Pill>}
                            {menusOff(x.features) > 0 && (
                              <Pill status="off">{plural(menusOff(x.features), 'menu')} off</Pill>
                            )}
                          </div>
                        </td>
                        <td className="r actions">
                          <Button
                            size="sm"
                            variant="quiet"
                            className="icon-only"
                            icon="link"
                            title="Links & sign-in"
                            aria-label={'Links for ' + x.name}
                            onClick={() => setLinks({ salon: x })}
                          />
                          {may('salons.edit') && (
                            <Button
                              size="sm"
                              variant="quiet"
                              className="icon-only"
                              icon="edit"
                              title="Edit"
                              aria-label={'Edit ' + x.name}
                              onClick={() => setEditing(x)}
                            />
                          )}
                          {may('salons.edit') && (
                            <Button
                              size="sm"
                              variant="quiet"
                              className="icon-only"
                              icon="shield"
                              title="Menus & features"
                              aria-label={'Menus and features of ' + x.name}
                              onClick={() => setFeaturesFor(x)}
                            />
                          )}
                          {may('salons.toggle') && (
                            <Button
                              size="sm"
                              variant="quiet"
                              className={'icon-only' + (x.active ? '' : ' is-off')}
                              icon="power"
                              title={x.active ? 'Disable' : 'Enable'}
                              aria-label={(x.active ? 'Disable ' : 'Enable ') + x.name}
                              onClick={() => toggle(x)}
                            />
                          )}
                          {may('salons.delete') && (
                            <Button
                              size="sm"
                              variant="danger-quiet"
                              className="icon-only"
                              icon="trash"
                              title="Delete"
                              aria-label={'Delete ' + x.name}
                              onClick={() => del(x)}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {paged.pager}
            </>
          ) : all.length ? (
            <Empty
              icon="search"
              title="No businesses match"
              action={
                <Button size="sm" onClick={() => (setSearch(''), setFilter('all'), setCatFilter(''))}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <Empty
              icon="store"
              title="No businesses yet"
              action={
                <Button variant="primary" icon="plus" onClick={() => setEditing({})}>
                  Add the first business
                </Button>
              }
            >
              Each business gets an owner sign-in, a first branch and its own booking pages.
            </Empty>
          )}
        </Panel>
      </div>
      {editing && (
        <SalonDialog
          salon={editing}
          categories={d.categories}
          showMoney={may('revenue.view')}
          onClose={() => setEditing(null)}
          reload={reload}
          onCreated={async (id, password) => {
            const fresh = await reload();
            const salon = fresh && fresh.salons.find((x) => x.id === id);
            if (salon) setLinks({ salon, password });
          }}
        />
      )}
      {showRef && <ReferralDialog onClose={() => setShowRef(false)} />}
      {bulk && (
        <BulkBusinessDialog
          ids={selected}
          canEdit={may('salons.edit')}
          canToggle={may('salons.toggle')}
          onClose={() => setBulk(false)}
          onDone={() => {
            setPicked(new Set());
            reload();
          }}
        />
      )}
      {featuresFor && <FeaturesDialog salon={featuresFor} onClose={() => setFeaturesFor(null)} reload={reload} />}
      {links && <LinksDialog salon={links.salon} password={links.password} onClose={() => setLinks(null)} />}
    </>
  );
}

function SalonDialog({ salon, onClose, reload, onCreated, showMoney, categories = [] }) {
  const isNew = !salon.id;
  const [v, bind, set] = useForm({
    name: salon.name || '',
    slug: salon.slug || '',
    branchName: 'Main Branch',
    ownerName: salon.ownerName || '',
    ownerMobile: salon.ownerMobile || '',
    ownerEmail: salon.ownerEmail || '',
    username: salon.ownerUsername || '',
    password: '',
    plan: salon.plan || 'Yearly',
    amount: salon.amount != null ? salon.amount : '',
    currency: salon.currency || '₹',
    expiresAt: salon.expiresAt == null ? addYears(1) : salon.expiresAt,
    active: salon.active !== false,
    categoryId: salon.categoryId || '',
    serviceMode: salon.serviceMode || 'multiple',
    staffMode: salon.staffMode || 'multiple',
  });
  return (
    <StepFormDialog
      title={isNew ? 'New business' : 'Edit ' + salon.name}
      submit={isNew ? 'Create business' : 'Save changes'}
      width={660}
      free={!isNew}
      onClose={onClose}
      onSubmit={async () => {
        const body = { ...v };
        if (!isNew) delete body.branchName;
        if (!showMoney) delete body.amount;
        if (!body.password) delete body.password;
        const r = await api(isNew ? 'POST' : 'PUT', '/api/admin/salons' + (isNew ? '' : '/' + salon.id), body);
        toast(isNew ? 'Business created' : 'Business saved');
        if (isNew) onCreated(r.id, v.password);
        else reload();
      }}
      steps={[
        {
          title: 'Business',
          body: (
            <>
              <div className="form-row">
                <Field label="Business name">
                  <input {...bind('name')} required maxLength={80} />
                </Field>
                <Field label="Page link" hint={'/s/' + (v.slug || 'made-from-name')}>
                  <input {...bind('slug')} maxLength={60} autoCapitalize="none" placeholder="Optional" />
                </Field>
              </div>
              <CategoryPicker categories={categories} value={v.categoryId} set={set} />
              {isNew && (
                <Field label="First branch name">
                  <input {...bind('branchName')} maxLength={80} />
                </Field>
              )}
            </>
          ),
        },
        {
          title: 'Booking form',
          body: (
            <div className="field">
              <span className="field-label">How customers book</span>
              <BookingModes serviceMode={v.serviceMode} staffMode={v.staffMode} onChange={set} />
            </div>
          ),
        },
        { title: 'Owner', body: <OwnerFields bind={bind} isNew={isNew} salon={salon} reload={reload} /> },
        {
          title: 'Plan',
          body: (
            <>
              <PlanFields bind={bind} showMoney={showMoney} />
              <Switch
                checked={v.active}
                onChange={(x) => set('active', x)}
                label="Business enabled"
                hint="When disabled, online booking and the business’s sign-ins stop working."
              />
            </>
          ),
        },
      ]}
    />
  );
}

/** Pick the business category (or none). */
function CategoryPicker({ categories, value, set }) {
  return (
    <div className="field">
      <span className="field-label">Business category</span>
      <div className="cat-pick" role="radiogroup" aria-label="Business category">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={value === c.id}
            className={'cat-pick-item' + (value === c.id ? ' on' : '')}
            style={{ '--cat': c.color }}
            onClick={() => set('categoryId', c.id)}
          >
            <span className="cat-ico">
              <Icon name={c.icon} />
            </span>
            {c.name}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={!value}
          className={'cat-pick-item' + (!value ? ' on' : '')}
          style={{ '--cat': '#64748b' }}
          onClick={() => set('categoryId', '')}
        >
          <span className="cat-ico">
            <Icon name="minus" />
          </span>
          No category
        </button>
      </div>
      <small className="field-hint">
        The owner sees default services for this category, plus the ones for all businesses.
      </small>
    </div>
  );
}

/** The owner’s name, contact details and sign-in. */
function OwnerFields({ bind, isNew, salon, reload }) {
  return (
    <fieldset className="fieldset">
      <legend>Owner</legend>
      <div className="form-row">
        <Field label="Name">
          <input {...bind('ownerName')} maxLength={80} />
        </Field>
        <Field label="Mobile">
          <input {...bind('ownerMobile')} maxLength={20} inputMode="tel" />
        </Field>
        <Field label="Email">
          <input {...bind('ownerEmail')} type="email" maxLength={120} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Username">
          <input {...bind('username')} required={isNew} autoCapitalize="none" autoComplete="off" />
        </Field>
        <Field
          label={isNew ? 'Password' : 'New password'}
          hint={isNew ? 'At least 8 characters.' : 'Leave blank to keep the current one.'}
        >
          <RevealPassword {...bind('password')} required={isNew} minLength={8} autoComplete="new-password" />
        </Field>
      </div>
      {!isNew && salon.ownerUserId && (
        <MfaResetRow
          userId={salon.ownerUserId}
          name={salon.ownerName || salon.name}
          enabled={salon.ownerMfa}
          onDone={reload}
        />
      )}
    </fieldset>
  );
}

/** Plan name, amount, currency and expiry. */
function PlanFields({ bind, showMoney }) {
  return (
    <fieldset className="fieldset">
      <legend>Plan</legend>
      <div className="form-row">
        <Field label="Plan name">
          <input {...bind('plan')} maxLength={40} />
        </Field>
        {showMoney && (
          <Field label="Amount">
            <input {...bind('amount')} type="number" min="0" step="any" inputMode="decimal" />
          </Field>
        )}
        <Field label="Currency">
          <input {...bind('currency')} maxLength={6} />
        </Field>
        <Field label="Valid till" hint="Blank = no expiry">
          <input {...bind('expiresAt')} type="date" />
        </Field>
      </div>
    </fieldset>
  );
}

/** The links and sign-in details to hand over to a salon owner. */
function LinksDialog({ salon, password, onClose }) {
  const o = location.origin;
  const rows = [
    ['Sign-in page (owner & staff)', o + '/s/' + salon.slug + '/login'],
    ['Customer page', o + '/s/' + salon.slug],
    ['Username', salon.ownerUsername],
    password && ['Password', password],
  ].filter((r) => r && r[1]);
  const message =
    `${salon.name} on BQuee\n\n` +
    rows.map(([label, value]) => `${label}: ${value}`).join('\n') +
    (password ? '\n\nPlease change your password after your first sign-in (My profile → Change password).' : '');
  return (
    <Dialog
      title={password ? salon.name + ' is ready' : 'Links for ' + salon.name}
      onClose={onClose}
      width={560}
      footer={
        <>
          {salon.ownerMobile && (
            <a
              className="btn quiet"
              href={waLink(salon.ownerMobile) + '?text=' + encodeURIComponent(message)}
              target="_blank"
              rel="noopener"
            >
              <Icon name="chat" />
              <span>Send on WhatsApp</span>
            </a>
          )}
          <Button variant="primary" icon="copy" onClick={() => copyText(message, 'Details copied')}>
            Copy all
          </Button>
        </>
      }
    >
      <p className="confirm-text">
        {password
          ? 'Send these details to the owner. The password is shown only now.'
          : 'Send these to the owner. Branch QR codes are in their dashboard under Branches & QR.'}
      </p>
      <ul className="handover">
        {rows.map(([label, value]) => (
          <li key={label}>
            <span>
              <small>{label}</small>
              <b className={value.startsWith('http') ? 'link' : ''}>{value}</b>
            </span>
            <Button
              size="sm"
              variant="quiet"
              className="icon-only"
              icon="copy"
              aria-label={'Copy ' + label}
              onClick={() => copyText(value, label + ' copied')}
            />
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
