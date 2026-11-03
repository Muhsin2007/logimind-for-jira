import { useEffect, useRef, useState } from 'react';
import { call, errorMessage, useAsync, type JiraConfig } from '../api';
import { ErrorState, Loading, Panel } from '../components';
import { useI18n } from '../i18n';

/** Admin-only: where "Create Jira issue" puts new issues. */
export function JiraSettings({ canManage, dataVersion, onDataChanged }: { canManage: boolean; dataVersion: number; onDataChanged: () => void }) {
  const current = useAsync(() => call('listIssueLinks'), [dataVersion]);
  const projects = useAsync(() => (canManage ? call('listJiraProjects') : Promise.resolve([])), [canManage]);
  const [projectKey, setProjectKey] = useState('');
  const [issueTypeId, setIssueTypeId] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const { t, fmt } = useI18n();
  const issueTypes = useAsync(() => (projectKey ? call('listJiraIssueTypes', { projectKey }) : Promise.resolve([])), [projectKey]);

  const config: JiraConfig | null = current.status === 'ready' ? current.data.config : null;
  // Pre-select the saved project once; afterwards the admin's choice (even "none") stands.
  const initialised = useRef(false);
  useEffect(() => {
    if (!initialised.current && config) {
      initialised.current = true;
      setProjectKey(config.projectKey);
    }
  }, [config]);
  const chooseProject = (key: string) => {
    setIssueTypeId(''); // never keep a type from the previous project
    setProjectKey(key);
  };
  useEffect(() => {
    if (issueTypes.status !== 'ready') return;
    const keep = issueTypes.data.some((t) => t.id === issueTypeId);
    // Prefer a Task in any of the common site languages, otherwise the first standard type.
    const task = issueTypes.data.find((t) => /^(task|задача|vazifa)$/i.test(t.name));
    if (!keep) setIssueTypeId(config?.projectKey === projectKey ? config.issueTypeId : task?.id ?? issueTypes.data[0]?.id ?? '');
  }, [issueTypes, issueTypeId, config, projectKey]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const saved = await call('saveJiraConfig', { projectKey, issueTypeId });
      setMessage({ tone: 'ok', text: t.savedConfig(saved.projectName, saved.issueTypeName) });
      onDataChanged();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title={t.jiraIntegration}>
      {current.status === 'loading' && <Loading />}
      {current.status === 'error' && <ErrorState message={current.message} onRetry={current.reload} />}
      {current.status === 'ready' && (
        <p>
          {config ? (
            <>
              <strong>{t.issuesCreatedIn(config.projectName, config.projectKey, config.issueTypeName)}</strong>
              <span className="muted small"> · {t.updatedAt(fmt.dateTime(config.updatedAt))}</span>
            </>
          ) : (
            t.noProjectChosen
          )}
        </p>
      )}
      <p className="muted small">{t.createdAsUser}</p>

      {canManage && (
        <div className="row">
          <label className="checkbox">
            {t.project}
            <select className="input" value={projectKey} onChange={(e) => chooseProject(e.target.value)} disabled={projects.status !== 'ready'}>
              <option value="">{t.chooseProject}</option>
              {projects.status === 'ready' && projects.data.map((p) => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
            </select>
          </label>
          <label className="checkbox">
            {t.issueType}
            <select className="input" value={issueTypeId} onChange={(e) => setIssueTypeId(e.target.value)} disabled={!projectKey || issueTypes.status !== 'ready'}>
              {issueTypes.status === 'ready' && issueTypes.data.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !projectKey || !issueTypeId}>
            {saving ? t.saving : t.save}
          </button>
        </div>
      )}
      {projects.status === 'error' && <p role="alert" className="text-danger small">{projects.message}</p>}
      {issueTypes.status === 'error' && <p role="alert" className="text-danger small">{issueTypes.message}</p>}
      {message && <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-danger small' : 'small'}>{message.text}</p>}
    </Panel>
  );
}
