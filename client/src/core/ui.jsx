/* Shared UI kit: icons, buttons, pills, avatars, dialogs, toasts, pagination, form fields. */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { PATHS } from './icon-paths.js';
import { hashHue, initials, statusLabel } from './format.js';
import { Link } from './router.jsx';

/* ---------- icons ---------- */

export function Icon({ name, className = '', size }) {
  return (
    <svg
      className={'i ' + className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={size ? { width: size, height: size } : undefined}
      dangerouslySetInnerHTML={{ __html: PATHS[name] || '' }}
    />
  );
}

/* ---------- buttons ---------- */

export function Button({ variant = '', size = '', icon, iconRight, children, className = '', busy, ...rest }) {
  const cls = ['btn', variant, size, busy ? 'is-busy' : '', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} disabled={busy || rest.disabled} {...rest}>
      {icon && <Icon name={icon} />}
      {children != null && children !== false && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} />}
    </button>
  );
}

export function LinkButton({ to, variant = '', size = '', icon, iconRight, children, className = '', ...rest }) {
  const cls = ['btn', variant, size, className].filter(Boolean).join(' ');
  return (
    <Link to={to} className={cls} {...rest}>
      {icon && <Icon name={icon} />}
      {children != null && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} />}
    </Link>
  );
}

/* ---------- small pieces ---------- */

export const Spinner = ({ className = '' }) => <span className={'spinner ' + className} aria-label="Loading" />;

export function PageLoader() {
  return (
    <div className="page-center">
      <Spinner />
    </div>
  );
}

export function ErrorPage({ message, action }) {
  return (
    <div className="page-center">
      <div className="error-card">
        <Icon name="search" />
        <h1>We couldn’t open this page</h1>
        <p>{message}</p>
        {action || (
          <LinkButton to="/" variant="primary">
            Go to the home page
          </LinkButton>
        )}
      </div>
    </div>
  );
}

export function Pill({ status, children }) {
  return <span className={'pill ' + (status || '')}>{children || statusLabel(status)}</span>;
}

const AVATAR_HUES = [282, 330, 196, 146, 24, 248, 172, 40];

export function Avatar({ name, photo, size = 'md', className = '' }) {
  if (photo) return <img className={`avatar ${size} ${className}`} src={photo} alt="" loading="lazy" />;
  const hue = AVATAR_HUES[hashHue(name) % AVATAR_HUES.length];
  return (
    <span className={`avatar ${size} ${className}`} style={{ '--h': hue }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/** The salon's uploaded logo; until one is uploaded, a lotus mark on the brand colour. */
export function SalonMark({ salon, size = 'md', className = '' }) {
  const [broken, setBroken] = useState(false);
  if (salon && salon.logo && !broken)
    return (
      <span className={`mark img ${size} ${className}`}>
        <img src={salon.logo} alt={salon.name ? salon.name + ' logo' : ''} onError={() => setBroken(true)} />
      </span>
    );
  return (
    <span className={`mark ph ${size} ${className}`} aria-hidden="true">
      <Icon name="ticket" />
    </span>
  );
}

export function Empty({ icon = 'sparkle', title, children, action }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/* ---------- forms ---------- */

export function Field({ label, hint, children, className = '' }) {
  return (
    <label className={'field ' + className}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <small className="field-hint">{hint}</small>}
    </label>
  );
}

export function Switch({ checked, onChange, label, hint }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true" />
      <span className="switch-text">
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

/** Small state helper for forms: const [v, bind, set] = useForm({...}); <input {...bind('name')} /> */
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const set = (name, value) => setValues((v) => ({ ...v, [name]: value }));
  const bind = (name) => ({
    name,
    value: values[name] == null ? '' : values[name],
    onChange: (e) => set(name, e.target.value),
  });
  return [values, bind, set, setValues];
}

/* ---------- toasts ---------- */

let toasts = [];
const toastListeners = new Set();
const emitToasts = () => toastListeners.forEach((fn) => fn());

export function toast(message, type = 'ok') {
  const id = Math.random().toString(36).slice(2);
  toasts = [...toasts, { id, message, type }];
  emitToasts();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emitToasts();
  }, 3400);
}

export function ToastHost() {
  const list = useSyncExternalStore(
    (fn) => {
      toastListeners.add(fn);
      return () => toastListeners.delete(fn);
    },
    () => toasts,
  );
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={'toast ' + t.type}>
          <Icon name={t.type === 'err' ? 'x' : 'check'} />
          {t.message}
        </div>
      ))}
    </div>
  );
}

/* ---------- dialogs ---------- */

