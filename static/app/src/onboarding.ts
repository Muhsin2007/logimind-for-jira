import { useCallback, useState } from 'react';

/** Tabs whose first visit completes a "Getting started" step. */
export type GuideStep = 'risks' | 'whatIf' | 'copilot' | 'import';
export const GUIDE_STEPS: GuideStep[] = ['risks', 'whatIf', 'copilot', 'import'];

interface GuideState {
  visited: GuideStep[];
  dismissed: boolean;
}

const KEY = 'logimind.onboarding';
const EMPTY: GuideState = { visited: [], dismissed: false };

/**
 * Per-person, per-browser progress of the "Getting started" panel. It is only a convenience:
 * when storage is blocked in the iframe, the panel simply starts fresh on every load.
 */
export function readGuide(): GuideState {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<GuideState> | null;
    if (!raw || typeof raw !== 'object') return EMPTY;
    const visited = Array.isArray(raw.visited) ? GUIDE_STEPS.filter((s) => raw.visited?.includes(s)) : [];
    return { visited, dismissed: raw.dismissed === true };
  } catch {
    return EMPTY;
  }
}

function writeGuide(state: GuideState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* Storage blocked: progress lasts for this page only. */
  }
}

/** Records the first visit of a tab that belongs to a step. */
export function markVisited(tab: string): void {
  if (!(GUIDE_STEPS as string[]).includes(tab)) return;
  const state = readGuide();
  if (state.visited.includes(tab as GuideStep)) return;
  writeGuide({ ...state, visited: [...state.visited, tab as GuideStep] });
}

export function useGuide(): GuideState & { dismiss: () => void } {
  const [state, setState] = useState(readGuide);
  const dismiss = useCallback(() => {
    const next = { ...readGuide(), dismissed: true };
    writeGuide(next);
    setState(next);
  }, []);
  return { ...state, dismiss };
}
