import { describe, expect, it } from 'vitest';
import { briefList, diffRisks, refFromEntry, toSnapshotEntries, type SnapshotEntry } from '../../src/domain/risk-diff';
import type { RiskEvent, Severity } from '../../src/domain/types';

const risk = (id: string, severity: Severity): RiskEvent => {
  const [type, entityKey] = id.split(/:(.*)/s) as [RiskEvent['type'], string];
  return {
    id, type, severity, entityType: type === 'LOW_STOCK' ? 'inventory' : 'shipment', entityKey,
    title: id, evidence: [], ruleVersion: '1.2.0', evaluatedOn: '2026-11-09',
  };
};

describe('diffRisks', () => {
  it('treats the first check as a baseline: nothing is new or resolved', () => {
    const current = [risk('LATE_SHIPMENT:SHP-1', 'critical'), risk('LOW_STOCK:SKU-1@Main', 'high')];
    const d = diffRisks(null, current);
    expect(d.baseline).toBe(true);
    expect(d.newRisks).toEqual([]);
    expect(d.newCritical).toEqual([]);
    expect(d.resolved).toEqual([]);
    expect(d.stillOpen.map((r) => r.id)).toEqual(current.map((r) => r.id));
    expect(d.stillCritical.map((r) => r.id)).toEqual(['LATE_SHIPMENT:SHP-1']);
  });

  it('splits risks into new, resolved and still open by risk ID', () => {
    const prev: SnapshotEntry[] = [['LATE_SHIPMENT:SHP-1', 'critical'], ['ETA_SLIP:SHP-2', 'medium']];
    const current = [risk('LATE_SHIPMENT:SHP-1', 'critical'), risk('MISSING_ETA:SHP-3', 'high')];
    const d = diffRisks(prev, current);
    expect(d.baseline).toBe(false);
    expect(d.newRisks.map((r) => r.id)).toEqual(['MISSING_ETA:SHP-3']);
    expect(d.resolved.map((r) => r.id)).toEqual(['ETA_SLIP:SHP-2']);
    expect(d.resolved[0]).toEqual({ id: 'ETA_SLIP:SHP-2', type: 'ETA_SLIP', severity: 'medium', entityType: 'shipment', entityKey: 'SHP-2' });
    expect(d.stillOpen.map((r) => r.id)).toEqual(['LATE_SHIPMENT:SHP-1']);
    expect(d.stillCritical.map((r) => r.id)).toEqual(['LATE_SHIPMENT:SHP-1']);
  });

  it('counts a risk that escalated to critical as newly critical (but not as new)', () => {
    const prev: SnapshotEntry[] = [['LATE_SHIPMENT:SHP-1', 'high']];
    const d = diffRisks(prev, [risk('LATE_SHIPMENT:SHP-1', 'critical'), risk('LATE_SHIPMENT:SHP-9', 'critical'), risk('ETA_SLIP:SHP-4', 'low')]);
    expect(d.newRisks.map((r) => r.id)).toEqual(['LATE_SHIPMENT:SHP-9', 'ETA_SLIP:SHP-4']);
    expect(d.newCritical.map((r) => r.id)).toEqual(['LATE_SHIPMENT:SHP-1', 'LATE_SHIPMENT:SHP-9']);
    expect(d.stillCritical).toEqual([]);
  });

  it('treats an empty previous snapshot (data was cleared) as a real comparison', () => {
    const d = diffRisks([], [risk('LATE_SHIPMENT:SHP-1', 'critical')]);
    expect(d.baseline).toBe(false);
    expect(d.newCritical.map((r) => r.id)).toEqual(['LATE_SHIPMENT:SHP-1']);
  });

  it('ignores malformed snapshot entries instead of failing', () => {
    const prev = [['nonsense', 'critical'], ['LATE_SHIPMENT:SHP-1', 'weird'], 42] as unknown as SnapshotEntry[];
    const d = diffRisks(prev, []);
    expect(d.resolved).toEqual([]);
  });
});

describe('snapshot helpers', () => {
  it('stores only ID and severity per risk', () => {
    expect(toSnapshotEntries([risk('LOW_STOCK:SKU-1@Main', 'high')])).toEqual([['LOW_STOCK:SKU-1@Main', 'high']]);
  });

  it('rebuilds a reference from an ID; warehouse names with colons stay intact', () => {
    expect(refFromEntry(['LOW_STOCK:SKU-1@Hall: A', 'low'])).toEqual({ id: 'LOW_STOCK:SKU-1@Hall: A', type: 'LOW_STOCK', severity: 'low', entityType: 'inventory', entityKey: 'SKU-1@Hall: A' });
    expect(refFromEntry(['BOGUS:X', 'low'])).toBeNull();
  });

  it('briefList keeps the most severe first, then by ID, capped', () => {
    const list = briefList([risk('ETA_SLIP:B', 'low'), risk('LATE_SHIPMENT:A', 'critical'), risk('ETA_SLIP:A', 'low')], 2);
    expect(list.map((r) => r.id)).toEqual(['LATE_SHIPMENT:A', 'ETA_SLIP:A']);
    expect(Object.keys(list[0]).sort()).toEqual(['entityKey', 'entityType', 'id', 'severity', 'type']);
  });
});
