/* Terms and Conditions (/terms) and Privacy Policy (/privacy). The text lives in src/content/legal.js,
   shared with the server so search engines read the same words. */

import { useEffect } from 'react';
import { applyBrand } from '../core/format.js';
import { SiteFooter, SiteHeader, useSite } from './Home.jsx';
import legal from '../../../src/content/legal.js';

function LegalPage({ doc }) {
  const site = useSite();
  useEffect(() => {
    applyBrand();
    document.title = `${doc.title} | BQuee`;
    window.scrollTo(0, 0);
  }, [doc]);
  const c = legal.CONTACT;
  return (
    <div className="site legal">
      <SiteHeader site={site} />
      <main className="site-wrap legal-in">
        <h1>{doc.title}</h1>
        <p className="legal-date">Last updated: {doc.updated}</p>
        {doc.intro.map((t, i) => (
          <p key={i}>{t}</p>
        ))}
        {doc.sections.map((s, i) => (
          <section key={i}>
            {s.h && <h2>{s.h}</h2>}
            {s.p && s.p.length > 0 && s.list && <p>{s.p[0]}</p>}
            {s.list && (
              <ul>
                {s.list.map((t, j) => (
                  <li key={j}>{t}</li>
                ))}
              </ul>
            )}
            {(s.list ? (s.p || []).slice(1) : s.p || []).map((t, j) => (
              <p key={j}>{t}</p>
            ))}
          </section>
        ))}
        <aside className="legal-contact" aria-label="Contact details">
          <h2>Questions?</h2>
          <p>
            {c.company}
            <br />
            <a href={c.phoneHref}>{c.phone}</a>
            <br />
            <a href={'mailto:' + c.email}>{c.email}</a>
            <br />
            {c.address}
          </p>
        </aside>
      </main>
      <SiteFooter site={site} />
    </div>
  );
}

export const Terms = () => <LegalPage doc={legal.terms} />;
export const Privacy = () => <LegalPage doc={legal.privacy} />;
