/**
 * English text for supplier reliability and the history-based arrival forecast (week 6).
 * Mounted as `t.supplier` in both dictionaries; Russian must have exactly the same shape.
 */
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

export const supplierEn = {
  title: 'Supplier reliability',
  desc: 'From the delivery history in the shipments file: how often deliveries arrived by the planned date and how late they usually were. Select a supplier to see only its shipments.',
  empty: 'No suppliers in the shipments file yet.',
  colSupplier: 'Supplier',
  colGrade: 'Grade',
  colOnTime: 'On time',
  colTypical: 'Usual delay',
  colOpen: 'Open',
  colLateNow: 'Late now',
  grade: { reliable: 'Reliable', watch: 'Watch', unreliable: 'Unreliable', new: 'Too little history' },
  onTime: (pct: string, onTime: number, deliveries: number) => `${pct} (${onTime} of ${deliveries})`,
  noDeliveries: 'No deliveries yet',
  typical: (n: number) => (n === 0 ? 'On time' : `+${days(n)}`),
  pick: (supplier: string) => `Show only shipments from ${supplier}`,
  table: 'Delivery record by supplier',
  showing: (supplier: string) => `Showing shipments from ${supplier}`,
  showAll: 'Show all suppliers',
  rules: (min: number, reliable: string, watch: string) =>
    `A grade needs at least ${min} deliveries. Reliable: ${reliable} or more on time; watch: ${watch} or more. The usual delay is the median over all deliveries (early counts as on time).`,

  forecastShort: (date: string) => `likely ${date}`,
  forecastTitle: (supplier: string, typical: number, shift: number, fromPlan: boolean) =>
    `${supplier} is usually ${days(typical)} late, so this shipment will probably arrive ${days(shift)} after its ${fromPlan ? 'planned date' : 'ETA'}.`,
  timelineForecast: 'Forecast',
  forecastHistory: (typical: number, shift: number, fromPlan: boolean) =>
    `plan + usual delay of ${days(typical)}; ${days(shift)} after the ${fromPlan ? 'plan' : 'ETA'}`,
  forecastKept: 'the ETA already allows for the usual delay',
  forecastPlan: 'not enough delivery history to adjust',
  forecastOnTime: 'the supplier is usually on time; date kept',
  factRecord: 'Delivery record',
  record: (grade: string, pct: string, onTime: number, deliveries: number, typical: string) =>
    `${grade}: ${pct} on time (${onTime} of ${deliveries}), usual delay ${typical}`,
  recordNew: (deliveries: number) => `Too little history (${deliveries} ${deliveries === 1 ? 'delivery' : 'deliveries'})`,

  chartLine: 'If late as usual',
  chartSummaryOut: (date: string) => ` If suppliers are as late as usual, it runs out on ${date}.`,
  chartNote: "The dashed line moves each open shipment to its planned date plus the supplier's usual delay, when that is later than the ETA.",
};

export type SupplierMessages = typeof supplierEn;
