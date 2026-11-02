import { useRef, useState } from 'react';
import { call, errorMessage, useAsync, type ImportOutcome } from '../api';
import { ErrorState, Loading, Panel } from '../components';
import { fmtDateTime } from '../format';
import type { NavProps } from '../App';

const MAX_BYTES = 1_000_000;

type Busy = null | 'upload' | 'demo' | 'clear';

export function ImportSettings({ dataVersion, onDataChanged }: NavProps) {
  const history = useAsync(() => call('listImports'), [dataVersion]);
  const access = useAsync(() => call('getAccess'), []);
  // The server enforces this; the UI only avoids offering actions that would be refused.
  const canManage = access.status === 'ready' && access.data.canManageData;
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [outcomes, setOutcomes] = useState<{ filename: string; outcome: ImportOutcome }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const run = async (kind: Busy, action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
      onDataChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const upload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void run('upload', async () => {
      const results: { filename: string; outcome: ImportOutcome }[] = [];
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          results.push({ filename: file.name, outcome: { ok: false, errors: [{ line: 0, field: null, message: 'File is larger than 1 MB' }] } });
          continue;
        }
        const content = await file.text();
        results.push({ filename: file.name, outcome: await call('importCsv', { filename: file.name, content }) });
      }
      setOutcomes(results);
      if (fileInput.current) fileInput.current.value = '';
    });
  };

  return (
    <div className="stack">
      <Panel title="Import CSV">
        <p>
          Upload a <strong>shipments</strong> or <strong>inventory</strong> CSV (UTF-8, max 1 MB). The file type is detected from its
          header. Each import <strong>replaces</strong> the current dataset of that type; rows that fail validation are rejected and listed
          below, never silently used.
        </p>
        {access.status === 'ready' && !canManage && (
          <p className="notice" role="note">Only Jira administrators can import, load or delete data. You can view everything else.</p>
        )}
        <div className="row">
          <label htmlFor="csv-files" className="h4">CSV files</label>
          <input
            id="csv-files"
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            multiple
            disabled={busy !== null || !canManage}
            onChange={(e) => upload(e.target.files)}
          />
          {busy === 'upload' && <span className="muted">Importing…</span>}
        </div>
        {error && <p role="alert" className="text-danger">{error}</p>}
        <div aria-live="polite">
          {outcomes.map(({ filename, outcome }, i) => (
            <ImportResult key={`${i}-${filename}`} filename={filename} outcome={outcome} />
          ))}
        </div>
      </Panel>

      <div className="grid-2">
        <Panel title="File formats">
          <h3 className="h4">Shipments</h3>
          <p className="mono small wrap">shipment_id*, order_id, supplier*, sku*, product_name, qty*, planned_arrival*, eta, actual_arrival, status*, warehouse*, carrier, tracking_ref</p>
          <h3 className="h4">Inventory</h3>
          <p className="mono small wrap">sku*, product_name, warehouse*, on_hand*, reserved, inbound_qty, safety_stock*, unit_cost, updated_at</p>
          <p className="muted small">* required. Dates as YYYY-MM-DD. Status: planned, confirmed, in_transit, customs, delivered, cancelled.</p>
        </Panel>

        <Panel title="Demo and data management">
          <p>Load a synthetic dataset (30 shipments, 12 stock positions) with dates relative to today. It replaces current data.</p>
          <p className="muted small">Imports are limited to 2,000 rows per file.</p>
          <div className="row">
            <button type="button" className="btn btn-primary" disabled={busy !== null || !canManage} onClick={() => run('demo', async () => setOutcomes((await call('loadDemoData')).map((o, i) => ({ filename: i === 0 ? 'demo-shipments.csv' : 'demo-inventory.csv', outcome: o }))))}>
              {busy === 'demo' ? 'Loading…' : 'Load demo data'}
            </button>
            {!confirmClear ? (
              <button type="button" className="btn btn-danger-subtle" disabled={busy !== null || !canManage} onClick={() => setConfirmClear(true)}>
                Delete all data…
              </button>
            ) : (
              <span className="confirm" role="group" aria-label="Confirm delete">
                <span>Delete all shipments, inventory and import history?</span>
                <button type="button" className="btn btn-danger" disabled={busy !== null} onClick={() => run('clear', async () => { await call('clearData'); setOutcomes([]); setConfirmClear(false); })}>
                  {busy === 'clear' ? 'Deleting…' : 'Delete'}
                </button>
                <button type="button" className="btn" onClick={() => setConfirmClear(false)}>Cancel</button>
              </span>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Import history">
        {history.status === 'loading' && <Loading />}
        {history.status === 'error' && <ErrorState message={history.message} onRetry={history.reload} />}
        {history.status === 'ready' && (history.data.length === 0 ? (
          <p className="muted">No imports yet.</p>
        ) : (
          <table className="table compact">
            <thead>
              <tr><th>File</th><th>Type</th><th>Imported</th><th className="num">Rows</th><th className="num">Valid</th><th className="num">Rejected</th></tr>
            </thead>
            <tbody>
              {history.data.map((b) => (
                <tr key={b.id}>
                  <td>{b.filename}</td><td>{b.kind}</td><td>{fmtDateTime(b.importedAt)}</td>
                  <td className="num">{b.rowsTotal}</td><td className="num">{b.rowsValid}</td>
                  <td className="num">{b.rowsRejected > 0 ? <span className="text-danger">{b.rowsRejected}</span> : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </Panel>
    </div>
  );
}

function ImportResult({ filename, outcome }: { filename: string; outcome: ImportOutcome }) {
  const errors = outcome.ok ? outcome.batch.errors : outcome.errors;
  return (
    <div className={`result ${outcome.ok && outcome.batch.rowsRejected === 0 ? 'result-ok' : 'result-warn'}`}>
      <strong>{filename}: </strong>
      {outcome.ok ? (
        <>
          {outcome.batch.rowsValid} of {outcome.batch.rowsTotal} {outcome.batch.kind} rows imported
          {outcome.batch.rowsRejected > 0 && `, ${outcome.batch.rowsRejected} rejected`}.
          {!outcome.replaced && ' No valid rows — existing data was kept.'}
        </>
      ) : (
        'File was not imported.'
      )}
      {errors.length > 0 && (
        <table className="table compact errors">
          <thead><tr><th className="num">Line</th><th>Field</th><th>Problem</th></tr></thead>
          <tbody>
            {errors.map((e, i) => (
              <tr key={`${e.line}-${e.field}-${i}`}>
                <td className="num">{e.line || '—'}</td><td className="mono">{e.field ?? '—'}</td><td>{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
