/* Super admin → Account requests: users asked (in the apps) to delete or deactivate their account.
   Approving carries the request out; rejecting needs a note the user sees in the app. */

import { useState } from 'react';
import { api } from '../core/api.js';
import { dayText, plural } from '../core/format.js';
import { Avatar, Button, Empty, Field, FormDialog, Pill, PageLoader, toast, useLoad, usePaged } from '../core/ui.jsx';
import { Figures, Panel, handleError } from './Shell.jsx';

const dayOf = (ms) => (ms ? dayText(new Date(ms).toISOString().slice(0, 10)) : '—');

const ROLE = { customer: 'Customer', owner: 'Business owner', staff: 'Staff', platform_staff: 'BQuee team' };
const STATUS = {
  pending: ['waiting', 'Waiting'],
  done: ['on', 'Done'],
  rejected: ['bad', 'Rejected'],
  cancelled: ['off', 'Cancelled by user'],
};

/** What approving does, so the admin knows before pressing the button. */
function approveEffect(r) {
  const del = r.kind === 'delete';
  switch (r.role) {
    case 'owner':
      return del
        ? `The whole business “${r.business}” is removed for good: branches, services, staff logins, tokens, offers and reviews.`
        : `The business “${r.business}” is switched off: customers can’t book and nobody in it can sign in. You can switch it back on later.`;
    case 'staff':
      return del
        ? `${r.name}’s staff profile and login are removed for good.`
        : `${r.name}’s login is switched off. You can switch it back on later.`;
    case 'platform_staff':
      return del
        ? `${r.name}’s BQuee team login is removed for good.`
        : `${r.name}’s BQuee team login is switched off. You can switch it back on later.`;
    default:
      return del
        ? `${r.name}’s customer account and photo are removed for good. Businesses keep their token records.`
        : `${r.name} can’t sign in to the customer app. You can switch it back on later.`;
  }
}

function DecideDialog({ request: r, action, onClose, onDone }) {
  const [note, setNote] = useState('');
  const approve = action === 'approve';
  return (
    <FormDialog
      title={
        approve ? (r.kind === 'delete' ? 'Delete this account?' : 'Deactivate this account?') : 'Reject this request?'
      }
      submit={approve ? (r.kind === 'delete' ? 'Approve and delete' : 'Approve and deactivate') : 'Reject request'}
      danger={approve && r.kind === 'delete'}
      onClose={onClose}
      onSubmit={async () => {
        const out = await api('POST', `/api/admin/account-requests/${r.id}/decide`, { action, note });
        toast(approve ? 'Request carried out' : 'Request rejected');
        onDone(out);
      }}
    >
      <p className={'req-effect' + (approve && r.kind === 'delete' ? ' bad' : '')}>
        {approve ? approveEffect(r) : 'Nothing changes on the account. The user sees your note in the app.'}
      </p>
      <Field label={approve ? 'Note to the user (optional)' : 'Why is it rejected?'}>
        <textarea rows={3} maxLength={400} value={note} required={!approve} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

export function AccountRequestsTab({ onChange }) {
  const [status, setStatus] = useState('pending');
  const load = useLoad(
    () => api('GET', '/api/admin/account-requests' + (status === 'all' ? '' : '?status=' + status)),
    [status],
  );
  const [deciding, setDeciding] = useState(null); // { request, action }
  const list = (load.data && load.data.requests) || [];
  const paged = usePaged('admin-account-requests', list);

  if (load.error) {
    handleError(load.error);
    return null;
  }
  if (!load.data) return <PageLoader />;

  const refresh = () => {
    load.reload();
    if (onChange) onChange();
  };
  const reactivate = async (r) => {
    try {
      await api('POST', `/api/admin/account-requests/${r.id}/reactivate`, {});
      toast('Switched back on');
      refresh();
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="stack">
      <Figures
        items={[
          ['Waiting', load.data.counts.pending, load.data.counts.pending ? 'wait' : ''],
          ['All requests', load.data.counts.total],
        ]}
      />
      <Panel
        flush
        title={plural(list.length, 'request')}
        actions={
          <select
            className="input sm"
            value={status}
            onChange={(e) => (setStatus(e.target.value), paged.reset())}
            aria-label="Show"
          >
            <option value="pending">Waiting</option>
            <option value="done">Done</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
            <option value="all">All</option>
          </select>
        }
      >
        {list.length ? (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Who</th>
                    <th>Asks to</th>
                    <th>Reason</th>
                    <th>Sent</th>
                    <th>Status</th>
                    <th className="r">
                      <span className="visually-hidden">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.items.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Who">
                        <div className="cell-with-thumb">
                          <Avatar name={r.name} size="sm" />
                          <span>
                            <b>{r.name || 'Unknown'}</b>
                            <small>{[ROLE[r.role], r.business].filter(Boolean).join(' · ')}</small>
                            <small>{[r.mobile, r.email].filter(Boolean).join(' · ')}</small>
                          </span>
                        </div>
                      </td>
                      <td data-label="Asks to">
                        {r.kind === 'delete' ? (
                          <Pill status="bad">Delete</Pill>
                        ) : (
                          <Pill status="waiting">Deactivate</Pill>
                        )}
                      </td>
                      <td data-label="Reason">
                        <span>{r.reasonText}</span>
                        {r.details && <small className="req-text">{r.details}</small>}
                      </td>
                      <td data-label="Sent">
                        <span>{dayOf(r.createdAt)}</span>
                        {r.handledAt && <small>{(r.handledBy ? r.handledBy + ', ' : '') + dayOf(r.handledAt)}</small>}
                      </td>
                      <td data-label="Status">
                        <Pill status={STATUS[r.status][0]}>{STATUS[r.status][1]}</Pill>
                        {r.adminNote && <small className="req-text">“{r.adminNote}”</small>}
                        {r.status === 'done' && !r.accountExists && <small>Account removed</small>}
                      </td>
                      <td className="r actions">
                        {r.status === 'pending' ? (
                          <>
                            <Button
                              size="sm"
                              variant={r.kind === 'delete' ? 'danger' : 'primary'}
                              onClick={() => setDeciding({ request: r, action: 'approve' })}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="quiet"
                              onClick={() => setDeciding({ request: r, action: 'reject' })}
                            >
                              Reject
                            </Button>
                          </>
                        ) : r.status === 'done' && r.kind === 'deactivate' && r.accountExists && !r.accountActive ? (
                          <Button size="sm" variant="soft" icon="power" onClick={() => reactivate(r)}>
                            Switch back on
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {paged.pager}
          </>
        ) : (
          <Empty icon="shield" title={status === 'pending' ? 'No waiting requests' : 'No requests here'}>
            Users ask to delete or deactivate their account from the BQuee apps. Their requests show up here.
          </Empty>
        )}
      </Panel>
      {deciding && (
        <DecideDialog
          request={deciding.request}
          action={deciding.action}
          onClose={() => setDeciding(null)}
          onDone={() => refresh()}
        />
      )}
    </div>
  );
}
