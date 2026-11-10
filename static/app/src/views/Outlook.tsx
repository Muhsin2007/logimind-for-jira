import { useMemo } from 'react';
import { buildPipelineIndex } from '../../../../src/domain/cover';
import { seriesFor } from '../../../../src/domain/stock-series';
import { inboundTimeline } from '../../../../src/domain/timeline';
import { call, useAsync, type InventoryRow, type IsoDate, type Shipment } from '../api';
import { InboundTimelineChart, StockChart } from '../charts';
import { ErrorState, Loading, Panel } from '../components';
import { useI18n } from '../i18n';

/** Enough rows to show every overdue and the next arrivals without burying the rest of the dashboard. */
const TIMELINE_ROWS = 12;

/** Dashboard panel: open shipments on a calendar; a row opens the shipment drawer. */
export function InboundTimelinePanel({ dataVersion, onOpenShipment }: { dataVersion: number; onOpenShipment: (id: string) => void }) {
  const state = useAsync(() => call('listShipments'), [dataVersion]);
  const { t } = useI18n();
  const d = t.design;
  const timeline = useMemo(() => (state.status === 'ready' ? inboundTimeline(state.data.shipments, state.data.today, { maxItems: TIMELINE_ROWS }) : null), [state]);

  return (
    <Panel title={d.timelineTitle} icon="calendar" description={d.timelineDesc}>
      {state.status === 'loading' && <Loading variant="inline" />}
      {state.status === 'error' && <ErrorState message={state.message} onRetry={state.reload} />}
      {timeline && (timeline.items.length === 0 ? <p className="muted">{d.timelineEmpty}</p> : <InboundTimelineChart timeline={timeline} onOpen={onOpenShipment} />)}
      {timeline && timeline.later > 0 && <p className="footnote">{d.timelineLater(timeline.later)}</p>}
    </Panel>
  );
}

export const CHART_DAYS = 30;

/** Stock outlook for one inventory position, built from the same rules as days of cover. */
export function StockOutlookPanel({ item, shipments, today }: { item: InventoryRow; shipments: Shipment[]; today: IsoDate }) {
  const { t } = useI18n();
  const d = t.design;
  const series = useMemo(() => seriesFor(item, buildPipelineIndex(shipments), today, CHART_DAYS), [item, shipments, today]);
  return (
    <Panel title={d.chartTitle(item.sku, item.warehouse)} icon="box" description={d.chartDesc} actions={<span className="badge badge-neutral">{d.chartDays(CHART_DAYS)}</span>}>
      <StockChart series={series} stockOutDate={item.cover.stockOutDate} belowSafetyDate={item.cover.belowSafetyDate} />
    </Panel>
  );
}
