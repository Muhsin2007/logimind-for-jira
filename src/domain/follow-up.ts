import { cleanUntrusted } from './text';
import type { IsoDate, RiskEvent, RiskType, Severity, Shipment } from './types';

/**
 * Supplier follow-up message for a shipment risk. The facts are split like the copilot's tool
 * results: structured values (IDs, numbers, dates) that a draft may cite, and `importedText`
 * (free text from the uploaded CSV) that is cleaned, shown to the model as data only, and never
 * counted as evidence for a value in the draft.
 */
export interface FollowUpFacts {
  shipmentId: string;
  orderId: string | null;
  sku: string;
  qty: number;
  status: Shipment['status'];
  plannedArrival: IsoDate;
  eta: IsoDate | null;
  today: IsoDate;
  /** `days`: days late, ETA slip, or days to the planned arrival, depending on the type. */
  risks: { type: RiskType; severity: Severity; days: number | null }[];
  importedText: { supplier: string; productName: string | null; warehouse: string; carrier: string | null; trackingRef: string | null };
}

export interface DraftText {
  subject: string;
  body: string;
}

const MAX_TEXT = 80;
const DAYS_LABEL: Record<RiskType, string | null> = {
  LATE_SHIPMENT: 'Days late',
  ETA_SLIP: 'Slip (days)',
  MISSING_ETA: 'Days to planned arrival',
  LOW_STOCK: null,
};

export function followUpFacts(shipment: Shipment, risks: RiskEvent[], today: IsoDate): FollowUpFacts {
  return {
    shipmentId: shipment.id,
    orderId: shipment.orderId,
    sku: shipment.sku,
    qty: shipment.qty,
    status: shipment.status,
    plannedArrival: shipment.plannedArrival,
    eta: shipment.eta,
    today,
    risks: risks
      .filter((r) => r.entityType === 'shipment')
      .map((r) => {
        const value = r.evidence.find((e) => e.label === DAYS_LABEL[r.type])?.value;
        return { type: r.type, severity: r.severity, days: typeof value === 'number' ? value : null };
      }),
    importedText: {
      supplier: cleanUntrusted(shipment.supplier, MAX_TEXT) ?? '',
      productName: cleanUntrusted(shipment.productName, MAX_TEXT),
      warehouse: cleanUntrusted(shipment.warehouse, MAX_TEXT) ?? '',
      carrier: cleanUntrusted(shipment.carrier, MAX_TEXT),
      trackingRef: cleanUntrusted(shipment.trackingRef, MAX_TEXT),
    },
  };
}

/** Russian plural form (1 день, 2 дня, 5 дней). */
function ruDays(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  const word = abs >= 11 && abs <= 14 ? 'дней' : last === 1 ? 'день' : last >= 2 && last <= 4 ? 'дня' : 'дней';
  return `${n} ${word}`;
}
const enDays = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** Deterministic message used when the AI draft is unavailable or rejected. */
export function buildFollowUpTemplate(f: FollowUpFacts, locale: 'en' | 'ru'): DraftText {
  const t = f.importedText;
  const product = t.productName ? ` ${t.productName}` : '';
  const risk = (type: RiskType) => f.risks.find((r) => r.type === type);
  const late = risk('LATE_SHIPMENT');
  const slip = risk('ETA_SLIP');
  const missing = risk('MISSING_ETA');

  if (locale === 'ru') {
    const lines = [`Здравствуйте, ${t.supplier}!`, '', `Уточняем статус поставки ${f.shipmentId}${f.orderId ? ` (заказ ${f.orderId})` : ''}: ${f.qty} × ${f.sku}${product}, склад ${t.warehouse}.`];
    if (late?.days != null) lines.push(`Плановая дата прибытия — ${f.plannedArrival}; поставка опаздывает уже на ${ruDays(late.days)} и пока не получена.`);
    if (slip?.days != null && f.eta) lines.push(`Текущий ETA ${f.eta} на ${ruDays(slip.days)} позже плановой даты ${f.plannedArrival}.`);
    if (missing) lines.push(`У нас пока нет ETA по этой поставке; плановая дата прибытия — ${f.plannedArrival}.`);
    lines.push('', `Пожалуйста, подтвердите текущий статус и ожидаемую дату прибытия${t.trackingRef ? '' : ', а также номер для отслеживания'}.`, '', 'Спасибо!');
    return { subject: `Поставка ${f.shipmentId}: просим подтвердить дату прибытия`, body: lines.join('\n') };
  }

  const lines = [`Hello ${t.supplier},`, '', `We are following up on shipment ${f.shipmentId}${f.orderId ? ` (order ${f.orderId})` : ''}: ${f.qty} × ${f.sku}${product} for our ${t.warehouse} warehouse.`];
  if (late?.days != null) lines.push(`It was planned to arrive on ${f.plannedArrival} and is now ${enDays(late.days)} past that date without being received.`);
  if (slip?.days != null && f.eta) lines.push(`The current ETA ${f.eta} is ${enDays(slip.days)} later than the planned arrival on ${f.plannedArrival}.`);
  if (missing) lines.push(`We have no ETA for it yet; the planned arrival is ${f.plannedArrival}.`);
  lines.push('', `Could you please confirm the current status and the expected arrival date${t.trackingRef ? '' : ', and share a tracking reference'}?`, '', 'Thank you,');
  return { subject: `Shipment ${f.shipmentId}: please confirm the arrival date`, body: lines.join('\n') };
}

const DATE = /\b\d{4}-\d{2}-\d{2}\b/g;
/** Record-like tokens: capitals, a hyphen, digits (SHP-1004, SKU-04, PO-504). Same shape the copilot checks. */
const ID_IN_TEXT = /\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[A-Z]*\d[A-Z0-9]*\b/g;
const NUMBER = /\d+(?:[.,]\d+)?/g;
const LINK_OR_ADDRESS = /(https?:|www\.|[^\s@]+@[^\s@]+\.[a-z]{2,})/i;

/**
 * Checks a drafted message against the structured facts. Returns the first problem, or null if
 * every date, record ID and number in the text comes from them. Links and e-mail addresses are
 * never allowed: the facts contain none, so any would come from imported text or the model.
 */
export function checkDraftText(text: string, f: FollowUpFacts): string | null {
  if (LINK_OR_ADDRESS.test(text)) return 'link or address';
  const dates = new Set([f.plannedArrival, f.today, ...(f.eta ? [f.eta] : [])]);
  const ids = new Set([f.shipmentId, f.sku, ...(f.orderId ? [f.orderId] : [])].map((id) => id.toUpperCase()));
  const numbers = new Set([f.qty, ...f.risks.flatMap((r) => (r.days === null ? [] : [r.days]))]);
  for (const date of text.match(DATE) ?? []) if (!dates.has(date)) return `date ${date}`;
  const withoutDates = text.replace(DATE, ' ');
  for (const id of withoutDates.match(ID_IN_TEXT) ?? []) if (!ids.has(id.toUpperCase())) return `id ${id}`;
  for (const n of withoutDates.replace(ID_IN_TEXT, ' ').match(NUMBER) ?? []) {
    if (!numbers.has(Number(n.replace(',', '.')))) return `number ${n}`;
  }
  return null;
}
