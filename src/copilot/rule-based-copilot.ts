import type { CitedStatement, CopilotAnswer, CopilotIntent, CopilotRecommendation, InventoryRow } from '../shared/api';
import { recommend } from './recommendations';
import type { CopilotToolbox, DataFreshness } from './tools';

export const MAX_QUESTION = 500;
const SUMMARY_WORDS = /\b(risk|risks|summary|overview|today|briefing|problem|issues)\b|риск|сводк|сегодня|обзор|проблем|xavf/i;
/** Candidate identifiers in a question: same character set as imported IDs. */
const TOKEN = /[A-Z0-9][A-Z0-9._/-]*/g;
/** A token shaped like a record ID (e.g. SHP-9999) that may not exist. */
const ID_LIKE = /^[A-Z]{2,6}-\d+$/;
const MAX_ENTITIES = 3;
const STALE_DAYS = 7;
const SUMMARY_SIZE = 5;

/**
 * Answers logistics questions without an AI model: it recognises which records a question
 * is about, calls the read-only tools, and states only what those tools returned.
 */
export class RuleBasedCopilot {
  constructor(private readonly tools: CopilotToolbox) {}

  async ask(rawQuestion: string): Promise<CopilotAnswer> {
    const question = rawQuestion.trim().slice(0, MAX_QUESTION);
    const [known, freshness] = await Promise.all([this.tools.listKnownIds(), this.tools.getDataFreshness()]);
    // Whole-token, case-insensitive matching against IDs that exist: "SKU-1" never matches "SKU-1-BLUE".
    const tokens = [...new Set((question.toUpperCase().match(TOKEN) ?? []).map((t) => t.replace(/[._/-]+$/, '')))];
    const shipmentByUpper = new Map(known.shipmentIds.map((id) => [id.toUpperCase(), id]));
    const skuByUpper = new Map(known.skus.map((id) => [id.toUpperCase(), id]));
    const shipmentIds = tokens.flatMap((t) => shipmentByUpper.get(t) ?? []);
    const skus = tokens.flatMap((t) => (shipmentByUpper.has(t) ? [] : skuByUpper.get(t) ?? []));
    const unknownIds = tokens.filter((t) => ID_LIKE.test(t) && !shipmentByUpper.has(t) && !skuByUpper.has(t));

    let intent: CopilotIntent = 'help';
    let body: Body = emptyBody();
    if (shipmentIds.length + skus.length > 0) {
      intent = shipmentIds.length > 0 ? 'shipment' : 'inventory';
      const entities = [...shipmentIds.map((id) => () => this.shipment(id)), ...skus.map((sku) => () => this.inventory(sku))];
      body = merge(await Promise.all(entities.slice(0, MAX_ENTITIES).map((load) => load())));
      if (entities.length > MAX_ENTITIES) {
        body.unknowns.push(`Only the first ${MAX_ENTITIES} of ${entities.length} mentioned records are answered; ask about the rest separately.`);
      }
    } else if (SUMMARY_WORDS.test(question)) {
      intent = 'risk_summary';
      body = await this.summary();
    } else if (unknownIds.length === 0) {
      body.facts.push({
        text: 'Ask about a shipment (e.g. "status of SHP-1004"), a SKU (e.g. "stock of SKU-03"), or "today\'s risk summary".',
        ids: [],
      });
    }
    for (const id of unknownIds) body.unknowns.push(`${id} was not found in the imported shipments or inventory.`);
    body.unknowns.push(...staleness(freshness));
    const linkError = intent === 'help' ? null : await this.tools.getLinkLookupError();
    if (linkError) body.unknowns.push(`Linked Jira issues could not be checked: ${linkError}`);

    const { today, shipmentsImportedAt, inventoryImportedAt } = freshness;
    return { mode: 'rules', intent, question, ...body, dataAsOf: { today, shipmentsImportedAt, inventoryImportedAt } };
  }

  private async shipment(id: string): Promise<Body> {
    const detail = await this.tools.getShipment(id);
    const out = emptyBody();
    if (!detail) {
      out.unknowns.push(`${id} was not found in the imported shipments.`);
      return out;
    }
    const s = detail.shipment;
    out.facts.push({
      text: `${s.id}: ${s.qty} × ${s.sku}${s.productName ? ` (${s.productName})` : ''} from ${s.supplier} to ${s.warehouse}; status ${s.status.replaceAll('_', ' ')}, planned ${s.plannedArrival}, ETA ${s.eta ?? 'not provided'}${s.actualArrival ? `, arrived ${s.actualArrival}` : ''}.`,
      ids: [s.id],
    });
    if (detail.risks.length === 0) out.facts.push({ text: `No risk rule is triggered for ${s.id}.`, ids: [s.id] });

    const stock = detail.inventory ? await this.tools.getInventory(s.sku) : [];
    for (const risk of detail.risks) {
      out.facts.push({ text: `${capitalise(risk.severity)} risk: ${risk.title}.`, ids: [risk.id] });
      const issue = await this.tools.getLinkedJiraIssue(risk.id);
      if (issue) {
        out.facts.push({ text: `Tracked in Jira as ${issue.issueKey}${issue.status ? ` (${issue.status.statusName})` : ''}.`, ids: [issue.issueKey, risk.id] });
      }
      out.recommendations.push(...recommend(risk, { shipment: s, stock }));
    }
    if (detail.inventory) {
      const inv = detail.inventory;
      out.facts.push({
        text: `Stock of ${inv.sku} at ${inv.warehouse}: ${inv.available} available, ${inv.inboundSoon} inbound within 7 days, safety stock ${inv.safetyStock}.`,
        ids: [`${inv.sku}@${inv.warehouse}`],
      });
      // A delayed shipment matters most when its destination is already short of the SKU.
      if (inv.risk) {
        out.facts.push({ text: `Destination stock is also at risk: ${inv.risk.title}.`, ids: [inv.risk.id] });
        out.recommendations.push(...recommend(inv.risk, { stock }));
      }
    } else {
      out.unknowns.push(`No inventory record for ${s.sku} at ${s.warehouse}, so the stock impact of ${s.id} is unknown.`);
    }
    if (!s.eta && !s.actualArrival) out.unknowns.push(`${s.id} has no ETA, so its arrival date cannot be estimated.`);
    if (!s.carrier) out.unknowns.push(`No carrier is recorded for ${s.id}.`);
    return out;
  }

