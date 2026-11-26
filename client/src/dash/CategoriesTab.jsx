/*
 * Super admin → Business categories (Clinic, Salon & spa, ...). Each business belongs to one,
 * and default services can be meant for one category or for all businesses.
 */

import { useState } from 'react';
import { api } from '../core/api.js';
import { navigate } from '../core/router.jsx';
import {
  Button,
  Dialog,
  Empty,
  Field,
  FormDialog,
  Icon,
  PageLoader,
  confirmAction,
  toast,
  useForm,
  useLoad,
  usePaged,
} from '../core/ui.jsx';
import { handleError } from './Shell.jsx';

const SWATCHES = [
  '#7b2c9e',
  '#b0357a',
  '#dc2626',
  '#c2410c',
  '#ca8a04',
  '#15803d',
  '#0f8a7e',
  '#0284c7',
  '#2563eb',
  '#4f46e5',
  '#475569',
];

/** Small coloured label for a category (renders nothing without one). */
export function CategoryChip({ category, none }) {
  if (!category) return none ? <span className="cat-chip none">{none}</span> : null;
  return (
    <span className="cat-chip" style={{ '--cat': category.color }}>
      <Icon name={category.icon} /> {category.name}
    </span>
  );
}

export function useCategories() {
  return useLoad(() => api('GET', '/api/admin/categories'), []);
}

export function CategoriesTab({ canEdit }) {
  const load = useCategories();
  const [editing, setEditing] = useState(null);
  const [groupsFor, setGroupsFor] = useState(null); // category id, or 'general'
  const { items, pager } = usePaged('admin-categories', (load.data && load.data.categories) || []);
  if (load.error) {
    handleError(load.error);
    return null;
  }
  if (!load.data) return <PageLoader />;
  const { categories, icons, generalGroups = [] } = load.data;
  const GENERAL = { id: 'general', name: 'All businesses', icon: 'globe', color: '#475569', groups: generalGroups };
  const groupTarget = groupsFor === 'general' ? GENERAL : categories.find((c) => c.id === groupsFor);

  const del = async (c) => {
    const ok = await confirmAction({
      title: 'Delete ' + c.name + '?',
      message:
        'Its ' +
        (c.businesses === 1 ? '1 business' : c.businesses + ' businesses') +
        ' and ' +
        (c.services === 1 ? '1 default service' : c.services + ' default services') +
        ' are kept but no longer have a category. Default services without a category are offered to every business.',
      confirm: 'Delete category',
    });
    if (!ok) return;
    try {
      await api('DELETE', '/api/admin/categories/' + c.id);
      toast('Category deleted');
      load.reload();
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="stack">
      <div className="cat-grid">
        <article className="cat-card general" style={{ '--cat': GENERAL.color }}>
          <div className="cat-card-top">
            <span className="cat-card-ico">
              <Icon name="globe" />
            </span>
          </div>
          <h3>All businesses</h3>
          <small className="cat-card-note">Groups every business can use, whatever its category.</small>
          <GroupChips groups={generalGroups} />
          <button type="button" className="cat-groups-btn" onClick={() => setGroupsFor('general')}>
            <Icon name="list" /> {canEdit ? 'Manage service groups' : 'Service groups'}
          </button>
        </article>
        {items.map((c) => (
          <article key={c.id} className="cat-card" style={{ '--cat': c.color }}>
            <div className="cat-card-top">
              <span className="cat-card-ico">
                <Icon name={c.icon} />
              </span>
              {canEdit && (
                <div className="cat-card-actions">
                  <Button
                    size="sm"
                    variant="quiet"
                    className="icon-only"
                    icon="edit"
                    aria-label={'Edit ' + c.name}
                    onClick={() => setEditing(c)}
                  />
                  <Button
                    size="sm"
                    variant="danger-quiet"
                    className="icon-only"
                    icon="trash"
                    aria-label={'Delete ' + c.name}
                    onClick={() => del(c)}
                  />
                </div>
              )}
            </div>
            <h3>{c.name}</h3>
            <div className="cat-card-stats">
              <button type="button" onClick={() => navigate('/admin')}>
                <b className="num">{c.businesses}</b> {c.businesses === 1 ? 'business' : 'businesses'}
              </button>
              <button type="button" onClick={() => navigate('/admin?tab=services&cat=' + c.id)}>
                <b className="num">{c.services}</b> default {c.services === 1 ? 'service' : 'services'}
              </button>
            </div>
            <GroupChips groups={c.groups || []} />
            <button type="button" className="cat-groups-btn" onClick={() => setGroupsFor(c.id)}>
              <Icon name="list" /> {canEdit ? 'Manage service groups' : 'Service groups'}
            </button>
          </article>
        ))}
        {canEdit && (
          <button type="button" className="cat-card add" onClick={() => setEditing({})}>
            <span className="cat-card-ico">
              <Icon name="plus" />
            </span>
            <b>Add category</b>
            <small>e.g. Restaurant, Pharmacy, Government office</small>
          </button>
        )}
      </div>
      {pager}
      {!categories.length && !canEdit && <Empty icon="grid" title="No categories yet" />}
      {groupTarget && (
        <GroupsDialog
          category={groupTarget}
          canEdit={canEdit}
          onClose={() => setGroupsFor(null)}
          reload={load.reload}
        />
      )}
      {editing && (
        <CategoryDialog category={editing} icons={icons} onClose={() => setEditing(null)} reload={load.reload} />
      )}
    </div>
  );
}

function CategoryDialog({ category, icons, onClose, reload }) {
  const isNew = !category.id;
  const [v, bind, set] = useForm({
    name: category.name || '',
    icon: category.icon || 'store',
    color: category.color || '#7b2c9e',
  });
  return (
    <FormDialog
      title={isNew ? 'Add business category' : 'Edit ' + category.name}
      submit={isNew ? 'Add category' : 'Save changes'}
      width={520}
      onClose={onClose}
      onSubmit={async () => {
        await api(isNew ? 'POST' : 'PUT', '/api/admin/categories' + (isNew ? '' : '/' + category.id), v);
        toast(isNew ? 'Category added' : 'Category saved');
        reload();
      }}
    >
      <div className="cat-preview" style={{ '--cat': v.color }}>
        <span className="cat-card-ico">
          <Icon name={v.icon} />
        </span>
        <b>{v.name || 'Category name'}</b>
      </div>
      <Field label="Name">
        <input {...bind('name')} required maxLength={50} placeholder="e.g. Clinic & healthcare" />
      </Field>
      <div className="field">
        <span className="field-label">Icon</span>
        <div className="icon-pick" role="radiogroup" aria-label="Icon">
          {icons.map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={v.icon === i}
              aria-label={i}
              className={v.icon === i ? 'on' : ''}
              onClick={() => set('icon', i)}
            >
              <Icon name={i} />
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span className="field-label">Colour</span>
        <div className="swatches" role="radiogroup" aria-label="Colour">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={v.color === c}
              aria-label={'Colour ' + c}
              className={'swatch' + (v.color === c ? ' on' : '')}
              style={{ background: c }}
              onClick={() => set('color', c)}
            />
          ))}
        </div>
      </div>
    </FormDialog>
  );
}

