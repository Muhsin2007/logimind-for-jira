import { useEffect, useState } from 'react';
import { invoke } from '@forge/bridge';

interface HealthResponse {
  app: string;
  status: 'ok';
  accountId: string | null;
  timestamp: string;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; health: HealthResponse }
  | { kind: 'error'; message: string };

export function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    invoke<HealthResponse>('getHealth')
      .then((health) => setState({ kind: 'ready', health }))
      .catch((err: unknown) =>
        setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) }),
      );
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1 style={{ margin: 0 }}>LogiMind for Jira</h1>
      <p style={{ color: '#44546F' }}>Turn logistics chaos into clear, AI-powered action inside Jira.</p>
      {state.kind === 'loading' && <p>Connecting to Forge backend…</p>}
      {state.kind === 'error' && <p role="alert">Backend error: {state.message}</p>}
      {state.kind === 'ready' && (
        <p>
          Backend status: <strong>{state.health.status}</strong> · {state.health.timestamp}
        </p>
      )}
    </main>
  );
}
