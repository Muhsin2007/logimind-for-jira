import { CsvParseError, detectDelimiter, parseCsv, scanHeader } from './csv';
import { cleanUntrusted } from './text';
import type { ImportKind } from './types';

export interface FieldSpec {
  field: string;
  required: boolean;
  /** Plain description shown to the model and in the mapping UI. */
  description: string;
}

/** Target columns of each import file, in canonical order. Required flags match the importer. */
export const SCHEMA: Record<ImportKind, FieldSpec[]> = {
  shipments: [
    { field: 'shipment_id', required: true, description: 'unique shipment / consignment / delivery number' },
    { field: 'order_id', required: false, description: 'purchase order number' },
    { field: 'supplier', required: true, description: 'supplier or vendor name' },
    { field: 'sku', required: true, description: 'item code / article / part number' },
    { field: 'product_name', required: false, description: 'item description' },
    { field: 'qty', required: true, description: 'shipped quantity (whole number)' },
    { field: 'planned_arrival', required: true, description: 'originally promised arrival date' },
    { field: 'eta', required: false, description: 'latest estimated arrival date' },
    { field: 'actual_arrival', required: false, description: 'date actually received' },
    { field: 'status', required: true, description: 'shipment status (planned, confirmed, in transit, customs, delivered, cancelled)' },
    { field: 'warehouse', required: true, description: 'destination warehouse' },
    { field: 'carrier', required: false, description: 'carrier / forwarder' },
    { field: 'tracking_ref', required: false, description: 'tracking, AWB or bill of lading number' },
  ],
  inventory: [
    { field: 'sku', required: true, description: 'item code / article / part number' },
    { field: 'product_name', required: false, description: 'item description' },
    { field: 'warehouse', required: true, description: 'warehouse / location' },
    { field: 'on_hand', required: true, description: 'physical stock on hand (whole number)' },
    { field: 'reserved', required: false, description: 'quantity reserved / allocated' },
    { field: 'inbound_qty', required: false, description: 'quantity on order / inbound' },
    { field: 'safety_stock', required: true, description: 'safety stock / minimum / reorder level' },
    { field: 'unit_cost', required: false, description: 'cost per unit' },
    { field: 'updated_at', required: false, description: 'date the stock figure was taken' },
  ],
};

export const MAX_COLUMNS = 40;
const MAX_HEADER = 60;
const MAX_SAMPLE = 40;
const SAMPLE_ROWS = 3;

export interface ColumnPreview {
  index: number;
  header: string;
  /** First few values, cleaned and capped: untrusted text, for context only. */
  samples: string[];
}

/** Headers plus a few sample values: everything a person or a model needs to map columns. */
export function previewColumns(text: string): { columns: ColumnPreview[]; rowCount: number } | { error: string } {
  let table;
  try {
    table = parseCsv(text, { keepHeaderCase: true });
  } catch (err) {
    return { error: err instanceof CsvParseError ? err.message : 'Could not parse CSV' };
  }
  if (table.rows.length === 0) return { error: 'File has a header but no data rows' };
  if (table.header.length > MAX_COLUMNS) return { error: `Too many columns (${table.header.length}); the limit is ${MAX_COLUMNS}` };
  const sampleRows = table.rows.slice(0, SAMPLE_ROWS);
  return {
    rowCount: table.rows.length,
    columns: table.header.map((h, index) => ({
      index,
      header: cleanUntrusted(h, MAX_HEADER) ?? '',
      samples: sampleRows.map((r) => cleanUntrusted(r.cells[index] ?? '', MAX_SAMPLE) ?? '').filter((v) => v !== ''),
    })),
  };
}

/** `"  Planned Arrival "` → `planned_arrival`. */
export function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** Deterministic match: a header that is a target field name once normalised. First match wins. */
export function matchByName(kind: ImportKind, headers: string[]): (string | null)[] {
  const fields = new Set(SCHEMA[kind].map((f) => f.field));
  const used = new Set<string>();
  return headers.map((h) => {
    const n = normaliseHeader(h);
    if (!fields.has(n) || used.has(n)) return null;
    used.add(n);
    return n;
  });
}

export function missingRequired(kind: ImportKind, mapping: (string | null)[]): string[] {
  return SCHEMA[kind].filter((f) => f.required && !mapping.includes(f.field)).map((f) => f.field);
}

/** Checks a mapping (one target field or null per column) before it is applied. */
export function validateMapping(kind: ImportKind, columnCount: number, mapping: (string | null)[]): string[] {
  const errors: string[] = [];
  if (mapping.length !== columnCount) errors.push(`The mapping must list all ${columnCount} columns`);
  const fields = new Set(SCHEMA[kind].map((f) => f.field));
  const seen = new Set<string>();
  for (const field of mapping) {
    if (field === null) continue;
    if (!fields.has(field)) errors.push(`${String(field).slice(0, 40)} is not an ${kind === 'inventory' ? 'inventory' : 'shipments'} column`);
    else if (seen.has(field)) errors.push(`${field} is mapped more than once`);
    seen.add(field);
  }
  const missing = missingRequired(kind, mapping);
  if (missing.length > 0) errors.push(`Missing required column(s): ${missing.join(', ')}`);
  return errors;
}

/**
 * Replaces the header record with the mapped field names (unmapped columns get an empty
 * header, which the importer ignores). Everything after the header is returned unchanged,
 * so a mapping can never alter a value.
 */
export function applyMapping(text: string, mapping: (string | null)[]): string {
  const input = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(input);
  // Same header boundaries as the parser, so the preview and the import see the same rows.
  const { end } = scanHeader(input);
  return mapping.map((f) => f ?? '').join(delimiter) + input.slice(end);
}
