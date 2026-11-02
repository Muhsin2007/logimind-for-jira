import type { RiskEvent, RiskType, Severity } from './types';

const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const RISK_TYPE_LABEL: Record<RiskType, string> = {
  LATE_SHIPMENT: 'Late shipment',
  ETA_SLIP: 'ETA slip',
  MISSING_ETA: 'Missing ETA',
  LOW_STOCK: 'Low stock',
};
const MAX_SUMMARY = 250;

/** Atlassian Document Format node (only the subset used here). */
export interface AdfNode {
  type: string;
  text?: string;
  content?: AdfNode[];
  marks?: { type: string }[];
}

export interface IssueContent {
  summary: string;
  description: { version: 1; type: 'doc'; content: AdfNode[] };
  labels: string[];
}

const text = (value: string, strong = false): AdfNode => ({ type: 'text', text: value, ...(strong ? { marks: [{ type: 'strong' }] } : {}) });
const paragraph = (...content: AdfNode[]): AdfNode => ({ type: 'paragraph', content });

/**
 * Builds the Jira issue for a risk from a fixed template. Imported values only ever appear
 * as plain ADF text nodes (never markup), and nothing is added that the risk does not contain.
 */
export function buildIssueContent(risk: RiskEvent): IssueContent {
  // Truncate by code point so Cyrillic or emoji titles never end in half a character.
  const summary = Array.from(`[${SEVERITY_LABEL[risk.severity]}] ${risk.title}`.replace(/\s+/g, ' ')).slice(0, MAX_SUMMARY).join('');
  const evidence = risk.evidence
    .filter((e) => e.value !== null && e.value !== '')
    .map((e) => ({ type: 'listItem', content: [paragraph(text(`${e.label}: `, true), text(String(e.value)))] }));

  return {
    summary,
    description: {
      version: 1,
      type: 'doc',
      content: [
        paragraph(
          text('LogiMind detected a '),
          text(`${RISK_TYPE_LABEL[risk.type]} (${SEVERITY_LABEL[risk.severity]})`, true),
          text(` risk for ${risk.entityType} ${risk.entityKey}.`),
        ),
        ...(evidence.length > 0 ? [paragraph(text('Evidence from imported data', true)), { type: 'bulletList', content: evidence }] : []),
        paragraph(text(`Risk ID: ${risk.id} · Rule v${risk.ruleVersion} · Evaluated ${risk.evaluatedOn}`)),
        paragraph(text('Created from LogiMind for Jira. Values are copied from the imported logistics data and were not changed or estimated.')),
      ],
    },
    labels: ['logimind', `logimind-${risk.type.toLowerCase().replace(/_/g, '-')}`],
  };
}
