/* Salon owner dashboard: loads the salon data once, then shows one section at a time (?tab=…). */

import { useEffect, useState } from 'react';
import { api } from '../../core/api.js';
import { applyBrand, dayText } from '../../core/format.js';
import { navigate } from '../../core/router.jsx';
import { PageLoader, useInterval, useLoad } from '../../core/ui.jsx';
import { Scanner } from '../../lib/Scanner.jsx';
import { ScanButton, Shell, handleError, useGuard } from '../Shell.jsx';
import { BranchesTab } from './Branches.jsx';
import { ServicesTab } from './Services.jsx';
import { StaffTab } from './Staff.jsx';
import { OffersTab, ReviewsTab } from './Marketing.jsx';
import { Overview, TokensTab } from './Tokens.jsx';
import { SettingsTab } from './Settings.jsx';
import { ReportsTab } from '../Reports.jsx';
import { SupportTab } from '../Support.jsx';

const TABS = [
  { id: 'dash', icon: 'home', label: 'Overview', section: 'Today' },
  { id: 'tokens', icon: 'list', label: 'Tokens', section: 'Today' },
  { id: 'reports', icon: 'chart', label: 'Reports', section: 'Today' },
  { id: 'branches', icon: 'qr', label: 'Branches & QR', section: 'Business' },
  { id: 'services', icon: 'tag', label: 'Services', section: 'Business' },
  { id: 'staff', icon: 'users', label: 'Staff', section: 'Business' },
  { id: 'offers', icon: 'gift', label: 'Offers', section: 'Marketing' },
  { id: 'reviews', icon: 'star', label: 'Reviews', section: 'Marketing' },
  { id: 'settings', icon: 'gear', label: 'Business profile', section: 'Account' },
  { id: 'support', icon: 'chat', label: 'Help & support', section: 'Account' },
];

export function OwnerApp({ query }) {
  const guard = useGuard('owner');
  if (guard.redirect) return guard.redirect;
  return <Owner query={query} />;
}

function Owner({ query }) {
  const load = useLoad(() => api('GET', '/api/owner/data'), []);
  const [scanning, setScanning] = useState(false);
  const d = load.data;
  // Menus the super admin switched on for this business (Overview is always on).
  const menus = (d && d.features && d.features.menus) || {};
  const tabs = TABS.filter((t) => t.id === 'dash' || menus[t.id] !== false);
  const tab = tabs.some((t) => t.id === query.get('tab')) ? query.get('tab') : 'dash';

  useEffect(() => {
    if (load.error) handleError(load.error);
  }, [load.error]);
  useEffect(() => {
    if (d) applyBrand(d.salon.color);
  }, [d && d.salon.color]);
  useInterval(load.reload, 15000, !!d && tab === 'dash');

  if (!d) return <PageLoader />;

  const reload = async () => {
    const r = await load.reload();
    return r;
  };
  const props = { d, reload };
  const badges = {
    tokens: d.stats.waiting,
    offers: d.offers.filter((o) => o.active && !o.expired).length,
    reviews: d.testimonials.length,
    support: d.supportUnread || 0,
  };
  const current = tabs.find((t) => t.id === tab);

  return (
    <Shell
      brand={d.salon}
      nav={tabs.map((t) => ({ ...t, badge: badges[t.id] }))}
      active={tab}
      onNav={(id) => navigate(id === 'dash' ? '/owner' : '/owner?tab=' + id)}
      title={current.label}
      subtitle={d.salon.name + (d.salon.expiresAt ? ' · plan valid till ' + dayText(d.salon.expiresAt) : '')}
      actions={<ScanButton onClick={() => setScanning(true)} />}
    >
      {tab === 'dash' && <Overview {...props} />}
      {tab === 'tokens' && <TokensTab {...props} />}
      {tab === 'reports' && (
        <ReportsTab kind="owner" currency={d.salon.currency} canExport={d.features ? d.features.reportExport : true} />
      )}
      {tab === 'branches' && <BranchesTab {...props} />}
      {tab === 'services' && <ServicesTab {...props} />}
      {tab === 'staff' && <StaffTab {...props} />}
      {tab === 'offers' && <OffersTab {...props} />}
      {tab === 'reviews' && <ReviewsTab {...props} />}
      {tab === 'settings' && <SettingsTab {...props} />}
      {tab === 'support' && <SupportTab side="owner" />}
      {scanning && <Scanner onClose={() => setScanning(false)} onToken={(id) => navigate('/t/' + id)} />}
    </Shell>
  );
}
