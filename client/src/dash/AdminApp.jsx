/* Super admin and BQuee team dashboard: the menu, the page title and which section is shown.
   Each section is its own file (BusinessesTab.jsx, CustomersTab.jsx, Support.jsx …). */

import { useEffect, useState } from 'react';
import { api, can, currentUser } from '../core/api.js';
import { navigate } from '../core/router.jsx';
import { TeamTab } from './TeamTab.jsx';
import { ReportsTab } from './Reports.jsx';
import { SiteTab } from './SiteTab.jsx';
import { CustomersTab } from './CustomersTab.jsx';
import { SupportTab } from './Support.jsx';
import { AccountRequestsTab } from './AccountRequestsTab.jsx';
import { DefaultServicesTab } from './DefaultServicesTab.jsx';
import { CategoriesTab } from './CategoriesTab.jsx';
import { DEFAULT_BRAND, applyBrand } from '../core/format.js';
import { Button, PageLoader, useLoad } from '../core/ui.jsx';
import { Shell, handleError, useGuard } from './Shell.jsx';
import { BusinessesTab } from './BusinessesTab.jsx';

export function AdminApp({ query }) {
  const guard = useGuard(['superadmin', 'platform_staff']);
  if (guard.redirect) return guard.redirect;
  return <Admin query={query} />;
}

function Admin({ query }) {
  const me = currentUser();
  const isSuper = me.role === 'superadmin';
  const asked = query.get('tab');
  const tab =
    (asked === 'team' || asked === 'site' || asked === 'accounts') && isSuper
      ? asked
      : ['services', 'categories', 'reports', 'customers', 'support'].includes(asked)
        ? asked
        : 'salons';
  const TITLES = {
    salons: ['Businesses', 'Everything sold on this BQuee platform'],
    team: ['Team & permissions', 'People who help you run BQuee – separate from business staff'],
    services: ['Default services', 'A starter list service owners can load into their business'],
    categories: ['Business categories', 'Group businesses by type – each category gets its own default services'],
    customers: ['Customers', 'People who use the BQuee customer app'],
    support: ['Support tickets', 'Bugs, problems and questions from business owners'],
    accounts: ['Account requests', 'People who asked in the apps to delete or deactivate their account'],
    reports: ['Reports', 'Businesses, tokens and customers across the platform – filter and export'],
    site: ['Website', 'Your BQuee home page and business sign-up'],
  };
  const may = (p) => can(me, p);
  const load = useLoad(() => api('GET', '/api/admin/data'), []);
  const [editing, setEditing] = useState(null);
  const [showRef, setShowRef] = useState(false);
  const d = load.data;

  useEffect(() => applyBrand(DEFAULT_BRAND), []);
  useEffect(() => {
    if (load.error) handleError(load.error);
  }, [load.error]);

  if (!d) return <PageLoader />;
  const s = d.stats;

  return (
    <Shell
      brand={{ name: 'BQuee', platform: true }}
      nav={[
        { id: 'salons', icon: 'store', label: 'Businesses', section: 'Platform', badge: s.salons },
        { id: 'categories', icon: 'grid', label: 'Business categories', section: 'Platform' },
        { id: 'services', icon: 'tag', label: 'Default services', section: 'Platform' },
        { id: 'customers', icon: 'user', label: 'Customers', section: 'Platform' },
        { id: 'support', icon: 'chat', label: 'Support tickets', section: 'Platform', badge: d ? d.supportOpen : 0 },
        ...(isSuper
          ? [
              {
                id: 'accounts',
                icon: 'shield',
                label: 'Account requests',
                section: 'Platform',
                badge: d ? d.accountRequestsPending : 0,
              },
            ]
          : []),
        { id: 'reports', icon: 'chart', label: 'Reports', section: 'Insights' },
        ...(isSuper
          ? [
              { id: 'team', icon: 'users', label: 'Team & permissions', section: 'Platform' },
              { id: 'site', icon: 'globe', label: 'Website', section: 'Platform' },
            ]
          : []),
      ]}
      active={tab}
      onNav={(id) => navigate(id === 'salons' ? '/admin' : '/admin?tab=' + id)}
      title={TITLES[tab][0]}
      subtitle={TITLES[tab][1]}
      actions={
        tab === 'salons' ? (
          <>
            <Button
              variant="soft"
              size="sm"
              icon="share"
              className="ref-btn"
              title="Referral links"
              aria-label="Referral links"
              onClick={() => setShowRef(true)}
            >
              Referral links
            </Button>
            {may('salons.create') && (
              <Button variant="primary" size="sm" icon="plus" onClick={() => setEditing({})}>
                New business
              </Button>
            )}
          </>
        ) : null
      }
    >
      {tab === 'site' ? (
        <SiteTab />
      ) : tab === 'customers' ? (
        <CustomersTab />
      ) : tab === 'support' ? (
        <SupportTab side="team" />
      ) : tab === 'accounts' && isSuper ? (
        <AccountRequestsTab onChange={load.reload} />
      ) : tab === 'reports' ? (
        <ReportsTab kind="admin" />
      ) : tab === 'team' ? (
        <TeamTab />
      ) : tab === 'services' ? (
        <DefaultServicesTab canEdit={may('defaults.manage')} />
      ) : tab === 'categories' ? (
        <CategoriesTab canEdit={may('defaults.manage')} />
      ) : (
        <BusinessesTab
          d={d}
          reload={load.reload}
          may={may}
          editing={editing}
          setEditing={setEditing}
          showRef={showRef}
          setShowRef={setShowRef}
        />
      )}
    </Shell>
  );
}
