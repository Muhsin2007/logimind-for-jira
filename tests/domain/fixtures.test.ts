import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importCsv } from '../../src/domain/importer';

const fixture = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', name), 'utf8');

/** These fixtures are also used for the manual upload check in Jira (docs/TEST_REPORT.md). */
describe('QA fixture files', () => {
  it('shipments-with-errors.csv: 2 of 9 rows valid, each rejection explained by line', () => {
    const r = importCsv(fixture('shipments-with-errors.csv'));
    if (!r.ok || r.kind !== 'shipments') throw new Error('expected a shipments import');
    expect(r.records.map((s) => s.id)).toEqual(['QA-001', 'QA-008']);
    expect(r.errors.map((e) => [e.line, e.field])).toEqual([
      [3, 'supplier'],
      [4, 'planned_arrival'],
      [5, 'qty'],
      [6, 'status'],
      [7, 'shipment_id'],
      [8, null],
      [9, 'actual_arrival'],
    ]);
  });

  it('not-a-logistics-file.csv is refused as a whole', () => {
    expect(importCsv(fixture('not-a-logistics-file.csv'))).toMatchObject({ ok: false, errors: [{ line: 1 }] });
  });
});
