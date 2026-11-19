/*
 * Landing page: "Check your waiting time" by token number, next to a live board of
 * token NUMBERS (now serving / waiting). The public never sees names or services.
 */

import { useRef, useState } from 'react';
import { api } from '../core/api.js';
import { statusLabel, waitText } from '../core/format.js';
import { Icon, Pill, useInterval, useLoad } from '../core/ui.jsx';

export function QueueCheck({ branchId, prefix, inputRef }) {
  const board = useLoad(() => api('GET', '/api/public/branch/' + branchId + '/queue'), [branchId]);
  useInterval(board.reload, 20000, !!board.data);
  const [value, setValue] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const last = useRef('');

  const lookup = async (number) => {
    setBusy(true);
    setError('');
    try {
      const r = await api('GET', `/api/public/branch/${branchId}/lookup?number=${encodeURIComponent(number)}`);
      last.current = number;
      setResult(r);
    } catch (err) {
      setResult(null);
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  // Keep a looked-up token fresh while the page is open.
  useInterval(
    () => last.current && lookup(last.current),
    20000,
    !!result && ['waiting', 'serving'].includes(result.status),
  );

  const b = board.data;
  const PER_PAGE = 8;
  const waiting = b ? b.waiting : [];
  const pages = Math.max(1, Math.ceil(waiting.length / PER_PAGE));
  const current = Math.min(page, pages);
  const pageItems = waiting.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const example = (prefix ? prefix + '-' : '') + '007';

  return (
    <div className="qc">
      <div className="qc-check">
        <h3>Check your waiting time</h3>
        <p>Enter the token number printed on your token.</p>
        <form
          className="qc-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) lookup(value.trim());
          }}
        >
          <span className="qc-input">
            <Icon name="ticket" />
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={'e.g. ' + example}
              inputMode="text"
              autoComplete="off"
              aria-label="Token number"
            />
          </span>
          <button type="submit" className="btn primary" disabled={busy || !value.trim()}>
            <span>{busy ? 'Checking…' : 'Check'}</span>
          </button>
        </form>

        {error && (
          <p className="qc-error" role="alert">
            {error}
          </p>
        )}
        {result && (
          <div className={'qc-result ' + result.status} aria-live="polite">
            <div className="qc-result-top">
              <b className="num">{result.label}</b>
              <Pill status={result.status}>{statusLabel(result.status)}</Pill>
            </div>
            {result.status === 'waiting' ? (
              <dl>
                <div>
                  <dt>Estimated wait</dt>
                  <dd className="num">{waitText(result.wait)}</dd>
                </div>
                <div>
                  <dt>People ahead</dt>
                  <dd className="num">{result.ahead}</dd>
                </div>
              </dl>
            ) : (
              <p className="qc-msg">
                {result.status === 'serving'
                  ? 'This token is being served now.'
                  : result.status === 'done'
                    ? 'This token has been completed.'
                    : result.status === 'cancelled'
                      ? 'This token was cancelled.'
                      : 'This token has expired.'}
              </p>
            )}
            {['waiting', 'serving'].includes(result.status) && <small>Updates every 20 seconds</small>}
          </div>
        )}
      </div>

      <div className="qc-board" aria-label="Live queue board">
        <div className="qc-board-head">
          <span className="live-dot" />
          <b>Live queue</b>
          <span>{b ? `${b.waitingCount} waiting` : ''}</span>
        </div>
        {!b ? (
          <div className="qc-board-empty">Loading…</div>
        ) : (
          <>
            <div className="qc-now">
              <small>Now serving</small>
              {b.serving.length ? (
                <div className="qc-chips">
                  {b.serving.map((t) => (
                    <span key={t.label} className="qc-chip now num">
                      {t.label}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="qc-none">No one right now</p>
              )}
            </div>
            <div className="qc-next">
              <small>Waiting</small>
              {waiting.length ? (
                <>
                  <ol className="qc-list" start={(current - 1) * PER_PAGE + 1}>
                    {pageItems.map((t, i) => (
                      <li key={t.label} className={(current - 1) * PER_PAGE + i === 0 ? 'next' : ''}>
                        <span className="num">{t.label}</span>
                        <em>
                          {t.wait ? '~' + waitText(t.wait) : (current - 1) * PER_PAGE + i === 0 ? 'Next' : 'Soon'}
                        </em>
                      </li>
                    ))}
                  </ol>
                  {pages > 1 && (
                    <div className="qc-pager">
                      <button
                        type="button"
                        onClick={() => setPage(current - 1)}
                        disabled={current === 1}
                        aria-label="Previous page"
                      >
                        <Icon name="prev" />
                      </button>
                      <span className="num">
                        {(current - 1) * PER_PAGE + 1}–{Math.min(current * PER_PAGE, waiting.length)} of{' '}
                        {waiting.length}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage(current + 1)}
                        disabled={current === pages}
                        aria-label="Next page"
                      >
                        <Icon name="next" />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <p className="qc-none">No queue – walk right in</p>
              )}
              {b.waitingCount > b.waiting.length && (
                <p className="qc-none">+{b.waitingCount - b.waiting.length} more</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
