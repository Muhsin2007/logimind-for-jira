import { useState, type FormEvent } from 'react';
import { call, errorMessage, type CitedStatement, type CopilotAnswer } from '../api';
import { Panel } from '../components';
import { fmtDateTime } from '../format';
import type { NavProps } from '../App';

const EXAMPLES = ["Today's risk summary", 'Which delays hurt stock the most?', 'Why is SHP-1004 a problem and what should I do?', 'Stock of SKU-10', 'Where is SHP-9999?'];
const MAX_QUESTION = 500;

export function Copilot(_props: NavProps) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<CopilotAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setQuestion(text);
    setBusy(true);
    setError(null);
    try {
      setAnswer(await call('askCopilot', { question: text }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(question);
  };

  return (
    <div className="stack">
      <p className="notice" role="note">
        <strong>AI mode.</strong> Answers are written by Claude (Atlassian-hosted Forge LLM, no external provider), which can only call
        LogiMind's read-only tools. Every ID, number and date in an answer is checked against your data; if the AI is unavailable or an
        answer cannot be verified, the rule-based answer is shown instead.
      </p>

      <form className="copilot-form" onSubmit={submit}>
        <label htmlFor="copilot-q" className="h4">Ask about shipments, stock or risks</label>
        <div className="row">
          <input
            id="copilot-q"
            className="input copilot-input"
            value={question}
            maxLength={MAX_QUESTION}
            placeholder="e.g. Status of SHP-1004"
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !question.trim()}>
            {busy ? 'Answering…' : 'Ask'}
          </button>
        </div>
        <div className="row" aria-label="Example questions">
          {EXAMPLES.map((q) => (
            <button key={q} type="button" className="btn btn-subtle chip" onClick={() => void ask(q)} disabled={busy}>
              {q}
            </button>
          ))}
        </div>
      </form>

      {error && <p role="alert" className="text-danger">{error}</p>}
      {answer && <AnswerView answer={answer} />}
    </div>
  );
}

function AnswerView({ answer }: { answer: CopilotAnswer }) {
  const freshness = [
    answer.dataAsOf.shipmentsImportedAt && `shipments imported ${fmtDateTime(answer.dataAsOf.shipmentsImportedAt)}`,
    answer.dataAsOf.inventoryImportedAt && `inventory imported ${fmtDateTime(answer.dataAsOf.inventoryImportedAt)}`,
  ].filter(Boolean);

  return (
    <div className="stack" aria-live="polite">
      {answer.fallbackReason && (
        <p className="notice" role="note"><strong>Rule-based answer.</strong> {answer.fallbackReason}</p>
      )}
      <Panel title="Verified facts">
        {answer.facts.length === 0 ? <p className="muted">No matching records in the current data.</p> : <Statements items={answer.facts} />}
      </Panel>
      <Panel title="Recommended next steps">
        {answer.recommendations.length === 0 ? (
          <p className="muted">No action is suggested: the data does not support one.</p>
        ) : (
          <ol className="answer-list">
            {answer.recommendations.map((r, i) => (
              <li key={i}>
                <span className={`badge prio-${r.priority}`}>{r.priority} priority</span> {r.text}
                <div className="muted small">Based on: {r.evidence} · confidence {r.confidence}</div>
                <Ids ids={r.ids} />
              </li>
            ))}
          </ol>
        )}
      </Panel>
      {answer.unknowns.length > 0 && (
        <Panel title="Unknown or missing data">
          <ul className="answer-list">
            {answer.unknowns.map((u) => <li key={u}>{u}</li>)}
          </ul>
        </Panel>
      )}
      <p className="muted small">
        Evaluated {answer.dataAsOf.today}{freshness.length > 0 ? ` · ${freshness.join(' · ')}` : ''} · mode: {answer.mode === 'rules' ? 'rules, no AI' : 'AI (Forge LLM), IDs and numbers verified'}
      </p>
    </div>
  );
}

function Statements({ items }: { items: CitedStatement[] }) {
  return (
    <ul className="answer-list">
      {items.map((f, i) => (
        <li key={i}>
          {f.text}
          <Ids ids={f.ids} />
        </li>
      ))}
    </ul>
  );
}

function Ids({ ids }: { ids: string[] }) {
  if (ids.length === 0) return null;
  return (
    <span className="ids" aria-label="Sources">
      {ids.map((id) => <span key={id} className="mono id-chip">{id}</span>)}
    </span>
  );
}
