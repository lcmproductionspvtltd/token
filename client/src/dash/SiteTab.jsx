/* Super admin: edit the BQuee home (landing) page and the business sign-up settings. */

import { useEffect, useState } from 'react';
import { api } from '../core/api.js';
import { Button, Field, Icon, PageLoader, Switch, confirmAction, toast, useLoad } from '../core/ui.jsx';
import { Panel, handleError } from './Shell.jsx';
import { StepBar } from '../core/Steps.jsx';

/** The editor's pages, in the order they appear on the home page. */
const PAGES = ['Setup', 'Top of page', 'Features', 'Pricing & reviews', 'FAQ & contact', 'Google & locations'];

const SECTIONS = [
  ['stats', 'Numbers strip'],
  ['replace', 'Replace paper tokens (problems and fixes)'],
  ['features', 'Features'],
  ['steps', 'How it works'],
  ['categories', 'Business types'],
  ['app', 'Mobile app download'],
  ['locations', 'Locations'],
  ['plans', 'Pricing'],
  ['testimonials', 'Testimonials'],
  ['faqs', 'FAQ'],
  ['contact', 'Contact'],
];

const LISTS = {
  stats: {
    title: 'Numbers strip',
    item: 'number',
    max: 6,
    blank: { value: '', label: '' },
    fields: [
      ['value', 'Value', 'text', 20],
      ['label', 'Label', 'text', 60],
    ],
  },
  features: {
    title: 'Features',
    item: 'feature',
    max: 12,
    blank: { icon: 'check', title: '', text: '' },
    fields: [
      ['icon', 'Icon', 'icon'],
      ['title', 'Title', 'text', 60],
      ['text', 'Text', 'area', 240],
    ],
  },
  replace: {
    title: 'Replace paper tokens and token machines',
    item: 'problem',
    max: 10,
    blank: { problem: '', solution: '' },
    fields: [
      ['problem', 'Problem (what goes wrong today)', 'text', 120],
      ['solution', 'How BQuee fixes it', 'area', 240],
    ],
  },
  locations: {
    title: 'Locations',
    item: 'region',
    max: 20,
    blank: { region: '', places: '' },
    fields: [
      ['region', 'Country or region', 'text', 60],
      ['places', 'Cities – separated by commas', 'area', 300],
    ],
  },
  steps: {
    title: 'How it works',
    item: 'step',
    max: 8,
    blank: { title: '', text: '' },
    fields: [
      ['title', 'Title', 'text', 60],
      ['text', 'Text', 'area', 240],
    ],
  },
  plans: {
    title: 'Pricing plans',
    item: 'plan',
    max: 6,
    blank: { name: '', price: '', period: '', features: '', highlight: false },
    fields: [
      ['name', 'Plan name', 'text', 40],
      ['price', 'Main price, e.g. ₹999, Free or Talk to us', 'text', 30],
      ['period', 'Per (e.g. per month)', 'text', 40],
      [
        'fixedPrices',
        'Fixed prices – optional, e.g. ₹999, AED 149, $39, £35 (others: the $ price × your rate)',
        'text',
        300,
      ],
      ['features', 'What’s included – one per line', 'area', 600],
      ['highlight', 'Mark as most popular', 'check'],
    ],
  },
  testimonials: {
    title: 'Testimonials',
    item: 'testimonial',
    max: 12,
    blank: { name: '', role: '', text: '', rating: 5 },
    fields: [
      ['name', 'Name', 'text', 60],
      ['role', 'Business or role', 'text', 60],
      ['rating', 'Stars', 'stars'],
      ['text', 'What they said', 'area', 400],
    ],
  },
  currencies: {
    title: 'Currencies you sell in',
    item: 'currency',
    max: 200,
    blank: { code: '', rate: '' },
    fields: [
      ['code', 'Currency code – e.g. GBP, EUR, PKR, LKR', 'text', 3],
      ['rate', '1 US$ = ? of it (e.g. 0.79 for £)', 'number', 12],
    ],
  },
  faqs: {
    title: 'FAQ',
    item: 'question',
    max: 20,
    blank: { q: '', a: '' },
    fields: [
      ['q', 'Question', 'text', 160],
      ['a', 'Answer', 'area', 800],
    ],
  },
};

