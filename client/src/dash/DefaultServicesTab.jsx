/*
 * Super admin → Default services. A starter catalogue salon owners can load into their salon.
 * Owners get their own copies, so changes here never alter a salon's services (and vice versa).
 */

import { useState } from 'react';
import { api } from '../core/api.js';
import { categoryIcon, money, plural } from '../core/format.js';
import {
  Button,
  Empty,
  Field,
  FormDialog,
  Icon,
  ImagePicker,
  PageLoader,
  confirmAction,
  toast,
  useForm,
  useLoad,
  usePaged,
  SearchInput,
  searchList,
} from '../core/ui.jsx';
import { ServiceThumb } from '../customer/parts.jsx';
import { Panel, handleError } from './Shell.jsx';
import { CategoryChip, useCategories } from './CategoriesTab.jsx';
import { navigate, useLocation } from '../core/router.jsx';

export function DefaultServicesTab({ canEdit }) {
  const load = useLoad(() => api('GET', '/api/admin/default-services'), []);
  const cats = useCategories();
  const { query } = useLocation();
  const [editing, setEditing] = useState(null);
  const [cat, setCat] = useState(query.get('cat') || '');
  const categories = (cats.data && cats.data.categories) || [];
  const all = (load.data && load.data.services) || [];
  const [q, setQ] = useState('');
  const list = searchList(
    all.filter((x) => !cat || (cat === 'all' ? !x.categoryId : x.categoryId === cat)),
    q,
    (x) => [x.name, x.category],
  );
  const { items, pager, reset } = usePaged('admin-defaults', list);
  const pick = (id) => (setCat(id), reset && reset());
  const countFor = (id) => all.filter((x) => (id === 'all' ? !x.categoryId : x.categoryId === id)).length;
  if (load.error) {
    handleError(load.error);
    return null;
  }
  if (!load.data || !cats.data) return <PageLoader />;

  const del = async (x) => {
    const ok = await confirmAction({
      title: 'Delete ' + x.name + '?',
      message: 'It’s removed from the default list. Businesses that already loaded it keep their own copy.',
      confirm: 'Delete',
    });
    if (!ok) return;
    try {
      await api('DELETE', '/api/admin/default-services/' + x.id);
      toast('Default service deleted');
      load.reload();
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="stack">
      <DefaultsNote />
      <CategoryChips all={all} categories={categories} cat={cat} pick={pick} countFor={countFor} />
      <Panel
        flush
        title={plural(list.length, 'default service')}
        actions={
          <>
            {all.length > 0 && (
              <SearchInput value={q} onChange={(v) => (setQ(v), reset && reset())} label="Search defaults" />
            )}
            {canEdit && (
              <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing({})}>
                Add default service
              </Button>
            )}
          </>
        }
      >
        {list.length ? (
          <>
            <DefaultsTable items={items} categories={categories} canEdit={canEdit} setEditing={setEditing} del={del} />
            {pager}
          </>
        ) : (
          <Empty
            icon="tag"
            title="No default services"
            action={
              canEdit && (
                <Button variant="primary" icon="plus" onClick={() => setEditing({})}>
                  Add default service
                </Button>
              )
            }
          >
            Add the services most businesses offer. Owners can load them in one tap.
          </Empty>
        )}
      </Panel>
      {editing && (
        <DefaultDialog
          service={editing.id ? editing : { ...editing, categoryId: cat && cat !== 'all' ? cat : '' }}
          categories={categories}
          generalGroups={(cats.data && cats.data.generalGroups) || []}
          onClose={() => setEditing(null)}
          reload={() => (load.reload(), cats.reload())}
        />
      )}
    </div>
  );
}

/** How owners use this list. */
function DefaultsNote() {
  return (
    <div className="team-note">
      <Icon name="tag" />
      <p>
        Service owners see a <b>Load default services</b> button on their Services page and pick from this list. Each
        business gets its own copy to edit or delete – changes here don’t change services businesses already loaded.
      </p>
    </div>
  );
}

/** Filter: everything, all businesses, or one business category. */
function CategoryChips({ all, categories, cat, pick, countFor }) {
  return (
    <div className="filter-chips" role="tablist" aria-label="Show services for">
      <button type="button" role="tab" aria-selected={!cat} className={!cat ? 'on' : ''} onClick={() => pick('')}>
        Everything <span className="num">{all.length}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={cat === 'all'}
        className={cat === 'all' ? 'on' : ''}
        onClick={() => pick('all')}
      >
        <Icon name="globe" /> All businesses <span className="num">{countFor('all')}</span>
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          role="tab"
          aria-selected={cat === c.id}
          className={cat === c.id ? 'on' : ''}
          style={{ '--cat': c.color }}
          onClick={() => pick(c.id)}
        >
          <Icon name={c.icon} /> {c.name} <span className="num">{countFor(c.id)}</span>
        </button>
      ))}
    </div>
  );
}

