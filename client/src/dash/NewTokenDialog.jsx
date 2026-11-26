/* Staff make a token by hand for a walk-in customer. The staff member is fixed (themselves) and only
   the services they do can be chosen; the token goes straight into their own queue. */

import { useEffect, useState } from 'react';
import { api } from '../core/api.js';
import { money, tokenNo } from '../core/format.js';
import { Avatar, Field, FormDialog, Icon, toast } from '../core/ui.jsx';

export function NewTokenDialog({ currency, onClose, onDone }) {
  const [data, setData] = useState(null); // { staff, services }
  const [error, setError] = useState('');
  const [picked, setPicked] = useState([]);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');

  useEffect(() => {
    api('GET', '/api/staff/my-services')
      .then((r) => {
        setData(r);
        if (r.services.length === 1) setPicked([r.services[0].id]);
      })
      .catch((err) => setError(err.message));
  }, []);

  const flip = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <FormDialog
      title="New token"
      submit="Create token"
      width={480}
      onClose={onClose}
      onSubmit={async () => {
        if (!name.trim()) throw new Error('Enter the customer’s name');
        if (!picked.length) throw new Error('Choose at least one service');
        const r = await api('POST', '/api/staff/tokens', { name, mobile, serviceIds: picked });
        toast(`Token ${tokenNo(r.token)} created for ${r.token.customer.name}`);
        onDone(r);
      }}
    >
      {error && <p className="auth-error">{error}</p>}
      {data && (
        <div className="newtok-staff">
          <Avatar name={data.staff.name} size="sm" />
          <span>
            <small>Staff</small>
            <b>{data.staff.name} (you)</b>
          </span>
          <Icon name="lock" />
        </div>
      )}
      <Field label="Customer name *">
        <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoFocus />
      </Field>
      <Field label="Mobile" hint="Optional – for the customer’s token page.">
        <input type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} maxLength={20} />
      </Field>
      <fieldset className="newtok-services">
        <legend>Services *</legend>
        {!data && !error && <span className="spinner" />}
        {data && !data.services.length && (
          <p className="field-hint">No services are linked to you yet. Ask the owner to add your services.</p>
        )}
        {data &&
          data.services.map((s) => (
            <label key={s.id} className={picked.includes(s.id) ? 'on' : ''}>
              <input type="checkbox" checked={picked.includes(s.id)} onChange={() => flip(s.id)} />
              <span>
                <b>{s.name}</b>
                <small>
                  {s.duration} min · {money(s.price, currency)}
                </small>
              </span>
            </label>
          ))}
      </fieldset>
    </FormDialog>
  );
}
