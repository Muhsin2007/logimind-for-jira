import type { RiskEvent } from '../../../../src/shared/api';
import type { Formatters } from '../format';
import { loopEn } from './loop-en';

/** A value from a risk's rule evidence (labels are fixed by the rule engine). */
export const ev = (risk: RiskEvent, label: string): string | number | null => risk.evidence.find((e) => e.label === label)?.value ?? null;
export const num = (risk: RiskEvent, label: string): number | null => {
  const value = ev(risk, label);
  return typeof value === 'number' ? value : null;
};
export const str = (risk: RiskEvent, label: string): string => String(ev(risk, label) ?? '—');
export const numText = (risk: RiskEvent, label: string, fmt: Formatters): string => {
  const value = num(risk, label);
  return value === null ? '—' : fmt.number(value);
};
const daysEn = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const STATUS_EN = {
  planned: 'Planned',
  confirmed: 'Confirmed',
  in_transit: 'In transit',
  customs: 'Customs',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/**
 * English UI text: the default language and the reference for every other dictionary.
 * `Messages` is derived from this object, so another language that misses or adds a key
 * does not compile (and tests/ui/i18n.test.ts checks the same at runtime).
 */
export const en = {
  appSubtitle: 'Logistics risk, shipments and stock — inside Jira.',
  language: 'Language',
  sections: 'LogiMind sections',
  tabs: {
    dashboard: 'Dashboard',
    shipments: 'Shipments',
    inventory: 'Inventory',
    whatIf: 'What-if',
    risks: 'Risk Center',
    copilot: 'Copilot',
    import: 'Import & Settings',
  },

  // Shared states
  loading: 'Loading…',
  somethingWrong: 'Something went wrong.',
  retry: 'Retry',
  cancel: 'Cancel',
  none: 'None',
  ofTotal: (shown: number, total: number) => `${shown} of ${total}`,

  severity: { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' },
  status: STATUS_EN,
  riskType: { LATE_SHIPMENT: 'Late shipment', ETA_SLIP: 'ETA slip', MISSING_ETA: 'Missing ETA', LOW_STOCK: 'Low stock' },
  importKind: { shipments: 'shipments', inventory: 'inventory' },
  /** Risk evidence labels exactly as the rule engine produces them. */
  evidence: {
    'Days late': 'Days late',
    Supplier: 'Supplier',
    SKU: 'SKU',
    Qty: 'Qty',
    Status: 'Status',
    'Planned arrival': 'Planned arrival',
    ETA: 'ETA',
    'Slip (days)': 'Slip (days)',
    'Days to planned arrival': 'Days to planned arrival',
    'On hand': 'On hand',
    Reserved: 'Reserved',
    Available: 'Available',
    'Inbound within 7 days': 'Inbound within 7 days',
    Projected: 'Projected',
    'Safety stock': 'Safety stock',
    'Inbound shipments': 'Inbound shipments',
  } as Record<string, string>,
  /** The rule engine writes its titles in English, so the English UI shows them unchanged. */
  riskTitle: (risk: RiskEvent) => risk.title,

  // Dashboard
  loadingDashboard: 'Loading dashboard…',
  noDataTitle: 'No logistics data yet',
  noDataText: 'Import shipment and inventory CSV files, or load the synthetic demo dataset to explore LogiMind.',
  loadDemo: 'Load demo data',
  loadingDemo: 'Loading demo data…',
  importCsv: 'Import CSV',
  kpiOpenShipments: 'Open shipments',
  kpiOpenHint: (inTransit: string, total: string) => `${inTransit} in transit · ${total} total`,
  kpiLate: 'Late shipments',
  kpiLateHint: 'Past planned arrival, not delivered',
  kpiOnTime: 'On-time delivery',
  kpiOnTimeHint: (delivered: string) => `${delivered} delivered shipments`,
  kpiBelowSafety: 'SKUs below safety stock',
  kpiBelowSafetyHint: 'After inbound due within 7 days',
  kpiValueAtRisk: 'Stock value at risk',
  kpiValueAtRiskHint: 'Shortfall × unit cost (file currency)',
  openRisks: (n: number) => `Open risks (${n})`,
  openRisksBySeverity: 'Open risks by severity',
  toRiskCenter: 'Risk Center →',
  ruleScoreNote: (date: string) => `Rule-based risk score (deterministic rules, evaluated ${date}). Not a statistical prediction.`,
  topRisks: 'Top risks',
  noOpenRisks: 'No open risks.',
  recentImports: 'Recent imports',
  noImportsRecorded: 'No imports recorded.',
  colFile: 'File',
  colType: 'Type',
  colImported: 'Imported',
  colRows: 'Rows',
  colValid: 'Valid',
  colRejected: 'Rejected',

  // Shipments
  loadingShipments: 'Loading shipments…',
  noShipmentsTitle: 'No shipments imported',
  noShipmentsText: 'Import a shipments CSV from Import & Settings.',
  searchShipments: 'Search ID, supplier, SKU, warehouse…',
  searchShipmentsLabel: 'Search shipments',
  filterStatus: 'Filter by status',
  allStatuses: 'All statuses',
  atRiskOnly: 'At risk only',
  colShipment: 'Shipment',
  colSupplier: 'Supplier',
  colSku: 'SKU',
  colQty: 'Qty',
  colPlanned: 'Planned',
  colEta: 'ETA',
  colStatus: 'Status',
  colWarehouse: 'Warehouse',
  colRisk: 'Risk',
  arrivedOn: (date: string) => `Arrived ${date}`,
  noShipmentsMatch: 'No shipments match these filters.',

  // Inventory
  loadingInventory: 'Loading inventory…',
  noInventoryTitle: 'No inventory imported',
  noInventoryText: 'Import an inventory CSV from Import & Settings.',
  searchInventory: 'Search SKU, product, warehouse…',
  searchInventoryLabel: 'Search inventory',
  belowSafetyOnly: 'Below safety stock only',
  inventoryNote: 'Available = on hand − reserved. Projected adds open, on-time inbound shipments due within 7 days.',
  colProduct: 'Product',
  colOnHand: 'On hand',
  colReserved: 'Reserved',
  colAvailable: 'Available',
  colInbound7: 'Inbound 7d',
  colProjected: 'Projected',
  colSafety: 'Safety',
  colCoverage: 'Coverage',
  colUnitCost: 'Unit cost',
  coverageLabel: 'Coverage of safety stock',
  coverageText: (pct: number) => `${pct}% of safety stock`,
  noInventoryMatch: 'No inventory rows match these filters.',

  // Risk Center
  evaluatingRules: 'Evaluating risk rules…',
  noRisksTitle: 'No open risks',
  noRisksText: 'All shipments and stock levels pass the current rules.',
  filterSeverity: 'Filter by severity',
  allSeverities: 'All severities',
  filterRiskType: 'Filter by risk type',
  allRiskTypes: 'All risk types',
  evaluatedOn: (date: string) => `evaluated ${date}`,
  viewShipment: (id: string) => `View shipment ${id}`,
  viewInventory: 'View inventory',
  ruleVersion: (v: string) => `Rule v${v}`,
  jiraLinksUnavailable: (message: string) => `Jira links unavailable: ${message}`,
  loadingJiraLink: 'Loading Jira link…',
  noRisksMatch: 'No risks match these filters.',
  jiraStatusNotRefreshed: (message: string) => `Jira status could not be refreshed: ${message}`,

  // Jira issues
  issueCategory: { new: 'To do', indeterminate: 'In progress', done: 'Done', unknown: 'Unknown' },
  openInJira: 'Open in Jira (new tab)',
  justCreated: 'just created — status appears in a moment',
  statusUnavailable: 'status unavailable (deleted or no access)',
  jiraNotConfigured: 'Jira project not configured (Import & Settings)',
  createIssue: 'Create Jira issue',
  confirmIssue: 'Confirm issue creation',
  createIssueIn: (type: string, project: string, key: string) => `Create a ${type} in ${project} (${key})?`,
  create: 'Create',
  creating: 'Creating…',
  createdIssue: (key: string) => `Created ${key}`,

  // Shipment drawer
  shipment: 'Shipment',
  closeShipment: 'Close shipment details',
  shipmentNotFound: (id: string) => `Shipment ${id} was not found in the current dataset.`,
  factStatus: 'Status',
  factSupplier: 'Supplier',
  factOrder: 'Order',
  factSku: 'SKU',
  factProduct: 'Product',
  factQuantity: 'Quantity',
  factWarehouse: 'Warehouse',
  factPlanned: 'Planned arrival',
  factEta: 'ETA',
  factActual: 'Actual arrival',
  factCarrier: 'Carrier',
  factTracking: 'Tracking ref',
  risksCount: (n: number) => `Risks (${n})`,
  risksLabel: 'Risks',
  noShipmentRule: 'No rule is triggered for this shipment.',
  stockAtDestination: 'Stock at destination',
  factAvailable: 'Available',
  factInbound7: 'Inbound ≤ 7 days',
  factProjected: 'Projected',
  factSafety: 'Safety stock',
  factStockRisk: 'Stock risk',
  noInventoryRecord: (sku: string, warehouse: string) => `No inventory record for ${sku} at ${warehouse}.`,

  // Issue sidebar
  notFromLogiMind: 'This issue was not created from a LogiMind risk.',
  stillActive: (date: string) => `Still active in the current data (evaluated ${date}).`,
  noLongerActive: 'No longer active: the condition is resolved in the current data.',
  createdAt: (date: string) => `created ${date}`,
  factShipment: 'Shipment',
  factQty: 'Qty',
  factPlannedShort: 'Planned',
  shipmentNotInData: (id: string) => `Shipment ${id} is not in the current dataset.`,

  // Copilot
  aiNotice: 'AI by Claude on Atlassian.',
  aiNoticeDetail: 'Every ID, number and date is checked against your data.',
  askLabel: 'Ask about shipments, stock or risks',
  askPlaceholder: 'e.g. Status of SHP-1004',
  ask: 'Ask',
  answering: 'Answering…',
  examplesLabel: 'Example questions',
  examples: ["Today's risk summary", 'Which delays hurt stock the most?', 'Why is SHP-1004 a problem and what should I do?', 'Stock of SKU-10', 'Where is SHP-9999?'],
  ruleBasedAnswer: 'Rule-based answer.',
  /** English shows the server's own reason; other languages explain it in their own words. */
  fallbackText: (reason: string) => reason,
  verifiedFacts: 'Verified facts',
  noMatchingRecords: 'No matching records in the current data.',
  nextSteps: 'Recommended next steps',
  noActionSuggested: 'No action is suggested: the data does not support one.',
  priority: { high: 'high priority', medium: 'medium priority', low: 'low priority' },
  confidence: { high: 'high', medium: 'medium', low: 'low' },
  basedOn: (evidence: string, confidence: string) => `Based on: ${evidence} · confidence ${confidence}`,
  unknownData: 'Unknown or missing data',
  sources: 'Sources',
  shipmentsImportedAt: (date: string) => `shipments imported ${date}`,
  inventoryImportedAt: (date: string) => `inventory imported ${date}`,
  evaluated: (date: string) => `Evaluated ${date}`,
  modeRules: 'mode: rules, no AI',
  modeLlm: 'mode: AI (Forge LLM), IDs and numbers verified',

  // Import & Settings
  importTitle: 'Import CSV',
  importIntro:
    'Upload a shipments or inventory CSV (UTF-8, comma, semicolon or tab separated as exported by Excel, max 1 MB). The file type is detected from its header; if your supplier uses other column names, AI proposes a column mapping for you to confirm. Each import replaces the current dataset of that type; rows that fail validation are rejected and listed below, never silently used.',
  adminOnly: 'Only Jira administrators can import, load or delete data. You can view everything else.',
  csvFiles: 'CSV files',
  importingAi: 'Importing… (unrecognised columns are mapped with AI)',
  confirmMappingFirst: 'Confirm or cancel the column mapping below first.',
  pasteSummary: 'Or paste rows copied from Excel',
  pasteHelp: 'Copy the cells including the header row from Excel or Google Sheets and paste them here.',
  importPasted: 'Import pasted rows',
  fileTooLarge: 'File is larger than 1 MB',
  fileFormats: 'File formats',
  formatShipments: 'Shipments',
  formatInventory: 'Inventory',
  formatNote: '* required. Dates as YYYY-MM-DD. Status: planned, confirmed, in_transit, customs, delivered, cancelled.',
  demoTitle: 'Demo and data management',
  demoText: 'Load a synthetic dataset (30 shipments, 12 stock positions) with dates relative to today. It replaces current data.',
  rowLimit: 'Imports are limited to 2,000 rows per file.',
  deleteAll: 'Delete all data…',
  confirmDelete: 'Confirm delete',
  deleteQuestion: 'Delete all shipments, inventory, import history and risk-to-issue links? Jira issues are not deleted.',
  delete: 'Delete',
  deleting: 'Deleting…',
  importHistory: 'Import history',
  noImportsYet: 'No imports yet.',
  importedRows: (valid: number, total: number, kind: string) => `${valid} of ${total} ${kind} rows imported`,
  rejectedRows: (n: number) => `, ${n} rejected`,
  keptExisting: ' No valid rows — existing data was kept.',
  notImported: 'File was not imported.',
  colLine: 'Line',
  colField: 'Field',
  colProblem: 'Problem',

  // Column mapping
  mappingFor: (file: string) => `Column mapping for ${file}`,
  columnsNotRecognised: 'the columns were not recognised.',
  aiProposed: 'The AI (Atlassian-hosted Forge LLM) proposed this mapping from the column names and the first rows.',
  checkBeforeImport: 'Check it before importing.',
  matchedByName: 'Columns were matched by name.',
  onlyNamesMapped: 'Only column names are mapped; values are never changed and every row is validated as usual.',
  fileType: 'File type',
  fileKind: { shipments: 'Shipments', inventory: 'Inventory' },
  dataRows: (n: number) => `${n} data row${n === 1 ? '' : 's'}`,
  colInYourFile: 'Column in your file',
  colFirstValues: 'First values',
  colLogiMindField: 'LogiMind field',
  noName: '(no name)',
  fieldForColumn: (name: string) => `Field for column ${name}`,
  ignoreColumn: '— ignore this column —',
  shapeWholeNumbers: 'whole numbers',
  shapeDates: 'dates (YYYY-MM-DD)',
  shapeNumbers: 'numbers',
  shapeWarning: (label: string) => `The first values are not all ${label}; check that this is the right column. Rows that do not fit are rejected.`,
  mapRequiredFirst: (fields: string) => `Map the required field(s) first: ${fields}`,
  importWithMapping: 'Import with this mapping',
  importing: 'Importing…',
  /** Shown next to each target field in the mapping step (the server's descriptions go to the model). */
  fieldHelp: {
    shipment_id: 'unique shipment / consignment / delivery number',
    order_id: 'purchase order number',
    supplier: 'supplier or vendor name',
    sku: 'item code / article / part number',
    product_name: 'item description',
    qty: 'shipped quantity (whole number)',
    planned_arrival: 'originally promised arrival date',
    eta: 'latest estimated arrival date',
    actual_arrival: 'date actually received',
    status: 'shipment status (planned, confirmed, in transit, customs, delivered, cancelled)',
    warehouse: 'warehouse / location',
    carrier: 'carrier / forwarder',
    tracking_ref: 'tracking, AWB or bill of lading number',
    on_hand: 'physical stock on hand (whole number)',
    reserved: 'quantity reserved / allocated',
    inbound_qty: 'quantity on order / inbound',
    safety_stock: 'safety stock / minimum / reorder level',
    unit_cost: 'cost per unit',
    daily_usage: 'average units used or sold per day',
    updated_at: 'date the stock figure was taken',
  } as Record<string, string>,

  // Days of cover (inventory, drawer, what-if)
  colDailyUsage: 'Use / day',
  colDaysOfCover: 'Days of cover',
  daysShort: (n: number) => `${n} d`,
  beyondHorizon: (n: number) => `> ${n} d`,
  runsOutOn: (date: string) => `out ${date}`,
  noUsage: 'No daily_usage in the inventory file',
  coverNote:
    'Days of cover uses daily_usage from the inventory file and every open inbound shipment on its expected arrival date; overdue shipments are not counted. It is a projection, not a risk rule.',
  factDailyUsage: 'Daily usage',
  factDaysOfCover: 'Days of cover',
  factStockOut: 'Projected stock-out',
  factBelowSafetyFrom: 'Below safety stock from',
  notProjected: 'not projected (no daily usage)',
  beyondHorizonLong: (n: number) => `more than ${n} days`,
  simulateDelay: 'Simulate a delay →',

  // What-if
  whatIfIntro: 'What happens to stock if shipments arrive later? Read-only: nothing is saved, and no risk or Jira issue changes.',
  loadingWhatIf: 'Loading shipments and stock…',
  whatIfNoData: 'Import shipments and inventory first.',
  noUpcoming: 'There are no open, upcoming shipments to delay. Overdue, delivered and cancelled shipments are not included.',
  delayWhat: 'What to delay',
  modeShipment: 'One shipment',
  modeSupplier: 'All upcoming shipments of a supplier',
  chooseShipment: 'Shipment',
  chooseSupplier: 'Supplier',
  shipmentOption: (id: string, sku: string, warehouse: string, date: string) => `${id} · ${sku} → ${warehouse} · ${date}`,
  delayBy: 'Delay',
  delayDays: (n: number) => `${n} day${n === 1 ? '' : 's'}`,
  notUpcoming: (id: string) => `${id} cannot be delayed here: it is no longer an open, upcoming shipment. Showing the next one instead.`,
  moveSlider: 'Move the slider to see the effect of a delay.',
  summaryWorse: (count: number, delay: string) => `With a delay of ${delay}, ${count} stock position${count === 1 ? '' : 's'} get${count === 1 ? 's' : ''} worse.`,
  summaryNone: (delay: string) => `With a delay of ${delay}, no stock position gets worse.`,
  delayedShipments: 'Delayed shipments',
  arrivalMove: (from: string, to: string) => `${from} → ${to}`,
  impactTitle: 'Stock impact',
  colLowStock: 'Low-stock risk',
  colStockOut: 'Stock-out',
  colBelowSafety: 'Below safety from',
  colChange: 'Change',
  today: 'today',
  withDelay: 'with delay',
  worse: 'Worse',
  noChange: 'No change',
  okLevel: 'OK',
  untracked: (keys: string) => `No inventory record for ${keys}, so the stock impact is unknown.`,

  // Jira settings
  jiraIntegration: 'Jira integration',
  issuesCreatedIn: (project: string, key: string, type: string) => `Risk issues are created in ${project} (${key}) as ${type}`,
  updatedAt: (date: string) => `updated ${date}`,
  noProjectChosen: 'No Jira project chosen yet, so "Create Jira issue" is disabled.',
  createdAsUser: "Issues are created as the user who clicks the button, so Jira's project permissions apply.",
  project: 'Project',
  chooseProject: 'Choose a project…',
  issueType: 'Issue type',
  save: 'Save',
  saving: 'Saving…',
  savedConfig: (project: string, type: string) => `Saved: new issues go to ${project} as ${type}.`,
  // Shell and shared components (redesign)
  pageDesc: {
    dashboard: 'What needs attention across shipments and stock, from the latest rule evaluation.',
    shipments: 'Every imported shipment with its status, arrival dates and open risks.',
    inventory: 'Stock per SKU and warehouse: available, inbound, safety stock and days of cover.',
    whatIf: 'Simulate a shipment or supplier delay and see which stock positions get worse.',
    risks: 'Open risks from the deterministic rules: why each one matters and what to do next.',
    copilot: 'Ask about shipments, stock and risks in plain language; every answer cites your records.',
    import: 'Bring in CSV files, manage the dataset and choose where Jira issues are created.',
  },
  moreInfo: 'What this number means',

  // Dashboard (redesign)
  attentionTitle: (n: number) => (n === 1 ? '1 critical or high risk needs attention' : `${n} critical or high risks need attention`),
  attentionText: (critical: number, high: number) => `${critical} critical · ${high} high. Start with the top risks below.`,
  allClearTitle: 'No critical or high risks',
  allClearText: 'Shipments and stock pass the rules at the critical and high levels.',
  reviewRisks: 'Review risks',
  kpiInfoOpen: 'Shipments that are not delivered or cancelled and have no actual arrival date.',
  kpiInfoLate: 'Open shipments whose planned arrival date is before today. A later ETA does not reset this.',
  kpiInfoOnTime: 'Share of delivered shipments that arrived on or before their planned arrival date.',
  kpiInfoBelowSafety: 'Stock positions (a SKU at a warehouse) whose projected stock — available plus inbound due within 7 days — is below safety stock.',
  kpiInfoValue: 'Unit cost × units missing to reach safety stock, summed over positions that have a unit cost in the file. The currency is the one used in the file.',
  noDeliveriesYet: 'no delivered shipments yet',
  riskDistribution: 'Risk distribution',
  viewAll: 'View all',
  viewShipmentsLink: 'Shipments',
  viewStockLink: 'Inventory',

  // Shipments (redesign)
  filterRisk: 'Filter by risk',
  riskFilterAll: 'All',
  riskFilterAt: 'At risk',
  riskFilterNone: 'No risk',
  etaSlip: (n: number) => `+${n} d`,
  etaSlipTitle: (n: number) => `ETA is ${daysEn(n)} after the planned date`,
  clearFilters: 'Clear filters',

  // Shipment drawer (redesign)
  secOverview: 'Overview',
  secSupplier: 'Supplier and carrier',
  secTimeline: 'Delivery timeline',
  secImpact: 'Warehouse and inventory impact',
  secRisks: 'Related risks and Jira issues',
  timelinePlanned: 'Planned arrival',
  timelineEta: 'Latest ETA',
  timelineActual: 'Received',
  timelineNoEta: 'No ETA in the data',
  timelineNotYet: 'Not received yet',
  overdueBy: (n: number) => `passed ${daysEn(n)} ago, not received`,
  vsPlan: (days: number) => (days === 0 ? 'on the planned date' : days > 0 ? `${daysEn(days)} after plan` : `${daysEn(-days)} before plan`),

  // Inventory (redesign)
  sumPositions: 'Stock positions',
  sumCritical: 'No stock available',
  sumBelow: 'Below safety stock',
  sumNoUsage: 'Without daily usage',
  stockFilter: 'Filter stock positions',
  stockFilterAll: 'All',
  onHandReserved: (onHand: string, reserved: string) => `${onHand} on hand · ${reserved} reserved`,
  inboundVia: (ids: string) => `via ${ids}`,
  colProjectedVsSafety: 'Projected / safety',

  // Risk Center (redesign): sentences use only the rule's own evidence
  riskWhy: 'Why it matters',
  riskImpact: 'Business impact',
  riskNextStep: 'Next step',
  riskEvidence: 'Rule evidence',
  whyText: (r: RiskEvent, fmt: Formatters): string => {
    const n = num(r, r.type === 'LATE_SHIPMENT' ? 'Days late' : r.type === 'ETA_SLIP' ? 'Slip (days)' : 'Days to planned arrival');
    switch (r.type) {
      case 'LATE_SHIPMENT':
        return `Planned to arrive on ${fmt.date(str(r, 'Planned arrival'))} and still not delivered${n === null ? '' : ` — ${daysEn(n)} late`}.`;
      case 'ETA_SLIP':
        return `The latest ETA (${fmt.date(str(r, 'ETA'))}) is ${n === null ? 'later than' : `${daysEn(n)} after`} the planned date (${fmt.date(str(r, 'Planned arrival'))}).`;
      case 'MISSING_ETA': {
        const status = STATUS_EN[ev(r, 'Status') as keyof typeof STATUS_EN] ?? str(r, 'Status');
        const when = n === null ? '' : n >= 0 ? `; planned arrival is in ${daysEn(n)}` : `; planned arrival was ${daysEn(-n)} ago`;
        return `${status} with no ETA in the data${when}.`;
      }
      default: {
        const available = num(r, 'Available');
        return available !== null && available <= 0
          ? `Nothing is available now: ${numText(r, 'On hand', fmt)} on hand, ${numText(r, 'Reserved', fmt)} reserved.`
          : `Projected stock (${numText(r, 'Projected', fmt)}) is below the safety stock of ${numText(r, 'Safety stock', fmt)}.`;
      }
    }
  },
  impactText: (r: RiskEvent, fmt: Formatters): string => {
    const qty = num(r, 'Qty');
    const units = `${qty === null ? '' : `${fmt.number(qty)} units of `}${str(r, 'SKU')}`;
    switch (r.type) {
      case 'LATE_SHIPMENT':
        return `${units} from ${str(r, 'Supplier')} are not in the warehouse when planned.`;
      case 'ETA_SLIP':
        return `${units} arrive later than planned; stock that counts on them is short until then.`;
      case 'MISSING_ETA':
        return `${units} have no expected date, so they cannot be planned into stock.`;
      default: {
        const available = num(r, 'Available');
        const safety = num(r, 'Safety stock');
        const projected = num(r, 'Projected');
        const gap = safety === null || projected === null ? 0 : safety - projected;
        if (available !== null && available <= 0) return 'Demand at this warehouse cannot be served from stock until inbound stock arrives.';
        return gap > 0 ? `${fmt.number(gap)} units short of safety stock, even after inbound due within 7 days.` : 'Stock is below the safety level.';
      }
    }
  },
  nextText: (r: RiskEvent): string => {
    switch (r.type) {
      case 'LATE_SHIPMENT':
        return `Contact ${str(r, 'Supplier')} for a confirmed delivery date and update the ETA.`;
      case 'ETA_SLIP':
        return `Check which orders depend on ${str(r, 'SKU')} and whether the later ETA delays them.`;
      case 'MISSING_ETA':
        return `Ask ${str(r, 'Supplier')} or the carrier for an ETA.`;
      default: {
        const inbound = ev(r, 'Inbound shipments');
        return inbound
          ? `Prioritise receiving ${inbound}; if that is not enough, transfer stock or raise a replenishment order.`
          : 'Raise a replenishment order or transfer stock from another warehouse.';
      }
    }
  },

  // Import (redesign)
  stepsLabel: 'Import steps',
  steps: { upload: 'Upload', validate: 'Validate', map: 'Map columns', results: 'Results' },
  dropTitle: 'Drag and drop CSV files here',
  dropOr: 'or',
  browseFiles: 'choose files',
  dropHint: 'Shipments or inventory · UTF-8 CSV · up to 1 MB and 2,000 rows per file',
  howToFix: 'How to fix: correct these lines in your file (line 1 is the header) and import it again. An import replaces all data of that type, so the corrected file is used as a whole.',
  resultOk: 'Imported',
  resultPartial: 'Imported with rejected rows',
  resultFailed: 'Not imported',
  dangerZone: 'Danger zone',
  deleteTitle: 'Delete all LogiMind data?',

  // Copilot and sidebar (redesign)
  yourQuestion: 'Question',
  scenario: 'Scenario',
  sidebarRisk: 'LogiMind risk',

  // Daily check, automation and supplier follow-up
  loop: loopEn,
};

export type Messages = typeof en;
