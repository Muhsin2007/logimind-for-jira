import { useState } from 'react';
import { type ImportKind, type MappingProposal } from '../api';
import { useI18n } from '../i18n';
import { Icon } from '../icons';
import type { Messages } from '../i18n/en';

type Proposal = Extract<MappingProposal, { ok: true }>;

type ShapeLabel = 'shapeWholeNumbers' | 'shapeDates' | 'shapeNumbers';
const WHOLE = { test: /^-?\d+$/, label: 'shapeWholeNumbers' as ShapeLabel };
const DATE = { test: /^\d{4}-\d{2}-\d{2}$/, label: 'shapeDates' as ShapeLabel };
const DECIMAL = { test: /^\d+(\.\d+)?$/, label: 'shapeNumbers' as ShapeLabel };
const SHAPES: Record<string, { test: RegExp; label: ShapeLabel }> = {
  qty: WHOLE,
  on_hand: WHOLE,
  reserved: WHOLE,
  inbound_qty: WHOLE,
  safety_stock: WHOLE,
  unit_cost: DECIMAL,
  daily_usage: DECIMAL,
  planned_arrival: DATE,
  eta: DATE,
  actual_arrival: DATE,
  updated_at: DATE,
};

/** A hint when the sample values do not fit the chosen field (e.g. text mapped to qty). */
function shapeWarning(t: Messages, field: string | null, samples: string[]): string | null {
  const shape = field ? SHAPES[field] : undefined;
  if (!shape || samples.every((v) => shape.test.test(v))) return null;
  return t.shapeWarning(t[shape.label]);
}

interface Props {
  filename: string;
  proposal: Proposal;
  busy: boolean;
  onConfirm: (kind: ImportKind, mapping: (string | null)[]) => void;
  onCancel: () => void;
}

/**
 * Lets the LogiMind owner or a manager check and edit a proposed column mapping before importing. Only
 * column names change; every row is still validated by the importer afterwards.
 */
export function ColumnMapping({ filename, proposal, busy, onConfirm, onCancel }: Props) {
  const [kind, setKind] = useState<ImportKind>(proposal.kind);
  const [mapping, setMapping] = useState<(string | null)[]>(proposal.columns.map((c) => c.field));
  const { t } = useI18n();
  const fields = proposal.schema[kind];
  const missing = fields.filter((f) => f.required && !mapping.includes(f.field)).map((f) => f.field);

  const chooseKind = (next: ImportKind) => {
    const allowed = new Set(proposal.schema[next].map((f) => f.field));
    setKind(next);
    setMapping((m) => m.map((f) => (f && allowed.has(f) ? f : null)));
  };

  // A field belongs to one column: choosing it elsewhere clears the previous column.
  const choose = (index: number, field: string | null) =>
    setMapping((m) => m.map((f, i) => (i === index ? field : field !== null && f === field ? null : f)));

  return (
    <div className="mapping" role="group" aria-label={t.mappingFor(filename)}>
      <p>
        <strong>{filename}: </strong>
        {t.columnsNotRecognised}{' '}
        {proposal.source === 'ai' ? <><span className="inline-icon"><Icon name="sparkles" size={14} /></span> {t.aiProposed} <strong>{t.checkBeforeImport}</strong></> : <>{t.matchedByName}</>}{' '}
        {t.onlyNamesMapped}
      </p>
      {proposal.notice && <p className="callout callout-info" role="note">{proposal.notice}</p>}
      <div className="row">
        <label htmlFor={`kind-${filename}`} className="field-label">{t.fileType}</label>
        <select id={`kind-${filename}`} className="input" value={kind} onChange={(e) => chooseKind(e.target.value as ImportKind)} disabled={busy}>
          <option value="shipments">{t.fileKind.shipments}</option>
          <option value="inventory">{t.fileKind.inventory}</option>
        </select>
        <span className="muted small">{t.dataRows(proposal.rowCount)}</span>
      </div>
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr><th>{t.colInYourFile}</th><th>{t.colFirstValues}</th><th>{t.colLogiMindField}</th></tr>
          </thead>
          <tbody>
            {proposal.columns.map((c, i) => {
              const warning = shapeWarning(t, mapping[i], c.samples);
              return (
                <tr key={c.index}>
                  <td>{c.header || <span className="muted">{t.noName}</span>}</td>
                  <td className="muted small mono">{c.samples.join(' · ') || '—'}</td>
                  <td>
                    <select
                      className="input"
                      aria-label={t.fieldForColumn(c.header || String(i + 1))}
                      value={mapping[i] ?? ''}
                      onChange={(e) => choose(i, e.target.value || null)}
                      disabled={busy}
                    >
                      <option value="">{t.ignoreColumn}</option>
                      {fields.map((f) => (
                        <option key={f.field} value={f.field}>{f.field}{f.required ? ' *' : ''} — {t.fieldHelp[f.field] ?? f.description}</option>
                      ))}
                    </select>
                    {warning && <div className="text-danger small">{warning}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {missing.length > 0 && <p className="text-danger">{t.mapRequiredFirst(missing.join(', '))}</p>}
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={busy || missing.length > 0} onClick={() => onConfirm(kind, mapping)}>
          {busy ? t.importing : t.importWithMapping}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>{t.cancel}</button>
      </div>
    </div>
  );
}