  private async inventory(sku: string): Promise<Body> {
    const rows = await this.tools.getInventory(sku);
    const out = emptyBody();
    if (rows.length === 0) {
      out.unknowns.push(`${sku} has no inventory record; only shipments mention it.`);
      return out;
    }
    for (const row of rows) {
      out.facts.push({ text: stockFact(row), ids: [`${row.sku}@${row.warehouse}`] });
      if (row.risk) {
        out.facts.push({ text: `${capitalise(row.risk.severity)} risk: ${row.risk.title}.`, ids: [row.risk.id] });
        out.recommendations.push(...recommend(row.risk, { stock: rows }));
      }
      if (row.unitCost === null) out.unknowns.push(`Unit cost of ${row.sku} at ${row.warehouse} is not provided, so the value at risk is unknown.`);
    }
    return out;
  }

  private async summary(): Promise<Body> {
    const s = await this.tools.getRiskSummary({ limit: SUMMARY_SIZE });
    const out = emptyBody();
    out.facts.push({
      text: `${s.total} open risk${s.total === 1 ? '' : 's'} on ${s.today}: ${s.bySeverity.critical} critical, ${s.bySeverity.high} high, ${s.bySeverity.medium} medium, ${s.bySeverity.low} low.${s.total > s.top.length ? ` The ${s.top.length} most severe are listed; see the Risk Center for all.` : ''}`,
      ids: [],
    });
    for (const risk of s.top) out.facts.push({ text: `${capitalise(risk.severity)}: ${risk.title}.`, ids: [risk.id] });
    for (const risk of s.top.slice(0, 3)) {
      const shipment = risk.entityType === 'shipment' ? (await this.tools.getShipment(risk.entityKey))?.shipment : null;
      const stock = risk.type === 'LOW_STOCK' ? await this.tools.getInventory(risk.entityKey.split('@')[0]) : [];
      out.recommendations.push(...recommend(risk, { shipment, stock }));
    }
    if (s.total === 0) out.facts.push({ text: 'No risk rule is triggered by the current data.', ids: [] });
    return out;
  }
}

type Body = Pick<CopilotAnswer, 'facts' | 'recommendations' | 'unknowns'>;

const emptyBody = (): Body => ({ facts: [], recommendations: [], unknowns: [] });

function merge(parts: Body[]): Body {
  const seen = new Set<string>();
  const recommendations: CopilotRecommendation[] = [];
  for (const r of parts.flatMap((p) => p.recommendations)) {
    if (seen.has(r.text)) continue;
    seen.add(r.text);
    recommendations.push(r);
  }
  return {
    facts: parts.flatMap((p): CitedStatement[] => p.facts),
    recommendations,
    unknowns: [...new Set(parts.flatMap((p) => p.unknowns))],
  };
}

function stockFact(row: InventoryRow): string {
  return `${row.sku} at ${row.warehouse}: ${row.onHand} on hand, ${row.reserved} reserved, ${row.available} available, ${row.inboundSoon} inbound within 7 days, safety stock ${row.safetyStock}.`;
}

/** Missing or stale imports, stated deterministically (shared with the AI copilot). */
export function staleness(f: DataFreshness): string[] {
  const out: string[] = [];
  const check = (label: string, at: string | null, hasData: boolean) => {
    if (!at) {
      // Import history keeps only recent batches, so data can exist without a recorded import time.
      out.push(hasData ? `The ${label} import time is no longer in the import history, so its freshness is unknown.` : `No ${label} data has been imported.`);
    } else if ((Date.parse(`${f.today}T00:00:00Z`) - Date.parse(at)) / 86_400_000 > STALE_DAYS) {
      out.push(`${capitalise(label)} data was last imported ${at.slice(0, 10)} and may be stale.`);
    }
  };
  check('shipment', f.shipmentsImportedAt, f.hasShipments);
  check('inventory', f.inventoryImportedAt, f.hasInventory);
  return out;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
