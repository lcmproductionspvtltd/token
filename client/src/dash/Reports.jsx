/* Reports for every role: pick a date range and filters, see totals, a daily chart and breakdowns, export CSV. */

import { useEffect, useMemo, useState } from 'react';
import { api } from '../core/api.js';
import { isoDate, money, statusLabel, todayStr, dayText, plural } from '../core/format.js';
import { Button, Empty, Icon, Pill, downloadBlob, resetPage, toast, usePaged } from '../core/ui.jsx';
import { Figures, Panel, handleError } from './Shell.jsx';

const ENDPOINT = { owner: '/api/owner/reports', staff: '/api/staff/reports', admin: '/api/admin/reports' };

function shift(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDate(d);
}
function monthStart(offset = 0) {
  const d = new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth() + offset, 1));
}
function monthEnd(offset = 0) {
  const d = new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth() + offset + 1, 0));
}

export const PRESETS = [
  { id: 'today', label: 'Today', range: () => [todayStr(), todayStr()] },
  { id: 'yesterday', label: 'Yesterday', range: () => [shift(-1), shift(-1)] },
  { id: '7', label: 'Last 7 days', range: () => [shift(-6), todayStr()] },
  { id: '30', label: 'Last 30 days', range: () => [shift(-29), todayStr()] },
  { id: 'month', label: 'This month', range: () => [monthStart(), todayStr()] },
  { id: 'lastmonth', label: 'Last month', range: () => [monthStart(-1), monthEnd(-1)] },
  { id: 'custom', label: 'Custom' },
];

const STAFF_STATUS = { waiting: 'Waiting', in_progress: 'In service', done: 'Completed', missed: 'Missed' };
const BIZ_STATUS = { active: 'Active', expired: 'Expired', disabled: 'Disabled' };

export function ReportsTab({ kind, currency = '₹', canExport = true }) {
  const [preset, setPreset] = useState('30');
  const [from, setFrom] = useState(shift(-29));
  const [to, setTo] = useState(todayStr());
  const [filters, setFilters] = useState({});
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const query = (extra = '') => {
    const q = new URLSearchParams({ from, to });
    Object.entries(filters).forEach(([k, v]) => v && q.set(k, v));
    return ENDPOINT[kind] + '?' + q.toString() + extra;
  };

  const load = async () => {
    setBusy(true);
    try {
      setData(await api('GET', query()));
      resetPage('report-rows-' + kind);
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (from && to && from <= to) load();
  }, [from, to, JSON.stringify(filters)]);

  const choose = (id) => {
    setPreset(id);
    const p = PRESETS.find((x) => x.id === id);
    if (p.range) {
      const [f, t] = p.range();
      setFrom(f);
      setTo(t);
    }
  };
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const exportCsv = async () => {
    setExporting(true);
    try {
      const r = await api('GET', query('&export=1'));
      downloadBlob(new Blob([r.csv], { type: 'text/csv;charset=utf-8' }), r.fileName);
      toast('Report downloaded');
    } catch (err) {
      handleError(err);
    } finally {
      setExporting(false);
    }
  };

  const cur = (data && data.currency) || currency;
  const opts = (data && data.options) || {};

  return (
    <div className="stack report">
      <Panel
        title="Report filters"
        sub={data ? `${dayText(data.range.from)} – ${dayText(data.range.to)} · ${plural(data.range.days, 'day')}` : ' '}
        actions={
          canExport ? (
            <Button
              variant="primary"
              size="sm"
              icon="download"
              busy={exporting}
              onClick={exportCsv}
              disabled={!data || !data.rowCount}
            >
              Export CSV
            </Button>
          ) : null
        }
      >
        <PresetChips preset={preset} choose={choose} />
        <FilterFields
          kind={kind}
          opts={opts}
          filters={filters}
          setFilter={setFilter}
          setFilters={setFilters}
          from={from}
          to={to}
          setFrom={setFrom}
          setTo={setTo}
          setPreset={setPreset}
        />
      </Panel>

      {!data ? (
        <div className="panel panel-loading">
          <span className="spinner" />
        </div>
      ) : (
        <ReportBody kind={kind} data={data} busy={busy} cur={cur} />
      )}
    </div>
  );
}

