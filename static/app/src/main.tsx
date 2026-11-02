import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { view } from '@forge/bridge';
import { App } from './App';
import './styles.css';

// Load Atlassian design tokens so the app follows Jira's light/dark theme.
view.theme.enable().catch(() => {
  /* Outside Jira (or tokens unavailable) the CSS fallbacks apply. */
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
