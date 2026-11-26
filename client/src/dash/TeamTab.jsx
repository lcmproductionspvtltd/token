/*
 * Super admin → Team & permissions. Platform staff help run BQuee (e.g. create salons for
 * new customers). They are separate from salon staff and see only what is ticked here.
 */

import { useState } from 'react';
import { api } from '../core/api.js';
import { dayText } from '../core/format.js';
import {
  Avatar,
  Button,
  Empty,
  Field,
  FormDialog,
  Icon,
  PageLoader,
  Pill,
  Switch,
  confirmAction,
  toast,
  useForm,
  useLoad,
  usePaged,
  SearchInput,
  searchList,
  NoMatches,
} from '../core/ui.jsx';
import { Panel, handleError } from './Shell.jsx';
import { MfaResetRow } from './MfaReset.jsx';

const PERMISSION_INFO = {
  'salons.create': ['Create businesses', 'Add new businesses with their owner sign-in'],
  'salons.edit': ['Edit businesses', 'Change business details, plan, expiry and owner sign-in'],
  'salons.toggle': ['Enable / disable businesses', 'Pause or restart a business’s booking and sign-ins'],
  'salons.delete': ['Delete businesses', 'Permanently remove a business and all its data'],
  'revenue.view': ['See plan amounts', 'View what each business pays and total plan revenue'],
  'defaults.manage': ['Manage default services', 'Add, edit and delete the default services businesses can load'],
};

export function TeamTab() {
  const load = useLoad(() => api('GET', '/api/admin/team'), []);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const { items, pager, reset } = usePaged(
    'admin-team',
    searchList((load.data && load.data.team) || [], q, (x) => [x.name, x.username, x.email]),
  );
  if (load.error) {
    handleError(load.error);
    return null;
  }
  if (!load.data) return <PageLoader />;
  const { team, permissions } = load.data;

  const remove = async (m) => {
    const ok = await confirmAction({
      title: 'Remove ' + m.name + '?',
      message: 'Their sign-in stops working immediately. Businesses they created stay as they are.',
      confirm: 'Remove',
    });
    if (!ok) return;
    try {
      await api('DELETE', '/api/admin/team/' + m.id);
      toast(m.name + ' removed');
      load.reload();
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="stack">
      <div className="team-note">
        <Icon name="shield" />
        <p>
          Team members sign in at <b>/login</b>, like you. They always see the business list and can only do what you
          tick below. They can’t see or manage this team. Service owners and business staff are separate and never
          appear here.
        </p>
      </div>
      <Panel
        flush
        title={team.length === 1 ? '1 team member' : team.length + ' team members'}
        actions={
          <>
            {team.length > 0 && <SearchInput value={q} onChange={(v) => (setQ(v), reset())} label="Search team" />}
            <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing({})}>
              Add team member
            </Button>
          </>
        }
      >
        {team.length ? (
          <ul className="team-list">
            {items.map((m) => (
              <li key={m.id} className={m.active ? '' : 'faded'}>
                <Avatar name={m.name} />
                <div className="team-info">
                  <div className="team-top">
                    <b>{m.name}</b>
                    {m.active ? <Pill status="on">Active</Pill> : <Pill>Disabled</Pill>}
                    {m.mfa ? (
                      <Pill status="on">Two-step on</Pill>
                    ) : (
                      <Pill status="waiting">Two-step at next sign-in</Pill>
                    )}
                  </div>
                  <small>
                    {m.username}
                    {m.email ? ' · ' + m.email : ''} · added {dayText(new Date(m.createdAt).toISOString().slice(0, 10))}
                  </small>
                  <div className="perm-chips">
                    {m.permissions.length ? (
                      m.permissions.map((p) => (
                        <span key={p} className="perm-chip">
                          <Icon name="check" /> {(PERMISSION_INFO[p] || [p])[0]}
                        </span>
                      ))
                    ) : (
                      <span className="perm-chip none">View businesses only</span>
                    )}
                  </div>
                </div>
                <div className="actions">
                  <Button size="sm" variant="quiet" icon="edit" onClick={() => setEditing(m)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="danger-quiet"
                    className="icon-only"
                    icon="trash"
                    aria-label={'Remove ' + m.name}
                    onClick={() => remove(m)}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {team.length ? (
          <>
            {q && !items.length && <NoMatches />}
            {pager}
          </>
        ) : (
          <Empty
            icon="users"
            title="No team members yet"
            action={
              <Button variant="primary" icon="plus" onClick={() => setEditing({})}>
                Add team member
              </Button>
            }
          >
            Add people who help you sell and set up businesses. You decide exactly what each person can do.
          </Empty>
        )}
      </Panel>
      {editing && (
        <MemberDialog
          member={editing}
          permissions={permissions}
          onClose={() => setEditing(null)}
          reload={load.reload}
        />
      )}
    </div>
  );
}

function MemberDialog({ member, permissions, onClose, reload }) {
  const isNew = !member.id;
  const [v, bind, set] = useForm({
    name: member.name || '',
    username: member.username || '',
    email: member.email || '',
    password: '',
    permissions: member.permissions || ['salons.create'],
    active: member.active !== false,
  });
  const toggle = (p) =>
    set('permissions', v.permissions.includes(p) ? v.permissions.filter((x) => x !== p) : [...v.permissions, p]);
  return (
    <FormDialog
      title={isNew ? 'Add team member' : 'Edit ' + member.name}
      submit={isNew ? 'Add team member' : 'Save changes'}
      width={620}
      onClose={onClose}
      onSubmit={async () => {
        const body = { ...v };
        if (!body.password) delete body.password;
        await api(isNew ? 'POST' : 'PUT', '/api/admin/team' + (isNew ? '' : '/' + member.id), body);
        toast(isNew ? 'Team member added' : 'Team member saved');
        reload();
      }}
    >
      <div className="form-row">
        <Field label="Name">
          <input {...bind('name')} required maxLength={60} />
        </Field>
        <Field label="Email" hint="Optional – they can sign in with it.">
          <input {...bind('email')} type="email" maxLength={120} autoComplete="off" />
        </Field>
      </div>
      <div className="form-row">
        <Field label="Username">
          <input {...bind('username')} required autoCapitalize="none" autoComplete="off" />
        </Field>
        <Field
          label={isNew ? 'Password' : 'New password'}
          hint={isNew ? 'At least 12 characters.' : 'Leave blank to keep the current one (new: 12+ characters).'}
        >
          <input {...bind('password')} type="password" required={isNew} minLength={12} autoComplete="new-password" />
        </Field>
      </div>
      <fieldset className="fieldset">
        <legend>What can they do?</legend>
        <p className="field-hint">They can always see the business list. Tick anything else they need.</p>
        <div className="perm-list">
          {permissions.map((p) => (
            <Switch
              key={p}
              checked={v.permissions.includes(p)}
              onChange={() => toggle(p)}
              label={(PERMISSION_INFO[p] || [p])[0]}
              hint={(PERMISSION_INFO[p] || [, ''])[1]}
            />
          ))}
        </div>
      </fieldset>
      <Switch
        checked={v.active}
        onChange={(x) => set('active', x)}
        label="Account active"
        hint="Turn off to block sign-in without deleting them."
      />
      {!isNew && <MfaResetRow userId={member.id} name={member.name} enabled={member.mfa} onDone={reload} />}
    </FormDialog>
  );
}
