/*
 * "One service or many?" and "One staff member or many?" – chosen when a business is created
 * (home page sign-up, or by the super admin and their team). "One" skips that step
 * of the customer's token booking form.
 */

import { Icon } from './ui.jsx';

const GROUPS = [
  [
    'serviceMode',
    'Services',
    [
      ['single', 'tag', 'One service', 'Customers don’t need to choose a service'],
      ['multiple', 'list', 'Many services', 'Customers pick one or more services'],
    ],
  ],
  [
    'staffMode',
    'Staff',
    [
      ['single', 'user', 'One staff member', 'Customers don’t need to choose who serves them'],
      ['multiple', 'users', 'Many staff', 'Customers can pick a staff member or the first free'],
    ],
  ],
];

export function BookingModes({ serviceMode = 'multiple', staffMode = 'multiple', onChange }) {
  const value = { serviceMode, staffMode };
  const steps = [
    serviceMode !== 'single' && 'Services',
    staffMode !== 'single' && 'Staff member',
    'Your details',
  ].filter(Boolean);
  return (
    <div className="bmodes">
      {GROUPS.map(([key, label, options]) => (
        <div key={key} className="bmodes-group">
          <span className="bmodes-label" id={'bm-' + key}>
            {label}
          </span>
          <div className="bmodes-row" role="radiogroup" aria-labelledby={'bm-' + key}>
            {options.map(([val, icon, title, hint]) => {
              const on = value[key] === val;
              return (
                <button
                  key={val}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={'bmode' + (on ? ' on' : '')}
                  onClick={() => onChange(key, val)}
                >
                  <span className="bmode-ico">
                    <Icon name={icon} />
                  </span>
                  <span className="bmode-text">
                    <b>{title}</b>
                    <small>{hint}</small>
                  </span>
                  <span className="bmode-tick" aria-hidden="true">
                    {on && <Icon name="check" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="bmodes-flow">
        <Icon name="ticket" />
        <span>
          Customer booking: <b>{steps.join(' → ')}</b>
        </span>
      </p>
    </div>
  );
}
