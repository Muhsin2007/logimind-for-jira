import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { COVER_HORIZON_DAYS } from '../../../src/domain/cover';
import type { CoverProjection, Severity, Shipment } from './api';
import { useI18n } from './i18n';
import { Icon, type IconName } from './icons';

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

/** Severity is status, not identity: always an icon glyph + label, never colour alone. */
const SEVERITY_GLYPH: Record<Severity, string> = { critical: '▲', high: '◆', medium: '●', low: '○' };

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { t } = useI18n();
  return (
    <span className={`badge sev sev-${severity}`}>
      <span className="sev-glyph" aria-hidden="true">{SEVERITY_GLYPH[severity]}</span> {t.severity[severity]}
    </span>
  );
}

export function StatusBadge({ status }: { status: Shipment['status'] }) {
  const { t } = useI18n();
  return (
    <span className={`status status-${status}`}>
      <span className="status-dot" aria-hidden="true" />
      {t.status[status]}
    </span>
  );
}

/** Days of cover with the projected stock-out date; a dash when the file has no daily usage. */
export function CoverValue({ cover }: { cover: CoverProjection }) {
  const { t, fmt } = useI18n();
  if (cover.dailyUsage === null || cover.dailyUsage <= 0) {
    return <span className="muted" title={t.noUsage}><span aria-hidden="true">—</span><span className="sr-only">{t.noUsage}</span></span>;
  }
  if (cover.daysOfCover === null) return <span className="cover cover-ok">{t.beyondHorizon(COVER_HORIZON_DAYS)}</span>;
  const tone = cover.daysOfCover <= 7 ? 'cover-danger' : cover.daysOfCover <= 14 ? 'cover-warn' : 'cover-ok';
  return (
    <span className={`cover ${tone}`}>
      <strong>{t.daysShort(cover.daysOfCover)}</strong> <span className="cover-date nowrap">{t.runsOutOn(fmt.date(cover.stockOutDate))}</span>
    </span>
  );
}

/** An info icon that explains a number; the text is the button's description, shown on hover and focus. */
export function InfoTip({ text }: { text: string }) {
  const { t } = useI18n();
  const id = useId();
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Escape') e.currentTarget.blur();
  };
  return (
    <span className="tip-wrap">
      <button type="button" className="tip-btn" aria-label={t.moreInfo} aria-describedby={id} onKeyDown={onKeyDown}>
        <Icon name="info" size={14} />
      </button>
      <span role="tooltip" id={id} className="tip">{text}</span>
    </span>
  );
}

export function KpiCard({ icon, label, value, sub, info, tone, onClick, actionLabel }: {
  icon: IconName;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  info?: string;
  tone?: 'danger' | 'warning' | 'success';
  /** Adds a shortcut to the page that explains the number. */
  onClick?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className={`kpi${tone ? ` kpi-${tone}` : ''}`}>
      <div className="kpi-head">
        <span className="kpi-icon"><Icon name={icon} /></span>
        <span className="kpi-label">{label}</span>
        {info && <InfoTip text={info} />}
      </div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
      {onClick && actionLabel && (
        <button type="button" className="kpi-link" onClick={onClick}>
          {actionLabel} <Icon name="arrowRight" size={14} />
        </button>
      )}
    </div>
  );
}

