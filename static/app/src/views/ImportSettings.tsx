import { useRef, useState, type DragEvent } from 'react';
import { call, errorMessage, useAsync, type ImportKind, type ImportOutcome, type MappingProposal } from '../api';
import { Callout, ConfirmDialog, ErrorState, Loading, Panel } from '../components';
import type { NavProps } from '../App';
import { useI18n } from '../i18n';
import { Icon } from '../icons';
import { ColumnMapping } from './ColumnMapping';
import { JiraSettings } from './JiraSettings';
import { LoopSettings } from './LoopSettings';

const MAX_BYTES = 1_000_000;

type Busy = null | 'upload' | 'demo' | 'clear' | 'map';
type Step = 'upload' | 'validate' | 'map' | 'results';
const STEPS: Step[] = ['upload', 'validate', 'map', 'results'];

/** A file whose header was not recognised, waiting for the admin to confirm a column mapping. */
interface PendingMapping {
  /** Unique per upload, so a re-upload with the same name never reuses an old mapping. */
  id: number;
  filename: string;
  content: string;
  proposal: Extract<MappingProposal, { ok: true }>;
}

let nextPendingId = 1;

/** Header problems (unknown, missing or duplicate columns) can be fixed by mapping columns. */
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
  const [dragging, setDragging] = useState(false);
  const { t, fmt } = useI18n();
  // While a mapping waits for confirmation, new uploads are blocked so nothing is confirmed against the wrong file.
  const locked = busy !== null || !canManage || pending.length > 0;

  // The step indicator follows what actually happened; "results" only once the server has answered.
  const step: Step = busy === 'upload' ? 'validate' : pending.length > 0 || busy === 'map' ? 'map' : outcomes.length > 0 ? 'results' : 'upload';
  const stepIndex = STEPS.indexOf(step);

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
        try {
          const content = await read();
          if (content === null || content.length > MAX_BYTES) {
            results.push({ filename, outcome: { ok: false, errors: [{ line: 0, field: null, message: t.fileTooLarge }] } });
            continue;
          }
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

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = locked ? 'none' : 'copy';
    if (!locked) setDragging(true);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!locked) upload(e.dataTransfer.files);
  };

  const importPasted = () => importTexts([{ filename: 'pasted-from-excel.csv', read: () => Promise.resolve(pasted) }], () => setPasted(''));

  const confirmMapping = (item: PendingMapping, kind: ImportKind, mapping: (string | null)[]) =>
    void run('map', async () => {
      const outcome = await call('importCsvWithMapping', { filename: item.filename, content: item.content, kind, mapping });
      setOutcomes((o) => [...o, { filename: item.filename, outcome }]);
      setPending((p) => p.filter((x) => x !== item));
    });

  const clearAll = () =>
    run('clear', async () => {
      await call('clearData');
      setOutcomes([]);
      setConfirmClear(false);
    });

  return (
    <div className="stack">
      <Panel title={t.importTitle} icon="upload">
        <ol className="stepper" aria-label={t.stepsLabel}>
          {STEPS.map((s, i) => (
            <li key={s} className={`step${i < stepIndex ? ' step-done' : i === stepIndex ? ' step-active' : ''}`} aria-current={i === stepIndex ? 'step' : undefined}>
              <span className="step-num" aria-hidden="true">{i < stepIndex ? <Icon name="check" size={12} /> : i + 1}</span>
              {t.steps[s]}
            </li>
          ))}
        </ol>

        <p className="muted small">{t.importIntro}</p>
        {access.status === 'ready' && !canManage && (
          <Callout tone="warning" role="note" className="mt-3">{t.adminOnly}</Callout>
        )}

        <div
          className={`dropzone mt-3${dragging ? ' dropzone-active' : ''}${locked ? ' dropzone-disabled' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <span className="dropzone-icon"><Icon name="upload" size={20} /></span>
          <span className="dropzone-title" role="status">{busy === 'upload' ? t.importingAi : t.dropTitle}</span>
          <span>
            {t.dropOr}{' '}
            <input
              id="csv-files"
              ref={fileInput}
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              multiple
              disabled={locked}
              aria-describedby="csv-hint"
              onChange={(e) => upload(e.target.files)}
            />
            <label htmlFor="csv-files" className="file-label">{t.browseFiles}</label>
          </span>
          <span id="csv-hint" className="dropzone-hint">{t.dropHint}</span>
          {pending.length > 0 && busy === null && <span className="dropzone-hint">{t.confirmMappingFirst}</span>}
        </div>

        <details className="disclosure mt-3">
          <summary><Icon name="chevronDown" size={14} />{t.pasteSummary}</summary>
          <div className="disclosure-body">
            <label htmlFor="csv-paste" className="muted small">{t.pasteHelp}</label>
            <textarea
              id="csv-paste"
              className="input paste-box"
              rows={6}
              value={pasted}
              maxLength={MAX_BYTES}
              disabled={locked}
              onChange={(e) => setPasted(e.target.value)}
            />
            <button type="button" className="btn" disabled={locked || !pasted.trim()} onClick={importPasted}>
              {t.importPasted}
            </button>
          </div>
        </details>

        {error && <Callout tone="danger" role="alert" className="mt-3">{error}</Callout>}
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
        <Panel title={t.fileFormats} icon="file">
          <h3 className="field-label">{t.formatShipments}</h3>
          <p className="format-code">shipment_id*, order_id, supplier*, sku*, product_name, qty*, planned_arrival*, eta, actual_arrival, status*, warehouse*, carrier, tracking_ref</p>
          <h3 className="field-label">{t.formatInventory}</h3>
          <p className="format-code">sku*, product_name, warehouse*, on_hand*, reserved, inbound_qty, safety_stock*, unit_cost, daily_usage, updated_at</p>
          <p className="footnote">{t.formatNote}</p>
        </Panel>

        <Panel title={t.demoTitle} icon="database">
          <p className="muted">{t.demoText}</p>
          <p className="footnote">{t.rowLimit}</p>
          <div className="row mt-3">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy !== null || !canManage}
              onClick={() => run('demo', async () => setOutcomes((await call('loadDemoData')).map((o, i) => ({ filename: o.ok ? `demo-${o.batch.kind}.csv` : i === 0 ? 'demo-shipments.csv' : 'demo-inventory.csv', outcome: o }))))}
            >
              <Icon name="database" size={14} /> {busy === 'demo' ? t.loading : t.loadDemo}
            </button>
          </div>
          <div className="danger-row">
            <div>
              <strong className="small">{t.dangerZone}</strong>
              <p className="footnote danger-text">{t.deleteQuestion}</p>
            </div>
            <button type="button" className="btn btn-danger-subtle" disabled={busy !== null || !canManage} onClick={() => { setError(null); setConfirmClear(true); }}>
              <Icon name="trash" size={14} /> {t.deleteAll}
            </button>
          </div>
        </Panel>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title={t.deleteTitle}
        confirmLabel={busy === 'clear' ? t.deleting : t.delete}
        busy={busy === 'clear'}
        onConfirm={() => void clearAll()}
        onCancel={() => setConfirmClear(false)}
      >
        <p>{t.deleteQuestion}</p>
        {error && busy === null && <p role="alert" className="text-danger small">{error}</p>}
      </ConfirmDialog>

      {access.status === 'ready' && <JiraSettings canManage={canManage} dataVersion={dataVersion} onDataChanged={onDataChanged} />}
      {access.status === 'ready' && <LoopSettings canManage={canManage} dataVersion={dataVersion} />}

      <Panel title={t.importHistory} icon="clock">
        {history.status === 'loading' && <Loading variant="inline" />}
        {history.status === 'error' && <ErrorState message={history.message} onRetry={history.reload} />}
        {history.status === 'ready' && (history.data.length === 0 ? (
          <p className="muted">{t.noImportsYet}</p>
        ) : (
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr><th>{t.colFile}</th><th>{t.colType}</th><th>{t.colImported}</th><th className="num">{t.colRows}</th><th className="num">{t.colValid}</th><th className="num">{t.colRejected}</th></tr>
              </thead>
              <tbody>
                {history.data.map((b) => (
                  <tr key={b.id}>
                    <td className="cell-main">{b.filename}</td>
                    <td><span className="badge badge-neutral">{t.importKind[b.kind]}</span></td>
                    <td className="muted">{fmt.dateTime(b.importedAt)}</td>
                    <td className="num">{fmt.number(b.rowsTotal)}</td>
                    <td className="num">{fmt.number(b.rowsValid)}</td>
                    <td className="num">{b.rowsRejected > 0 ? <span className="text-danger">{fmt.number(b.rowsRejected)}</span> : <span className="muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Panel>
    </div>
  );
}

/** One file's server answer; success is shown only when the server reports imported rows. */
function ImportResult({ filename, outcome }: { filename: string; outcome: ImportOutcome }) {
  const { t } = useI18n();
  const errors = outcome.ok ? outcome.batch.errors : outcome.errors;
  const tone = !outcome.ok || outcome.batch.rowsValid === 0 ? 'fail' : outcome.batch.rowsRejected > 0 ? 'warn' : 'ok';
  const title = tone === 'ok' ? t.resultOk : tone === 'warn' ? t.resultPartial : t.resultFailed;
  // Row-level problems (line > 1) can be fixed in the file; file-level ones are explained by the message.
  const fixable = errors.some((e) => e.line > 1);
  return (
    <div className={`result-card result-${tone}`}>
      <div className="result-head">
        <Icon name={tone === 'ok' ? 'checkCircle' : tone === 'warn' ? 'alert' : 'alertCircle'} />
        <div className="result-text">
          <strong>{title} · <span className="mono">{filename}</span></strong>
          <span className="muted small">
            {outcome.ok ? (
              <>
                {t.importedRows(outcome.batch.rowsValid, outcome.batch.rowsTotal, t.importKind[outcome.batch.kind])}
                {outcome.batch.rowsRejected > 0 && t.rejectedRows(outcome.batch.rowsRejected)}.
                {!outcome.replaced && t.keptExisting}
              </>
            ) : (
              t.notImported
            )}
          </span>
        </div>
      </div>
      {errors.length > 0 && (
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th className="num">{t.colLine}</th><th>{t.colField}</th><th>{t.colProblem}</th></tr></thead>
            <tbody>
              {errors.map((e, i) => (
                <tr key={`${e.line}-${e.field}-${i}`}>
                  <td className="num">{e.line || '—'}</td><td className="mono">{e.field ?? '—'}</td><td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {fixable && <p className="result-fix">{t.howToFix}</p>}
    </div>
  );
}
