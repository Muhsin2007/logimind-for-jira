import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogisticsService, MAX_CSV_CHARS } from '../../src/services/logistics-service';
import type { LogisticsRepository } from '../../src/storage/repository';
import type { InventoryItem, Shipment } from '../../src/domain/types';

const NOW = new Date('2026-11-02T10:00:00Z');
const HEADER = 'shipment_id,supplier,sku,qty,planned_arrival,eta,status,warehouse';

function mockRepo(shipments: Shipment[] = [], inventory: InventoryItem[] = []) {
  return {
    listShipments: vi.fn().mockResolvedValue(shipments),
    listInventory: vi.fn().mockResolvedValue(inventory),
    replaceShipments: vi.fn().mockResolvedValue(undefined),
    replaceInventory: vi.fn().mockResolvedValue(undefined),
    saveImportBatch: vi.fn().mockResolvedValue(undefined),
    listImportBatches: vi.fn().mockResolvedValue([]),
    clearAll: vi.fn().mockResolvedValue(undefined),
    withWriteLock: vi.fn(<T,>(fn: () => Promise<T>) => fn()),
  } satisfies LogisticsRepository;
}

const late: Shipment = {
  id: 'SHP-9', orderId: null, supplier: 'Acme', sku: 'SKU-1', productName: null, qty: 5,
  plannedArrival: '2026-10-25', eta: '2026-10-25', actualArrival: null, status: 'in_transit',
  warehouse: 'W', carrier: null, trackingRef: null,
};

describe('LogisticsService.importCsv', () => {
  let repo: ReturnType<typeof mockRepo>;
  let service: LogisticsService;
  beforeEach(() => {
    repo = mockRepo();
    service = new LogisticsService(repo, () => NOW, () => 'batch1');
  });

  it('replaces shipments under the write lock and records an audited import batch', async () => {
    const out = await service.importCsv('s.csv', `${HEADER}\nSHP-1,A,S,1,2026-11-04,,planned,W\nSHP-2,A,S,0,2026-11-04,,planned,W`, 'acc-1');
    expect(out).toMatchObject({ ok: true, replaced: true, batch: { id: 'batch1', kind: 'shipments', rowsTotal: 2, rowsValid: 1, rowsRejected: 1 } });
    expect(repo.withWriteLock).toHaveBeenCalledTimes(1);
    expect(repo.replaceShipments).toHaveBeenCalledWith([expect.objectContaining({ id: 'SHP-1' })]);
    expect(repo.replaceInventory).not.toHaveBeenCalled();
    expect(repo.saveImportBatch).toHaveBeenCalledWith(expect.objectContaining({ importedAt: NOW.toISOString(), importedBy: 'acc-1' }));
  });

  it('keeps existing data when every row is invalid', async () => {
    const out = await service.importCsv('s.csv', `${HEADER}\nSHP-1,A,S,0,2026-11-04,,planned,W`, null);
    expect(out).toMatchObject({ ok: true, replaced: false, batch: { rowsValid: 0, rowsRejected: 1 } });
    expect(repo.replaceShipments).not.toHaveBeenCalled();
  });

  it('rejects oversized files and invalid headers without touching storage', async () => {
    expect((await service.importCsv('big.csv', 'x'.repeat(MAX_CSV_CHARS + 1), null)).ok).toBe(false);
    expect((await service.importCsv('x.csv', 'a,b\n1,2', null)).ok).toBe(false);
    expect(repo.saveImportBatch).not.toHaveBeenCalled();
  });

  it('propagates storage failures', async () => {
    repo.replaceShipments.mockRejectedValue(new Error('Storage write failed'));
    await expect(service.importCsv('s.csv', `${HEADER}\nSHP-1,A,S,1,2026-11-04,,planned,W`, null)).rejects.toThrow('Storage write failed');
  });

  it('does not write when another write holds the lock', async () => {
    repo.withWriteLock.mockRejectedValue(new Error('Another import or delete is already in progress.'));
    await expect(service.importCsv('s.csv', `${HEADER}\nSHP-1,A,S,1,2026-11-04,,planned,W`, null)).rejects.toThrow(/in progress/);
    await expect(service.clearData()).rejects.toThrow(/in progress/);
    expect(repo.replaceShipments).not.toHaveBeenCalled();
    expect(repo.clearAll).not.toHaveBeenCalled();
  });
});

describe('LogisticsService reads', () => {
  it('builds the dashboard from stored data and the rule engine', async () => {
    const service = new LogisticsService(mockRepo([late]), () => NOW);
    const d = await service.getDashboard();
    expect(d).toMatchObject({ today: '2026-11-02', hasData: true, kpis: { shipmentsLate: 1 } });
    expect(d.topRisks.map((r) => r.id)).toEqual(['LATE_SHIPMENT:SHP-9']);
  });

  it('reports an empty dataset', async () => {
    const d = await new LogisticsService(mockRepo(), () => NOW).getDashboard();
    expect(d.hasData).toBe(false);
    expect(d.topRisks).toEqual([]);
  });

  it('returns null for an unknown shipment instead of inventing one', async () => {
    const service = new LogisticsService(mockRepo([late]), () => NOW);
    expect(await service.getShipment('SHP-404')).toBeNull();
    const detail = await service.getShipment('SHP-9');
    expect(detail?.risks.map((r) => r.type)).toEqual(['LATE_SHIPMENT']);
    expect(detail?.inventory).toBeNull();
  });

  it('annotates shipments with their highest risk severity', async () => {
    const { shipments } = await new LogisticsService(mockRepo([late]), () => NOW).listShipments();
    expect(shipments[0]).toMatchObject({ topSeverity: 'critical', riskIds: ['LATE_SHIPMENT:SHP-9'] });
  });
});

describe('LogisticsService.loadDemoData', () => {
  it('imports both demo files through the normal importer under one lock', async () => {
    const repo = mockRepo();
    const out = await new LogisticsService(repo, () => NOW).loadDemoData(null);
    expect(repo.withWriteLock).toHaveBeenCalledTimes(1);
    expect(out.every((o) => o.ok && o.batch.rowsRejected === 0)).toBe(true);
    expect(repo.replaceShipments.mock.calls[0][0]).toHaveLength(30);
    expect(repo.replaceInventory.mock.calls[0][0]).toHaveLength(12);
  });
});