export function Dialog({ title, onClose, children, width = 520, footer, className = '', focusFirst = true }) {
  const box = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    const t = setTimeout(() => {
      const el = box.current;
      if (!el || el.contains(document.activeElement)) return;
      const first = focusFirst
        ? el.querySelector('[data-autofocus], input:not([type=hidden]):not([disabled]), select, textarea')
        : null;
      (first || el).focus();
    }, 40);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      if (!document.querySelector('.dialog-backdrop + .dialog-backdrop')) document.body.classList.remove('no-scroll');
      if (prev && prev.focus) prev.focus();
    };
  }, []);
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={'dialog ' + className}
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={box}
        tabIndex={-1}
      >
        <header className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Dialog with a form: runs onSubmit, shows errors as toasts, closes on success.
 *   <FormDialog title="Add branch" submit="Add branch" onSubmit={async () => …} onClose={…}>fields</FormDialog>
 */
export function FormDialog({ title, submit = 'Save', onSubmit, onClose, children, width, danger }) {
  const [busy, setBusy] = useState(false);
  const formId = useRef('f' + Math.random().toString(36).slice(2)).current;
  const handle = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await onSubmit(e.currentTarget);
      onClose();
    } catch (err) {
      toast(err.message, 'err');
      setBusy(false);
    }
  };
  return (
    <Dialog
      title={title}
      onClose={onClose}
      width={width}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <button type="submit" form={formId} className={'btn ' + (danger ? 'danger' : 'primary')} disabled={busy}>
            <span>{busy ? 'Saving…' : submit}</span>
          </button>
        </>
      }
    >
      <form id={formId} onSubmit={handle} className="form-stack" noValidate={false}>
        {children}
      </form>
    </Dialog>
  );
}

/* Confirmation box, used as: if (await confirmAction({...})) … */

let confirmState = null;
const confirmListeners = new Set();
const emitConfirm = () => confirmListeners.forEach((fn) => fn());

export function confirmAction({ title = 'Are you sure?', message, confirm = 'Yes, continue', danger = true }) {
  return new Promise((resolve) => {
    confirmState = { title, message, confirm, danger, resolve };
    emitConfirm();
  });
}

export function ConfirmHost() {
  const state = useSyncExternalStore(
    (fn) => {
      confirmListeners.add(fn);
      return () => confirmListeners.delete(fn);
    },
    () => confirmState,
  );
  if (!state) return null;
  const finish = (answer) => {
    confirmState = null;
    emitConfirm();
    state.resolve(answer);
  };
  return (
    <Dialog
      title={state.title}
      onClose={() => finish(false)}
      width={420}
      footer={
        <>
          <Button variant="quiet" onClick={() => finish(false)}>
            Keep it
          </Button>
          <Button variant={state.danger ? 'danger' : 'primary'} onClick={() => finish(true)} data-autofocus>
            {state.confirm}
          </Button>
        </>
      }
    >
      <p className="confirm-text">{state.message}</p>
    </Dialog>
  );
}

/* ---------- pagination ---------- */

const PAGE_SIZES = [10, 25, 50, 100];
const pageMemory = new Map();

function storedSize(key) {
  try {
    const n = Number(localStorage.getItem('sq_page_size_' + key));
    if (PAGE_SIZES.includes(n)) return n;
  } catch (err) {
    /* storage unavailable */
  }
  return PAGE_SIZES[0];
}

/** Pages already-loaded lists. The page survives refreshes; the size is saved per list. */
export function usePaged(key, all) {
  const [size, setSizeState] = useState(() => storedSize(key));
  const [page, setPageState] = useState(() => pageMemory.get(key) || 1);
  const pages = Math.max(1, Math.ceil(all.length / size));
  const current = Math.min(page, pages);
  const setPage = (p) => {
    pageMemory.set(key, p);
    setPageState(p);
  };
  const setSize = (s) => {
    try {
      localStorage.setItem('sq_page_size_' + key, String(s));
    } catch (err) {
      /* ignore */
    }
    setSizeState(s);
    setPage(1);
  };
  const start = (current - 1) * size;
  const items = all.slice(start, start + size);
  const pager =
    all.length > 0 ? (
      <Pager
        page={current}
        pages={pages}
        size={size}
        total={all.length}
        from={start + 1}
        to={start + items.length}
        onPage={setPage}
        onSize={setSize}
      />
    ) : null;
  return { items, pager, reset: () => setPage(1) };
}

export const resetPage = (key) => pageMemory.delete(key);

function pageList(page, count) {
  const out = [];
  for (let p = 1; p <= count; p++) {
    if (p === 1 || p === count || Math.abs(p - page) <= 1) out.push(p);
    else if (out[out.length - 1] !== '…') out.push('…');
  }
  return out;
}

