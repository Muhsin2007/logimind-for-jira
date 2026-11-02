import { router } from '@forge/bridge';
import { useState } from 'react';
import { call, errorMessage, useAsync, type IssueLinkView, type IssueLinksData, type JiraConfig, type RiskEvent } from './api';

/** Live issue links keyed by risk ID; `reload` after creating an issue. */
export function useIssueLinks(dataVersion: number) {
  const state = useAsync(() => call('listIssueLinks'), [dataVersion]);
  const data: IssueLinksData | null = state.status === 'ready' ? state.data : null;
  const byRisk = new Map((data?.links ?? []).map((l) => [l.riskId, l]));
  return { state, data, byRisk };
}

const CATEGORY_LABEL = { new: 'To do', indeterminate: 'In progress', done: 'Done', unknown: 'Unknown' } as const;

export function IssueKeyLink({ link }: { link: IssueLinkView }) {
  const open = () => void router.open(`/browse/${link.issueKey}`).catch(() => undefined);
  return (
    <span className="issue-link">
      <button type="button" className="link mono" onClick={open} title="Open in Jira (new tab)">
        {link.issueKey}
      </button>
      {link.status ? (
        <span className={`badge status-cat-${link.status.category}`} title={CATEGORY_LABEL[link.status.category]}>
          {link.status.statusName}
        </span>
      ) : Date.now() - new Date(link.createdAt).getTime() < 2 * 60_000 ? (
        // Jira search indexes new issues with a short delay.
        <span className="muted small">just created — status appears in a moment</span>
      ) : (
        <span className="muted small">status unavailable (deleted or no access)</span>
      )}
    </span>
  );
}

/**
 * "Create Jira issue" for one risk: shows the linked issue if there is one, otherwise a
 * button with an inline confirmation naming the target project.
 */
export function IssueAction({ risk, link, config, onChanged }: { risk: RiskEvent; link?: IssueLinkView; config: JiraConfig | null; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  if (link) return <IssueKeyLink link={link} />;
  if (!config) return <span className="muted small">Jira project not configured (Import &amp; Settings)</span>;

  const create = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const out = await call('createIssueForRisk', { riskId: risk.id });
      if (out.ok) {
        setMessage({ tone: 'ok', text: `Created ${out.link.issueKey}` });
        onChanged();
      } else {
        setMessage({ tone: 'error', text: out.message });
        if (out.code === 'DUPLICATE') onChanged();
      }
    } catch (err) {
      setMessage({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <span className="issue-action">
      {!confirming ? (
        <button type="button" className="btn" onClick={() => setConfirming(true)} disabled={busy}>
          Create Jira issue
        </button>
      ) : (
        <span className="confirm" role="group" aria-label="Confirm issue creation">
          <span className="small">
            Create a {config.issueTypeName} in {config.projectName} ({config.projectKey})?
          </span>
          <button type="button" className="btn btn-primary" onClick={create} disabled={busy}>
            {busy ? 'Creating…' : 'Create'}
          </button>
          <button type="button" className="btn" onClick={() => setConfirming(false)} disabled={busy}>
            Cancel
          </button>
        </span>
      )}
      {message && (
        <span role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-danger small' : 'small'}>
          {message.text}
        </span>
      )}
    </span>
  );
}
