import { useState, type FormEvent } from 'react';
import { call, errorMessage, type CitedStatement, type CopilotAnswer } from '../api';
import { Panel } from '../components';
import type { NavProps } from '../App';
import { useI18n } from '../i18n';

const MAX_QUESTION = 500;

export function Copilot(_props: NavProps) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<CopilotAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { t, locale } = useI18n();

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setQuestion(text);
    setBusy(true);
    setError(null);
    try {
      // The AI writes its answer in the person's UI language.
      setAnswer(await call('askCopilot', { question: text, locale }));
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
      <p className="notice ai-notice" role="note">
        <span className="check" aria-hidden="true">✓</span>{' '}
        <strong>{t.aiNotice}</strong> {t.aiNoticeDetail}
      </p>

      <form className="copilot-form" onSubmit={submit}>
        <label htmlFor="copilot-q" className="h4">{t.askLabel}</label>
        <div className="row">
          <input
            id="copilot-q"
            className="input copilot-input"
            value={question}
            maxLength={MAX_QUESTION}
            placeholder={t.askPlaceholder}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={busy || !question.trim()}>
            {busy ? t.answering : t.ask}
          </button>
        </div>
        <div className="row" aria-label={t.examplesLabel}>
          {t.examples.map((q) => (
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
  const { t, fmt } = useI18n();
  const freshness = [
    answer.dataAsOf.shipmentsImportedAt && t.shipmentsImportedAt(fmt.dateTime(answer.dataAsOf.shipmentsImportedAt)),
    answer.dataAsOf.inventoryImportedAt && t.inventoryImportedAt(fmt.dateTime(answer.dataAsOf.inventoryImportedAt)),
  ].filter(Boolean);

  return (
    <div className="stack" aria-live="polite">
      {answer.fallbackReason && (
        <p className="notice" role="note"><strong>{t.ruleBasedAnswer}</strong> {t.fallbackText(answer.fallbackReason)}</p>
      )}
      <Panel title={t.verifiedFacts}>
        {answer.facts.length === 0 ? <p className="muted">{t.noMatchingRecords}</p> : <Statements items={answer.facts} />}
      </Panel>
      <Panel title={t.nextSteps}>
        {answer.recommendations.length === 0 ? (
          <p className="muted">{t.noActionSuggested}</p>
        ) : (
          <ol className="answer-list">
            {answer.recommendations.map((r, i) => (
              <li key={i}>
                <span className={`badge prio-${r.priority}`}>{t.priority[r.priority]}</span> {r.text}
                <div className="muted small">{t.basedOn(r.evidence, t.confidence[r.confidence])}</div>
                <Ids ids={r.ids} />
              </li>
            ))}
          </ol>
        )}
      </Panel>
      {answer.unknowns.length > 0 && (
        <Panel title={t.unknownData}>
          <ul className="answer-list">
            {answer.unknowns.map((u) => <li key={u}>{u}</li>)}
          </ul>
        </Panel>
      )}
      <p className="muted small">
        {t.evaluated(fmt.date(answer.dataAsOf.today))}{freshness.length > 0 ? ` · ${freshness.join(' · ')}` : ''} · {answer.mode === 'rules' ? t.modeRules : t.modeLlm}
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
  const { t } = useI18n();
  if (ids.length === 0) return null;
  return (
    <span className="ids" aria-label={t.sources}>
      {ids.map((id) => <span key={id} className="mono id-chip">{id}</span>)}
    </span>
  );
}
