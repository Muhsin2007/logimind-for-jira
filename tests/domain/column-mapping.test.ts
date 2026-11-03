import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyMapping, matchByName, normaliseHeader, previewColumns, SCHEMA, validateMapping } from '../../src/domain/column-mapping';
import { parseCsv } from '../../src/domain/csv';
import { importCsv, INVENTORY_REQUIRED, SHIPMENT_REQUIRED } from '../../src/domain/importer';

const MESSY = readFileSync(join(__dirname, '../fixtures/supplier-export-messy.csv'), 'utf8');
/** The mapping a person (or the model) would choose for the messy supplier export. */
const MESSY_MAPPING = ['shipment_id', 'order_id', 'supplier', 'sku', 'product_name', 'qty', 'planned_arrival', 'eta', 'actual_arrival', 'status', 'warehouse', 'carrier', null];

describe('parseCsv delimiter detection', () => {
  it('reads semicolon-separated Excel exports, keeping quoted semicolons', () => {
    const t = parseCsv('a;b\n"x; y";2\n');
    expect(t.header).toEqual(['a', 'b']);
    expect(t.rows[0].cells).toEqual(['x; y', '2']);
  });

  it('keeps commas as the delimiter when the header has them', () => {
    expect(parseCsv('a,b;c\n1,2\n').header).toEqual(['a', 'b;c']);
  });
});

describe('SCHEMA', () => {
  it('marks exactly the importer\'s required columns as required', () => {
    expect(SCHEMA.shipments.filter((f) => f.required).map((f) => f.field)).toEqual(SHIPMENT_REQUIRED);
    expect(SCHEMA.inventory.filter((f) => f.required).map((f) => f.field)).toEqual(INVENTORY_REQUIRED);
  });
});

describe('previewColumns', () => {
  it('lists headers with a few cleaned, capped sample values', () => {
    const p = previewColumns(MESSY);
    if ('error' in p) throw new Error(p.error);
    expect(p.rowCount).toBe(4);
    expect(p.columns).toHaveLength(13);
    expect(p.columns[0]).toEqual({ index: 0, header: 'Shipment #', samples: ['TK-501', 'TK-502', 'TK-503'] });
    expect(p.columns[4].samples[1]).toBe('Air filter; premium');
  });

  it('strips control characters and caps long values', () => {
    const p = previewColumns(`name\n"bad‮text ${'x'.repeat(200)}"\n`);
    if ('error' in p) throw new Error(p.error);
    expect(p.columns[0].samples[0]).not.toMatch(/‮/);
    expect(p.columns[0].samples[0].length).toBeLessThanOrEqual(41);
  });

  it('reports unreadable files', () => {
    expect(previewColumns('a\n"oops')).toEqual({ error: expect.stringMatching(/Unterminated/) });
    expect(previewColumns('just_a_header\n')).toEqual({ error: 'File has a header but no data rows' });
  });
});

describe('matchByName', () => {
  it('normalises spacing, case and punctuation', () => {
    expect(normaliseHeader('  Planned Arrival ')).toBe('planned_arrival');
    expect(normaliseHeader('On-Hand')).toBe('on_hand');
    expect(matchByName('inventory', ['SKU', 'Warehouse', 'On Hand', 'Safety-Stock', 'Colour'])).toEqual(['sku', 'warehouse', 'on_hand', 'safety_stock', null]);
  });

  it('never assigns the same field twice', () => {
    expect(matchByName('inventory', ['sku', 'SKU'])).toEqual(['sku', null]);
  });
});

describe('validateMapping', () => {
  it('accepts a complete mapping', () => {
    expect(validateMapping('shipments', 13, MESSY_MAPPING)).toEqual([]);
  });

  it('rejects unknown fields, duplicates, wrong length and missing required columns', () => {
    expect(validateMapping('inventory', 2, ['sku', 'shipment_id'])).toEqual(expect.arrayContaining([expect.stringMatching(/shipment_id is not an inventory column/)]));
    expect(validateMapping('inventory', 2, ['sku', 'sku'])).toEqual(expect.arrayContaining([expect.stringMatching(/sku is mapped more than once/)]));
    expect(validateMapping('inventory', 3, ['sku'])).toEqual(expect.arrayContaining([expect.stringMatching(/3 columns/)]));
    expect(validateMapping('inventory', 2, ['sku', null])).toEqual(expect.arrayContaining([expect.stringMatching(/Missing required column\(s\): warehouse, on_hand, safety_stock/)]));
  });
});

describe('applyMapping', () => {
  it('rewrites only the header; every value stays byte-for-byte identical', () => {
    const out = applyMapping(MESSY, MESSY_MAPPING);
    const [header, ...rest] = out.split('\n');
    expect(header).toBe('shipment_id;order_id;supplier;sku;product_name;qty;planned_arrival;eta;actual_arrival;status;warehouse;carrier;');
    expect(rest.join('\n')).toBe(MESSY.slice(MESSY.indexOf('\n') + 1));
  });

  it('handles a BOM, CRLF and quoted header cells with line breaks', () => {
    const out = applyMapping('﻿"Item\nCode",Qty\r\nA-1,5\r\n', ['sku', null]);
    expect(out).toBe('sku,\r\nA-1,5\r\n');
  });

  it('lets the existing validator import the remapped messy file, rejecting bad rows', () => {
    const r = importCsv(applyMapping(MESSY, MESSY_MAPPING));
    if (!r.ok || r.kind !== 'shipments') throw new Error('expected shipments');
    expect(r.records.map((s) => s.id)).toEqual(['TK-501', 'TK-502', 'TK-503']);
    expect(r.records[1]).toMatchObject({ productName: 'Air filter; premium', eta: '2026-11-14', status: 'confirmed', warehouse: 'Samarkand' });
    expect(r.errors).toEqual([{ line: 5, field: 'qty', message: '"abc" is not a whole number' }]);
  });
});
