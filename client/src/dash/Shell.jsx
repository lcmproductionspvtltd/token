/* Dashboard layout: collapsible sidebar (drawer on phones), top bar, account menu, auth guard. */

import { useEffect, useRef, useState } from 'react';
import { api, currentUser, getSession, homeFor, readStored, setSession, writeStored } from '../core/api.js';
import { Redirect, navigate } from '../core/router.jsx';
import { Avatar, Button, Field, FormDialog, Icon, SalonMark, toast, useForm } from '../core/ui.jsx';
import { loginPathFor } from '../pages/Login.jsx';
import { SecurityDialog } from './SecurityDialog.jsx';
import { NotificationBell } from './Notifications.jsx';

const ROLE_LABEL = { superadmin: 'Super admin', platform_staff: 'BQuee team', owner: 'Service owner', staff: 'Staff' };

/** Returns the signed-in user, or a redirect element when they may not open this dashboard. */
export function useGuard(role) {
  const user = currentUser();
  if (!user) {
    const next = location.pathname + location.search;
    const platform = (Array.isArray(role) ? role : [role]).includes('superadmin');
    return {
      redirect: <Redirect to={platform ? '/login?next=' + encodeURIComponent(next) : loginPathFor(null, next)} />,
    };
  }
  const roles = Array.isArray(role) ? role : [role];
  if (!roles.includes(user.role)) return { redirect: <Redirect to={homeFor(user)} /> };
  return { user };
}

/** Handles a failed dashboard request: expired session → sign-in page, otherwise a toast. */
export function handleError(err) {
  if (err && err.status === 401) {
    const to = loginPathFor(currentUser(), location.pathname + location.search);
    setSession(null);
    toast('Your session ended. Please sign in again.', 'err');
    navigate(to, { replace: true });
  } else if (err) toast(err.message, 'err');
}

/**
 * <Shell brand={{name, logo}} nav={[{id, icon, label, section, badge}]} active onNav title subtitle actions>
 */