function Pager({ page, pages, size, total, from, to, onPage, onSize }) {
  return (
    <nav className="pager" aria-label="Pages">
      <span className="pager-info">
        {from}–{to} of {total}
      </span>
      <div className="pager-pages">
        <button className="icon-btn" disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <Icon name="prev" />
        </button>
        {pageList(page, pages).map((p, i) =>
          p === '…' ? (
            <span key={'g' + i} className="pager-gap">
              …
            </span>
          ) : (
            <button
              key={p}
              className={'pager-num' + (p === page ? ' on' : '')}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPage(p)}
            >
              {p}
            </button>
          ),
        )}
        <button className="icon-btn" disabled={page === pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <Icon name="next" />
        </button>
      </div>
      <label className="pager-size">
        <span>Rows</span>
        <select value={size} onChange={(e) => onSize(Number(e.target.value))}>
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
}

/* ---------- misc helpers ---------- */

export function copyText(text, label = 'Copied') {
  const write = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject();
  write.then(
    () => toast(label),
    () => window.prompt('Copy this', text),
  );
}

export function downloadBlob(blob, fileName) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(link.href);
    link.remove();
  }, 1000);
}

/** Runs `fn` every `ms` while mounted (skips while the tab is hidden). */
export function useInterval(fn, ms, enabled = true) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => {
      if (!document.hidden) saved.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
}

/** Loads data once (and on `deps` change): { data, error, loading, reload, setData }. */
export function useLoad(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const latest = useRef(0);
  const run = async (quiet) => {
    const id = ++latest.current;
    if (!quiet) setState((s) => ({ ...s, loading: true }));
    try {
      const data = await loader();
      if (id === latest.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (id === latest.current) setState((s) => ({ data: quiet ? s.data : null, error, loading: false }));
      return null;
    }
  };
  useEffect(() => {
    run(false);
  }, deps);
  return {
    ...state,
    reload: () => run(true),
    setData: (data) => setState((s) => ({ ...s, data })),
  };
}

/** Reads an image file and returns a resized data URL (JPEG/PNG). */
function resizeImage(file, max, square, type) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        const x = c.getContext('2d');
        if (square) {
          const m = Math.min(img.width, img.height);
          const sz = Math.min(max, m);
          c.width = c.height = sz;
          x.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, sz, sz);
          return resolve(c.toDataURL('image/jpeg', 0.85));
        }
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        c.width = Math.round(img.width * sc);
        c.height = Math.round(img.height * sc);
        x.drawImage(img, 0, 0, c.width, c.height);
        resolve(type ? c.toDataURL(type, 0.82) : c.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('That file is not an image'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Could not read the file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Image picker for uploads. `value` is a URL or data URL; onChange gets a data URL or '' (removed).
 */
/** Pictures a user may choose. They are redrawn and shrunk before upload, so the original can be large. */
const PICKABLE = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_PICK_BYTES = 15 * 1024 * 1024;

export function ImagePicker({
  label,
  value,
  onChange,
  max = 800,
  square,
  type = 'image/jpeg',
  shape = 'square',
  hint,
}) {
  const input = useRef(null);
  const pick = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (!PICKABLE.includes(file.type)) throw new Error('Choose a PNG, JPG or WEBP picture');
      if (file.size > MAX_PICK_BYTES) throw new Error('That picture is over 15 MB – choose a smaller one');
      onChange(await resizeImage(file, max, square, type));
    } catch (err) {
      toast(err.message, 'err');
    }
  };
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className={'picker ' + shape}>
        <button type="button" className="picker-preview" onClick={() => input.current.click()}>
          {value ? <img src={value} alt="" /> : <Icon name="image" />}
        </button>
        <div className="picker-actions">
          <Button size="sm" icon="camera" onClick={() => input.current.click()}>
            {value ? 'Replace' : 'Upload'}
          </Button>
          {value && (
            <Button size="sm" variant="quiet" onClick={() => onChange('')}>
              Remove
            </Button>
          )}
          {hint && <small className="field-hint">{hint}</small>}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick} />
      </div>
    </div>
  );
}

/* ---------- list search ---------- */

/** Compact search box for list headers. */
export function SearchInput({ value, onChange, label = 'Search' }) {
  return (
    <label className="search-box">
      <Icon name="search" />
      <input
        className="input sm"
        type="search"
        placeholder={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
    </label>
  );
}

/** Items whose text fields contain the query (case-insensitive). */
export function searchList(list, q, fields) {
  const s = String(q || '')
    .trim()
    .toLowerCase();
  if (!s) return list;
  return list.filter((x) =>
    fields(x).some((f) =>
      String(f || '')
        .toLowerCase()
        .includes(s),
    ),
  );
}

/** Shown under a list header when a search finds nothing. */
export function NoMatches() {
  return (
    <Empty icon="search" title="Nothing matches your search">
      Try another word.
    </Empty>
  );
}
