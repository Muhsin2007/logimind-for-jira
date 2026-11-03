import { useRef, useState } from 'react';
import { call, errorMessage, useAsync, type ImportKind, type ImportOutcome, type MappingProposal } from '../api';
import { ErrorState, Loading, Panel } from '../components';
import { fmtDateTime } from '../format';
import type { NavProps } from '../App';
import { ColumnMapping } from './ColumnMapping';
import { JiraSettings } from './JiraSettings';

const MAX_BYTES = 1_000_000;

type Busy = null | 'upload' | 'demo' | 'clear' | 'map';

/** A file whose header was not recognised, waiting for the admin to confirm a column mapping. */
interface PendingMapping {
  /** Unique per upload, so a re-upload with the same name never reuses an old mapping. */
  id: number;
  filename: string;
  content: string;
  proposal: Extract<MappingProposal, { ok: true }>;
}

/** Header problems (unknown, missing or duplicate columns) can be fixed by mapping columns. */
let nextPendingId = 1;

const isHeaderProblem = (o: ImportOutcome) => !o.ok && o.errors.length > 0 && o.errors.every((e) => e.line === 1 && e.field === null);

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
  const [pending, setPending] = useState<PendingMapping[]>([]);
  const [pasted, setPasted] = useState('');
  // While a mapping waits for confirmation, new uploads are blocked so nothing is confirmed against the wrong file.
  const locked = busy !== null || !canManage || pending.length > 0;

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

  /** Imports each text; a header problem becomes a column-mapping step instead of a failure. */
  const importTexts = (items: { filename: string; read: () => Promise<string | null> }[], after?: () => void) =>
    void run('upload', async () => {
      const results: { filename: string; outcome: ImportOutcome }[] = [];
      const mappings: PendingMapping[] = [];
      for (const { filename, read } of items) {
        const content = await read();
        if (content === null || content.length > MAX_BYTES) {
          results.push({ filename, outcome: { ok: false, errors: [{ line: 0, field: null, message: 'File is larger than 1 MB' }] } });
          continue;
        }
        try {
          const outcome = await call('importCsv', { filename, content });
          if (isHeaderProblem(outcome)) {
            // Ask for a column mapping (AI-proposed when names do not match) instead of failing the file.
            const proposal = await call('proposeColumnMapping', { filename, content });
            if (proposal.ok) {
              mappings.push({ id: nextPendingId++, filename, content, proposal });
              continue;
            }
          }
          results.push({ filename, outcome });
        } catch (err) {
          // One failing file must not hide the results of the files already imported.
          results.push({ filename, outcome: { ok: false, errors: [{ line: 0, field: null, message: errorMessage(err) }] } });
        }
      }
      setOutcomes(results);
      setPending(mappings);
      after?.();
    });

  const upload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    importTexts(
      Array.from(files).map((file) => ({ filename: file.name, read: () => (file.size > MAX_BYTES ? Promise.resolve(null) : file.text()) })),
      () => {
        if (fileInput.current) fileInput.current.value = '';
      },
    );
  };

  const importPasted = () => importTexts([{ filename: 'pasted-from-excel.csv', read: () => Promise.resolve(pasted) }], () => setPasted(''));

  const confirmMapping = (item: PendingMapping, kind: ImportKind, mapping: (string | null)[]) =>
    void run('map', async () => {
      const outcome = await call('importCsvWithMapping', { filename: item.filename, content: item.content, kind, mapping });
      setOutcomes((o) => [...o, { filename: item.filename, outcome }]);
      setPending((p) => p.filter((x) => x !== item));
    });

  return (
    <div className="stack">
      <Panel title="Import CSV">
        <p>
          Upload a <strong>shipments</strong> or <strong>inventory</strong> CSV (UTF-8, comma, semicolon or tab separated as exported by Excel,
          max 1 MB). The file type is detected from its header; if your supplier uses other column names, AI proposes a column mapping for
          you to confirm. Each import <strong>replaces</strong> the current dataset of that type; rows that fail validation are rejected and listed
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
            disabled={locked}
            onChange={(e) => upload(e.target.files)}
          />
          {busy === 'upload' && <span className="muted">Importing… (unrecognised columns are mapped with AI)</span>}
          {pending.length > 0 && busy === null && <span className="muted">Confirm or cancel the column mapping below first.</span>}
        </div>
        <details>
          <summary>Or paste rows copied from Excel</summary>
          <label htmlFor="csv-paste" className="muted small">Copy the cells including the header row from Excel or Google Sheets and paste them here.</label>
          <textarea
            id="csv-paste"
            className="input paste-box"
            rows={6}
            value={pasted}
            maxLength={MAX_BYTES}
            disabled={locked}
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="row">
            <button type="button" className="btn" disabled={locked || !pasted.trim()} onClick={importPasted}>
              Import pasted rows
            </button>
          </div>
        </details>
        {error && <p role="alert" className="text-danger">{error}</p>}
        {pending.map((item) => (
          <ColumnMapping
            key={item.id}
            filename={item.filename}
            proposal={item.proposal}
            busy={busy !== null}
            onConfirm={(kind, mapping) => confirmMapping(item, kind, mapping)}
            onCancel={() => setPending((p) => p.filter((x) => x !== item))}
          />
        ))}
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
                <span>Delete all shipments, inventory, import history and risk-to-issue links? Jira issues are not deleted.</span>
                <button type="button" className="btn btn-danger" disabled={busy !== null} onClick={() => run('clear', async () => { await call('clearData'); setOutcomes([]); setConfirmClear(false); })}>
                  {busy === 'clear' ? 'Deleting…' : 'Delete'}
                </button>
                <button type="button" className="btn" onClick={() => setConfirmClear(false)}>Cancel</button>
              </span>
            )}
          </div>
        </Panel>
      </div>

      {access.status === 'ready' && <JiraSettings canManage={canManage} dataVersion={dataVersion} onDataChanged={onDataChanged} />}

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
