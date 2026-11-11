import { MIN_HISTORY, RELIABLE_RATE, WATCH_RATE, type ReliabilityGrade, type SupplierReliability } from '../../../../src/domain/supplier-reliability';
import { Panel } from '../components';
import { useI18n } from '../i18n';

const GRADE_CLASS: Record<ReliabilityGrade, string> = {
  unreliable: 'sev-high',
  watch: 'sev-medium',
  reliable: 'badge-success',
  new: 'badge-neutral',
};

export function GradeBadge({ grade }: { grade: ReliabilityGrade }) {
  const { t } = useI18n();
  return <span className={`badge ${GRADE_CLASS[grade]}`}>{t.supplier.grade[grade]}</span>;
}

/**
 * Delivery record per supplier, least reliable first. Each supplier name is a toggle that
 * filters the shipments table; the grade is always written out, never colour alone.
 */
export function SupplierReliabilityPanel({ suppliers, selected, onSelect }: {
  suppliers: SupplierReliability[];
  selected: string | null;
  onSelect: (supplier: string | null) => void;
}) {
  const { t, fmt } = useI18n();
  const s = t.supplier;
  return (
    <Panel title={s.title} icon="truck" description={s.desc}>
      {suppliers.length === 0 ? (
        <p className="muted">{s.empty}</p>
      ) : (
        <div className="table-wrap">
          <table className="table" aria-label={s.table}>
            <thead>
              <tr>
                <th scope="col">{s.colSupplier}</th><th scope="col">{s.colGrade}</th><th scope="col">{s.colOnTime}</th><th scope="col">{s.colTypical}</th>
                <th scope="col" className="num">{s.colOpen}</th><th scope="col" className="num">{s.colLateNow}</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((r) => (
                <tr key={r.key} className={r.key === selected ? 'row-selected' : undefined}>
                  <td>
                    <button
                      type="button"
                      className="link"
                      aria-pressed={r.key === selected}
                      title={s.pick(r.supplier)}
                      onClick={() => onSelect(r.key === selected ? null : r.key)}
                    >
                      {r.supplier}
                    </button>
                  </td>
                  <td><GradeBadge grade={r.grade} /></td>
                  <td className="nowrap">{r.onTimeRate === null ? <span className="subtlest">{s.noDeliveries}</span> : s.onTime(fmt.percent(r.onTimeRate), r.onTime, r.deliveries)}</td>
                  <td className="nowrap">{r.deliveries === 0 ? <span className="subtlest">—</span> : s.typical(r.typicalDelayDays)}</td>
                  <td className="num">{fmt.number(r.openShipments)}</td>
                  <td className={`num${r.lateNow > 0 ? ' text-danger' : ''}`}>{fmt.number(r.lateNow)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="footnote">{s.rules(MIN_HISTORY, fmt.percent(RELIABLE_RATE), fmt.percent(WATCH_RATE))}</p>
    </Panel>
  );
}
