import { useState } from 'react';
import { call, errorMessage, useAsync } from '../api';
import type { Tab } from '../App';
import { useI18n } from '../i18n';
import type { DesignMessages } from '../i18n/design-en';
import { Icon, type IconName } from '../icons';
import { GUIDE_STEPS, useGuide, type GuideStep } from '../onboarding';

/** First run: what LogiMind does in three steps, with demo data one click away. */
export function Welcome({ onNavigate, onDataChanged }: { onNavigate: (tab: Tab) => void; onDataChanged: () => void }) {
  const { t } = useI18n();
  const d = t.design;
  const access = useAsync(() => call('getAccess'), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Until access is known, the button stays enabled; the resolver enforces the role anyway.
  const canManage = access.status !== 'ready' || access.data.canManageData;

  const loadDemo = async () => {
    setLoading(true);
    setError(null);
    try {
      await call('loadDemoData');
      onDataChanged();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const steps: [IconName, string, string][] = [
    ['upload', d.welcomeStep1, d.welcomeStep1Text],
    ['alert', d.welcomeStep2, d.welcomeStep2Text],
    ['check', d.welcomeStep3, d.welcomeStep3Text],
  ];

  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-head">
        <h2 id="welcome-title">{d.welcomeTitle}</h2>
        <p>{d.welcomeText}</p>
      </div>
      <ol className="welcome-steps">
        {steps.map(([icon, title, text], n) => (
          <li key={title} className="welcome-step">
            <span className="welcome-top" aria-hidden="true">
              <span className="welcome-num">{n + 1}</span>
              <span className="welcome-icon"><Icon name={icon} size={18} /></span>
            </span>
            <strong>{title}</strong>
            <span className="muted">{text}</span>
          </li>
        ))}
      </ol>
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={loadDemo} disabled={loading || !canManage}>
          {loading ? t.loadingDemo : t.loadDemo}
        </button>
        <button type="button" className="btn" onClick={() => onNavigate('import')}>
          <Icon name="upload" /> {t.importCsv}
        </button>
      </div>
      <p className="footnote">{canManage ? d.welcomeDemoNote : d.welcomeViewerNote}</p>
      {error && <p role="alert" className="text-danger">{error}</p>}
    </section>
  );
}

const stepText = (d: DesignMessages): Record<GuideStep, [string, string]> => ({
  risks: [d.guideRisks, d.guideRisksText],
  whatIf: [d.guideWhatIf, d.guideWhatIfText],
  copilot: [d.guideCopilot, d.guideCopilotText],
  import: [d.guideJira, d.guideJiraText],
});

/** A short checklist after the first import; a step is done once its tab has been opened. */
export function GettingStarted({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const { t } = useI18n();
  const d = t.design;
  const guide = useGuide();
  if (guide.dismissed) return null;

  const text = stepText(d);
  const done = 1 + guide.visited.length;
  const total = 1 + GUIDE_STEPS.length;

  return (
    <section className="panel guide" aria-labelledby="guide-title">
      <header className="panel-head">
        <div className="panel-title">
          <span className="panel-icon"><Icon name="sparkles" /></span>
          <h2 id="guide-title">{d.guideTitle}</h2>
          <span className="badge badge-neutral">{d.guideProgress(done, total)}</span>
        </div>
        <button type="button" className="btn btn-sm btn-subtle" onClick={guide.dismiss} aria-label={d.guideDismiss} title={d.guideDismiss}>
          <Icon name="close" size={14} />
        </button>
      </header>
      <div className="guide-bar" aria-hidden="true"><span style={{ width: `${(done / total) * 100}%` }} /></div>
      <ol className="guide-steps">
        <GuideItem done title={d.guideData} text={d.guideDataText} />
        {GUIDE_STEPS.map((step) => (
          <GuideItem key={step} done={guide.visited.includes(step)} title={text[step][0]} text={text[step][1]} onOpen={() => onNavigate(step)} />
        ))}
      </ol>
      {done === total && <p className="footnote">{d.guideAllDone}</p>}
    </section>
  );
}

function GuideItem({ done, title, text, onOpen }: { done: boolean; title: string; text: string; onOpen?: () => void }) {
  const { t } = useI18n();
  return (
    <li className={`guide-step${done ? ' guide-done' : ''}`}>
      <span className="guide-check" aria-hidden="true">{done && <Icon name="check" size={14} />}</span>
      <span className="guide-text">
        <strong>{title}{done && <span className="sr-only"> ({t.design.guideDone})</span>}</strong>
        <span className="muted">{text}</span>
      </span>
      {!done && onOpen && (
        <button type="button" className="btn btn-sm" onClick={onOpen}>
          {t.design.guideOpen}<span className="sr-only">: {title}</span> <Icon name="arrowRight" size={14} />
        </button>
      )}
    </li>
  );
}
