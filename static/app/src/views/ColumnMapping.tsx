import { useState } from 'react';
import { type ImportKind, type MappingProposal } from '../api';

type Proposal = Extract<MappingProposal, { ok: true }>;

const WHOLE = { test: /^-?\d+$/, label: 'whole numbers' };
const DATE = { test: /^\d{4}-\d{2}-\d{2}$/, label: 'dates (YYYY-MM-DD)' };
const SHAPES: Record<string, { test: RegExp; label: string }> = {
  qty: WHOLE,
  on_hand: WHOLE,
  reserved: WHOLE,
  inbound_qty: WHOLE,
  safety_stock: WHOLE,
  unit_cost: { test: /^\d+(\.\d+)?$/, label: 'numbers' },
  planned_arrival: DATE,
  eta: DATE,
  actual_arrival: DATE,
  updated_at: DATE,
};

/** A hint when the sample values do not fit the chosen field (e.g. text mapped to qty). */
function shapeWarning(field: string | null, samples: string[]): string | null {
  const shape = field ? SHAPES[field] : undefined;
  if (!shape || samples.every((v) => shape.test.test(v))) return null;
  return `The first values are not all ${shape.label}; check that this is the right column. Rows that do not fit are rejected.`;
}

interface Props {
  filename: string;
  proposal: Proposal;
  busy: boolean;
  onConfirm: (kind: ImportKind, mapping: (string | null)[]) => void;
  onCancel: () => void;
}

/**
 * Lets an administrator check and edit a proposed column mapping before importing. Only
 * column names change; every row is still validated by the importer afterwards.
 */
export function ColumnMapping({ filename, proposal, busy, onConfirm, onCancel }: Props) {
  const [kind, setKind] = useState<ImportKind>(proposal.kind);
  const [mapping, setMapping] = useState<(string | null)[]>(proposal.columns.map((c) => c.field));
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
    <div className="result result-warn" role="group" aria-label={`Column mapping for ${filename}`}>
      <p>
        <strong>{filename}: </strong>
        the columns were not recognised.{' '}
        {proposal.source === 'ai'
          ? <>The AI (Atlassian-hosted Forge LLM) proposed this mapping from the column names and the first rows. <strong>Check it before importing.</strong></>
          : <>Columns were matched by name.</>}{' '}
        Only column names are mapped; values are never changed and every row is validated as usual.
      </p>
      {proposal.notice && <p className="notice" role="note">{proposal.notice}</p>}
      <div className="row">
        <label htmlFor={`kind-${filename}`} className="h4">File type</label>
        <select id={`kind-${filename}`} className="input" value={kind} onChange={(e) => chooseKind(e.target.value as ImportKind)} disabled={busy}>
          <option value="shipments">Shipments</option>
          <option value="inventory">Inventory</option>
        </select>
        <span className="muted small">{proposal.rowCount} data rows</span>
      </div>
      <div className="table-wrap">
        <table className="table compact">
          <thead>
            <tr><th>Column in your file</th><th>First values</th><th>LogiMind field</th></tr>
          </thead>
          <tbody>
            {proposal.columns.map((c, i) => (
              <tr key={c.index}>
                <td>{c.header || <span className="muted">(no name)</span>}</td>
                <td className="muted small">{c.samples.join(' · ') || '—'}</td>
                <td>
                  <select
                    className="input"
                    aria-label={`Field for column ${c.header || i + 1}`}
                    value={mapping[i] ?? ''}
                    onChange={(e) => choose(i, e.target.value || null)}
                    disabled={busy}
                  >
                    <option value="">— ignore this column —</option>
                    {fields.map((f) => (
                      <option key={f.field} value={f.field}>{f.field}{f.required ? ' *' : ''} — {f.description}</option>
                    ))}
                  </select>
                  {shapeWarning(mapping[i], c.samples) && <div className="text-danger small">{shapeWarning(mapping[i], c.samples)}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {missing.length > 0 && <p className="text-danger">Map the required field(s) first: {missing.join(', ')}</p>}
      <div className="row">
        <button type="button" className="btn btn-primary" disabled={busy || missing.length > 0} onClick={() => onConfirm(kind, mapping)}>
          {busy ? 'Importing…' : 'Import with this mapping'}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
