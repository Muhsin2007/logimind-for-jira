import { describe, expect, it } from 'vitest';
import { buildFollowUpTemplate, checkDraftText, followUpFacts } from '../../src/domain/follow-up';
import type { RiskEvent, Shipment } from '../../src/domain/types';

const SHIPMENT: Shipment = {
  id: 'SHP-1004', orderId: 'PO-504', supplier: 'Tashkent Parts‮ LLC', sku: 'SKU-04', productName: 'Brake pads',
  qty: 120, plannedArrival: '2026-10-31', eta: '2026-11-12', actualArrival: null, status: 'in_transit',
  warehouse: 'Main', carrier: 'DHL', trackingRef: 'TRK-77',
};
const LATE: RiskEvent = {
  id: 'LATE_SHIPMENT:SHP-1004', type: 'LATE_SHIPMENT', severity: 'critical', entityType: 'shipment', entityKey: 'SHP-1004',
  title: 't', evidence: [{ label: 'Days late', value: 9 }, { label: 'Supplier', value: 'Tashkent Parts' }], ruleVersion: '1.2.0', evaluatedOn: '2026-11-09',
};
const SLIP: RiskEvent = { ...LATE, id: 'ETA_SLIP:SHP-1004', type: 'ETA_SLIP', severity: 'high', evidence: [{ label: 'Slip (days)', value: 12 }] };

const facts = followUpFacts(SHIPMENT, [LATE, SLIP], '2026-11-09');

describe('followUpFacts', () => {
  it('keeps structured facts apart from imported free text, which is cleaned', () => {
    expect(facts).toMatchObject({
      shipmentId: 'SHP-1004', orderId: 'PO-504', sku: 'SKU-04', qty: 120, status: 'in_transit',
      plannedArrival: '2026-10-31', eta: '2026-11-12', today: '2026-11-09',
      risks: [{ type: 'LATE_SHIPMENT', severity: 'critical', days: 9 }, { type: 'ETA_SLIP', severity: 'high', days: 12 }],
    });
    expect(facts.importedText).toEqual({ supplier: 'Tashkent Parts LLC', productName: 'Brake pads', warehouse: 'Main', carrier: 'DHL', trackingRef: 'TRK-77' });
  });
});

describe('buildFollowUpTemplate', () => {
  it('writes an English message from the facts only', () => {
    const d = buildFollowUpTemplate(facts, 'en');
    expect(d.subject).toBe('Shipment SHP-1004: please confirm the arrival date');
    expect(d.body).toContain('Hello Tashkent Parts LLC,');
    expect(d.body).toContain('shipment SHP-1004 (order PO-504): 120 × SKU-04 Brake pads');
    expect(d.body).toContain('planned to arrive on 2026-10-31 and is now 9 days past that date');
    expect(d.body).toContain('current ETA 2026-11-12 is 12 days later');
    expect(checkDraftText(`${d.subject}\n${d.body}`, facts)).toBeNull();
  });

  it('writes a Russian message with the same values', () => {
    const d = buildFollowUpTemplate(facts, 'ru');
    expect(d.subject).toBe('Поставка SHP-1004: просим подтвердить дату прибытия');
    expect(d.body).toContain('Здравствуйте, Tashkent Parts LLC!');
    expect(d.body).toContain('9 дней');
    expect(d.body).toContain('12 дней');
  });

  it('asks for an ETA when it is missing', () => {
    const missing = followUpFacts({ ...SHIPMENT, eta: null, orderId: null }, [{ ...LATE, id: 'MISSING_ETA:SHP-1004', type: 'MISSING_ETA', evidence: [{ label: 'Days to planned arrival', value: 3 }] }], '2026-11-09');
    const d = buildFollowUpTemplate(missing, 'en');
    expect(d.body).toContain('We have no ETA for it yet');
    expect(d.body).not.toContain('order');
  });
});

describe('checkDraftText', () => {
  it('accepts text that uses only values from the facts', () => {
    expect(checkDraftText('Shipment SHP-1004 (PO-504, SKU-04, 120 units) was due 2026-10-31, 9 days ago.', facts)).toBeNull();
  });

  it.each([
    ['a date not in the facts', 'Please deliver by 2026-11-20.', 'date 2026-11-20'],
    ['a number not in the facts', 'We need 500 units.', 'number 500'],
    ['an ID not in the facts', 'See SHP-9999.', 'id SHP-9999'],
    ['a link', 'Pay at https://evil.example now.', 'link or address'],
    ['an e-mail address', 'Write to x@y.com', 'link or address'],
    ['a bare domain', 'Use the portal pay.evil-example.com/inv today.', 'link or address'],
    ['non-ASCII digits', 'We need ５００ units.', 'non-ASCII digit'],
    ['a currency amount', 'A penalty of 120 $ applies.', 'currency'],
  ])('rejects %s', (_name, text, problem) => {
    expect(checkDraftText(text, facts)).toBe(problem);
  });

  it('ignores numbers that appear only in imported text (they are not trusted)', () => {
    const tricky = followUpFacts({ ...SHIPMENT, productName: 'Pads 300' }, [LATE], '2026-11-09');
    expect(checkDraftText('Pads 300', tricky)).toBe('number 300');
  });

  it('accepts a negative day count and fact IDs without a hyphen', () => {
    const missing: RiskEvent = { ...LATE, id: 'MISSING_ETA:SHP-1004', type: 'MISSING_ETA', evidence: [{ label: 'Days to planned arrival', value: -3 }] };
    const f = followUpFacts({ ...SHIPMENT, sku: 'ABC123' }, [missing], '2026-11-09');
    expect(checkDraftText('abc123 was due 3 days ago (-3).', f)).toBeNull();
  });
});

describe('imported text with links', () => {
  it('is dropped from the facts and the template', () => {
    const f = followUpFacts({ ...SHIPMENT, supplier: 'Acme pay.evil-example.com', productName: 'see www.x.io' }, [LATE], '2026-11-09');
    expect(f.importedText.supplier).toBe('');
    expect(f.importedText.productName).toBeNull();
    const en = buildFollowUpTemplate(f, 'en');
    expect(en.body.startsWith('Hello,')).toBe(true);
    expect(checkDraftText(en.body, f)).toBeNull();
    expect(buildFollowUpTemplate(f, 'ru').body.startsWith('Здравствуйте!')).toBe(true);
  });
});
