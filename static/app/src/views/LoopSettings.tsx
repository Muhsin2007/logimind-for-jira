import { useState } from 'react';
import { call, errorMessage, useAsync } from '../api';
import { Callout, ErrorState, Loading, Panel } from '../components';
import { useI18n } from '../i18n';
import { useAutoCreateError } from './DailyBriefing';

/** Settings panel for the daily check: the auto-create switch (admins) and the last check's problems. */
export function LoopSettings({ canManage, dataVersion }: { canManage: boolean; dataVersion: number }) {
  const briefing = useAsync(() => call('getDailyBriefing'), [dataVersion]);
  const settings = useAsync(() => (canManage ? call('getLoopSettings') : Promise.resolve(null)), [canManage, dataVersion]);
  const [override, setOverride] = useState<{ autoCreate: boolean; updatedAt: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const { t, fmt } = useI18n();
  const autoError = useAutoCreateError();

  const current = override ?? (settings.status === 'ready' ? settings.data : null);
  const autoCreate = current?.autoCreate ?? (briefing.status === 'ready' && briefing.data.autoCreate);
  const lastRun = briefing.status === 'ready' ? briefing.data.lastRun : null;
  const autoMessage = lastRun ? autoError(lastRun.autoCreate.error) : null;

  const toggle = async (next: boolean) => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await call('saveLoopSettings', { autoCreate: next });
      setOverride(saved);
      setMessage({ tone: 'ok', text: saved.autoCreate ? t.loop.savedOn : t.loop.savedOff });
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title={t.loop.automationTitle} icon="settings">
      {(briefing.status === 'loading' || settings.status === 'loading') && <Loading variant="inline" />}
      {briefing.status === 'error' && <ErrorState message={briefing.message} onRetry={briefing.reload} />}
      {settings.status === 'error' && <ErrorState message={settings.message} onRetry={settings.reload} />}
      <label className="checkbox">
        <input type="checkbox" checked={autoCreate} disabled={!canManage || saving || settings.status !== 'ready'} onChange={(e) => void toggle(e.target.checked)} />
        <span>{t.loop.autoCreateLabel}</span>
      </label>
      {current?.updatedAt && <p className="muted small">{t.loop.lastChanged(fmt.dateTime(current.updatedAt))}</p>}
      <p className="footnote">{t.loop.autoCreateHelp}</p>
      <p className="footnote">{t.loop.commentsHelp}</p>
      {!canManage && <p className="muted small">{t.loop.adminOnly}</p>}
      {(autoMessage || lastRun?.comments.error) && (
        <Callout tone="warning" title={t.loop.lastRunErrors} role="alert" className="mt-3">
          {autoMessage && <p>{autoMessage}</p>}
          {lastRun?.comments.error && <p>{lastRun.comments.error}</p>}
        </Callout>
      )}
      {message && <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-3 small ${message.tone === 'error' ? 'text-danger' : 'text-success'}`}>{message.text}</p>}
    </Panel>
  );
}
