import { plural } from './ru';
import type { SupplierMessages } from './supplier-en';

const days = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;

/** Russian text for supplier reliability and the history-based arrival forecast. */
export const supplierRu: SupplierMessages = {
  title: 'Надёжность поставщиков',
  desc: 'По истории доставок в файле поставок: как часто поставки приходили к плановой дате и насколько обычно опаздывали. Выберите поставщика, чтобы увидеть только его поставки.',
  empty: 'В файле поставок пока нет поставщиков.',
  colSupplier: 'Поставщик',
  colGrade: 'Оценка',
  colOnTime: 'Вовремя',
  colTypical: 'Обычная задержка',
  colOpen: 'Открытых',
  colLateNow: 'Опаздывают',
  grade: { reliable: 'Надёжный', watch: 'Под наблюдением', unreliable: 'Ненадёжный', new: 'Мало истории' },
  onTime: (pct: string, onTime: number, deliveries: number) => `${pct} (${onTime} из ${deliveries})`,
  noDeliveries: 'Доставок ещё не было',
  typical: (n: number) => (n === 0 ? 'Вовремя' : `+${days(n)}`),
  pick: (supplier: string) => `Показать только поставки от «${supplier}»`,
  table: 'История доставок по поставщикам',
  showing: (supplier: string) => `Показаны поставки от «${supplier}»`,
  showAll: 'Все поставщики',
  rules: (min: number, reliable: string, watch: string) =>
    `Для оценки нужно не меньше ${min} доставок. Надёжный: вовремя ${reliable} и больше; под наблюдением: ${watch} и больше. Обычная задержка — медиана по всем доставкам (раньше срока считается вовремя).`,

  forecastShort: (date: string) => `вероятно ${date}`,
  forecastTitle: (supplier: string, typical: number, shift: number, fromPlan: boolean) =>
    `«${supplier}» обычно опаздывает на ${days(typical)}, поэтому поставка, вероятно, придёт на ${days(shift)} позже ${fromPlan ? 'плановой даты' : 'ETA'}.`,
  timelineForecast: 'Прогноз',
  forecastHistory: (typical: number, shift: number, fromPlan: boolean) =>
    `план + обычная задержка ${days(typical)}; на ${days(shift)} позже ${fromPlan ? 'плана' : 'ETA'}`,
  forecastKept: 'ETA уже учитывает обычную задержку',
  forecastPlan: 'мало истории доставок для поправки',
  forecastOnTime: 'поставщик обычно приходит вовремя; дата без поправки',
  factRecord: 'История доставок',
  record: (grade: string, pct: string, onTime: number, deliveries: number, typical: string) =>
    `${grade}: вовремя ${pct} (${onTime} из ${deliveries}), обычная задержка ${typical}`,
  recordNew: (deliveries: number) => `Мало истории (${deliveries} ${plural(deliveries, 'доставка', 'доставки', 'доставок')})`,

  chartLine: 'Если опоздают как обычно',
  chartSummaryOut: (date: string) => ` Если поставщики опоздают как обычно, запас закончится ${date}.`,
  chartNote: 'Пунктир переносит каждую открытую поставку на плановую дату плюс обычную задержку поставщика, если это позже ETA.',
};
