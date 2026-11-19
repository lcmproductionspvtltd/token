/*
 * Support tickets – one screen for both sides:
 *   side="owner"  business owner: raise tickets, follow replies, answer back
 *   side="team"   super admin and BQuee team: every business's tickets, reply, change status/priority
 */

import { useEffect, useRef, useState } from 'react';
import { api } from '../core/api.js';
import { clock, dayText, plural } from '../core/format.js';
import {
  Button,
  Empty,
  Field,
  FormDialog,
  Icon,
  ImagePicker,
  PageLoader,
  Pill,
  SalonMark,
  toast,
  useInterval,
  useLoad,
  usePaged,
} from '../core/ui.jsx';
import { Figures, Panel, handleError } from './Shell.jsx';

const TICKET_CATEGORIES = {
  bug: ['Bug', 'bolt'],
  issue: ['Problem', 'shield'],
  question: ['Question', 'chat'],
  billing: ['Plan & billing', 'calendar'],
  feature: ['Feature request', 'sparkle'],
  other: ['Other', 'list'],
};
const TICKET_STATUS = {
  open: ['Open', 'waiting'],
  in_progress: ['In progress', 'serving'],
  resolved: ['Resolved', 'on'],
  closed: ['Closed', 'off'],
};
const PRIORITY = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };

const when = (ms) => {
  if (!ms) return '';
  const d = new Date(ms);
  const iso = d.toISOString().slice(0, 10);
  return (iso === new Date().toISOString().slice(0, 10) ? 'Today' : dayText(iso)) + ', ' + clock(ms);
};

function StatusPill({ status }) {
  const [label, tone] = TICKET_STATUS[status] || [status, 'off'];
  return <Pill status={tone}>{label}</Pill>;
}

export function SupportTab({ side }) {
  const team = side === 'team';
  const base = team ? '/api/admin/tickets' : '/api/owner/tickets';
  const load = useLoad(() => api('GET', base), []);
  const [status, setStatus] = useState(team ? 'active' : 'all');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  useInterval(load.reload, 30000, !!load.data && !openId);

  const all = (load.data && load.data.tickets) || [];
  const ql = q.trim().toLowerCase();
  const shown = all.filter(
    (t) =>
      (status === 'all' ||
        (status === 'active' ? t.status === 'open' || t.status === 'in_progress' : t.status === status)) &&
      (!cat || t.category === cat) &&
      (!ql || [t.subject, t.business, t.raisedBy, '#' + t.number].join(' ').toLowerCase().includes(ql)),
  );
  const paged = usePaged('tickets-' + side, shown);

  if (load.error) {
    handleError(load.error);
    return null;
  }
  if (!load.data) return <PageLoader />;
  const c = load.data.counts;

  if (openId)
    return (
      <TicketView
        id={openId}
        team={team}
        onBack={() => {
          setOpenId(null);
          load.reload();
        }}
      />
    );

  return (
    <div className="stack">
      <Figures
        items={[
          ['Open', c.open, c.open ? 'wait' : ''],
          ['In progress', c.inProgress],
          ['Resolved', c.resolved, 'done'],
          [team ? 'Waiting for reply' : 'New replies', load.data.unread, load.data.unread ? 'wait' : ''],
        ]}
      />
      <Panel
        flush
        title={plural(shown.length, 'ticket')}
        actions={
          <TicketFilters
            team={team}
            q={q}
            setQ={setQ}
            status={status}
            setStatus={setStatus}
            cat={cat}
            setCat={setCat}
            reset={paged.reset}
            onNew={() => setCreating(true)}
          />
        }
      >
        {shown.length ? (
          <>
            <ul className="tk-list">
              {paged.items.map((t) => (
                <TicketRow key={t.id} t={t} team={team} onOpen={setOpenId} />
              ))}
            </ul>
            {paged.pager}
          </>
        ) : (
          <Empty
            icon="chat"
            title={all.length ? 'No tickets match' : team ? 'No tickets yet' : 'No support tickets yet'}
          >
            {all.length
              ? 'Try another filter.'
              : team
                ? 'Tickets from business owners appear here.'
                : 'Found a bug or need help? Raise a ticket and the BQuee team will reply here.'}
          </Empty>
        )}
      </Panel>
      {creating && (
        <NewTicket
          onClose={() => setCreating(false)}
          onCreated={(t) => {
            setCreating(false);
            setOpenId(t.id);
          }}
        />
      )}
    </div>
  );
}

