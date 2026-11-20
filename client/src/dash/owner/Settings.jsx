/* Owner: salon profile – name, link, brand colour, logo, cover photo, contact details. */

import { useState } from 'react';
import { api, getSession, setSession } from '../../core/api.js';
import { applyBrand, dayText, validColor } from '../../core/format.js';
import { Button, Field, ImagePicker, SalonMark, copyText, toast, useForm } from '../../core/ui.jsx';
import { Panel, handleError } from '../Shell.jsx';

const PRESETS = ['#7b2c9e', '#b4235a', '#0f6e66', '#1f4fb4', '#b25e0b', '#2b2733'];

export function SettingsTab({ d, reload }) {
  const s = d.salon;
  const [busy, setBusy] = useState(false);
  const [v, bind, set] = useForm({
    name: s.name || '',
    slug: s.slug || '',
    tagline: s.tagline || '',
    about: s.about || '',
    hours: s.hours || '',
    phone: s.phone || '',
    whatsapp: s.whatsapp || '',
    instagram: s.instagram || '',
    email: s.email || '',
    facebook: s.facebook || '',
    youtube: s.youtube || '',
    x: s.x || '',
    website: s.website || '',
    mapUrl: s.mapUrl || '',
    address: s.address || '',
    currency: s.currency || '₹',
    color: validColor(s.color),
    logo: s.logo || '',
    cover: s.cover || '',
  });

  const pickColor = (c) => {
    set('color', c);
    applyBrand(c);
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('PUT', '/api/owner/salon', v);
      const session = getSession();
      if (session) setSession({ ...session, user: { ...session.user, salonName: v.name } });
      toast('Business profile saved');
      await reload();
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="settings" onSubmit={save}>
      <Panel
        title="Look and feel"
        sub="Your colour, logo and photo appear on your landing page, booking pages and tokens."
      >
        <div className="settings-grid">
          <div className="form-stack">
            <div className="field">
              <span className="field-label">Brand colour</span>
              <div className="swatches">
                {PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={'swatch' + (v.color.toLowerCase() === c ? ' on' : '')}
                    style={{ background: c }}
                    onClick={() => pickColor(c)}
                    aria-label={'Use ' + c}
                  />
                ))}
                <label className="swatch custom" title="Pick any colour">
                  <input
                    type="color"
                    value={v.color}
                    onChange={(e) => pickColor(e.target.value)}
                    aria-label="Custom colour"
                  />
                </label>
                <code className="num">{v.color}</code>
              </div>
            </div>
            <ImagePicker
              label="Logo"
              value={v.logo}
              onChange={(x) => set('logo', x)}
              max={400}
              type="image/png"
              hint="Shown in your page header and footer, sign-in page and tokens. Square or wide; PNG keeps a transparent background."
            />
            <ImagePicker
              label="Cover photo"
              value={v.cover}
              onChange={(x) => set('cover', x)}
              max={1600}
              shape="wide"
              hint="A wide photo of your business. Shown at the top of your page."
            />
          </div>
          <div className="brand-preview" aria-hidden="true">
            <div className="bp-photo" style={v.cover ? { backgroundImage: `url("${v.cover}")` } : undefined} />
            <div className="bp-body">
              <SalonMark salon={{ logo: v.logo, name: v.name }} />
              <b>{v.name || 'Your business'}</b>
              <small>{v.tagline || 'Your tagline'}</small>
              <span className="bp-btn" style={{ background: v.color }}>
                Book a token
              </span>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Business details">
        <div className="form-stack">
          <div className="form-row">
            <Field label="Business name">
              <input {...bind('name')} required maxLength={80} />
            </Field>
            <Field label="Tagline" hint="e.g. Fast, friendly service">
              <input {...bind('tagline')} maxLength={200} />
            </Field>
          </div>
          <Field label="Page link" hint={location.origin + '/s/' + (v.slug || 'your-salon')}>
            <input {...bind('slug')} maxLength={60} autoCapitalize="none" />
          </Field>
          <Field label="About your business">
            <textarea {...bind('about')} maxLength={400} rows={3} />
          </Field>
          <div className="form-row">
            <Field label="Opening hours" hint="e.g. Mon–Sun · 9 AM – 9 PM">
              <input {...bind('hours')} maxLength={200} />
            </Field>
            <Field label="Currency symbol">
              <input {...bind('currency')} maxLength={6} />
            </Field>
          </div>
          <Field label="Address">
            <input {...bind('address')} maxLength={200} />
          </Field>
          <Field
            label="Google Maps link"
            hint="Optional. In Google Maps open your business, tap Share, copy the link and paste it here so Directions opens the exact place."
          >
            <input {...bind('mapUrl')} type="url" maxLength={500} placeholder="https://maps.app.goo.gl/…" />
          </Field>
        </div>
      </Panel>

      <Panel
        title="Sign-in page for you and your staff"
        sub="Your own sign-in page with your logo, name and colour. Only your business’s accounts can sign in here."
      >
        <div className="link-row">
          <a href={'/s/' + s.slug + '/login'} target="_blank" rel="noopener" className="num">
            {location.origin}/s/{s.slug}/login
          </a>
          <Button
            size="sm"
            icon="copy"
            onClick={() => copyText(location.origin + '/s/' + s.slug + '/login', 'Sign-in link copied')}
          >
            Copy link
          </Button>
        </div>
      </Panel>

      <Panel title="Contact" sub="Shown in “Come visit” and the footer of your page. Leave blank to hide.">
        <div className="form-row">
          <Field label="Phone">
            <input {...bind('phone')} maxLength={20} inputMode="tel" />
          </Field>
          <Field label="WhatsApp number" hint="With country code, e.g. 919876543210">
            <input {...bind('whatsapp')} maxLength={20} inputMode="tel" />
          </Field>
          <Field label="Email">
            <input {...bind('email')} type="email" maxLength={120} />
          </Field>
        </div>
      </Panel>

      <Panel
        title="Social media and website"
        sub="Shown as buttons in “Come visit” and the footer of your page. Paste the full link or just your handle. Leave blank to hide."
      >
        <div className="form-stack">
          <div className="form-row">
            <Field label="Instagram">
              <input {...bind('instagram')} maxLength={80} placeholder="@yoursalon" />
            </Field>
            <Field label="Facebook">
              <input {...bind('facebook')} maxLength={200} placeholder="facebook.com/yoursalon" />
            </Field>
          </div>
          <div className="form-row">
            <Field label="YouTube">
              <input {...bind('youtube')} maxLength={200} placeholder="@yoursalon" />
            </Field>
            <Field label="X (Twitter)">
              <input {...bind('x')} maxLength={200} placeholder="@yoursalon" />
            </Field>
            <Field label="Website">
              <input {...bind('website')} maxLength={200} placeholder="www.yoursalon.com" />
            </Field>
          </div>
        </div>
      </Panel>

      <Panel title="Plan">
        <p className="plan-line">
          <b>{s.plan || 'No plan'}</b>
          {s.expiresAt ? ' · valid till ' + dayText(s.expiresAt) : ''}
        </p>
        <p className="muted-text">Contact your BQuee provider to renew or upgrade.</p>
      </Panel>

      <div className="save-bar">
        <span>Changes apply to your public pages as soon as you save.</span>
        <Button type="submit" variant="primary" busy={busy}>
          {busy ? 'Saving…' : 'Save business profile'}
        </Button>
      </div>
    </form>
  );
}