export function Shell({ brand, nav, active, onNav, title, subtitle, actions, children }) {
  const [collapsed, setCollapsed] = useState(() => {
    const saved = readStored('sq_side', null);
    return saved == null ? window.innerWidth > 900 && window.innerWidth < 1200 : saved;
  });
  const [drawer, setDrawer] = useState(false);
  const [dialog, setDialog] = useState(null);
  const user = currentUser();

  const toggle = () => {
    writeStored('sq_side', !collapsed);
    setCollapsed(!collapsed);
  };

  useEffect(() => {
    document.title = title + ' · ' + brand.name;
  }, [title, brand.name]);

  const sections = [];
  for (const item of nav) {
    let sec = sections.find((s) => s.name === item.section);
    if (!sec) sections.push((sec = { name: item.section, items: [] }));
    sec.items.push(item);
  }

  return (
    <div className={'dash' + (collapsed ? ' collapsed' : '') + (drawer ? ' drawer-open' : '')}>
      <aside className="side" aria-label="Dashboard">
        <div className="side-brand">
          {brand.platform ? (
            <>
              {/* BQuee's own logo for the super admin and the BQuee team */}
              <img className="side-logo" src="/img/brand/bquee-logo-light.png" alt="BQuee" width="135" height="32" />
              <img className="side-logo-icon" src="/img/brand/bquee-icon.png" alt="BQuee" width="34" height="34" />
            </>
          ) : (
            <>
              <SalonMark salon={brand} size="sm" />
              <span className="side-name">{brand.name}</span>
            </>
          )}
          <button
            type="button"
            className="icon-btn side-close"
            onClick={() => setDrawer(false)}
            aria-label="Close menu"
          >
            <Icon name="x" />
          </button>
        </div>
        <nav className="side-nav">
          {sections.map((sec) => (
            <div key={sec.name} className="side-sec">
              <span className="side-sec-name">{sec.name}</span>
              {sec.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={'side-item' + (item.id === active ? ' on' : '')}
                  aria-current={item.id === active ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                  onClick={() => {
                    setDrawer(false);
                    onNav(item.id);
                  }}
                >
                  <Icon name={item.icon} />
                  <span className="side-label">{item.label}</span>
                  {item.badge ? <em className="side-badge num">{item.badge}</em> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <button
          type="button"
          className="side-collapse"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name="chevl" />
          <span className="side-label">Collapse</span>
        </button>
      </aside>
      <div className="side-scrim" onClick={() => setDrawer(false)} />

      <div className="dash-main">
        <header className="topbar">
          <button type="button" className="icon-btn topbar-menu" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <div className="topbar-title">
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <div className="topbar-actions">
            {actions}
            <NotificationBell />
            <AccountMenu user={user} onOpen={setDialog} />
          </div>
        </header>
        <main className="dcontent">{children}</main>
      </div>

      {dialog === 'profile' && <ProfileDialog onClose={() => setDialog(null)} />}
      {dialog === 'password' && <PasswordDialog onClose={() => setDialog(null)} />}
      {dialog === 'security' && <SecurityDialog onClose={() => setDialog(null)} />}
    </div>
  );
}

function AccountMenu({ user, onOpen }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const signOut = async () => {
    try {
      await api('POST', '/api/logout');
    } catch (err) {
      /* sign out locally anyway */
    }
    const to = loginPathFor(user);
    setSession(null);
    navigate(to, { replace: true });
  };

  return (
    <div className="account" ref={ref}>
      <button
        type="button"
        className="account-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Avatar name={user.name} size="sm" />
        <span className="account-name">{user.name}</span>
        <Icon name="chevd" />
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-who">
            <b>{user.name}</b>
            <small>
              {ROLE_LABEL[user.role]}
              {user.salonName ? ' · ' + user.salonName : ''}
            </small>
          </div>
          <button type="button" role="menuitem" onClick={() => (setOpen(false), onOpen('profile'))}>
            <Icon name="user" /> My profile
          </button>
          <button type="button" role="menuitem" onClick={() => (setOpen(false), onOpen('password'))}>
            <Icon name="lock" /> {user.hasPassword === false ? 'Set a password' : 'Change password'}
          </button>
          <button type="button" role="menuitem" onClick={() => (setOpen(false), onOpen('security'))}>
            <Icon name="shield" /> Sign-in security
          </button>
          <button type="button" role="menuitem" className="danger" onClick={signOut}>
            <Icon name="logout" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function ProfileDialog({ onClose }) {
  const user = currentUser();
  const isAdmin = user.role === 'superadmin';
  const [v, bind] = useForm({ name: user.name || '', username: user.username || '', email: user.email || '' });
  return (
    <FormDialog
      title="My profile"
      onClose={onClose}
      width={460}
      submit="Save profile"
      onSubmit={async () => {
        const body = { name: v.name, email: v.email };
        if (isAdmin) body.username = v.username;
        const r = await api('PUT', '/api/me/profile', body);
        const s = getSession();
        setSession({ ...s, user: { ...s.user, name: r.name, email: r.email, username: r.username } });
        toast('Profile saved');
      }}
    >
      <div className="prof-head">
        <Avatar name={v.name} size="lg" />
        <span>
          <b>{v.name || '—'}</b>
          <small>{ROLE_LABEL[user.role]}</small>
        </span>
      </div>
      <Field label="Full name">
        <input {...bind('name')} required maxLength={60} />
      </Field>
      <Field label="Username" hint={isAdmin ? undefined : 'Only the person who manages your account can change it.'}>
        <input {...bind('username')} disabled={!isAdmin} required autoCapitalize="none" />
      </Field>
      <Field label="Email" hint="You can sign in with your username or this email.">
        <input {...bind('email')} type="email" maxLength={80} placeholder="you@example.com" />
      </Field>
    </FormDialog>
  );
}

/**
 * Change password – or, for an owner who signed up with Google/Apple and has no password yet,
 * set one (no "current password" to ask for). After that they can sign in either way.
 */
function PasswordDialog({ onClose }) {
  const [v, bind] = useForm({ oldPassword: '', newPassword: '' });
  const user = currentUser();
  const first = user.hasPassword === false;
  const min = ['superadmin', 'platform_staff'].includes(user.role) ? 12 : 8;
  return (
    <FormDialog
      title={first ? 'Set a password' : 'Change password'}
      onClose={onClose}
      width={420}
      submit={first ? 'Set password' : 'Change password'}
      onSubmit={async () => {
        await api('PUT', '/api/me/password', first ? { newPassword: v.newPassword } : v);
        const session = getSession();
        if (session) setSession({ ...session, user: { ...session.user, hasPassword: true } });
        toast(first ? 'Password set – you can now sign in with it too' : 'Password changed – your other devices were signed out');
      }}
    >
      {first ? (
        <p className="muted-text">
          You signed up with Google or Apple. Set a password to also sign in with your username or email.
        </p>
      ) : (
        <Field label="Current password">
          <input {...bind('oldPassword')} type="password" required autoComplete="current-password" />
        </Field>
      )}
      <Field label="New password" hint={`At least ${min} characters. Very common passwords are refused.`}>
        <input {...bind('newPassword')} type="password" required minLength={min} autoComplete="new-password" />
      </Field>
    </FormDialog>
  );
}

/** One strip of figures with dividers (not a row of boxed cards). */
/** Picks an icon for a figure from its label. */
function figureIcon(label) {
  const l = String(label).toLowerCase();
  if (/revenue|amount|earn|paid/.test(l)) return 'chart';
  if (/wait|time/.test(l)) return 'clock';
  if (/in service|serving|busy/.test(l)) return 'play';
  if (/complet|done|active|online/.test(l)) return 'check';
  if (/expired/.test(l)) return 'calendar';
  if (/disabled|cancel|offline/.test(l)) return 'x';
  if (/business|salon/.test(l)) return 'store';
  if (/staff|team|people/.test(l)) return 'users';
  if (/service/.test(l)) return 'tag';
  return 'ticket';
}

const FIGURE_TONES = ['t-brand', 't-teal', 't-amber', 't-sky', 't-rose'];

export function Figures({ items }) {
  return (
    <dl className="figures">
      {items.map(([label, value, tone, icon], i) => (
        <div key={label} className={(tone || '') + ' ' + FIGURE_TONES[i % FIGURE_TONES.length]}>
          <span className="fig-ico" aria-hidden="true">
            <Icon name={icon || figureIcon(label)} />
          </span>
          <dt>{label}</dt>
          <dd className="num">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Panel with an optional header row. */
export function Panel({ title, sub, actions, children, className = '', flush }) {
  return (
    <section className={'panel ' + (flush ? 'flush ' : '') + className}>
      {(title || actions) && (
        <header className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {sub && <p>{sub}</p>}
          </div>
          {actions && <div className="panel-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export const ScanButton = ({ onClick }) => (
  <Button variant="primary" size="sm" icon="camera" onClick={onClick} className="scan-btn">
    Scan token
  </Button>
);
