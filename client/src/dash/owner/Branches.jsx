/* Owner → Branches & QR: each branch, its token prefix, and its QR code (copy, download, print poster). */

import { useState } from 'react';
import { api } from '../../core/api.js';
import { plural } from '../../core/format.js';
import {
  Button,
  Field,
  FormDialog,
  Pill,
  Switch,
  copyText,
  downloadBlob,
  toast,
  useForm,
  usePaged,
} from '../../core/ui.jsx';
import { QR } from '../../lib/qr-encoder.js';
import { printPoster } from '../../lib/poster.js';
import { Panel } from '../Shell.jsx';
import { confirmDelete } from './confirmDelete.js';

export function BranchesTab({ d, reload }) {
  const [editing, setEditing] = useState(null); // {} for new
  const { items, pager } = usePaged('owner-branches', d.branches);

  return (
    <Panel
      title={plural(d.branches.length, 'branch', 'branches')}
      sub="Each branch has its own booking page and QR code. Print the poster and put it at the entrance."
      actions={
        <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing({})}>
          Add branch
        </Button>
      }
    >
      <ul className="branch-list">
        {items.map((b) => {
          const url = location.origin + '/b/' + b.id;
          const staffCount = d.staff.filter((s) => s.branchId === b.id).length;
          return (
            <li key={b.id} className="branch-row">
              <div className="branch-qr" dangerouslySetInnerHTML={{ __html: QR.svg(url, { margin: 1 }) }} />
              <div className="branch-info">
                <div className="branch-title">
                  <h3>{b.name}</h3>
                  {b.active ? <Pill status="on">Booking open</Pill> : <Pill>Booking closed</Pill>}
                  {b.prefix && <span className="prefix num">{b.prefix}-001</span>}
                </div>
                <p>
                  {b.address || 'No address yet'}
                  {b.phone ? ' · ' + b.phone : ''} · {plural(staffCount, 'staff member', 'staff members')}
                </p>
                <a href={url} target="_blank" rel="noopener" className="branch-link">
                  {url.replace(/^https?:\/\//, '')}
                </a>
                <div className="row-actions">
                  <Button size="sm" icon="print" onClick={() => printPoster(url, d.salon, b.name)}>
                    Print poster
                  </Button>
                  <Button
                    size="sm"
                    icon="download"
                    onClick={() =>
                      QR.canvas(url, 1000, 4).toBlob((blob) =>
                        downloadBlob(blob, ('qr-' + b.name).replace(/[^a-z0-9-]+/gi, '-') + '.png'),
                      )
                    }
                  >
                    QR image
                  </Button>
                  <Button size="sm" icon="link" onClick={() => copyText(url, 'Link copied')}>
                    Copy link
                  </Button>
                  <Button size="sm" variant="quiet" icon="edit" onClick={() => setEditing(b)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="danger-quiet"
                    icon="trash"
                    className="icon-only"
                    aria-label={'Delete ' + b.name}
                    onClick={() =>
                      confirmDelete({
                        title: 'Delete ' + b.name + '?',
                        message: 'Its QR code and booking page will stop working.',
                        url: '/api/owner/branches/' + b.id,
                        done: 'Branch deleted',
                        reload,
                      })
                    }
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {pager}
      {editing && <BranchDialog branch={editing} onClose={() => setEditing(null)} reload={reload} />}
    </Panel>
  );
}

function BranchDialog({ branch, onClose, reload }) {
  const isNew = !branch.id;
  const [v, bind, set] = useForm({
    name: branch.name || '',
    prefix: branch.prefix || '',
    address: branch.address || '',
    phone: branch.phone || '',
    active: branch.active !== false,
  });
  return (
    <FormDialog
      title={isNew ? 'Add branch' : 'Edit branch'}
      submit={isNew ? 'Add branch' : 'Save changes'}
      onClose={onClose}
      onSubmit={async () => {
        await api(isNew ? 'POST' : 'PUT', '/api/owner/branches' + (isNew ? '' : '/' + branch.id), v);
        toast(isNew ? 'Branch added' : 'Branch saved');
        reload();
      }}
    >
      <div className="form-row">
        <Field label="Branch name">
          <input {...bind('name')} required maxLength={80} placeholder="e.g. MG Road" />
        </Field>
        <Field label="Token letter" hint={`Tokens look like ${(v.prefix || 'A').toUpperCase()}-001. Optional.`}>
          <input {...bind('prefix')} maxLength={3} placeholder="A" />
        </Field>
      </div>
      <Field label="Address">
        <input {...bind('address')} maxLength={200} />
      </Field>
      <Field label="Phone">
        <input {...bind('phone')} maxLength={20} inputMode="tel" />
      </Field>
      <Switch
        checked={v.active}
        onChange={(x) => set('active', x)}
        label="Online booking open"
        hint="Turn off to pause new tokens at this branch."
      />
    </FormDialog>
  );
}
