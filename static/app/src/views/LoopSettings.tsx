import { useState } from 'react';
import { call, errorMessage, useAsync } from '../api';
import { ErrorState, Loading, Panel } from '../components';
import { useI18n } from '../i18n';
import { RunProblems } from './DailyBriefing';

/** Settings panel for the daily check: the auto-create switch (admins) and the last check's problems. */
export function LoopSettings({ canManage, dataVersion }: { canManage: boolean; dataVersion: number }) {
  const briefing = useAsync(() => call('getDailyBriefing'), [dataVersion]);
  const settings = useAsync(() => (canManage ? call('getLoopSettings') : Promise.resolve(null)), [canManage, dataVersion]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const { t, fmt } = useI18n();

  const current = settings.status === 'ready' ? settings.data : null;
  const autoCreate = current?.autoCreate ?? (briefing.status === 'ready' && briefing.data.autoCreate);
  const lastRun = briefing.status === 'ready' ? briefing.data.lastRun : null;
  const locked = !canManage || settings.status !== 'ready';

  const toggle = async (next: boolean) => {
    if (saving || locked) return;
    setSaving(true);
    setMessage(null);
    try {
      const saved = await call('saveLoopSettings', { autoCreate: next });
      setMessage({ tone: 'ok', text: saved.autoCreate ? t.loop.savedOn : t.loop.savedOff });
      // Re-read from the server; the previous value stays visible while it loads.
      settings.reload();
      briefing.reload();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title={t.loop.automationTitle} icon="settings">
      <div aria-busy={saving}>
        {(briefing.status === 'loading' || settings.status === 'loading') && <Loading variant="inline" />}
        {briefing.status === 'error' && <ErrorState message={briefing.message} onRetry={briefing.reload} />}
        {settings.status === 'error' && <ErrorState message={settings.message} onRetry={settings.reload} />}
        <label className="checkbox">
          <input type="checkbox" checked={autoCreate} disabled={locked} aria-disabled={saving} onChange={(e) => void toggle(e.target.checked)} />
          <span>{t.loop.autoCreateLabel}</span>
        </label>
        {current?.updatedAt && <p className="muted small">{t.loop.lastChanged(fmt.dateTime(current.updatedAt))}</p>}
        <p className="footnote">{t.loop.autoCreateHelp}</p>
        <p className="footnote">{t.loop.commentsHelp}</p>
        {!canManage && <p className="muted small">{t.loop.adminOnly}</p>}
        {lastRun && <RunProblems run={lastRun} canManage={canManage} />}
        {message && <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-3 small ${message.tone === 'error' ? 'text-danger' : 'text-success'}`}>{message.text}</p>}
      </div>
    </Panel>
  );
}