/** Quick date ranges (today, 7 days, 30 days, this month…). */
function PresetChips({ preset, choose }) {
  return (
    <div className="report-presets" role="group" aria-label="Date range">
      {PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          className={'chip-btn' + (preset === p.id ? ' on' : '')}
          onClick={() => choose(p.id)}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

/** From / to dates and the filters each kind of report has. */
function FilterFields({ kind, opts, filters, setFilter, setFilters, from, to, setFrom, setTo, setPreset }) {
  return (
    <div className="filters report-filters">
      <label className="filter-field">
        <span>From</span>
        <input
          type="date"
          className="input sm"
          value={from}
          max={to}
          onChange={(e) => (setPreset('custom'), setFrom(e.target.value))}
        />
      </label>
      <label className="filter-field">
        <span>To</span>
        <input
          type="date"
          className="input sm"
          value={to}
          min={from}
          max={todayStr()}
          onChange={(e) => (setPreset('custom'), setTo(e.target.value))}
        />
      </label>
      {kind === 'owner' && opts.branches && opts.branches.length > 1 && (
        <Select
          label="Branch"
          value={filters.branchId}
          onChange={(v) => setFilter('branchId', v)}
          all="All branches"
          options={opts.branches.map((b) => [b.id, b.name])}
        />
      )}
      {kind === 'owner' && opts.staff && (
        <Select
          label="Staff"
          value={filters.staffId}
          onChange={(v) => setFilter('staffId', v)}
          all="All staff"
          options={opts.staff.map((s) => [s.id, s.name])}
        />
      )}
      {kind === 'owner' && (
        <Select
          label="Status"
          value={filters.status}
          onChange={(v) => setFilter('status', v)}
          all="All statuses"
          options={(opts.statuses || []).map((s) => [s, statusLabel(s)])}
        />
      )}
      {kind === 'staff' && (
        <Select
          label="Status"
          value={filters.status}
          onChange={(v) => setFilter('status', v)}
          all="All statuses"
          options={Object.entries(STAFF_STATUS)}
        />
      )}
      {kind === 'admin' && (
        <Select
          label="Category"
          value={filters.categoryId}
          onChange={(v) => setFilter('categoryId', v)}
          all="All categories"
          options={[...(opts.categories || []).map((c) => [c.id, c.name]), ['none', 'No category']]}
        />
      )}
      {kind === 'admin' && (
        <Select
          label="Status"
          value={filters.status}
          onChange={(v) => setFilter('status', v)}
          all="All statuses"
          options={Object.entries(BIZ_STATUS)}
        />
      )}
      {Object.values(filters).some(Boolean) && (
        <Button size="sm" variant="quiet" icon="x" onClick={() => setFilters({})}>
          Clear filters
        </Button>
      )}
    </div>
  );
}

/** Figures, the day chart, breakdowns and the rows of one report. */
function ReportBody({ kind, data, busy, cur }) {
  return (
    <div className={'stack' + (busy ? ' is-busy' : '')}>
      <Figures items={figures(kind, data, cur)} />
      <DayChart kind={kind} days={data.byDay} currency={cur} />
      <div className="report-grid">
        {kind === 'owner' && (
          <Breakdown
            title="By staff"
            rows={data.byStaff}
            cols={[
              ['name', 'Staff'],
              ['services', 'Services'],
              ['avgServiceMin', 'Avg min'],
              ['revenue', 'Revenue', 'money'],
            ]}
            currency={cur}
          />
        )}
        {kind !== 'admin' && (
          <Breakdown
            title="By service"
            rows={data.byService}
            cols={[
              ['name', 'Service'],
              ['count', 'Done'],
              ['revenue', kind === 'staff' ? 'Earned' : 'Revenue', 'money'],
            ]}
            currency={cur}
          />
        )}
        {kind === 'owner' && data.byBranch.length > 1 && (
          <Breakdown
            title="By branch"
            rows={data.byBranch}
            cols={[
              ['name', 'Branch'],
              ['tokens', 'Tokens'],
              ['done', 'Done'],
              ['revenue', 'Revenue', 'money'],
            ]}
            currency={cur}
          />
        )}
        {kind === 'owner' && data.byHour.length > 0 && (
          <Breakdown
            title="Busiest hours"
            rows={[...data.byHour]
              .sort((a, b) => b.tokens - a.tokens)
              .slice(0, 6)
              .map((h) => ({ ...h, name: hourLabel(h.hour) }))}
            cols={[
              ['name', 'Hour'],
              ['tokens', 'Tokens'],
            ]}
            currency={cur}
          />
        )}
        {kind === 'admin' && (
          <Breakdown
            title="By category"
            rows={data.byCategory}
            cols={[
              ['name', 'Category'],
              ['businesses', 'Businesses'],
              ['tokens', 'Tokens'],
              ...(data.summary.revenue !== null ? [['revenue', 'Plan revenue', 'money']] : []),
            ]}
            currency={cur}
          />
        )}
      </div>
      <RowsPanel kind={kind} data={data} currency={cur} />
    </div>
  );
}

function Select({ label, value, onChange, all, options }) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select className="input sm" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

const hourLabel = (h) => {
  const ampm = h < 12 ? 'AM' : 'PM';
  const n = h % 12 || 12;
  return `${n} ${ampm} – ${(h + 1) % 12 || 12} ${h + 1 < 12 || h + 1 === 24 ? 'AM' : 'PM'}`;
};

function figures(kind, d, cur) {
  const s = d.summary;
  if (kind === 'owner')
    return [
      ['Tokens', s.tokens, '', 'ticket'],
      ['Completed', s.done, 'done', 'check'],
      ['Revenue', money(s.revenue, cur), '', 'chart'],
      ['Customers', s.customers, '', 'users'],
      ['Avg bill', money(s.avgTicket, cur), '', 'tag'],
      ['Avg wait', s.avgWaitMin ? Math.round(s.avgWaitMin) + ' min' : '—', 'wait', 'clock'],
      ['Cancelled', s.cancelled, '', 'x'],
      ['Discounts given', money(s.discount, cur), '', 'gift'],
    ];
  if (kind === 'staff')
    return [
      ['Services done', s.done, 'done', 'check'],
      ['Earned', money(s.revenue, cur), '', 'chart'],
      ['Customers', s.customers, '', 'users'],
      ['Avg service time', s.avgServiceMin ? Math.round(s.avgServiceMin) + ' min' : '—', '', 'clock'],
      ['Missed', s.missed, '', 'x'],
    ];
  return [
    ['Businesses', s.businesses, '', 'store'],
    ['Active', s.active, 'done', 'check'],
    ['New in range', s.newBusinesses, '', 'plus'],
    ['Tokens', s.tokens, '', 'ticket'],
    ['Customers', s.customers, '', 'users'],
    ...(s.revenue !== null ? [['Plan revenue', money(s.revenue, '₹'), '', 'chart']] : []),
    ['Expired', s.expired, 'wait', 'clock'],
    ['Disabled', s.disabled, '', 'x'],
  ];
}

/** Bar chart of the range, drawn as SVG (no chart library). */
function DayChart({ kind, days, currency }) {
  const metrics =
    kind === 'owner'
      ? [
          ['tokens', 'Tokens'],
          ['revenue', 'Revenue'],
        ]
      : kind === 'staff'
        ? [
            ['services', 'Services'],
            ['revenue', 'Earned'],
          ]
        : [
            ['tokens', 'Tokens'],
            ['newBusinesses', 'New businesses'],
          ];
  const [metric, setMetric] = useState(metrics[0][0]);
  const values = days.map((d) => Number(d[metric]) || 0);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const isMoney = metric === 'revenue';
  const fmt = (v) => (isMoney ? money(v, currency) : String(v));
  const W = 720;
  const H = 180;
  const gap = days.length > 60 ? 1 : 3;
  const bw = Math.max(2, (W - gap * (days.length - 1)) / days.length);
  const step = Math.ceil(days.length / 8);

  return (
    <Panel
      title={metrics.find((m) => m[0] === metric)[1] + ' by day'}
      sub={'Total ' + fmt(Math.round(total * 100) / 100)}
      actions={
        <div className="seg" role="tablist">
          {metrics.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={metric === id}
              className={metric === id ? 'on' : ''}
              onClick={() => setMetric(id)}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {total === 0 ? (
        <Empty icon="chart" title="Nothing in this range">
          Try a longer date range or clear the filters.
        </Empty>
      ) : (
        <div className="day-chart">
          <svg viewBox={`0 0 ${W} ${H + 24}`} preserveAspectRatio="none" role="img" aria-label="Daily chart">
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <line key={f} x1="0" x2={W} y1={H - H * f} y2={H - H * f} className="grid" />
            ))}
            {days.map((d, i) => {
              const h = (values[i] / max) * (H - 8);
              const x = i * (bw + gap);
              return (
                <g key={d.date}>
                  <rect
                    x={x}
                    y={H - h}
                    width={bw}
                    height={Math.max(h, values[i] ? 2 : 0)}
                    rx={Math.min(4, bw / 2)}
                    className="bar"
                  >
                    <title>{`${dayText(d.date)}: ${fmt(values[i])}`}</title>
                  </rect>
                  {i % step === 0 && (
                    <text
                      x={i === 0 ? x : x + bw / 2}
                      y={H + 17}
                      textAnchor={i === 0 ? 'start' : 'middle'}
                      className="axis"
                    >
                      {d.date.slice(8)}/{d.date.slice(5, 7)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <span className="day-chart-max">{fmt(max)}</span>
        </div>
      )}
    </Panel>
  );
}

function Breakdown({ title, rows, cols, currency }) {
  const top = Math.max(1, ...rows.map((r) => Number(r[cols[cols.length - 1][0]]) || 0));
  return (
    <Panel title={title} flush className="breakdown">
      {rows.length ? (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                {cols.map(([k, label], i) => (
                  <th key={k} className={i ? 'r' : ''}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 12).map((r, n) => (
                <tr key={r.id || r.name || n}>
                  {cols.map(([k, , type], i) => (
                    <td key={k} className={i ? 'r num' : ''} data-label={cols[i][1]}>
                      {i === 0 ? (
                        <span className="bd-name">
                          <b>{r[k] || '—'}</b>
                          <span
                            className="bd-bar"
                            style={{
                              width: Math.round(((Number(r[cols[cols.length - 1][0]]) || 0) / top) * 100) + '%',
                            }}
                          />
                        </span>
                      ) : type === 'money' ? (
                        r[k] === null ? (
                          '—'
                        ) : (
                          money(r[k], currency)
                        )
                      ) : (
                        r[k]
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon="list" title="No data in this range" />
      )}
    </Panel>
  );
}

const ROW_COLS = {
  owner: [
    ['token', 'Token'],
    ['date', 'Date'],
    ['customer', 'Customer'],
    ['services', 'Services'],
    ['staff', 'Staff'],
    ['status', 'Status', 'status'],
    ['paid', 'Paid', 'money'],
  ],
  staff: [
    ['token', 'Token'],
    ['date', 'Date'],
    ['customer', 'Customer'],
    ['service', 'Service'],
    ['minutes', 'Minutes'],
    ['status', 'Status', 'status'],
    ['earned', 'Earned', 'money'],
  ],
  admin: [
    ['name', 'Business'],
    ['category', 'Category'],
    ['status', 'Status', 'biz'],
    ['tokens', 'Tokens'],
    ['done', 'Completed'],
    ['customers', 'Customers'],
    ['amount', 'Plan', 'money'],
  ],
};

function RowsPanel({ kind, data, currency }) {
  const [q, setQ] = useState('');
  const cols = ROW_COLS[kind].filter(([k]) => !(k === 'amount' && data.summary.revenue === null));
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data.rows;
    return data.rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(s)));
  }, [q, data]);
  const paged = usePaged('report-rows-' + kind, shown);
  const title = kind === 'admin' ? 'Businesses' : kind === 'staff' ? 'My services' : 'Tokens';
  return (
    <Panel
      flush
      title={title}
      sub={
        data.rowCount > data.rows.length
          ? `Showing the latest ${data.rows.length} of ${data.rowCount}. Export CSV for all.`
          : plural(data.rowCount, 'row')
      }
      actions={
        <label className="search-box">
          <Icon name="search" />
          <input
            className="input sm"
            placeholder="Search"
            value={q}
            onChange={(e) => (setQ(e.target.value), paged.reset())}
            aria-label={'Search ' + title.toLowerCase()}
          />
        </label>
      }
    >
      {shown.length ? (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  {cols.map(([k, label, type]) => (
                    <th
                      key={k}
                      className={type === 'money' || ['tokens', 'done', 'customers', 'minutes'].includes(k) ? 'r' : ''}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.items.map((r, n) => (
                  <tr key={(r.id || '') + n}>
                    {cols.map(([k, label, type]) => (
                      <td
                        key={k}
                        data-label={label}
                        className={
                          type === 'money' || ['tokens', 'done', 'customers', 'minutes'].includes(k)
                            ? 'r num'
                            : k === 'token'
                              ? 'num'
                              : ''
                        }
                      >
                        {type === 'status' ? (
                          <Pill status={r[k]} />
                        ) : type === 'biz' ? (
                          <span
                            className={'pill ' + (r[k] === 'active' ? 'done' : r[k] === 'expired' ? 'waiting' : 'off')}
                          >
                            {BIZ_STATUS[r[k]]}
                          </span>
                        ) : type === 'money' ? (
                          r[k] === null || r[k] === undefined ? (
                            '—'
                          ) : (
                            money(r[k], currency)
                          )
                        ) : k === 'customer' ? (
                          <>
                            <b>{r.customer}</b>
                            {r.mobile && <small className="num">{r.mobile}</small>}
                          </>
                        ) : k === 'date' ? (
                          <>
                            {dayText(r.date)}
                            {r.time && <small className="num">{r.time}</small>}
                          </>
                        ) : r[k] === '' || r[k] === null ? (
                          '—'
                        ) : (
                          r[k]
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {paged.pager}
        </>
      ) : (
        <Empty icon="list" title={q ? 'Nothing matches your search' : 'Nothing in this range'}>
          {q ? 'Try another word.' : 'Pick a longer date range or clear the filters.'}
        </Empty>
      )}
    </Panel>
  );
}