/** Search, status and type filters (and New ticket for owners). */
function TicketFilters({ team, q, setQ, status, setStatus, cat, setCat, reset, onNew }) {
  return (
    <div className="filters">
      <label className="search sm">
        <Icon name="search" />
        <input
          type="search"
          value={q}
          onChange={(e) => (setQ(e.target.value), reset())}
          placeholder={team ? 'Search subject, business, #' : 'Search tickets'}
          aria-label="Search tickets"
        />
      </label>
      <select
        className="input sm"
        value={status}
        onChange={(e) => (setStatus(e.target.value), reset())}
        aria-label="Status"
      >
        <option value="all">All</option>
        <option value="active">Open + in progress</option>
        <option value="open">Open</option>
        <option value="in_progress">In progress</option>
        <option value="resolved">Resolved</option>
        <option value="closed">Closed</option>
      </select>
      <select className="input sm" value={cat} onChange={(e) => (setCat(e.target.value), reset())} aria-label="Type">
        <option value="">All types</option>
        {Object.entries(TICKET_CATEGORIES).map(([k, [label]]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      {!team && (
        <Button variant="primary" size="sm" icon="plus" onClick={onNew}>
          New ticket
        </Button>
      )}
    </div>
  );
}

/** One ticket in the list: who / type, subject, replies, status. */
function TicketRow({ t, team, onOpen }) {
  const [catLabel, catIcon] = TICKET_CATEGORIES[t.category] || TICKET_CATEGORIES.other;
  return (
    <li>
      <button type="button" className={'tk-row' + (t.unread ? ' unread' : '')} onClick={() => onOpen(t.id)}>
        {team ? (
          <SalonMark salon={{ name: t.business, logo: t.businessLogo, color: t.businessColor }} size="sm" />
        ) : (
          <span className={'tk-ico ' + t.category}>
            <Icon name={catIcon} />
          </span>
        )}
        <span className="tk-main">
          <span className="tk-top">
            <b>{t.subject}</b>
            {t.unread && <span className="tk-dot">{team ? 'New' : 'New reply'}</span>}
          </span>
          <small>
            #{t.number} · {catLabel}
            {team ? ' · ' + t.business + (t.raisedBy ? ' (' + t.raisedBy + ')' : '') : ''} ·{' '}
            {plural(t.replies, 'reply', 'replies')} · updated {when(t.updatedAt)}
          </small>
        </span>
        <span className="tk-side">
          <StatusPill status={t.status} />
          {(t.priority === 'high' || t.priority === 'urgent') && <Pill status="bad">{PRIORITY[t.priority]}</Pill>}
        </span>
      </button>
    </li>
  );
}

function NewTicket({ onClose, onCreated }) {
  const [f, setF] = useState({ category: 'issue', subject: '', message: '', image: '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target ? e.target.value : e }));
  const save = async () => {
    if (!f.subject.trim() || !f.message.trim()) throw new Error('Add a subject and describe the problem');
    const t = await api('POST', '/api/owner/tickets', f);
    toast('Ticket #' + t.number + ' raised');
    onCreated(t);
  };
  return (
    <FormDialog title="New support ticket" submit="Send ticket" onSubmit={save} onClose={onClose} width={560}>
      <Field label="What is it about?">
        <div className="ticket-cats" role="radiogroup">
          {Object.entries(TICKET_CATEGORIES).map(([k, [label, icon]]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={f.category === k}
              className={'ticket-cat' + (f.category === k ? ' on' : '')}
              onClick={() => setF((x) => ({ ...x, category: k }))}
            >
              <Icon name={icon} /> {label}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Subject">
        <input
          className="input"
          value={f.subject}
          onChange={set('subject')}
          maxLength={120}
          placeholder="e.g. QR code doesn’t scan on the poster"
        />
      </Field>
      <Field
        label="Describe it"
        hint="What happened, where, and what you expected. The more detail, the faster we can fix it."
      >
        <textarea className="input" rows={5} value={f.message} onChange={set('message')} maxLength={4000} />
      </Field>
      <ImagePicker label="Screenshot (optional)" value={f.image} onChange={set('image')} max={1400} shape="wide" />
    </FormDialog>
  );
}

function TicketView({ id, team, onBack }) {
  const base = (team ? '/api/admin/tickets/' : '/api/owner/tickets/') + id;
  const load = useLoad(() => api('GET', base), [id]);
  const [msg, setMsg] = useState('');
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  useInterval(load.reload, 20000, !!load.data);
  const t = load.data;
  useEffect(() => {
    if (end.current) end.current.scrollIntoView({ block: 'end' });
  }, [t && t.messages.length]);

  if (load.error) {
    handleError(load.error);
    return null;
  }
  if (!t) return <PageLoader />;
  const [catLabel] = TICKET_CATEGORIES[t.category] || TICKET_CATEGORIES.other;

  const send = async (extra = {}) => {
    if (!msg.trim() && !image && !Object.keys(extra).length) return toast('Write a reply first', 'err');
    setBusy(true);
    try {
      const r = await api('POST', base + '/reply', { message: msg.trim(), image, ...extra });
      load.setData(r);
      setMsg('');
      setImage('');
      toast(
        extra.status
          ? 'Marked as ' + TICKET_STATUS[extra.status][0].toLowerCase()
          : extra.priority
            ? 'Priority changed'
            : 'Reply sent',
      );
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <Panel
        title={
          <span className="ticket-title">
            <button type="button" className="icon-btn" onClick={onBack} aria-label="Back to tickets">
              <Icon name="back" />
            </button>
            #{t.number} · {t.subject}
          </span>
        }
        sub={[catLabel, team ? t.business + (t.raisedBy ? ' – ' + t.raisedBy : '') : '', 'raised ' + when(t.createdAt)]
          .filter(Boolean)
          .join(' · ')}
        actions={<StatusPill status={t.status} />}
      >
        {team && (
          <div className="ticket-controls">
            <Field label="Status">
              <select
                className="input"
                value={t.status}
                disabled={busy}
                onChange={(e) => send({ status: e.target.value })}
              >
                {Object.entries(TICKET_STATUS).map(([k, [label]]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Priority">
              <select
                className="input"
                value={t.priority}
                disabled={busy}
                onChange={(e) => send({ priority: e.target.value })}
              >
                {Object.entries(PRIORITY).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <ol className="chat">
          {t.messages.map((m) =>
            m.status ? (
              <li key={m.id} className="chat-note">
                <Icon name="refresh" /> {m.author} marked this{' '}
                <b>{(TICKET_STATUS[m.status] || [m.status])[0].toLowerCase()}</b> · {when(m.createdAt)}
              </li>
            ) : (
              <li key={m.id} className={'chat-msg ' + (m.fromTeam === team ? 'mine' : 'theirs')}>
                <span className="chat-who">
                  {m.fromTeam ? (team ? m.author : 'BQuee support · ' + m.author) : m.author} · {when(m.createdAt)}
                </span>
                {m.body && <p>{m.body}</p>}
                {m.image && (
                  <a href={m.image} target="_blank" rel="noopener noreferrer" className="chat-img">
                    <img src={m.image} alt="Attached screenshot" />
                  </a>
                )}
              </li>
            ),
          )}
          <li ref={end} aria-hidden="true" />
        </ol>
        <div className="chat-reply">
          <textarea
            className="input"
            rows={3}
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            maxLength={4000}
            placeholder={team ? 'Reply to the business…' : 'Write a reply…'}
            aria-label="Reply"
          />
          <div className="chat-reply-bar">
            <ImagePicker label="" value={image} onChange={setImage} max={1400} shape="wide" />
            <div className="chat-reply-btns">
              {team && t.status !== 'resolved' && (
                <Button variant="soft" disabled={busy} onClick={() => send({ status: 'resolved' })}>
                  {msg.trim() ? 'Reply & resolve' : 'Mark resolved'}
                </Button>
              )}
              <Button variant="primary" icon="arrow" busy={busy} onClick={() => send()}>
                Send
              </Button>
            </div>
          </div>
          {!team && (t.status === 'resolved' || t.status === 'closed') && (
            <small className="chat-hint">Replying opens this ticket again.</small>
          )}
        </div>
      </Panel>
    </div>
  );
}
