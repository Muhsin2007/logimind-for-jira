import { useEffect, useId, useRef, useState } from 'react';
import { call, errorMessage, type FollowUpDraft } from '../api';
import { useI18n } from '../i18n';
import { Icon } from '../icons';

type State = { status: 'idle' } | { status: 'loading' } | { status: 'ready'; draft: FollowUpDraft | null } | { status: 'error'; message: string };

/** Copies text; the Jira iframe may block the async clipboard API, so fall back to a selection copy. */
async function copyText(text: string, fallback: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!fallback) return false;
    const previous = fallback.value;
    fallback.value = text;
    fallback.select();
    const ok = document.execCommand('copy');
    fallback.value = previous;
    return ok;
  }
}

/** "Draft supplier follow-up": a text to copy. Nothing is ever sent from LogiMind. */
export function FollowUp({ shipmentId }: { shipmentId: string }) {
  const [state, setState] = useState<State>({ status: 'idle' });
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const body = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number>();
  const { t, locale } = useI18n();
  const subjectId = useId();
  const bodyId = useId();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const draft = async () => {
    setState({ status: 'loading' });
    setCopy('idle');
    try {
      setState({ status: 'ready', draft: await call('draftFollowUp', { shipmentId, locale }) });
    } catch (err) {
      setState({ status: 'error', message: errorMessage(err) });
    }
  };

  const onCopy = async (d: FollowUpDraft) => {
    const ok = await copyText(`${d.subject}\n\n${d.body}`, body.current);
    setCopy(ok ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    if (ok) timer.current = window.setTimeout(() => setCopy('idle'), 2500);
  };

  const ready = state.status === 'ready' ? state.draft : null;
  return (
    <div className="followup">
      <div className="drawer-actions">
        <button type="button" className="btn" onClick={() => void draft()} disabled={state.status === 'loading'}>
          <Icon name="send" /> {state.status === 'loading' ? t.loop.drafting : t.loop.draftButton}
        </button>
      </div>
      {state.status === 'error' && <p role="alert" className="text-danger small">{state.message}</p>}
      {state.status === 'ready' && !ready && <p className="muted small" role="status">{t.loop.noDraft}</p>}
      {ready && (
        <div className="followup-draft" role="group" aria-label={t.loop.draftTitle}>
          <p className="small"><strong>{t.loop.draftTitle}</strong></p>
          <p className="footnote">{t.loop.draftNeverSent}</p>
          <p className="muted small">{ready.mode === 'llm' ? t.loop.draftAi : ready.fallbackReason ? t.loop.draftFallback : t.loop.draftTemplate}</p>
          <label className="field" htmlFor={subjectId}>
            <span className="field-label">{t.loop.subject}</span>
          </label>
          <input id={subjectId} className="input" readOnly value={ready.subject} />
          <label className="field" htmlFor={bodyId}>
            <span className="field-label">{t.loop.message}</span>
          </label>
          <textarea id={bodyId} ref={body} className="input followup-body" readOnly value={ready.body} rows={9} />
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void onCopy(ready)}>
              <Icon name={copy === 'copied' ? 'check' : 'file'} size={14} /> {copy === 'copied' ? t.loop.copied : t.loop.copy}
            </button>
            <span role="status" className="small">{copy === 'failed' ? <span className="text-danger">{t.loop.copyFailed}</span> : null}</span>
          </div>
        </div>
      )}
    </div>
  );
}
