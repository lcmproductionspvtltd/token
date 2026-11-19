/* Floating white pill header used by the booking and token pages (matches the landing page nav). */

import { Icon, SalonMark } from '../core/ui.jsx';

export function PillHeader({ salon, sub, onBack, backLabel = 'Back', children, progress }) {
  return (
    <header className="pill-head" style={progress != null ? { '--progress': progress } : undefined}>
      <div className="pill-head-inner">
        <button type="button" className="pill-back" onClick={onBack} aria-label={backLabel} title={backLabel}>
          <Icon name="arrowl" />
        </button>
        <SalonMark salon={salon} className="ld-logo" />
        <span className="ld-brand-text">
          <b>{salon.name}</b>
          {sub && <small>{sub}</small>}
        </span>
        <div className="pill-head-end">{children}</div>
        {progress != null && <span className="pill-progress" aria-hidden="true" />}
      </div>
    </header>
  );
}
