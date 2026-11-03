import { parseCsv, CsvParseError } from './csv';
import { parseIsoDate } from './dates';
import {
  SHIPMENT_STATUSES,
  type ImportKind,
  type InventoryItem,
  type RowError,
  type Shipment,
  type ShipmentStatus,
} from './types';

/** Keeps every resolver response (full lists with risk evidence) well inside Forge payload limits. */
export const MAX_ROWS = 2000;
/** Upper bound for quantities and costs; protects sums from overflow and absurd values. */
export const MAX_NUMBER = 1_000_000_000;
export const MAX_ERRORS_REPORTED = 200;
const MAX_TEXT = 200;
/** Warehouse is part of the inventory storage key and of risk IDs, so it is kept short. */
const MAX_WAREHOUSE = 64;
/** Warehouse names appear inside risk IDs shown to the Rovo agent: letters, digits and basic punctuation only. */
const WAREHOUSE = /^[\p{L}\p{N}][\p{L}\p{N} .,'()&_/-]*$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-/]{0,63}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

const SHIPMENT_REQUIRED = ['shipment_id', 'supplier', 'sku', 'qty', 'planned_arrival', 'status', 'warehouse'];
const INVENTORY_REQUIRED = ['sku', 'warehouse', 'on_hand', 'safety_stock'];

export type ImportResult =
  | { ok: true; kind: 'shipments'; records: Shipment[]; rowsTotal: number; errors: RowError[] }
  | { ok: true; kind: 'inventory'; records: InventoryItem[]; rowsTotal: number; errors: RowError[] }
  | { ok: false; errors: RowError[] };

export function detectKind(header: string[]): ImportKind | null {
  if (header.includes('shipment_id')) return 'shipments';
  if (header.includes('on_hand')) return 'inventory';
  return null;
}

/** Parses and validates a CSV file. Invalid rows are rejected with line-level errors, never silently used. */
export function importCsv(text: string): ImportResult {
  let table;
  try {
    table = parseCsv(text);
  } catch (err) {
    const message = err instanceof CsvParseError ? err.message : 'Could not parse CSV';
    return { ok: false, errors: [{ line: 0, field: null, message }] };
  }

  const kind = detectKind(table.header);
  if (!kind) {
    return {
      ok: false,
      errors: [{
        line: 1,
        field: null,
        message: 'Unrecognised header: expected a shipments file (shipment_id, …) or an inventory file (sku, warehouse, on_hand, …)',
      }],
    };
  }
  const duplicates = table.header.filter((h, i) => h !== '' && table.header.indexOf(h) !== i);
  if (duplicates.length > 0) {
    return { ok: false, errors: [{ line: 1, field: null, message: `Duplicate column(s): ${[...new Set(duplicates)].join(', ')}` }] };
  }
  const required = kind === 'shipments' ? SHIPMENT_REQUIRED : INVENTORY_REQUIRED;
  const missing = required.filter((c) => !table.header.includes(c));
  if (missing.length > 0) {
    return { ok: false, errors: [{ line: 1, field: null, message: `Missing required column(s): ${missing.join(', ')}` }] };
  }
  if (table.rows.length === 0) {
    return { ok: false, errors: [{ line: 0, field: null, message: 'File has a header but no data rows' }] };
  }
  if (table.rows.length > MAX_ROWS) {
    return { ok: false, errors: [{ line: 0, field: null, message: `Too many rows (${table.rows.length}); the limit is ${MAX_ROWS}` }] };
  }

  const errors: RowError[] = [];
  const pushError = (e: RowError) => {
    if (errors.length < MAX_ERRORS_REPORTED) errors.push(e);
  };

  if (kind === 'shipments') {
    const records: Shipment[] = [];
    const seen = new Map<string, number>();
    for (const row of table.rows) {
      const result = toShipment(new Row(table.header, row.cells, row.line));
      if ('errors' in result) {
        result.errors.forEach(pushError);
        continue;
      }
      const firstLine = seen.get(result.id);
      if (firstLine !== undefined) {
        pushError({ line: row.line, field: 'shipment_id', message: `Duplicate shipment_id ${result.id} (first seen on line ${firstLine})` });
        continue;
      }
      seen.set(result.id, row.line);
      records.push(result);
    }
    return { ok: true, kind, records, rowsTotal: table.rows.length, errors };
  }

  const records: InventoryItem[] = [];
  const seen = new Map<string, number>();
  for (const row of table.rows) {
    const result = toInventory(new Row(table.header, row.cells, row.line));
    if ('errors' in result) {
      result.errors.forEach(pushError);
      continue;
    }
    const key = `${result.sku}@${result.warehouse}`;
    const firstLine = seen.get(key);
    if (firstLine !== undefined) {
      pushError({ line: row.line, field: 'sku', message: `Duplicate inventory row for ${key} (first seen on line ${firstLine})` });
      continue;
    }
    seen.set(key, row.line);
    records.push(result);
  }
  return { ok: true, kind, records, rowsTotal: table.rows.length, errors };
}

/** Typed accessor over one CSV row that collects validation errors. */
class Row {
  readonly errors: RowError[] = [];

  constructor(
    private readonly header: string[],
    private readonly cells: string[],
    readonly line: number,
  ) {
    // Fewer cells is fine (trailing optional columns left blank); more means an unquoted comma shifted the row.
    const extra = cells.slice(header.length).filter((c) => c.trim() !== '');
    if (extra.length > 0) {
      this.errors.push({ line, field: null, message: `Row has ${cells.length} values but the header has ${header.length} columns (unquoted comma?)` });
    }
  }

  private raw(field: string): string {
    const idx = this.header.indexOf(field);
    return idx === -1 ? '' : (this.cells[idx] ?? '').replace(CONTROL_CHARS, ' ').trim();
  }

  private fail(field: string, message: string): null {
    this.errors.push({ line: this.line, field, message });
    return null;
  }

  id(field: string, required: boolean): string | null {
    const v = this.raw(field);
    if (!v) return required ? this.fail(field, 'is required') : null;
    return ID_PATTERN.test(v) ? v : this.fail(field, `"${v.slice(0, 40)}" is not a valid identifier`);
  }

  text(field: string, required: boolean, maxLen = MAX_TEXT): string | null {
    const v = this.raw(field);
    if (!v) return required ? this.fail(field, 'is required') : null;
    return v.length > maxLen ? this.fail(field, `is longer than ${maxLen} characters`) : v;
  }

  warehouse(field: string): string | null {
    const v = this.text(field, true, MAX_WAREHOUSE);
    if (v === null) return null;
    return WAREHOUSE.test(v) ? v : this.fail(field, 'may only contain letters, digits, spaces and . , \' ( ) & _ / -');
  }

  int(field: string, opts: { required: boolean; min: number; fallback?: number }): number | null {
    const v = this.raw(field);
    if (!v) {
      if (opts.fallback !== undefined) return opts.fallback;
      return opts.required ? this.fail(field, 'is required') : null;
    }
    if (!/^-?\d+$/.test(v)) return this.fail(field, `"${v.slice(0, 20)}" is not a whole number`);
    const n = Number(v);
    if (n < opts.min) return this.fail(field, `must be at least ${opts.min}`);
    return n > MAX_NUMBER ? this.fail(field, `must be at most ${MAX_NUMBER}`) : n;
  }

  decimal(field: string): number | null {
    const v = this.raw(field);
    if (!v) return null;
    const n = Number(v);
    if (!/^\d+(\.\d+)?$/.test(v) || !Number.isFinite(n)) return this.fail(field, `"${v.slice(0, 20)}" is not a valid non-negative number`);
    return n > MAX_NUMBER ? this.fail(field, `must be at most ${MAX_NUMBER}`) : n;
  }

  date(field: string, required: boolean): string | null {
    const v = this.raw(field);
    if (!v) return required ? this.fail(field, 'is required') : null;
    return parseIsoDate(v) ?? this.fail(field, `"${v.slice(0, 20)}" is not a valid date (use YYYY-MM-DD)`);
  }

  status(field: string): ShipmentStatus | null {
    const v = this.raw(field).toLowerCase().replace(/[\s-]+/g, '_');
    if (!v) return this.fail(field, 'is required');
    return (SHIPMENT_STATUSES as readonly string[]).includes(v)
      ? (v as ShipmentStatus)
      : this.fail(field, `"${v.slice(0, 20)}" is not one of ${SHIPMENT_STATUSES.join(', ')}`);
  }
}

function toShipment(r: Row): Shipment | { errors: RowError[] } {
  const s = {
    id: r.id('shipment_id', true),
    orderId: r.id('order_id', false),
    supplier: r.text('supplier', true),
    sku: r.id('sku', true),
    productName: r.text('product_name', false),
    qty: r.int('qty', { required: true, min: 1 }),
    plannedArrival: r.date('planned_arrival', true),
    eta: r.date('eta', false),
    actualArrival: r.date('actual_arrival', false),
    status: r.status('status'),
    warehouse: r.warehouse('warehouse'),
    carrier: r.text('carrier', false),
    trackingRef: r.text('tracking_ref', false),
  };
  if (r.errors.length === 0 && s.status === 'delivered' && !s.actualArrival) {
    r.errors.push({ line: r.line, field: 'actual_arrival', message: 'is required when status is delivered' });
  }
  if (r.errors.length > 0) return { errors: r.errors };
  return s as Shipment;
}

function toInventory(r: Row): InventoryItem | { errors: RowError[] } {
  const item = {
    sku: r.id('sku', true),
    productName: r.text('product_name', false),
    warehouse: r.warehouse('warehouse'),
    onHand: r.int('on_hand', { required: true, min: 0 }),
    reserved: r.int('reserved', { required: false, min: 0, fallback: 0 }),
    inboundQty: r.int('inbound_qty', { required: false, min: 0, fallback: 0 }),
    safetyStock: r.int('safety_stock', { required: true, min: 0 }),
    unitCost: r.decimal('unit_cost'),
    updatedAt: r.date('updated_at', false),
  };
  if (r.errors.length === 0 && (item.reserved as number) > (item.onHand as number)) {
    r.errors.push({ line: r.line, field: 'reserved', message: 'cannot exceed on_hand' });
  }
  if (r.errors.length > 0) return { errors: r.errors };
  return item as InventoryItem;
}
