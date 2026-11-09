import { useState } from 'react';
import { call, errorMessage, useAsync, type CheckRun, type RiskRef } from '../api';
import { Callout, ErrorState, Loading, Panel, SeverityBadge } from '../components';
import { useI18n } from '../i18n';
import { Icon } from '../icons';

/** Turns a run's auto-create error into the person's language where the code is known. */
export function useAutoCreateError() {
  const { t } = useI18n();
  return (error: CheckRun['autoCreate']['error']): string | null => {
    if (!error) return null;
    if (error.code === 'FORBIDDEN' || error.code === 'AUTH') return t.loop.autoForbidden;
    if (error.code === 'NOT_CONFIGURED') return t.loop.autoNotConfigured;
    return error.message;
  };
}

function RefList({ title, refs, total, onOpen }: { title: string; refs: RiskRef[]; total: number; onOpen: (r: RiskRef) => void }) {
  const { t } = useI18n();
  return (
    <div className="brief-col">
      <h3 className="section-title">{title} <span className="badge badge-neutral">{total}</span></h3>
      {refs.length === 0 ? (
        <p className="muted small">{t.loop.none}</p>
      ) : (
        <ul className="risk-list">
          {refs.map((r) => (
            <li key={r.id}>
              <button type="button" className="risk-link" onClick={() => onOpen(r)}>
                <SeverityBadge severity={r.severity} />
                <span className="risk-link-text">
                  <span className="risk-link-title">{t.riskType[r.type]}</span>
                  <span className="risk-link-meta mono">{r.entityKey}</span>
                </span>
                <Icon name="chevronRight" className="risk-link-chevron" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {total > refs.length && <p className="muted small">{t.loop.more(total - refs.length)}</p>}
    </div>
  );
}

/** Dashboard panel: what changed since the previous daily check, and an admin "Run check now". */
export function DailyBriefing({ dataVersion, onOpenShipment, onOpenInventory }: { dataVersion: number; onOpenShipment: (id: string) => void; onOpenInventory: () => void }) {
  const briefing = useAsync(() => call('getDailyBriefing'), [dataVersion]);
  const access = useAsync(() => call('getAccess'), []);
  const [fresh, setFresh] = useState<CheckRun | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t, fmt } = useI18n();
  const autoError = useAutoCreateError();
  const canManage = access.status === 'ready' && access.data.canManageData;

  const runNow = async () => {
    setRunning(true);
    setError(null);
    try {
      const result = await call('runDailyCheck');
      if (result.ok) setFresh(result.run);
      else setError(t.loop.busy);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRunning(false);
    }
  };

  const open = (r: RiskRef) => (r.entityType === 'shipment' ? onOpenShipment(r.entityKey) : onOpenInventory());
  const autoCreate = briefing.status === 'ready' ? briefing.data.autoCreate : false;
  const run = fresh ?? (briefing.status === 'ready' ? briefing.data.lastRun : null);

  const actions = (
    <>
      {briefing.status === 'ready' && <span className={`badge ${autoCreate ? 'badge-accent' : 'badge-neutral'}`}>{autoCreate ? t.loop.autoOn : t.loop.autoOff}</span>}
      {canManage && (
        <button type="button" className="btn btn-sm" onClick={() => void runNow()} disabled={running}>
          <Icon name="clock" size={14} /> {running ? t.loop.running : t.loop.runNow}
        </button>
      )}
    </>
  );

  const autoMessage = run ? autoError(run.autoCreate.error) : null;
  return (
    <Panel title={t.loop.briefingTitle} icon="calendar" actions={actions} description={t.loop.briefingDesc}>
      {briefing.status === 'loading' && <Loading variant="inline" />}
      {briefing.status === 'error' && <ErrorState message={briefing.message} onRetry={briefing.reload} />}
      {briefing.status === 'ready' && !run && <p className="muted">{t.loop.noCheckYet}</p>}
      {run && (
        <div className="stack">
          <p className="small muted" role="status">
            {t.loop.lastCheck(fmt.dateTime(run.checkedAt), run.trigger === 'manual')} · {t.loop.openTotal(run.counts.open)}
          </p>
          {run.baseline ? (
            <Callout tone="info">{t.loop.baseline}</Callout>
          ) : (
            <div className="brief-grid">
              <RefList title={t.loop.newRisks} refs={run.newRisks} total={run.counts.newRisks} onOpen={open} />
              <RefList title={t.loop.resolved} refs={run.resolved} total={run.counts.resolved} onOpen={open} />
              <RefList title={t.loop.stillCritical} refs={run.stillCritical} total={run.counts.stillCritical} onOpen={open} />
            </div>
          )}
          {run.autoCreate.created.length > 0 && (
            <p className="small">
              <strong>{t.loop.issuesCreated}:</strong> <span className="mono">{run.autoCreate.created.map((c) => c.issueKey).join(', ')}</span>
            </p>
          )}
          {run.autoCreate.notCreated > 0 && <p className="small muted">{t.loop.notCreated(run.autoCreate.notCreated)}</p>}
          {run.comments.added.length > 0 && <p className="small muted">{t.loop.commentsAdded(run.comments.added.length)}</p>}
          {(autoMessage || run.comments.error) && (
            <Callout tone="warning" title={t.loop.lastRunErrors} role="alert">
              {autoMessage && <p>{autoMessage}</p>}
              {run.comments.error && <p>{run.comments.error}</p>}
            </Callout>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-danger small">{error}</p>}
      <p className="footnote">{t.loop.dayChange}</p>
    </Panel>
  );
}
