import { useId, type ReactNode } from 'react';
import type { Severity, Shipment } from './api';
import { SEVERITY_LABEL, STATUS_LABEL } from './format';

/** Severity is status, not identity: always an icon glyph + label, never colour alone. */
const SEVERITY_GLYPH: Record<Severity, string> = { critical: '▲', high: '◆', medium: '●', low: '○' };

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`badge sev-${severity}`}>
      <span aria-hidden="true">{SEVERITY_GLYPH[severity]}</span> {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function StatusBadge({ status }: { status: Shipment['status'] }) {
  return <span className={`badge status status-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'danger' | 'warning' }) {
  return (
    <div className={`tile${tone ? ` tile-${tone}` : ''}`}>
      <div className="tile-label">{label}</div>
      <div className="tile-value">{value}</div>
      {hint && <div className="tile-hint">{hint}</div>}
    </div>
  );
}

export interface BarDatum {
  key: string;
  label: ReactNode;
  value: number;
  className?: string;
}

/** Horizontal bar list: one series, shared baseline, value labelled in text ink. */
export function BarList({ data, ariaLabel }: { data: BarDatum[]; ariaLabel: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="barlist" aria-label={ariaLabel}>
      {data.map((d) => (
        <li key={d.key} title={`${d.value}`}>
          <span className="barlist-label">{d.label}</span>
          <span className="barlist-track">
            <span className={`barlist-bar ${d.className ?? ''}`} style={{ width: `${(d.value / max) * 100}%` }} />
          </span>
          <span className="barlist-value">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function Panel({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const headingId = useId();
  return (
    <section className="panel" aria-labelledby={headingId}>
      <header className="panel-head">
        <h2 id={headingId}>{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" /> {label}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <strong>Something went wrong.</strong> {message}
      {onRetry && (
        <button type="button" className="btn" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state state-empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="facts">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
