/* BQuee web app – entry point and routes. */

import { createRoot } from 'react-dom/client';
import { useEffect } from 'react';
import './styles/tokens.css';
import './styles/base.css';
import './styles/customer.css';
import './styles/landing.css';
import './styles/dash.css';
import './styles/site.css';
import { useLocation } from './core/router.jsx';
import { ConfirmHost, ErrorPage, ToastHost } from './core/ui.jsx';
import { Landing, SalonPage } from './customer/Landing.jsx';
import { Booking } from './customer/Booking.jsx';
import { TokenPage } from './customer/TokenPage.jsx';
import { Home } from './pages/Home.jsx';
import { Privacy, Terms } from './pages/Legal.jsx';
import { SalonLogin } from './pages/Login.jsx';
import { Account } from './pages/Account.jsx';
import { RequestPage } from './pages/Request.jsx';
import { OwnerApp } from './dash/owner/OwnerApp.jsx';
import { AdminApp } from './dash/AdminApp.jsx';
import { StaffApp } from './dash/StaffApp.jsx';
import { InstallBanner, useAppManifest } from './core/pwa.jsx';

const ROUTES = [
  [/^\/$/, Home],
  [/^\/login$/, Account], // sign in and sign up share one page with two tabs
  [/^\/signup$/, Account],
  [/^\/admin$/, AdminApp],
  [/^\/owner$/, OwnerApp],
  [/^\/staff$/, StaffApp],
  [/^\/s\/([^/]+)$/, SalonPage, 'slug'], // salon page (all branches)
  [/^\/s\/([^/]+)\/login$/, SalonLogin, 'slug'], // salon's own sign-in page
  [/^\/b\/([^/]+)$/, Landing, 'branchId'], // branch landing – opened by the branch QR code
  [/^\/b\/([^/]+)\/book$/, Booking, 'branchId'],
  [/^\/t\/([^/]+)$/, TokenPage, 'id'], // customer token
  [/^\/terms$/, Terms],
  [/^\/privacy$/, Privacy],
  [/^\/request\/?$/, RequestPage], // account / data deletion request – address only, not linked anywhere
];

function App() {
  const { path, query } = useLocation();
  const isDash = ['/admin', '/owner', '/staff'].includes(path);

  useEffect(() => {
    document.body.classList.toggle('is-dash', isDash);
  }, [isDash]);

  // On a branch page the installed app is that salon's app (opens its booking page).
  const branchMatch = path.match(/^\/b\/([^/]+)/);
  useAppManifest(branchMatch ? decodeURIComponent(branchMatch[1]) : '', null);
  // Not on the booking form (its bar sits at the bottom) or sign-in pages.
  const showInstall = !/\/book$|\/login$|\/signup$|^\/request\/?$/.test(path);

  let page = <ErrorPage message="This address doesn’t match any page. Check the link and try again." />;
  for (const [pattern, Page, param] of ROUTES) {
    const m = path.match(pattern);
    if (m) {
      const props = param ? { [param]: decodeURIComponent(m[1]) } : {};
      page = <Page key={Page === Account ? 'account' : path} {...props} query={query} />;
      break;
    }
  }
  return (
    <>
      {page}
      {showInstall && <InstallBanner name={branchMatch ? null : 'BQuee'} />}
      <ToastHost />
      <ConfirmHost />
    </>
  );
}

createRoot(document.getElementById('root')).render(<App />);
