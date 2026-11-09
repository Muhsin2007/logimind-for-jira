import { RISK_TYPES, SEVERITIES, type IsoDate, type RiskEvent, type RiskType, type Severity } from './types';

/**
 * Daily-check comparison. A snapshot stores only `[riskId, severity]` per open risk: risk IDs
 * are deterministic (`TYPE:entityKey`), so they identify the same condition across days, and
 * the type and entity can be read back from the ID once the risk is gone from the data.
 */
export type SnapshotEntry = [id: string, severity: Severity];

export interface RiskSnapshot {
  checkedAt: string;
  today: IsoDate;
  entries: SnapshotEntry[];
}

/** A risk as shown in the briefing: enough to name it, nothing copied from free text beyond the ID. */
export interface RiskRef {
  id: string;
  type: RiskType;
  severity: Severity;
  entityType: RiskEvent['entityType'];
  entityKey: string;
}

export interface RiskDiff {
  /** No previous snapshot: the first check only records what is open. */
  baseline: boolean;
  /** Open now, absent from the previous check. */
  newRisks: RiskEvent[];
  /** Critical now, and absent or less severe at the previous check (candidates for auto-issues). */
  newCritical: RiskEvent[];
  /** Open at the previous check, gone from the data now. */
  resolved: RiskRef[];
  /** Open at both checks. */
  stillOpen: RiskEvent[];
  /** Critical at both checks. */
  stillCritical: RiskEvent[];
}

const entityTypeOf = (type: RiskType): RiskEvent['entityType'] => (type === 'LOW_STOCK' ? 'inventory' : 'shipment');

export function toSnapshotEntries(risks: RiskEvent[]): SnapshotEntry[] {
  return risks.map((r) => [r.id, r.severity]);
}

/** Rebuilds a reference from a stored entry; anything that does not parse is dropped. */
export function refFromEntry(entry: unknown): RiskRef | null {
  if (!Array.isArray(entry) || entry.length !== 2) return null;
  const [id, severity] = entry as unknown[];
  if (typeof id !== 'string' || !SEVERITIES.includes(severity as Severity)) return null;
  const at = id.indexOf(':');
  const type = id.slice(0, at) as RiskType;
  const entityKey = id.slice(at + 1);
  if (at < 1 || !RISK_TYPES.includes(type) || entityKey === '') return null;
  return { id, type, severity: severity as Severity, entityType: entityTypeOf(type), entityKey };
}

export function toRef(r: RiskEvent): RiskRef {
  return { id: r.id, type: r.type, severity: r.severity, entityType: r.entityType, entityKey: r.entityKey };
}

const rank = (s: Severity) => SEVERITIES.indexOf(s);

/** Most severe first, then by ID, capped; for the briefing lists. */
export function briefList(risks: (RiskEvent | RiskRef)[], limit: number): RiskRef[] {
  return risks
    .map((r) => ('title' in r ? toRef(r) : r))
    .sort((a, b) => rank(a.severity) - rank(b.severity) || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function diffRisks(previous: SnapshotEntry[] | null, current: RiskEvent[]): RiskDiff {
  if (previous === null) {
    return {
      baseline: true,
      newRisks: [],
      newCritical: [],
      resolved: [],
      stillOpen: [...current],
      stillCritical: current.filter((r) => r.severity === 'critical'),
    };
  }
  const prev = new Map<string, Severity>();
  const resolvedCandidates: RiskRef[] = [];
  for (const entry of previous) {
    const ref = refFromEntry(entry);
    if (!ref || prev.has(ref.id)) continue;
    prev.set(ref.id, ref.severity);
    resolvedCandidates.push(ref);
  }
  const now = new Set(current.map((r) => r.id));
  return {
    baseline: false,
    newRisks: current.filter((r) => !prev.has(r.id)),
    newCritical: current.filter((r) => r.severity === 'critical' && prev.get(r.id) !== 'critical'),
    resolved: resolvedCandidates.filter((r) => !now.has(r.id)),
    stillOpen: current.filter((r) => prev.has(r.id)),
    stillCritical: current.filter((r) => r.severity === 'critical' && prev.get(r.id) === 'critical'),
  };
}
