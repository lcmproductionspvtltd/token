/* Owner → Staff: who works where, which services they do, their sign-in, online status and on/off. */

import { useState } from 'react';
import { api } from '../../core/api.js';
import { plural, waitText } from '../../core/format.js';
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
import { Panel, handleError } from '../Shell.jsx';

export function StaffTab({ d, reload }) {
  const [editing, setEditing] = useState(null);
  const setOnline = async (st, online) => {
    try {
      await api('PUT', '/api/owner/staff/' + st.id + '/status', { online });
      toast(st.name + (online ? ' is online' : ' is offline'));
      reload();
    } catch (err) {
      handleError(err);
    }
  };
  // Owners switch staff on and off; deleting a staff member is only done by the BQuee admin on their own request.
  const setActive = async (st, active) => {
    if (!active) {
      const ok = await confirmAction({
        title: 'Switch off ' + st.name + '?',
        message:
          'They can’t sign in and customers can’t book them until you switch them on again. Their past tokens stay.',
        confirm: 'Switch off',
      });
      if (!ok) return;
    }
    try {
      await api('PUT', '/api/owner/staff/' + st.id + '/active', { active });
      toast(st.name + (active ? ' is switched on' : ' is switched off'));
      reload();
    } catch (err) {
      handleError(err);
    }
  };
  const [q, setQ] = useState('');
  const shownStaff = searchList(d.staff, q, (x) => [x.name, x.title, x.mobile, x.email]);
  const { items, pager, reset } = usePaged('owner-staff', shownStaff);
  const branchName = (id) => (d.branches.find((b) => b.id === id) || {}).name || '—';

  return (
    <Panel
      flush
      title={plural(d.staff.length, 'staff member', 'staff members')}
      sub="Each person has their own queue. Give them a login so they can scan tokens."
      actions={
        <>
          {d.staff.length > 0 && <SearchInput value={q} onChange={(v) => (setQ(v), reset())} label="Search staff" />}
          <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing({})} disabled={!d.branches.length}>
            Add staff
          </Button>
        </>
      }
    >
      {d.staff.length ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Services</th>
                  {d.branches.length > 1 && <th>Branch</th>}
                  <th>Sign-in</th>
                  <th className="r">Queue</th>
                  <th>Status</th>
                  <th className="r">
                    <span className="visually-hidden">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((st) => (
                  <StaffRow
                    key={st.id}
                    st={st}
                    d={d}
                    branchName={branchName}
                    setOnline={setOnline}
                    setActive={setActive}
                    setEditing={setEditing}
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
          icon="users"
          title="No staff yet"
          action={
            <Button variant="primary" icon="plus" onClick={() => setEditing({})}>
              Add staff
            </Button>
          }
        >
          Add your staff and link each one to the services they do.
        </Empty>
      )}
      {editing && <StaffDialog d={d} staff={editing} onClose={() => setEditing(null)} reload={reload} />}
    </Panel>
  );
}

/** One staff member: services, branch, sign-in, queue, online status, edit and on/off. */
function StaffRow({ st, d, branchName, setOnline, setActive, setEditing }) {
  return (
    <tr className={st.active ? '' : 'muted-row'}>
      <td data-label="Name">
        <div className="cell-with-thumb">
          <Avatar name={st.name} photo={st.photo} size="sm" />
          <span>
            <b>{st.name}</b>
            <small>{[st.title, st.mobile].filter(Boolean).join(' · ')}</small>
          </span>
        </div>
      </td>
      <td data-label="Services">
        {st.serviceIds.length ? (
          <span
            className="clip"
            title={st.serviceIds
              .map((id) => (d.services.find((x) => x.id === id) || {}).name)
              .filter(Boolean)
              .join(', ')}
          >
            {st.serviceIds
              .map((id) => (d.services.find((x) => x.id === id) || {}).name)
              .filter(Boolean)
              .join(', ')}
          </span>
        ) : (
          <span className="warn">No services</span>
        )}
      </td>
      {d.branches.length > 1 && <td data-label="Branch">{branchName(st.branchId)}</td>}
      <td data-label="Sign-in">
        {st.email || st.username ? (
          <span className="clip">{st.email || st.username}</span>
        ) : (
          <span className="dim">No login</span>
        )}
      </td>
      <td data-label="Queue" className="r num">
        {st.load ? waitText(st.load) : '—'}
      </td>
      <td data-label="Status">
        {!st.active ? (
          <Pill>Not working</Pill>
        ) : (
          <label className="presence-toggle">
            <input type="checkbox" checked={st.online} onChange={(e) => setOnline(st, e.target.checked)} />
            <span className={'presence-pill ' + (!st.online ? 'off' : st.busy ? 'busy' : 'on')}>
              <span className="presence-dot" />
              {!st.online ? 'Offline' : st.busy ? 'Busy' : 'Online'}
            </span>
          </label>
        )}
      </td>
      <td className="r actions">
        <Button
          size="sm"
          variant="quiet"
          className="icon-only"
          icon="edit"
          aria-label={'Edit ' + st.name}
          onClick={() => setEditing(st)}
        />
        <Button
          size="sm"
          variant="quiet"
          className={'icon-only' + (st.active ? '' : ' is-off')}
          icon="power"
          title={st.active ? 'Switch off' : 'Switch on'}
          aria-label={(st.active ? 'Switch off ' : 'Switch on ') + st.name}
          onClick={() => setActive(st, !st.active)}
        />
      </td>
    </tr>
  );
}