/** The default services, with edit and delete for those who may. */
function DefaultsTable({ items, categories, canEdit, setEditing, del }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Offered to</th>
            <th>Group</th>
            <th className="r">Price</th>
            <th className="r">Time</th>
            {canEdit && (
              <th className="r">
                <span className="visually-hidden">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((x) => (
            <tr key={x.id}>
              <td data-label="Service">
                <div className="cell-with-thumb">
                  <ServiceThumb service={x} className="sm" />
                  <span>
                    <b>{x.name}</b>
                    {x.description && <small>{x.description}</small>}
                  </span>
                </div>
              </td>
              <td data-label="Offered to">
                <CategoryChip category={categories.find((c) => c.id === x.categoryId)} none="All businesses" />
              </td>
              <td data-label="Group">
                {x.category ? (
                  <span className="cat">
                    <Icon name={categoryIcon(x.category)} /> {x.category}
                  </span>
                ) : (
                  <span className="dim">—</span>
                )}
              </td>
              <td data-label="Price" className="r num">
                {money(x.price)}
              </td>
              <td data-label="Time" className="r num">
                {x.duration} min
              </td>
              {canEdit && (
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
                    onClick={() => del(x)}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DefaultDialog({ service, categories, generalGroups, onClose, reload }) {
  const isNew = !service.id;
  const [v, bind, set] = useForm({
    name: service.name || '',
    category: service.category || '',
    description: service.description || '',
    duration: service.duration || 30,
    price: service.price != null ? service.price : '',
    image: service.image || '',
    categoryId: service.categoryId || '',
  });
  const chosenCat = categories.find((c) => c.id === v.categoryId);
  const catGroups = chosenCat ? chosenCat.groups || [] : [];
  const allNames = [...catGroups, ...generalGroups].map((g) => g.name.toLowerCase());
  // A group from before this change that isn't in the lists any more stays selectable on edit.
  const orphan = v.category && !allNames.includes(v.category.toLowerCase()) ? v.category : '';
  // Switching the business category clears a group that doesn't belong to it.
  const pickCategory = (id) => {
    const c = categories.find((x) => x.id === id);
    const names = [...((c && c.groups) || []), ...generalGroups].map((g) => g.name.toLowerCase());
    set('categoryId', id);
    if (v.category && !names.includes(v.category.toLowerCase())) set('category', '');
  };
  return (
    <FormDialog
      title={isNew ? 'Add default service' : 'Edit default service'}
      submit={isNew ? 'Add service' : 'Save changes'}
      width={560}
      onClose={onClose}
      onSubmit={async () => {
        await api(isNew ? 'POST' : 'PUT', '/api/admin/default-services' + (isNew ? '' : '/' + service.id), v);
        toast(isNew ? 'Default service added' : 'Default service saved');
        reload();
      }}
    >
      <Field label="Service name">
        <input {...bind('name')} required maxLength={80} placeholder="e.g. Consultation" />
      </Field>
      <Field label="Offered to" hint="Owners of this business category see it. “All businesses” shows it to everyone.">
        <select value={v.categoryId} onChange={(e) => pickCategory(e.target.value)}>
          <option value="">All businesses</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-row">
        <Field
          label="Group"
          hint={
            <>
              Groups for {chosenCat ? chosenCat.name : 'all businesses'}.{' '}
              <a
                href="/admin?tab=categories"
                onClick={(e) => (e.preventDefault(), onClose(), navigate('/admin?tab=categories'))}
              >
                Manage groups
              </a>
            </>
          }
        >
          <select {...bind('category')}>
            <option value="">No group</option>
            {catGroups.length > 0 && (
              <optgroup label={chosenCat.name}>
                {catGroups.map((g) => (
                  <option key={g.id} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </optgroup>
            )}
            {generalGroups.length > 0 && (
              <optgroup label="All businesses">
                {generalGroups.map((g) => (
                  <option key={g.id} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </optgroup>
            )}
            {orphan && <option value={orphan}>{orphan} (not in the list)</option>}
          </select>
        </Field>
        <Field label="Suggested price">
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
        hint="Optional. Businesses get their own copy."
      />
    </FormDialog>
  );
}
