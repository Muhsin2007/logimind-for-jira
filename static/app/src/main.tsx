import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { view } from '@forge/bridge';
import { App } from './App';
import { I18nProvider } from './i18n';
import { IssueContext } from './views/IssueContext';
import './styles.css';

// Load Atlassian design tokens so the app follows Jira's light/dark theme.
view.theme.enable().catch(() => {
  /* Outside Jira (or tokens unavailable) the CSS fallbacks apply. */
});

// One bundle serves both modules; the module key decides which view to render.
const ISSUE_CONTEXT_MODULE = 'logimind-issue-context';

view
  .getContext()
  .then((ctx) => ctx.moduleKey)
  .catch(() => null)
  .then((moduleKey) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <I18nProvider>{moduleKey === ISSUE_CONTEXT_MODULE ? <IssueContext /> : <App />}</I18nProvider>
      </StrictMode>,
    );
  });
