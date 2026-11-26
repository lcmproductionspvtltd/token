/* Owner → Services: the services customers book, price per branch, and loading the default services. */

import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { categoryIcon, money, plural } from '../../core/format.js';
import {
  Button,
  Dialog,
  Spinner,
  Empty,
  Field,
  FormDialog,
  Icon,
  ImagePicker,
  Pill,
  Switch,
  toast,
  useForm,
  usePaged,
  SearchInput,
  searchList,
  NoMatches,
} from '../../core/ui.jsx';
import { ServiceThumb } from '../../customer/parts.jsx';
import { Panel, handleError } from '../Shell.jsx';
import { confirmDelete } from './confirmDelete.js';

export function ServicesTab({ d, reload }) {
  const [editing, setEditing] = useState(null);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const sorted = d.services
    .slice()
    .sort((a, b) => (a.category || '~').localeCompare(b.category || '~') || a.name.localeCompare(b.name));
  const [q, setQ] = useState('');
  const shownServices = searchList(sorted, q, (x) => [x.name, x.category, x.description]);
  const { items, pager, reset } = usePaged('owner-services', shownServices);
  const branchNames = (ids) =>
    !ids.length || ids.length === d.branches.length
      ? 'All branches'
      : ids
          .map((id) => (d.branches.find((b) => b.id === id) || {}).name)
          .filter(Boolean)
          .join(', ');
  const staffCount = (id) => d.staff.filter((s) => s.serviceIds.includes(id)).length;

  return (
    <Panel
      flush
      title={plural(d.services.length, 'service')}
      sub="Customers see active services that at least one staff member offers."
      actions={
        <>
          {d.services.length > 0 && (
            <SearchInput value={q} onChange={(v) => (setQ(v), reset())} label="Search services" />
          )}
          <Button size="sm" icon="download" onClick={() => setLoadingDefaults(true)}>
            Load default services
          </Button>
          <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing({})}>
            Add service
          </Button>
        </>
      }
    >
      {d.services.length ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Category</th>
                  <th className="r">Price</th>
                  <th className="r">Time</th>
                  <th>Staff</th>
                  {d.branches.length > 1 && <th>Branches</th>}
                  <th>Status</th>
                  <th className="r">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <ServiceRow
                    key={x.id}
                    x={x}
                    d={d}
                    staffCount={staffCount}
                    branchNames={branchNames}
                    setEditing={setEditing}
                    reload={reload}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {q && !items.length && <NoMatches />}
          {pager}
        </>
      ) : (
        <Empty
          icon="tag"
          title="No services yet"
          action={
            <div className="empty-actions">
              <Button variant="primary" icon="download" onClick={() => setLoadingDefaults(true)}>
                Load default services
              </Button>
              <Button icon="plus" onClick={() => setEditing({})}>
                Add your own
              </Button>
            </div>
          }
        >
          Start fast with a ready list of common services, then change prices and times to suit your business.
        </Empty>
      )}
      {editing && <ServiceDialog d={d} service={editing} onClose={() => setEditing(null)} reload={reload} />}
      {loadingDefaults && <LoadDefaultsDialog d={d} onClose={() => setLoadingDefaults(false)} reload={reload} />}
    </Panel>
  );
}

/** One service: picture, group, price (and whether it varies by branch), time, staff, branches, status, edit and delete. */
function ServiceRow({ x, d, staffCount, branchNames, setEditing, reload }) {
  return (
    <tr className={x.active ? '' : 'muted-row'}>
      <td data-label="Service">
        <div className="cell-with-thumb">
          <ServiceThumb service={x} className="sm" />
          <span>
            <b>{x.name}</b>
            {x.description && <small>{x.description}</small>}
          </span>
        </div>
      </td>
      <td data-label="Category">
        {x.category ? (
          <span className="cat">
            <Icon name={categoryIcon(x.category)} /> {x.category}
          </span>
        ) : (
          <span className="dim">—</span>
        )}
      </td>
      <td data-label="Price" className="r num">
        {money(x.price, d.salon.currency)}
        {d.branches.length > 1 && Object.keys(x.branchPrices || {}).length > 0 && (
          <small className="price-varies">Varies by branch</small>
        )}
      </td>
      <td data-label="Time" className="r num">
        {x.duration} min
      </td>
      <td data-label="Staff">
        {staffCount(x.id) ? plural(staffCount(x.id), 'person', 'people') : <span className="warn">No staff</span>}
      </td>
      {d.branches.length > 1 && <td data-label="Branches">{branchNames(x.branchIds)}</td>}
      <td data-label="Status">{x.active ? <Pill status="on">Active</Pill> : <Pill>Hidden</Pill>}</td>
      <td className="r actions">
        <Button
          size="sm"
          variant="quiet"
          className="icon-only"
          icon="edit"
          aria-label={'Edit ' + x.name}
          onClick={() => setEditing(x)}
        />
        <Button
          size="sm"
          variant="danger-quiet"
          className="icon-only"
          icon="trash"
          aria-label={'Delete ' + x.name}
          onClick={() =>
            confirmDelete({
              title: 'Delete ' + x.name + '?',
              message: 'It disappears from booking. Past tokens keep their records.',
              url: '/api/owner/services/' + x.id,
              done: 'Service deleted',
              reload,
            })
          }
        />
      </td>
    </tr>
  );
}