function StaffDialog({ d, staff, onClose, reload }) {
  const isNew = !staff.id;
  const hasLogin = !!(staff.email || staff.username);
  const [v, bind, set] = useForm({
    name: staff.name || '',
    title: staff.title || '',
    mobile: staff.mobile || '',
    photo: staff.photo || '',
    branchId: staff.branchId || (d.branches[0] && d.branches[0].id) || '',
    serviceIds: staff.serviceIds || [],
    email: staff.email || '',
    password: '',
    active: staff.active !== false,
  });
  const toggleService = (id) =>
    set('serviceIds', v.serviceIds.includes(id) ? v.serviceIds.filter((x) => x !== id) : [...v.serviceIds, id]);
  const allOn = d.services.length && v.serviceIds.length === d.services.length;
  return (
    <FormDialog
      title={isNew ? 'Add staff' : 'Edit ' + staff.name}
      submit={isNew ? 'Add staff' : 'Save changes'}
      width={620}
      onClose={onClose}
      onSubmit={async () => {
        const body = { ...v };
        if (!body.password) delete body.password;
        await api(isNew ? 'POST' : 'PUT', '/api/owner/staff' + (isNew ? '' : '/' + staff.id), body);
        toast(isNew ? 'Staff member added' : 'Staff saved');
        reload();
      }}
    >
      <ImagePicker label="Photo" value={v.photo} onChange={(x) => set('photo', x)} max={240} square shape="round" />
      <div className="form-row">
        <Field label="Name">
          <input {...bind('name')} required maxLength={60} />
        </Field>
        <Field label="Title or speciality">
          <input {...bind('title')} maxLength={60} placeholder="e.g. Senior consultant" />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Mobile">
          <input {...bind('mobile')} maxLength={20} inputMode="tel" />
        </Field>
        <Field label="Branch">
          <select {...bind('branchId')} required>
            {d.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="field">
        <span className="field-label">
          Services they do
          {d.services.length > 1 && (
            <button
              type="button"
              className="link-btn"
              onClick={() => set('serviceIds', allOn ? [] : d.services.map((x) => x.id))}
            >
              {allOn ? 'Clear all' : 'Select all'}
            </button>
          )}
        </span>
        {d.services.length ? (
          <div className="checks">
            {d.services.map((x) => (
              <label key={x.id} className="check-chip">
                <input type="checkbox" checked={v.serviceIds.includes(x.id)} onChange={() => toggleService(x.id)} />
                <span>{x.name}</span>
              </label>
            ))}
          </div>
        ) : (
          <small className="field-hint">Add services first, then link them here.</small>
        )}
      </div>
      <fieldset className="fieldset">
        <legend>Sign-in for scanning tokens</legend>
        <div className="form-row">
          <Field label="Email" hint={`They sign in with this email at ${location.host}/s/${d.salon.slug}/login`}>
            <input {...bind('email')} type="email" maxLength={120} autoComplete="off" placeholder="name@business.com" />
          </Field>
          <Field
            label={hasLogin ? 'New password' : 'Password'}
            hint={hasLogin ? 'Leave blank to keep the current one.' : 'At least 8 characters.'}
          >
            <input
              {...bind('password')}
              type="password"
              minLength={8}
              autoComplete="new-password"
              required={!hasLogin && !!v.email}
            />
          </Field>
        </div>
      </fieldset>
      <Switch
        checked={v.active}
        onChange={(x) => set('active', x)}
        label="Working"
        hint="Turn off when they’re on leave – customers can’t pick them."
      />
    </FormDialog>
  );
}

/** Pick services from the super admin's default list and copy them into this salon. */
