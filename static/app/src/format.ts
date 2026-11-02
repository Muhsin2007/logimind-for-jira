import type { Severity, Shipment } from './api';

const number = new Intl.NumberFormat('en-US');
const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const fmtNumber = (n: number) => number.format(n);
export const fmtMoney = (n: number) => money.format(n);
export const fmtPercent = (n: number | null) => (n === null ? '—' : percent.format(n));

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : date.format(d);
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${date.format(d)} ${d.toISOString().slice(11, 16)} UTC`;
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const STATUS_LABEL: Record<Shipment['status'], string> = {
  planned: 'Planned',
  confirmed: 'Confirmed',
  in_transit: 'In transit',
  customs: 'Customs',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

export const RISK_TYPE_LABEL: Record<string, string> = {
  LATE_SHIPMENT: 'Late shipment',
  ETA_SLIP: 'ETA slip',
  MISSING_ETA: 'Missing ETA',
  LOW_STOCK: 'Low stock',
};
