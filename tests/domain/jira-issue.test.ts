import { describe, expect, it } from 'vitest';
import { buildIssueContent } from '../../src/domain/jira-issue';
import type { RiskEvent } from '../../src/domain/types';

const risk: RiskEvent = {
  id: 'LOW_STOCK:SKU-04@Samarkand', type: 'LOW_STOCK', severity: 'high', entityType: 'inventory', entityKey: 'SKU-04@Samarkand',
  title: 'SKU-04 at Samarkand is below safety stock',
  evidence: [{ label: 'Available', value: 3 }, { label: 'Inbound shipments', value: null }, { label: 'Note', value: '<script>alert(1)</script>' }],
  ruleVersion: '1.2.0', evaluatedOn: '2026-11-02',
};

describe('buildIssueContent', () => {
  it('builds summary, labels and an ADF description from the risk only', () => {
    const c = buildIssueContent(risk);
    expect(c.summary).toBe('[High] SKU-04 at Samarkand is below safety stock');
    expect(c.labels).toEqual(['logimind', 'logimind-low-stock']);
    expect(c.description).toMatchObject({ version: 1, type: 'doc' });
    const json = JSON.stringify(c.description);
    expect(json).toContain('Risk ID: LOW_STOCK:SKU-04@Samarkand');
    expect(json).not.toContain('Inbound shipments');
  });

  it('keeps imported text as plain ADF text nodes', () => {
    const items = buildIssueContent(risk).description.content.find((n) => n.type === 'bulletList')?.content ?? [];
    const note = items[1].content?.[0].content?.[1];
    expect(note).toEqual({ type: 'text', text: '<script>alert(1)</script>' });
  });

  it('collapses whitespace and caps the summary length', () => {
    const long = buildIssueContent({ ...risk, title: `A\n${'x'.repeat(400)}` }).summary;
    expect(long.length).toBe(250);
    expect(long).not.toContain('\n');
  });
});
