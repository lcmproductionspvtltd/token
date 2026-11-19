/*
 * Booking: services → stylist (optional) → your details. The token on the right fills in as you choose.
 * A business set up with one service skips the services step; one with one staff member skips the
 * staff step. The steps left are numbered 1, 2… in order.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, saveCustomer, savedCustomer } from '../core/api.js';
import { applyBrand, setFavicon, offerDiscount } from '../core/format.js';
import { navigate } from '../core/router.jsx';
import { Button, ErrorPage, Icon, PageLoader, toast, useLoad } from '../core/ui.jsx';
import {
  BookingBar,
  BookingClosed,
  DetailsStep,
  DraftTicket,
  OfferBar,
  ServicesStep,
  StaffStep,
  catOf,
} from './BookingSteps.jsx';
import { PillHeader } from './PillHeader.jsx';

const STEP_LABELS = { 1: 'Services', 2: 'Staff member', 3: 'Your details' };

export function Booking({ branchId, query }) {
  const { data, error } = useLoad(() => api('GET', '/api/public/branch/' + encodeURIComponent(branchId)), [branchId]);
  if (error) return <ErrorPage message={error.message} />;
  if (!data) return <PageLoader />;
  return <BookingFlow d={data} branchId={branchId} offerId={query ? query.get('offer') : ''} />;
}

function BookingFlow({ d, branchId, offerId }) {
  const s = d.salon;
  // Offer the customer tapped "Book" on (from the landing page); they can remove it.
  const [offer, setOffer] = useState(() => (offerId && (d.offers || []).find((o) => o.id === offerId)) || null);
  const missingOffer = !!offerId && !(d.offers || []).some((o) => o.id === offerId);
  useEffect(() => {
    if (missingOffer) toast('That offer has ended, so you’ll book without it', 'err');
  }, []);
  const cur = s.currency;
  const [stSel, setStSel] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('all');
  const [stCat, setStCat] = useState('all');
  const [cust, setCust] = useState(() => ({ name: '', mobile: '', email: '', ...savedCustomer() }));
  const [busy, setBusy] = useState(false);
  const [nextNumber, setNextNumber] = useState(d.nextNumber);
  const form = useRef(null);

  useEffect(() => applyBrand(s.color), [s.color]);
  // The tab shows this business's logo; leaving puts the BQuee logo back.
  useEffect(() => (setFavicon(s.logo), () => setFavicon('')), [s.logo]);

  const staffFor = (sid) => d.staff.filter((st) => st.serviceIds.includes(sid));
  // Only online stylists can be booked; offline ones are shown greyed out.
  const availableFor = (sid) => staffFor(sid).filter((st) => st.online !== false);
  const services = useMemo(
    () =>
      d.services
        .filter((x) => staffFor(x.id).length)
        .sort((a, b) => (catOf(a) === catOf(b) ? 0 : catOf(a) === 'Other' ? 1 : catOf(b) === 'Other' ? -1 : 0)),
    [d],
  );
  const cats = [...new Set(services.map(catOf))];

  // One-service business: its service is picked for the customer (if someone can do it right now).
  const singleService = s.serviceMode === 'single';
  const singleStaff = s.staffMode === 'single';
  const autoService =
    singleService && services.length === 1 && availableFor(services[0].id).length ? services[0] : null;
  const flow = [autoService ? 0 : 1, singleStaff ? 0 : 2, 3].filter(Boolean);
  const [step, setStep] = useState(flow[0]);
  const [sel, setSel] = useState(() => new Set(autoService ? [autoService.id] : []));
  const at = Math.max(0, flow.indexOf(step));
  const isLast = step === 3;

  // Refresh the likely token number when the customer reaches the last step.
  useEffect(() => {
    if (step !== 3) return;
    api('GET', '/api/public/branch/' + encodeURIComponent(branchId))
      .then((r) => r.nextNumber && setNextNumber(r.nextNumber))
      .catch(() => {});
  }, [step]);

  /* Assigns each selected service to the stylist with the shortest queue (preferring chosen stylists). */
  const plan = useMemo(() => {
    const extra = {};
    const out = [];
    for (const x of services) {
      if (!sel.has(x.id)) continue;
      const eligible = availableFor(x.id);
      if (!eligible.length) continue;
      const preferred = eligible.filter((st) => stSel.has(st.id));
      const pool = preferred.length ? preferred : eligible;
      const st = pool.slice().sort((a, b) => a.wait + (extra[a.id] || 0) - (b.wait + (extra[b.id] || 0)))[0];
      extra[st.id] = (extra[st.id] || 0) + x.duration;
      out.push({ s: x, st, pref: preferred.length > 0, wait: st.wait });
    }
    return out;
  }, [sel, stSel, services]);

  const subtotal = plan.reduce((a, x) => a + x.s.price, 0);
  const discount = offerDiscount(offer, subtotal);
  const total = subtotal - discount;
  const minutes = plan.reduce((a, x) => a + x.s.duration, 0);
  const wait = plan.reduce((a, x) => Math.max(a, x.wait), 0);

  const goTo = (n) => {
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const back = () => (at > 0 ? goTo(flow[at - 1]) : navigate('/b/' + branchId));

  const next = async () => {
    if (!sel.size) return toast('Choose at least one service', 'err');
    if (!isLast) return goTo(flow[at + 1]);
    const f = form.current;
    const mobile = f.elements.mobile;
    mobile.setCustomValidity(/^[0-9+\-\s()]{7,20}$/.test(mobile.value.trim()) ? '' : 'Enter a valid mobile number');
    if (!f.reportValidity()) return;
    setBusy(true);
    try {
      const r = await api('POST', '/api/public/book', {
        branchId,
        name: cust.name,
        mobile: cust.mobile,
        email: cust.email,
        items: plan.map((x) => ({ serviceId: x.s.id, staffId: x.pref ? x.st.id : 'any' })),
        offerId: offer ? offer.id : undefined,
      });
      saveCustomer(cust);
      navigate('/t/' + r.id + '?new=1');
    } catch (err) {
      setBusy(false);
      toast(err.message, 'err');
    }
  };

  const header = (
    <PillHeader
      salon={s}
      sub={d.branch.name}
      onBack={back}
      backLabel={at > 0 ? 'Previous step' : 'Back to business'}
      progress={d.open && services.length ? (at + 1) / flow.length : null}
    >
      {d.open && services.length > 0 && flow.length > 1 && (
        <ol className="flow-steps" aria-label="Booking steps">
          {flow.map((n, i) => (
            <li key={n} className={i === at ? 'on' : i < at ? 'done' : ''} aria-current={i === at ? 'step' : undefined}>
              <span className="num">{i < at ? <Icon name="check" /> : i + 1}</span>
              <em>{STEP_LABELS[n]}</em>
            </li>
          ))}
        </ol>
      )}
    </PillHeader>
  );

  if (!d.open || !services.length) {
    return (
      <div className="flow">
        {header}
        <BookingClosed d={d} branchId={branchId} />
      </div>
    );
  }

  const stepChip = 'Step ' + (at + 1) + ' of ' + flow.length;
  const nextLabel = isLast
    ? busy
      ? 'Booking…'
      : 'Book my token'
    : step === 1
      ? 'Continue'
      : stSel.size
        ? 'Continue'
        : 'Skip – any staff member';

  return (
    <div className="flow">
      {header}
      <div className="flow-grid">
        <main className="flow-main" key={step}>
          {offer && <OfferBar offer={offer} cur={cur} onRemove={() => setOffer(null)} />}
          {step === 1 ? (
            <ServicesStep
              services={services}
              cats={cats}
              sel={sel}
              setSel={setSel}
              singleService={singleService}
              availableFor={availableFor}
              query={query}
              setQuery={setQuery}
              cat={cat}
              setCat={setCat}
              cur={cur}
              stepChip={stepChip}
            />
          ) : step === 2 ? (
            <StaffStep
              d={d}
              services={services}
              sel={sel}
              stSel={stSel}
              setStSel={setStSel}
              stCat={stCat}
              setStCat={setStCat}
              wait={wait}
              stepChip={stepChip}
            />
          ) : (
            <DetailsStep formRef={form} cust={cust} setCust={setCust} flowLength={flow.length} onSubmit={next} />
          )}
        </main>
        <aside className={'flow-side' + (isLast ? ' show' : '')}>
          <DraftTicket
            d={d}
            plan={plan}
            total={total}
            subtotal={subtotal}
            discount={discount}
            offer={offer}
            minutes={minutes}
            wait={wait}
            step={step}
            cust={cust}
            nextNumber={nextNumber}
            singleStaff={singleStaff}
          />
          <Button
            variant="primary"
            size="lg"
            className="block flow-side-next"
            iconRight={isLast ? 'check' : 'arrow'}
            onClick={next}
            disabled={!sel.size}
            busy={busy}
          >
            {nextLabel}
          </Button>
        </aside>
      </div>
      <BookingBar
        sel={sel}
        total={total}
        minutes={minutes}
        wait={wait}
        cur={cur}
        isLast={isLast}
        busy={busy}
        onNext={next}
      />
    </div>
  );
}