/** Open risks as one stacked bar plus a legend that carries the numbers (the bar is decorative). */
export function SeverityDistribution({ counts }: { counts: Record<Severity, number> }) {
  const { t, fmt } = useI18n();
  const total = SEVERITY_ORDER.reduce((sum, s) => sum + counts[s], 0);
  return (
    <div className="dist">
      <div className="dist-bar" aria-hidden="true">
        {total === 0 ? <span className="dist-empty" /> : SEVERITY_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <span key={s} className={`dist-seg seg-${s}`} style={{ flexGrow: counts[s] }} />
        ))}
      </div>
      <ul className="dist-legend" aria-label={t.openRisksBySeverity}>
        {SEVERITY_ORDER.map((s) => (
          <li key={s}>
            <SeverityBadge severity={s} />
            <span className="dist-count">{fmt.number(counts[s])}</span>
            <span className="dist-share muted">{total === 0 ? '—' : fmt.percent(counts[s] / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Panel({ title, icon, actions, children, className, description }: {
  title: string;
  icon?: IconName;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  description?: ReactNode;
}) {
  const headingId = useId();
  return (
    <section className={`panel${className ? ` ${className}` : ''}`} aria-labelledby={headingId}>
      <header className="panel-head">
        <div className="panel-title">
          {icon && <span className="panel-icon"><Icon name={icon} /></span>}
          <h2 id={headingId}>{title}</h2>
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      {description && <p className="panel-desc">{description}</p>}
      {children}
    </section>
  );
}

/** Skeleton placeholder shaped like content, so the page does not jump when data arrives. */
export function Loading({ label, variant = 'page' }: { label?: string; variant?: 'page' | 'inline' }) {
  const { t } = useI18n();
  return (
    <div className={`skeleton-wrap skeleton-${variant}`} role="status">
      <span className="sr-only">{label ?? t.loading}</span>
      {variant === 'page' && (
        <div className="skeleton-kpis" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => <span key={i} className="skeleton skeleton-card" />)}
        </div>
      )}
      <div className="skeleton-lines" aria-hidden="true">
        {[100, 92, 96, 70].map((w, i) => <span key={i} className="skeleton skeleton-line" style={{ width: `${w}%` }} />)}
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="state state-error" role="alert">
      <span className="state-icon"><Icon name="alertCircle" size={20} /></span>
      <div className="state-body">
        <strong>{t.somethingWrong}</strong>
        <p>{message}</p>
        {onRetry && (
          <button type="button" className="btn" onClick={onRetry}>
            {t.retry}
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ title, children, icon = 'database' }: { title: string; children?: ReactNode; icon?: IconName }) {
  return (
    <div className="state state-empty">
      <span className="state-icon"><Icon name={icon} size={22} /></span>
      <div className="state-body">
        <strong>{title}</strong>
        {children}
      </div>
    </div>
  );
}

const CALLOUT_ICON: Record<'info' | 'success' | 'warning' | 'danger', IconName> = { info: 'info', success: 'checkCircle', warning: 'alert', danger: 'alertCircle' };

/** Inline message next to the thing it is about; `role` decides whether it is announced. */
export function Callout({ tone = 'info', title, children, role, className }: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
  role?: 'note' | 'status' | 'alert';
  className?: string;
}) {
  return (
    <div className={`callout callout-${tone}${className ? ` ${className}` : ''}`} role={role}>
      <span className="callout-icon"><Icon name={CALLOUT_ICON[tone]} /></span>
      <div className="callout-body">
        {title && <strong className="callout-title">{title}</strong>}
        {children && <div>{children}</div>}
      </div>
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

export function SearchField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <div className="search">
      <Icon name="search" className="search-icon" />
      <input type="search" className="input search-input" placeholder={placeholder} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

/** A row of mutually exclusive toggle buttons (filters, modes); the pressed one is the current value. */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: SegmentOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="segment" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
          {o.count !== undefined && <span className="segment-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Coverage bar: share of a target reached; the text value is what screen readers hear. */
export function Meter({ ratio, label, valueText }: { ratio: number; label: string; valueText: string }) {
  const pct = Math.round(Math.min(Math.max(ratio, 0), 1) * 100);
  const tone = ratio < 0.5 ? 'meter-danger' : ratio < 1 ? 'meter-warn' : 'meter-ok';
  return (
    <span className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={valueText} aria-label={label}>
      <span className={`meter-fill ${tone}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

/**
 * Modal confirmation built on the native <dialog> (focus trap, Escape and top layer come from
 * the browser). Focus returns to the control that opened it.
 */
export function ConfirmDialog({ open, title, children, confirmLabel, busy, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useI18n();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      opener?.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      {open && (
        <>
          <div className="dialog-head">
            <span className="dialog-icon"><Icon name="alert" size={20} /></span>
            <h2 id={titleId}>{title}</h2>
          </div>
          <div className="dialog-body">{children}</div>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onCancel} disabled={busy} autoFocus>
              {t.cancel}
            </button>
            <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
              {confirmLabel}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