export function SiteTab() {
  const load = useLoad(() => api('GET', '/api/admin/site'), []);
  const [c, setC] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (load.data) setC(load.data.content);
  }, [load.data]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (load.error) {
    handleError(load.error);
    return null;
  }
  if (!c) return <PageLoader />;
  const icons = load.data.icons || [];

  const put = (path, value) => {
    setDirty(true);
    setC((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      let o = next;
      for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
      o[path[path.length - 1]] = value;
      return next;
    });
  };
  const text = (path, label, max, area) => {
    const value = path.reduce((o, k) => (o ? o[k] : ''), c) || '';
    const props = { className: 'input', value, maxLength: max, onChange: (e) => put(path, e.target.value) };
    return <Field label={label}>{area ? <textarea rows={3} {...props} /> : <input {...props} />}</Field>;
  };

  /** Opens another page of the editor from its top (unsaved changes are kept). */
  const go = (i) => {
    setPage(i);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const main = document.querySelector('.dash-main');
    if (main) main.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async () => {
    setBusy(true);
    try {
      const r = await api('PUT', '/api/admin/site', c);
      setC(r.content);
      setDirty(false);
      toast('Website saved – it’s live now');
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (
      !(await confirmAction({
        title: 'Reset the website to the original content?',
        message: 'All your text, lists and settings on this page go back to the defaults.',
        confirm: 'Reset',
        danger: true,
      }))
    )
      return;
    try {
      const r = await api('DELETE', '/api/admin/site');
      setC(r.content);
      setDirty(false);
      toast('Website reset to the defaults');
    } catch (err) {
      handleError(err);
    }
  };

  return (
    <div className="stack site-editor">
      <EditorBar dirty={dirty} busy={busy} save={save} reset={reset} />

      <StepBar steps={PAGES} at={page} onPick={go} canPick={() => true} />

      {page === 0 && (
        <>
          <div className="site-editor-grid">
            <SectionsPanel c={c} put={put} />
            <SignupPanel c={c} put={put} text={text} />
          </div>
          <HeadingsPanel text={text} />
        </>
      )}
      {page === 1 && (
        <>
          <HeroPanel text={text} />
          <ListEditor spec={LISTS.stats} items={c.stats} onChange={(v) => put(['stats'], v)} icons={icons} />
        </>
      )}
      {page === 2 && (
        <>
          <ListEditor spec={LISTS.replace} items={c.replace} onChange={(v) => put(['replace'], v)} icons={icons} />
          <ListEditor spec={LISTS.features} items={c.features} onChange={(v) => put(['features'], v)} icons={icons} />
          <ListEditor spec={LISTS.steps} items={c.steps} onChange={(v) => put(['steps'], v)} icons={icons} />
          <TypesAndAppPanels text={text} />
        </>
      )}
      {page === 3 && (
        <>
          <ListEditor spec={LISTS.plans} items={c.plans} onChange={(v) => put(['plans'], v)} icons={icons} />
          <p className="hint-line">
            Visitors see a package’s fixed price for their currency; otherwise its $ price converted with your rate
            below. A country whose currency isn’t listed sees US$. Nothing is fetched from the internet – update the
            rates now and then (the Gulf currencies are fixed to the dollar).
          </p>
          <ListEditor
            spec={LISTS.currencies}
            items={c.currencies || []}
            onChange={(v) => put(['currencies'], v)}
            icons={icons}
          />
          <ListEditor
            spec={LISTS.testimonials}
            items={c.testimonials}
            onChange={(v) => put(['testimonials'], v)}
            icons={icons}
          />
        </>
      )}
      {page === 4 && (
        <>
          <ListEditor spec={LISTS.faqs} items={c.faqs} onChange={(v) => put(['faqs'], v)} icons={icons} />
          <CtaContactPanels text={text} />
        </>
      )}

      {page === 5 && (
        <>
          <SeoPanel c={c} text={text} />
          <ListEditor
            spec={LISTS.locations}
            items={c.locations}
            onChange={(v) => put(['locations'], v)}
            icons={icons}
          />
        </>
      )}

      <PageNav page={page} go={go} />

      {dirty && <FloatingSave busy={busy} save={save} />}
    </div>
  );
}

/** Previous / next page of the editor. */
function PageNav({ page, go }) {
  return (
    <div className="site-editor-pager">
      {page > 0 ? (
        <Button variant="quiet" icon="back" onClick={() => go(page - 1)}>
          {PAGES[page - 1]}
        </Button>
      ) : (
        <span />
      )}
      {page < PAGES.length - 1 && (
        <Button variant="soft" iconRight="arrow" onClick={() => go(page + 1)}>
          Next: {PAGES[page + 1]}
        </Button>
      )}
    </div>
  );
}

/** Saved / unsaved note with View page, Reset and Save. */
function EditorBar({ dirty, busy, save, reset }) {
  return (
    <div className="site-editor-bar">
      <p>
        {dirty ? <b>You have unsaved changes.</b> : 'Everything is saved.'} Changes on every page are kept until you
        save; they go live on the home page when you save.
      </p>
      <div className="site-editor-actions">
        <a className="btn sm soft" href="/" target="_blank" rel="noopener">
          <Icon name="globe" />
          <span>View page</span>
        </a>
        <Button size="sm" variant="quiet" icon="refresh" onClick={reset}>
          Reset
        </Button>
        <Button size="sm" variant="primary" icon="check" busy={busy} onClick={save} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

/** Turn home page sections on or off. */
function SectionsPanel({ c, put }) {
  return (
    <Panel title="Sections" sub="Turn parts of the home page on or off.">
      <div className="switch-list">
        {SECTIONS.map(([key, label]) => (
          <Switch key={key} checked={c.sections[key]} onChange={(v) => put(['sections', key], v)} label={label} />
        ))}
      </div>
    </Panel>
  );
}

const HEADINGS = [
  ['replace', 'Why switch (problems and solutions)'],
  ['features', 'Features'],
  ['steps', 'How it works'],
  ['locations', 'Locations'],
  ['plans', 'Pricing'],
  ['testimonials', 'Reviews'],
  ['faqs', 'FAQ'],
  ['contact', 'Contact'],
];

/** The heading of each home page section: small label, title and the line under it. */
function HeadingsPanel({ text }) {
  return (
    <Panel
      title="Section titles"
      sub="What each section of the home page is called. A title left empty goes back to the built-in one."
    >
      {HEADINGS.map(([key, label]) => (
        <fieldset key={key} className="heading-set">
          <legend>{label}</legend>
          <div className="form-row">
            {text(['headings', key, 'kicker'], 'Small label above', 30)}
            {text(['headings', key, 'title'], 'Title', 100)}
          </div>
          {text(['headings', key, 'text'], 'Line under the title', 300, true)}
        </fieldset>
      ))}
    </Panel>
  );
}

/** Whether businesses can sign up, trial or approval, and the plan name. */
function SignupPanel({ c, put, text }) {
  return (
    <Panel title="Business sign-up" sub="Only business owners can sign up. Staff are added by owners.">
      <Switch
        checked={c.signup.enabled}
        onChange={(v) => put(['signup', 'enabled'], v)}
        label="Allow new businesses to sign up"
        hint="Shows Sign up buttons on the website and in the app"
      />
      <Field label="New sign-ups">
        <select className="input" value={c.signup.mode} onChange={(e) => put(['signup', 'mode'], e.target.value)}>
          <option value="trial">Start right away with a free trial</option>
          <option value="approval">Wait until I approve them</option>
        </select>
      </Field>
      <div className="form-row">
        {c.signup.mode === 'trial' && (
          <Field label="Trial length (days)">
            <input
              className="input"
              type="number"
              min="1"
              max="365"
              value={c.signup.trialDays}
              onChange={(e) => put(['signup', 'trialDays'], Number(e.target.value))}
            />
          </Field>
        )}
        {text(['signup', 'planName'], 'Plan name for new sign-ups', 40)}
      </div>
      {c.signup.mode === 'approval' && (
        <p className="hint">
          New businesses appear as Disabled in Businesses with a “Signed up” tag. Enable them to let them sign in.
        </p>
      )}
    </Panel>
  );
}

/** The hero at the top of the home page. */
function HeroPanel({ text }) {
  return (
    <Panel title="Hero (top of the page)">
      <div className="form-row">
        {text(['hero', 'badge'], 'Small badge', 80)}
        {text(['hero', 'title'], 'Title *', 60)}
      </div>
      {text(['hero', 'highlight'], 'Coloured second line', 80)}
      {text(['hero', 'text'], 'Intro text', 400, true)}
      <div className="form-row">
        {text(['hero', 'primary'], 'Sign-up button', 30)}
        {text(['hero', 'secondary'], 'Sign-in button', 30)}
      </div>
    </Panel>
  );
}

/** Business types heading, and the mobile app download section. */
function TypesAndAppPanels({ text }) {
  return (
    <>
      <Panel title="Business types" sub="The list itself comes from Business categories.">
        {text(['categoriesTitle'], 'Heading', 80)}
        {text(['categoriesText'], 'Text', 240, true)}
      </Panel>

      <Panel
        title="Mobile app download"
        sub="Paste your store links when the app is published. Until then the buttons say “Coming soon”."
      >
        {text(['app', 'title'], 'Heading', 80)}
        {text(['app', 'text'], 'Text', 300, true)}
        <div className="form-row">
          {text(['app', 'playUrl'], 'Google Play link (https://…)', 300)}
          {text(['app', 'appStoreUrl'], 'App Store link (https://…)', 300)}
        </div>
      </Panel>

      <Panel
        title="Customer app on business pages"
        sub="“Get the BQuee app” buttons on every business’s page. Leave both empty to hide them; switch them off for one business or many in Businesses → Menus & features."
      >
        <div className="form-row">
          {text(['customerApp', 'playUrl'], 'BQuee app – Google Play link (https://…)', 300)}
          {text(['customerApp', 'appStoreUrl'], 'BQuee app – App Store link (https://…)', 300)}
        </div>
      </Panel>
    </>
  );
}

/** Call to action band, contact details and footer text. */
function CtaContactPanels({ text }) {
  return (
    <div className="site-editor-grid">
      <Panel title="Call to action band">
        {text(['cta', 'title'], 'Heading', 80)}
        {text(['cta', 'text'], 'Text', 240, true)}
      </Panel>
      <Panel title="Contact and footer">
        <div className="form-row">
          {text(['contact', 'email'], 'Email', 120)}
          {text(['contact', 'phone'], 'Phone', 30)}
        </div>
        <div className="form-row">
          {text(['contact', 'whatsapp'], 'WhatsApp number (with country code)', 30)}
          {text(['contact', 'address'], 'Address', 240)}
        </div>
        {text(['footer', 'text'], 'Footer text', 240, true)}
      </Panel>
    </div>
  );
}

/** What Google shows for the home page, with a live preview and length hints. */
function SeoPanel({ c, text }) {
  const seo = c.seo || {};
  const title = seo.title || '';
  const desc = seo.description || '';
  return (
    <Panel
      title="Google search result"
      sub="The title and description Google and link previews show for the home page. Leave empty to use the default."
    >
      {text(['seo', 'title'], `Title – best under 60 characters (${title.length})`, 70)}
      {text(['seo', 'description'], `Description – best under 160 characters (${desc.length})`, 170, true)}
      <div className="seo-preview" aria-label="Google preview">
        <span className="seo-preview-url">{window.location.host}</span>
        <b>{title || 'BQuee'}</b>
        <p>{desc}</p>
      </div>
    </Panel>
  );
}

/** Floating Save button while there are unsaved changes. */
function FloatingSave({ busy, save }) {
  return (
    <div className="site-editor-float">
      <span>Unsaved changes</span>
      <Button size="sm" variant="primary" icon="check" busy={busy} onClick={save}>
        Save
      </Button>
    </div>
  );
}

function ListEditor({ spec, items, onChange, icons }) {
  const update = (i, key, value) => onChange(items.map((x, j) => (j === i ? { ...x, [key]: value } : x)));
  const move = (i, d) => {
    const next = items.slice();
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <Panel
      title={spec.title}
      sub={`${items.length} ${spec.item}${items.length === 1 ? '' : 's'} · up to ${spec.max}`}
      actions={
        <Button
          size="sm"
          icon="plus"
          onClick={() => onChange([...items, { ...spec.blank }])}
          disabled={items.length >= spec.max}
        >
          Add {spec.item}
        </Button>
      }
    >
      {items.length === 0 ? (
        <p className="hint">Nothing here yet – this part is hidden on the page until you add something.</p>
      ) : (
        <ol className="site-list">
          {items.map((it, i) => (
            <li key={i}>
              <div className="site-list-head">
                <span className="site-list-no">{i + 1}</span>
                <b>{it.title || it.name || it.q || it.value || 'New ' + spec.item}</b>
                <div className="site-list-tools">
                  <button
                    type="button"
                    className="icon-btn sm"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                  >
                    <Icon name="chevd" className="rot180" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn sm"
                    onClick={() => move(i, 1)}
                    disabled={i === items.length - 1}
                    aria-label="Move down"
                  >
                    <Icon name="chevd" />
                  </button>
                  <button
                    type="button"
                    className="icon-btn sm danger"
                    onClick={() => onChange(items.filter((_, j) => j !== i))}
                    aria-label={'Remove ' + spec.item}
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              </div>
              <div className="site-list-fields">
                {spec.fields.map(([key, label, type, max]) =>
                  type === 'check' ? (
                    <Switch key={key} checked={it[key]} onChange={(v) => update(i, key, v)} label={label} />
                  ) : type === 'icon' ? (
                    <Field key={key} label={label}>
                      <div className="icon-pick">
                        {icons.map((name) => (
                          <button
                            key={name}
                            type="button"
                            className={it.icon === name ? 'on' : ''}
                            onClick={() => update(i, 'icon', name)}
                            aria-label={name}
                            aria-pressed={it.icon === name}
                          >
                            <Icon name={name} />
                          </button>
                        ))}
                      </div>
                    </Field>
                  ) : type === 'stars' ? (
                    <Field key={key} label={label}>
                      <select
                        className="input"
                        value={it[key] || 5}
                        onChange={(e) => update(i, key, Number(e.target.value))}
                      >
                        {[5, 4, 3, 2, 1].map((n) => (
                          <option key={n} value={n}>
                            {n} star{n === 1 ? '' : 's'}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : (
                    <Field key={key} label={label} className={type === 'area' ? 'wide' : ''}>
                      {type === 'area' ? (
                        <textarea
                          className="input"
                          rows={key === 'features' ? 4 : 2}
                          maxLength={max}
                          value={it[key] || ''}
                          onChange={(e) => update(i, key, e.target.value)}
                        />
                      ) : (
                        <input
                          className="input"
                          maxLength={max}
                          inputMode={type === 'number' ? 'decimal' : undefined}
                          placeholder={type === 'number' ? 'e.g. 149' : undefined}
                          value={it[key] || ''}
                          onChange={(e) => update(i, key, e.target.value)}
                        />
                      )}
                    </Field>
                  ),
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