function GroupChips({ groups }) {
  if (!groups.length) return <span className="group-chips empty">No service groups yet</span>;
  const shown = groups.slice(0, 6);
  return (
    <span className="group-chips">
      {shown.map((g) => (
        <span key={g.id} className="group-chip">
          {g.name}
        </span>
      ))}
      {groups.length > shown.length && <span className="group-chip more">+{groups.length - shown.length}</span>}
    </span>
  );
}

/** Add, rename and delete the service groups of one business category (or the general ones). */
function GroupsDialog({ category, canEdit, onClose, reload }) {
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(null); // { id, name }
  const [busy, setBusy] = useState(false);
  const run = async (fn, done) => {
    setBusy(true);
    try {
      await fn();
      if (done) toast(done);
      await reload();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };
  const add = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    run(
      () =>
        api('POST', '/api/admin/service-groups', { name: n, categoryId: category.id === 'general' ? '' : category.id }),
      'Group added',
    ).then(() => setName(''));
  };
  const saveRename = (e) => {
    e.preventDefault();
    run(() => api('PUT', '/api/admin/service-groups/' + renaming.id, { name: renaming.name }), 'Group renamed').then(
      () => setRenaming(null),
    );
  };
  const del = async (g) => {
    const ok = await confirmAction({
      title: 'Delete ' + g.name + '?',
      message: g.services
        ? `${g.services} default ${g.services === 1 ? 'service keeps' : 'services keep'} working but will have no group. Businesses that already loaded them aren’t changed.`
        : 'No default services use it.',
      confirm: 'Delete group',
    });
    if (ok) run(() => api('DELETE', '/api/admin/service-groups/' + g.id), 'Group deleted');
  };

  return (
    <Dialog title={'Service groups – ' + category.name} width={520} onClose={onClose}>
      <div className="groups-dialog" style={{ '--cat': category.color }}>
        <p className="field-hint">
          Groups like “Hair” or “Facial” sort the default services for{' '}
          {category.id === 'general' ? 'every business' : 'this kind of business'}. You pick one when adding a default
          service.
        </p>
        {category.groups.length ? (
          <ul className="groups-list">
            {category.groups.map((g) => (
              <li key={g.id}>
                {renaming && renaming.id === g.id ? (
                  <form className="groups-rename" onSubmit={saveRename}>
                    <input
                      value={renaming.name}
                      onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                      maxLength={40}
                      autoFocus
                      aria-label="Group name"
                    />
                    <Button type="submit" size="sm" variant="primary" disabled={busy || !renaming.name.trim()}>
                      Save
                    </Button>
                    <Button size="sm" variant="quiet" onClick={() => setRenaming(null)}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <span className="groups-dot" />
                    <b>{g.name}</b>
                    <small>
                      {g.services} default {g.services === 1 ? 'service' : 'services'}
                    </small>
                    {canEdit && (
                      <span className="groups-actions">
                        <Button
                          size="sm"
                          variant="quiet"
                          className="icon-only"
                          icon="edit"
                          title="Rename"
                          aria-label={'Rename ' + g.name}
                          onClick={() => setRenaming({ id: g.id, name: g.name })}
                        />
                        <Button
                          size="sm"
                          variant="danger-quiet"
                          className="icon-only"
                          icon="trash"
                          title="Delete"
                          aria-label={'Delete ' + g.name}
                          onClick={() => del(g)}
                        />
                      </span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="groups-empty">No groups yet.</p>
        )}
        {canEdit && (
          <form className="groups-add" onSubmit={add}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="New group, e.g. Hair"
              aria-label="New group name"
            />
            <Button type="submit" variant="primary" icon="plus" disabled={busy || !name.trim()}>
              Add group
            </Button>
          </form>
        )}
      </div>
    </Dialog>
  );
}
