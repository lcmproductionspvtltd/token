/* Super admin → a business's menus and features: what its owner and staff can see and do. */

import { useState } from 'react';
import { api } from '../core/api.js';
import { FormDialog, Icon, Switch, toast } from '../core/ui.jsx';

export const FEATURE_MENUS = [
  ['tokens', 'list', 'Tokens', 'Today’s and past tokens list'],
  ['reports', 'chart', 'Reports', 'Owner reports'],
  ['branches', 'qr', 'Branches & QR', 'Add branches, print QR codes'],
  ['services', 'tag', 'Services', 'Add and edit services'],
  ['staff', 'users', 'Staff', 'Add staff and their sign-ins'],
  ['offers', 'gift', 'Offers', 'Discounts and promo codes'],
  ['reviews', 'star', 'Reviews', 'Customer reviews on the business page'],
  ['settings', 'gear', 'Business profile', 'Name, logo, colours and contact details'],
];

/** How many owner menus are switched off (for a small note in the list). */
export const menusOff = (f) => (f ? FEATURE_MENUS.filter(([id]) => f.menus && f.menus[id] === false).length : 0);

export function FeaturesDialog({ salon, onClose, reload }) {
  const [f, setF] = useState(() => JSON.parse(JSON.stringify(salon.features)));
  const setMenu = (id, on) => setF((x) => ({ ...x, menus: { ...x.menus, [id]: on } }));
  const set = (k, on) => setF((x) => ({ ...x, [k]: on }));

  const save = async () => {
    await api('PUT', '/api/admin/salons/' + salon.id + '/features', { features: f });
    toast('Menus and features saved');
    reload();
  };

  return (
    <FormDialog title={'Menus & features – ' + salon.name} submit="Save" onSubmit={save} onClose={onClose} width={620}>
      <p className="feat-note">
        <Icon name="shield" /> Changes apply to the owner and staff of this business on their next refresh, on the web
        and in the app.
      </p>

      <h4 className="feat-head">Customer privacy</h4>
      <div className="feat-box">
        <Switch
          checked={f.maskContacts}
          onChange={(v) => set('maskContacts', v)}
          label="Hide customers’ mobile numbers and emails"
          hint="Owner and staff see them partly hidden (98•••210, ab•••@gmail.com) in tokens, the token page, reports and exports"
        />
      </div>

      <h4 className="feat-head">Owner menus</h4>
      <div className="feat-grid">
        <div className="feat-item locked">
          <span className="feat-ico">
            <Icon name="home" />
          </span>
          <span className="feat-txt">
            <b>Overview</b>
            <small>Always on</small>
          </span>
        </div>
        {FEATURE_MENUS.map(([id, icon, label, hint]) => (
          <label key={id} className={'feat-item' + (f.menus[id] ? ' on' : '')}>
            <span className="feat-ico">
              <Icon name={icon} />
            </span>
            <span className="feat-txt">
              <b>{label}</b>
              <small>{hint}</small>
            </span>
            <input
              type="checkbox"
              checked={!!f.menus[id]}
              onChange={(e) => setMenu(id, e.target.checked)}
              aria-label={label}
            />
            <span className="switch-track" aria-hidden="true" />
          </label>
        ))}
      </div>

      <h4 className="feat-head">Features</h4>
      <div className="feat-box">
        <Switch
          checked={f.reportExport}
          onChange={(v) => set('reportExport', v)}
          label="Excel (CSV) export"
          hint="Export buttons in Tokens and Reports for owner and staff"
        />
        <Switch
          checked={f.staffReports}
          onChange={(v) => set('staffReports', v)}
          label="Staff reports"
          hint="Staff can see their own reports"
        />
        <Switch
          checked={f.appButtons}
          onChange={(v) => set('appButtons', v)}
          label="BQuee app download buttons"
          hint="Google Play and App Store buttons for the customer app on this business’s page"
        />
      </div>
    </FormDialog>
  );
}
