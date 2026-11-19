/* Super admin → Customers: people who signed up in the BQuee customer app. */

import { useState } from 'react';
import { api, currentUser } from '../core/api.js';
import { dayText, plural } from '../core/format.js';
import { Avatar, Button, Empty, Icon, PageLoader, Pill, confirmAction, toast, useLoad, usePaged } from '../core/ui.jsx';
import { Figures, Panel, handleError } from './Shell.jsx';

const dayOf = (ms) => (ms ? dayText(new Date(ms).toISOString().slice(0, 10)) : '—');

export function CustomersTab() {
  const isSuper = currentUser().role === 'superadmin';
  const load = useLoad(() => api('GET', '/api/admin/customers'), []);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const all = (load.data && load.data.customers) || [];
  const needle = q.trim().toLowerCase();
  const shown = all.filter(
    (c) =>
      (filter === 'all' ||
        (filter === 'active'
          ? c.active
          : filter === 'disabled'
            ? !c.active
            : filter === 'booked'
              ? c.tokens > 0
              : c.tokens === 0)) &&
      (!needle || [c.name, c.email, c.mobile].some((x) => (x || '').toLowerCase().includes(needle))),
  );
  const paged = usePaged('admin-customers', shown);

  if (load.error) {
    handleError(load.error);
    return null;
  }
  if (!load.data) return <PageLoader />;

  const toggle = async (c) => {
    if (c.active) {
      const ok = await confirmAction({
        title: 'Disable ' + c.name + '?',
        message: 'They are signed out of the customer app and can’t sign in or book until you enable them again.',
        confirm: 'Disable customer',
      });
      if (!ok) return;
    }
    try {
      await api('PUT', '/api/admin/customers/' + c.id, { active: !c.active });
      toast(c.active ? 'Customer disabled' : 'Customer enabled');
      load.reload();
    } catch (err) {
      handleError(err);
    }
  };

  const week = Date.now() - 7 * 86400000;
  return (
    <div className="stack">
      <Figures
        items={[
          ['Customers', all.length],
          ['New this week', all.filter((c) => c.createdAt >= week).length, 'done'],
          ['Have booked', all.filter((c) => c.tokens > 0).length],
          ['App tokens', all.reduce((a, c) => a + c.tokens, 0)],
        ]}
      />
      <Panel
        flush
        title={plural(shown.length, 'customer')}
        actions={
          <div className="filters">
            <label className="search sm">
              <Icon name="search" />
              <input
                type="search"
                value={q}
                onChange={(e) => (setQ(e.target.value), paged.reset())}
                placeholder="Search name, email, phone"
                aria-label="Search customers"
              />
            </label>
            <select
              className="input sm"
              value={filter}
              onChange={(e) => (setFilter(e.target.value), paged.reset())}
              aria-label="Show"
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
              <option value="booked">Have booked</option>
              <option value="none">Not booked yet</option>
            </select>
          </div>
        }
      >
        {shown.length ? (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Contact</th>
                    <th>Tokens</th>
                    <th>Joined</th>
                    <th>Status</th>
                    {isSuper && (
                      <th className="r">
                        <span className="visually-hidden">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {paged.items.map((c) => (
                    <tr key={c.id}>
                      <td data-label="Customer">
                        <div className="cell-with-thumb">
                          <Avatar name={c.name} photo={c.photo} size="sm" />
                          <b>{c.name}</b>
                        </div>
                      </td>
                      <td data-label="Contact">
                        <a className="num dim-link" href={'tel:' + c.mobile}>
                          {c.mobile}
                        </a>
                        {c.email && <small>{c.email}</small>}
                      </td>
                      <td data-label="Tokens">
                        <b className="num">{c.tokens}</b>
                        <small>{c.lastTokenAt ? 'Last ' + dayOf(c.lastTokenAt) : 'No tokens yet'}</small>
                      </td>
                      <td data-label="Joined">
                        <span>{dayOf(c.createdAt)}</span>
                        {c.lastSeenAt && <small>Signed in {dayOf(c.lastSeenAt)}</small>}
                      </td>
                      <td data-label="Status">
                        {c.active ? <Pill status="on">Active</Pill> : <Pill status="bad">Disabled</Pill>}
                      </td>
                      {isSuper && (
                        <td className="r actions">
                          <Button
                            size="sm"
                            variant="quiet"
                            className={'icon-only' + (c.active ? '' : ' is-off')}
                            icon="power"
                            title={c.active ? 'Disable' : 'Enable'}
                            aria-label={(c.active ? 'Disable ' : 'Enable ') + c.name}
                            onClick={() => toggle(c)}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {paged.pager}
          </>
        ) : (
          <Empty icon="users" title={all.length ? 'No customers match' : 'No customers yet'}>
            {all.length
              ? 'Try another search or filter.'
              : 'Customers appear here when they sign up in the BQuee customer app.'}
          </Empty>
        )}
      </Panel>
    </div>
  );
}
