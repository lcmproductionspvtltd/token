/* Super admin → Businesses → change many at once: switch the selected businesses on/off and
   switch their menus and features on/off. Every setting starts at "No change", so only the
   settings picked here are changed; each business keeps the rest as it is. */

import { useState } from 'react';
import { api } from '../core/api.js';
import { FormDialog, Icon, toast } from '../core/ui.jsx';
import { plural } from '../core/format.js';
import { FEATURE_MENUS } from './FeaturesDialog.jsx';

/** Three-way choice: leave as it is, switch on, switch off. */
function Choice({ label, hint, icon, value, onChange, on = 'On', off = 'Off' }) {
  const opts = [
    ['', 'No change'],
    [true, on],
    [false, off],
  ];
  return (
    <div className="bulk-row">
      {icon && (
        <span className="feat-ico">
          <Icon name={icon} />
        </span>
      )}
      <span className="feat-txt">
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <span className="bulk-choice" role="radiogroup" aria-label={label}>
        {opts.map(([v, text]) => (
          <button
            key={text}
            type="button"
            role="radio"
            aria-checked={value === v}
            className={value === v ? 'on' + (v === false ? ' is-off' : v === true ? ' is-on' : '') : ''}
            onClick={() => onChange(v)}
          >
            {text}
          </button>
        ))}
      </span>
    </div>
  );
}

export function BulkBusinessDialog({ ids, canEdit, canToggle, onClose, onDone }) {
  const [active, setActive] = useState('');
  const [flags, setFlags] = useState({ maskContacts: '', reportExport: '', staffReports: '', appButtons: '' });
  const [menus, setMenus] = useState({});
  const setFlag = (k) => (v) => setFlags((x) => ({ ...x, [k]: v }));

  const save = async () => {
    const features = {};
    for (const [k, val] of Object.entries(flags)) if (val !== '') features[k] = val;
    const m = Object.fromEntries(Object.entries(menus).filter(([, val]) => val !== ''));
    if (Object.keys(m).length) features.menus = m;
    const body = { ids };
    if (active !== '') body.active = active;
    if (Object.keys(features).length) body.features = features;
    if (!('active' in body) && !body.features) throw new Error('Choose at least one setting to change');
    const r = await api('POST', '/api/admin/salons/bulk', body);
    toast(plural(r.updated, 'business', 'businesses') + ' updated');
    onDone();
  };

  return (
    <FormDialog
      title={'Change ' + plural(ids.length, 'business', 'businesses')}
      submit="Apply to selected"
      onSubmit={save}
      onClose={onClose}
      width={660}
    >
      <p className="feat-note">
        <Icon name="shield" /> Only the settings you change here are applied. Everything left at “No change” stays as it
        is for each business.
      </p>

      {canToggle && (
        <>
          <h4 className="feat-head">Business</h4>
          <div className="feat-box">
            <Choice
              label="Business on / off"
              hint="Off stops online booking and the business’s sign-ins"
              icon="power"
              value={active}
              onChange={setActive}
              on="Enable"
              off="Disable"
            />
          </div>
        </>
      )}

      {canEdit && (
        <>
          <h4 className="feat-head">Customer privacy</h4>
          <div className="feat-box">
            <Choice
              label="Customers’ mobile numbers and emails"
              hint="Hidden: owner and staff see them partly hidden (98•••210) in tokens, reports and exports"
              icon="eye"
              value={flags.maskContacts}
              onChange={setFlag('maskContacts')}
              on="Hide"
              off="Show"
            />
          </div>

          <h4 className="feat-head">Owner menus</h4>
          <div className="feat-box">
            {FEATURE_MENUS.map(([id, icon, label, hint]) => (
              <Choice
                key={id}
                label={label}
                hint={hint}
                icon={icon}
                value={menus[id] === undefined ? '' : menus[id]}
                onChange={(val) => setMenus((x) => ({ ...x, [id]: val }))}
              />
            ))}
          </div>

          <h4 className="feat-head">Features</h4>
          <div className="feat-box">
            <Choice
              label="Excel (CSV) export"
              hint="Export buttons in Tokens and Reports"
              icon="download"
              value={flags.reportExport}
              onChange={setFlag('reportExport')}
            />
            <Choice
              label="Staff reports"
              hint="Staff can see their own reports"
              icon="chart"
              value={flags.staffReports}
              onChange={setFlag('staffReports')}
            />
            <Choice
              label="BQuee app download buttons"
              hint="Google Play / App Store buttons on the business page"
              icon="phone"
              value={flags.appButtons}
              onChange={setFlag('appButtons')}
            />
          </div>
        </>
      )}
    </FormDialog>
  );
}
