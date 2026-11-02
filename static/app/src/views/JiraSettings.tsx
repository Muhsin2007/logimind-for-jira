import { useEffect, useRef, useState } from 'react';
import { call, errorMessage, useAsync, type JiraConfig } from '../api';
import { ErrorState, Loading, Panel } from '../components';
import { fmtDateTime } from '../format';

/** Admin-only: where "Create Jira issue" puts new issues. */
export function JiraSettings({ canManage, dataVersion, onDataChanged }: { canManage: boolean; dataVersion: number; onDataChanged: () => void }) {
  const current = useAsync(() => call('listIssueLinks'), [dataVersion]);
  const projects = useAsync(() => (canManage ? call('listJiraProjects') : Promise.resolve([])), [canManage]);
  const [projectKey, setProjectKey] = useState('');
  const [issueTypeId, setIssueTypeId] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
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
      setMessage({ tone: 'ok', text: `Saved: new issues go to ${saved.projectName} as ${saved.issueTypeName}.` });
      onDataChanged();
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Jira integration">
      {current.status === 'loading' && <Loading />}
      {current.status === 'error' && <ErrorState message={current.message} onRetry={current.reload} />}
      {current.status === 'ready' && (
        <p>
          {config ? (
            <>
              Risk issues are created in <strong>{config.projectName} ({config.projectKey})</strong> as <strong>{config.issueTypeName}</strong>
              <span className="muted small"> · updated {fmtDateTime(config.updatedAt)}</span>
            </>
          ) : (
            'No Jira project chosen yet, so "Create Jira issue" is disabled.'
          )}
        </p>
      )}
      <p className="muted small">Issues are created as the user who clicks the button, so Jira's project permissions apply.</p>

      {canManage && (
        <div className="row">
          <label className="checkbox">
            Project
            <select className="input" value={projectKey} onChange={(e) => chooseProject(e.target.value)} disabled={projects.status !== 'ready'}>
              <option value="">Choose a project…</option>
              {projects.status === 'ready' && projects.data.map((p) => <option key={p.key} value={p.key}>{p.name} ({p.key})</option>)}
            </select>
          </label>
          <label className="checkbox">
            Issue type
            <select className="input" value={issueTypeId} onChange={(e) => setIssueTypeId(e.target.value)} disabled={!projectKey || issueTypes.status !== 'ready'}>
              {issueTypes.status === 'ready' && issueTypes.data.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !projectKey || !issueTypeId}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
      {projects.status === 'error' && <p role="alert" className="text-danger small">{projects.message}</p>}
      {issueTypes.status === 'error' && <p role="alert" className="text-danger small">{issueTypes.message}</p>}
      {message && <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-danger small' : 'small'}>{message.text}</p>}
    </Panel>
  );
}
