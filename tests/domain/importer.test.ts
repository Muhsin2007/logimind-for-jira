import { describe, expect, it } from 'vitest';
import { importCsv } from '../../src/domain/importer';
import { parseCsv } from '../../src/domain/csv';
import { parseIsoDate } from '../../src/domain/dates';

const SHIP_HEADER = 'shipment_id,order_id,supplier,sku,qty,planned_arrival,eta,actual_arrival,status,warehouse';

describe('parseCsv', () => {
  it('handles quoted fields, escaped quotes, CRLF and a BOM', () => {
    const t = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n');
    expect(t.header).toEqual(['a', 'b']);
    expect(t.rows).toEqual([{ line: 2, cells: ['x, y', 'say "hi"'] }]);
  });

  it('skips blank lines but keeps source line numbers', () => {
    const t = parseCsv('a\n\n1\n');
    expect(t.rows).toEqual([{ line: 3, cells: ['1'] }]);
  });

  it('rejects unterminated quotes', () => {
    expect(() => parseCsv('a\n"oops')).toThrow(/Unterminated/);
  });
});

describe('parseIsoDate', () => {
  it.each(['2026-02-30', '2026-13-01', '02/11/2026', '2026-1-1', ''])('rejects %s', (v) => {
    expect(parseIsoDate(v)).toBeNull();
  });
  it('accepts leap day', () => expect(parseIsoDate('2028-02-29')).toBe('2028-02-29'));
});

describe('importCsv — shipments', () => {
  it('imports valid rows', () => {
    const r = importCsv(`${SHIP_HEADER}\nSHP-1,PO-1,Acme,SKU-1,10,2026-11-04,2026-11-06,,In Transit,Tashkent`);
    expect(r.ok).toBe(true);
    if (!r.ok || r.kind !== 'shipments') throw new Error('expected shipments');
    expect(r.records[0]).toMatchObject({ id: 'SHP-1', qty: 10, status: 'in_transit', eta: '2026-11-06', actualArrival: null });
    expect(r.errors).toEqual([]);
  });

  it('rejects bad values with line-level errors and keeps the good rows', () => {
    const csv = [
      SHIP_HEADER,
      'SHP-1,,Acme,SKU-1,10,2026-11-04,,,planned,Tashkent',
      'SHP-2,,Acme,SKU-1,-5,2026-11-04,,,planned,Tashkent',
      'SHP-3,,Acme,SKU-1,5,2026-02-30,,,planned,Tashkent',
      'SHP-4,,Acme,SKU-1,5,2026-11-04,,,teleported,Tashkent',
      'SHP-5,,,SKU-1,5,2026-11-04,,,planned,Tashkent',
      'SHP-6,,Acme,SKU-1,5,2026-11-04,,,delivered,Tashkent',
      'bad id!,,Acme,SKU-1,5,2026-11-04,,,planned,Tashkent',
    ].join('\n');
    const r = importCsv(csv);
    if (!r.ok) throw new Error('expected ok');
    expect(r.records.map((s) => s.id)).toEqual(['SHP-1']);
    expect(r.rowsTotal).toBe(7);
    expect(r.errors.map((e) => [e.line, e.field])).toEqual([
      [3, 'qty'],
      [4, 'planned_arrival'],
      [5, 'status'],
      [6, 'supplier'],
      [7, 'actual_arrival'],
      [8, 'shipment_id'],
    ]);
  });

  it('rejects duplicate IDs after the first occurrence', () => {
    const r = importCsv(`${SHIP_HEADER}\nSHP-1,,A,S,1,2026-11-04,,,planned,W\nSHP-1,,B,S,2,2026-11-05,,,planned,W`);
    if (!r.ok) throw new Error('expected ok');
    expect(r.records).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/Duplicate shipment_id SHP-1 \(first seen on line 2\)/);
  });

  it('fails the whole file when required columns are missing', () => {
    const r = importCsv('shipment_id,sku\nSHP-1,S');
    expect(r.ok).toBe(false);
    expect(r.errors[0].message).toMatch(/Missing required column\(s\): supplier, qty/);
  });

  it('fails on an unrecognised header or empty file', () => {
    expect(importCsv('foo,bar\n1,2').ok).toBe(false);
    expect(importCsv('').ok).toBe(false);
    expect(importCsv(SHIP_HEADER).ok).toBe(false);
  });

  it('rejects rows with extra values but accepts missing trailing optional values', () => {
    const r = importCsv(`${SHIP_HEADER}\nSHP-1,,Acme, Inc,S,1,2026-11-04,,,planned,W\nSHP-2,,Acme,S,1,2026-11-04,,,planned,W`);
    if (!r.ok) throw new Error('expected ok');
    expect(r.errors[0]).toMatchObject({ line: 2, message: expect.stringMatching(/11 values but the header has 10/) });
    const short = importCsv('sku,warehouse,on_hand,safety_stock,unit_cost\nSKU-1,W,1,1');
    expect(short.ok && short.errors).toEqual([]);
  });

  it('rejects duplicate columns and out-of-range numbers', () => {
    expect(importCsv(`${SHIP_HEADER},qty\nSHP-1,,A,S,1,2026-11-04,,,planned,W,2`)).toMatchObject({
      ok: false,
      errors: [{ message: 'Duplicate column(s): qty' }],
    });
    const r = importCsv(`${SHIP_HEADER}\nSHP-1,,A,S,99999999999999999999,2026-11-04,,,planned,W`);
    expect(r.ok && r.errors[0].message).toMatch(/at most/);
  });

  it('strips control characters from text fields', () => {
    const r = importCsv(`${SHIP_HEADER}\nSHP-1,,"Acme\u0007 Corp",S,1,2026-11-04,,,planned,W`);
    if (!r.ok || r.kind !== 'shipments') throw new Error('expected shipments');
    expect(r.records[0].supplier).toBe('Acme  Corp');
  });
});

describe('importCsv — inventory', () => {
  const HEADER = 'sku,warehouse,on_hand,reserved,safety_stock,unit_cost';

  it('imports rows and defaults optional quantities to 0', () => {
    const r = importCsv('sku,warehouse,on_hand,safety_stock\nSKU-1,Tashkent,10,5');
    if (!r.ok || r.kind !== 'inventory') throw new Error('expected inventory');
    expect(r.records[0]).toMatchObject({ reserved: 0, inboundQty: 0, unitCost: null });
  });

  it('rejects reserved > on_hand, negative stock, bad cost and duplicates', () => {
    const csv = [
      HEADER,
      'SKU-1,W,10,11,5,1',
      'SKU-2,W,-1,0,5,1',
      'SKU-3,W,1,0,5,abc',
      'SKU-4,W,1,0,5,1.5',
      'SKU-4,W,2,0,5,1.5',
    ].join('\n');
    const r = importCsv(csv);
    if (!r.ok) throw new Error('expected ok');
    expect(r.records).toHaveLength(1);
    expect(r.errors.map((e) => e.field)).toEqual(['reserved', 'on_hand', 'unit_cost', 'sku']);
  });
});