function ServiceDialog({ d, service, onClose, reload }) {
  const isNew = !service.id;
  const cats = [...new Set([...d.services.map((x) => x.category).filter(Boolean), ...(d.serviceGroups || [])])];
  const [v, bind, set] = useForm({
    name: service.name || '',
    category: service.category || '',
    description: service.description || '',
    duration: service.duration || 30,
    price: service.price != null ? service.price : '',
    image: service.image || '',
    branchIds: service.branchIds || [],
    branchPrices: Object.fromEntries(Object.entries(service.branchPrices || {}).map(([k, p]) => [k, String(p)])),
    active: service.active !== false,
  });
  // "All branches" = a default service offered everywhere; "Selected branches" = only the ticked ones.
  const [scope, setScope] = useState((service.branchIds || []).length ? 'some' : 'all');
  const toggleBranch = (id) =>
    set('branchIds', v.branchIds.includes(id) ? v.branchIds.filter((x) => x !== id) : [...v.branchIds, id]);
  const priceBranches = scope === 'all' ? d.branches : d.branches.filter((b) => v.branchIds.includes(b.id));
  const setBranchPrice = (id, value) => set('branchPrices', { ...v.branchPrices, [id]: value });
  return (
    <FormDialog
      title={isNew ? 'Add service' : 'Edit service'}
      submit={isNew ? 'Add service' : 'Save changes'}
      width={580}
      onClose={onClose}
      onSubmit={async () => {
        if (scope === 'some' && !v.branchIds.length)
          throw new Error('Tick at least one branch, or choose All branches.');
        const branchIds = scope === 'all' ? [] : v.branchIds;
        const keep = scope === 'all' ? d.branches.map((b) => b.id) : branchIds;
        const branchPrices = Object.fromEntries(
          Object.entries(v.branchPrices).filter(([k, p]) => keep.includes(k) && String(p).trim() !== ''),
        );
        await api(isNew ? 'POST' : 'PUT', '/api/owner/services' + (isNew ? '' : '/' + service.id), {
          ...v,
          branchIds,
          branchPrices,
        });
        toast(isNew ? 'Service added' : 'Service saved');
        reload();
      }}
    >
      <Field label="Service name">
        <input {...bind('name')} required maxLength={80} placeholder="e.g. Consultation" />
      </Field>
      <div className="form-row">
        <Field label="Category" hint="Groups services for customers, e.g. General, Express, Premium.">
          <input {...bind('category')} maxLength={40} list="svc-cats" />
          <datalist id="svc-cats">
            {cats.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label={(d.branches.length > 1 ? 'Normal price (' : 'Price (') + (d.salon.currency || '₹') + ')'}>
          <input {...bind('price')} type="number" min="0" step="any" required inputMode="decimal" />
        </Field>
        <Field label="Time (minutes)">
          <input {...bind('duration')} type="number" min="1" max="600" required inputMode="numeric" />
        </Field>
      </div>
      <Field label="Short description">
        <input {...bind('description')} maxLength={200} placeholder="Optional" />
      </Field>
      <ImagePicker
        label="Photo"
        value={v.image}
        onChange={(x) => set('image', x)}
        max={200}
        square
        hint="Square, shown in the booking list."
      />
      {d.branches.length > 1 && (
        <div className="field">
          <span className="field-label">Available at</span>
          <div className="checks">
            <label className="check-chip">
              <input type="radio" name="svc-scope" checked={scope === 'all'} onChange={() => setScope('all')} />
              <span>All branches (default service)</span>
            </label>
            <label className="check-chip">
              <input type="radio" name="svc-scope" checked={scope === 'some'} onChange={() => setScope('some')} />
              <span>Selected branches</span>
            </label>
          </div>
          {scope === 'some' && (
            <div className="checks">
              {d.branches.map((b) => (
                <label key={b.id} className="check-chip">
                  <input type="checkbox" checked={v.branchIds.includes(b.id)} onChange={() => toggleBranch(b.id)} />
                  <span>{b.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      {d.branches.length > 1 && priceBranches.length > 0 && (
        <div className="field">
          <span className="field-label">Price at each branch</span>
          <div className="branch-prices">
            {priceBranches.map((b) => (
              <label key={b.id} className="branch-price">
                <span>{b.name}</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={v.branchPrices[b.id] ?? ''}
                  placeholder={v.price === '' ? 'Normal price' : String(v.price)}
                  onChange={(e) => setBranchPrice(b.id, e.target.value)}
                  aria-label={'Price at ' + b.name}
                />
              </label>
            ))}
          </div>
          <small className="field-hint">Leave a branch blank to use the normal price.</small>
        </div>
      )}
      <Switch checked={v.active} onChange={(x) => set('active', x)} label="Show to customers" />
    </FormDialog>
  );
}

function LoadDefaultsDialog({ d, onClose, reload }) {
  const [list, setList] = useState(null);
  const [category, setCategory] = useState('');
  const [picked, setPicked] = useState([]);
  const [assignAll, setAssignAll] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api('GET', '/api/owner/default-services')
      .then((r) => {
        setList(r.services);
        setCategory(r.category || '');
        setPicked(r.services.filter((x) => !x.added).map((x) => x.id));
      })
      .catch((err) => {
        handleError(err);
        onClose();
      });
  }, []);

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const available = (list || []).filter((x) => !x.added);
  const allOn = available.length > 0 && available.every((x) => picked.includes(x.id));

  const submit = async () => {
    setSaving(true);
    try {
      const r = await api('POST', '/api/owner/default-services/load', { ids: picked, assignAll });
      toast(
        r.added
          ? plural(r.added, 'service') + ' added – edit them any time'
          : 'Those services are already in your list',
      );
      reload();
      onClose();
    } catch (err) {
      handleError(err);
      setSaving(false);
    }
  };

  return (
    <Dialog
      title="Load default services"
      width={600}
      onClose={onClose}
      className="defaults-dialog"
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="download" disabled={!picked.length || saving} onClick={submit}>
            {picked.length ? 'Add ' + plural(picked.length, 'service') : 'Choose services'}
          </Button>
        </>
      }
    >
      {!list ? (
        <div className="center-pad">
          <Spinner />
        </div>
      ) : !list.length ? (
        <p className="dim">There are no default services yet.</p>
      ) : (
        <>
          <p className="defaults-intro">
            {category ? (
              <>
                Services for <b>{category}</b> and for all businesses.{' '}
              </>
            ) : null}
            They’re copied into your business. Change the price, time or photo, or delete them – it only affects your
            business.
          </p>
          <div className="defaults-head">
            <b>{available.length ? plural(picked.length, 'service') + ' selected' : 'You already have all of these'}</b>
            {available.length > 0 && (
              <button
                type="button"
                className="link-btn"
                onClick={() => setPicked(allOn ? [] : available.map((x) => x.id))}
              >
                {allOn ? 'Clear all' : 'Select all'}
              </button>
            )}
          </div>
          <ul className="defaults-list">
            {list.map((x) => (
              <li key={x.id}>
                <label className={x.added ? 'is-added' : ''}>
                  <input
                    type="checkbox"
                    checked={x.added || picked.includes(x.id)}
                    disabled={x.added}
                    onChange={() => toggle(x.id)}
                  />
                  <ServiceThumb service={x} className="sm" />
                  <span className="defaults-name">
                    <b>
                      {x.name}
                      {category && !x.forAll && <span className="for-you">For {category}</span>}
                    </b>
                    <small>
                      {x.added ? 'Already in your services' : [x.category, x.description].filter(Boolean).join(' · ')}
                    </small>
                  </span>
                  <span className="defaults-meta num">
                    <b>{money(x.price, d.salon.currency)}</b>
                    <small>{x.duration} min</small>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {d.staff.length > 0 && (
            <Switch
              checked={assignAll}
              onChange={setAssignAll}
              label="All my staff can do these"
              hint="Turn off to choose staff for each service yourself."
            />
          )}
        </>
      )}
    </Dialog>
  );
}
