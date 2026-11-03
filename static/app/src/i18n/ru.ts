import type { RiskEvent } from '../../../../src/shared/api';
import type { Messages } from './en';

/** Russian plural form: 1 день, 2 дня, 5 дней (11–14 always take the "many" form). */
export function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs >= 11 && abs <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

const days = (n: number) => `${n} ${plural(n, 'день', 'дня', 'дней')}`;

const evidenceNumber = (risk: RiskEvent, label: string): number | null => {
  const value = risk.evidence.find((e) => e.label === label)?.value;
  return typeof value === 'number' ? value : null;
};

/**
 * Builds the Russian title from the risk's type, entity and numeric evidence (the rule engine
 * writes English titles). Anything unexpected falls back to the original English title.
 */
function riskTitle(risk: RiskEvent): string {
  const key = risk.entityKey;
  switch (risk.type) {
    case 'LATE_SHIPMENT': {
      const n = evidenceNumber(risk, 'Days late');
      return n === null ? risk.title : `Поставка ${key} опаздывает на ${days(n)} относительно плановой даты`;
    }
    case 'ETA_SLIP': {
      const n = evidenceNumber(risk, 'Slip (days)');
      return n === null ? risk.title : `Ожидаемая дата прибытия ${key} на ${days(n)} позже плана`;
    }
    case 'MISSING_ETA': {
      const where = risk.evidence.find((e) => e.label === 'Status')?.value === 'customs' ? 'на таможне' : 'в пути';
      return `Поставка ${key} ${where}, но ожидаемая дата прибытия не указана`;
    }
    case 'LOW_STOCK': {
      const at = key.indexOf('@');
      if (at < 1) return risk.title;
      const sku = key.slice(0, at);
      const warehouse = key.slice(at + 1);
      const available = evidenceNumber(risk, 'Available');
      return available !== null && available <= 0
        ? `${sku} на складе ${warehouse}: доступного остатка нет`
        : `${sku} на складе ${warehouse}: остаток ниже страхового запаса`;
    }
    default:
      return risk.title;
  }
}

export const ru: Messages = {
  appSubtitle: 'Риски поставок, отгрузки и складские остатки — прямо в Jira.',
  language: 'Язык',
  sections: 'Разделы LogiMind',
  tabs: {
    dashboard: 'Обзор',
    shipments: 'Поставки',
    inventory: 'Остатки',
    whatIf: 'Что если',
    risks: 'Риски',
    copilot: 'Копилот',
    import: 'Импорт и настройки',
  },

  loading: 'Загрузка…',
  somethingWrong: 'Что-то пошло не так.',
  retry: 'Повторить',
  cancel: 'Отмена',
  none: 'Нет',
  ofTotal: (shown, total) => `${shown} из ${total}`,

  severity: { critical: 'Критический', high: 'Высокий', medium: 'Средний', low: 'Низкий' },
  status: {
    planned: 'Запланирована',
    confirmed: 'Подтверждена',
    in_transit: 'В пути',
    customs: 'На таможне',
    delivered: 'Доставлена',
    cancelled: 'Отменена',
  },
  riskType: { LATE_SHIPMENT: 'Опоздание', ETA_SLIP: 'Сдвиг ETA', MISSING_ETA: 'Нет ETA', LOW_STOCK: 'Низкий остаток' },
  importKind: { shipments: 'поставки', inventory: 'остатки' },
  evidence: {
    'Days late': 'Дней опоздания',
    Supplier: 'Поставщик',
    SKU: 'Артикул',
    Qty: 'Кол-во',
    Status: 'Статус',
    'Planned arrival': 'Плановое прибытие',
    ETA: 'ETA',
    'Slip (days)': 'Сдвиг (дней)',
    'Days to planned arrival': 'Дней до планового прибытия',
    'On hand': 'На складе',
    Reserved: 'В резерве',
    Available: 'Доступно',
    'Inbound within 7 days': 'Поступит в течение 7 дней',
    Projected: 'Прогноз',
    'Safety stock': 'Страховой запас',
    'Inbound shipments': 'Входящие поставки',
  },
  riskTitle,

  loadingDashboard: 'Загружаем обзор…',
  noDataTitle: 'Данных пока нет',
  noDataText: 'Импортируйте CSV с поставками и остатками или загрузите демонстрационные данные, чтобы посмотреть LogiMind в работе.',
  loadDemo: 'Загрузить демо-данные',
  loadingDemo: 'Загружаем демо-данные…',
  importCsv: 'Импорт CSV',
  kpiOpenShipments: 'Открытые поставки',
  kpiOpenHint: (inTransit, total) => `${inTransit} в пути · всего ${total}`,
  kpiLate: 'Опаздывающие поставки',
  kpiLateHint: 'Плановая дата прошла, груз не доставлен',
  kpiOnTime: 'Доставка в срок',
  kpiOnTimeHint: (delivered) => `доставлено поставок: ${delivered}`,
  kpiBelowSafety: 'Артикулы ниже страхового запаса',
  kpiBelowSafetyHint: 'С учётом поставок в ближайшие 7 дней',
  kpiValueAtRisk: 'Стоимость под риском',
  kpiValueAtRiskHint: 'Дефицит × цена за единицу (в валюте файла)',
  openRisks: (n) => `Открытые риски (${n})`,
  openRisksBySeverity: 'Открытые риски по уровню',
  toRiskCenter: 'Все риски →',
  ruleScoreNote: (date) => `Оценка по детерминированным правилам на ${date}. Это не статистический прогноз.`,
  topRisks: 'Главные риски',
  noOpenRisks: 'Открытых рисков нет.',
  recentImports: 'Последние импорты',
  noImportsRecorded: 'Импортов пока не было.',
  colFile: 'Файл',
  colType: 'Тип',
  colImported: 'Импортирован',
  colRows: 'Строк',
  colValid: 'Принято',
  colRejected: 'Отклонено',

  loadingShipments: 'Загружаем поставки…',
  noShipmentsTitle: 'Поставки не импортированы',
  noShipmentsText: 'Импортируйте CSV с поставками в разделе «Импорт и настройки».',
  searchShipments: 'Поиск по номеру, поставщику, артикулу, складу…',
  searchShipmentsLabel: 'Поиск поставок',
  filterStatus: 'Фильтр по статусу',
  allStatuses: 'Все статусы',
  atRiskOnly: 'Только с рисками',
  colShipment: 'Поставка',
  colSupplier: 'Поставщик',
  colSku: 'Артикул',
  colQty: 'Кол-во',
  colPlanned: 'План',
  colEta: 'ETA',
  colStatus: 'Статус',
  colWarehouse: 'Склад',
  colRisk: 'Риск',
  arrivedOn: (date) => `Прибыла ${date}`,
  noShipmentsMatch: 'Под эти фильтры поставок нет.',

  loadingInventory: 'Загружаем остатки…',
  noInventoryTitle: 'Остатки не импортированы',
  noInventoryText: 'Импортируйте CSV с остатками в разделе «Импорт и настройки».',
  searchInventory: 'Поиск по артикулу, товару, складу…',
  searchInventoryLabel: 'Поиск остатков',
  belowSafetyOnly: 'Только ниже страхового запаса',
  inventoryNote: 'Доступно = на складе − в резерве. Прогноз добавляет открытые поставки, которые придут в ближайшие 7 дней.',
  colProduct: 'Товар',
  colOnHand: 'На складе',
  colReserved: 'Резерв',
  colAvailable: 'Доступно',
  colInbound7: 'Придёт за 7 дн.',
  colProjected: 'Прогноз',
  colSafety: 'Страх. запас',
  colCoverage: 'Покрытие',
  colUnitCost: 'Цена за ед.',
  coverageLabel: 'Покрытие страхового запаса',
  coverageText: (pct) => `${pct}% страхового запаса`,
  noInventoryMatch: 'Под эти фильтры позиций нет.',

  evaluatingRules: 'Проверяем правила…',
  noRisksTitle: 'Открытых рисков нет',
  noRisksText: 'Все поставки и остатки проходят текущие правила.',
  filterSeverity: 'Фильтр по уровню',
  allSeverities: 'Все уровни',
  filterRiskType: 'Фильтр по типу риска',
  allRiskTypes: 'Все типы',
  evaluatedOn: (date) => `на ${date}`,
  viewShipment: (id) => `Открыть поставку ${id}`,
  viewInventory: 'Перейти к остаткам',
  ruleVersion: (v) => `Правила v${v}`,
  jiraLinksUnavailable: (message) => `Связи с Jira недоступны: ${message}`,
  loadingJiraLink: 'Загружаем связь с Jira…',
  noRisksMatch: 'Под эти фильтры рисков нет.',
  jiraStatusNotRefreshed: (message) => `Не удалось обновить статусы Jira: ${message}`,

  issueCategory: { new: 'К выполнению', indeterminate: 'В работе', done: 'Готово', unknown: 'Неизвестно' },
  openInJira: 'Открыть в Jira (новая вкладка)',
  justCreated: 'только что создана — статус появится через минуту',
  statusUnavailable: 'статус недоступен (задача удалена или нет доступа)',
  jiraNotConfigured: 'Проект Jira не выбран (Импорт и настройки)',
  createIssue: 'Создать задачу в Jira',
  confirmIssue: 'Подтвердите создание задачи',
  createIssueIn: (type, project, key) => `Создать «${type}» в проекте ${project} (${key})?`,
  create: 'Создать',
  creating: 'Создаём…',
  createdIssue: (key) => `Создана задача ${key}`,

  shipment: 'Поставка',
  closeShipment: 'Закрыть карточку поставки',
  shipmentNotFound: (id) => `Поставка ${id} не найдена в текущих данных.`,
  factStatus: 'Статус',
  factSupplier: 'Поставщик',
  factOrder: 'Заказ',
  factSku: 'Артикул',
  factProduct: 'Товар',
  factQuantity: 'Количество',
  factWarehouse: 'Склад',
  factPlanned: 'Плановое прибытие',
  factEta: 'ETA',
  factActual: 'Фактическое прибытие',
  factCarrier: 'Перевозчик',
  factTracking: 'Трек-номер',
  risksCount: (n) => `Риски (${n})`,
  risksLabel: 'Риски',
  noShipmentRule: 'По этой поставке ни одно правило не сработало.',
  stockAtDestination: 'Остаток на складе назначения',
  factAvailable: 'Доступно',
  factInbound7: 'Придёт ≤ 7 дней',
  factProjected: 'Прогноз',
  factSafety: 'Страховой запас',
  factStockRisk: 'Риск по остатку',
  noInventoryRecord: (sku, warehouse) => `Нет данных об остатке ${sku} на складе ${warehouse}.`,

  notFromLogiMind: 'Эта задача создана не из риска LogiMind.',
  stillActive: (date) => `Риск всё ещё актуален по текущим данным (на ${date}).`,
  noLongerActive: 'Риск больше не актуален: по текущим данным условие устранено.',
  createdAt: (date) => `создана ${date}`,
  factShipment: 'Поставка',
  factQty: 'Кол-во',
  factPlannedShort: 'План',
  shipmentNotInData: (id) => `Поставки ${id} нет в текущих данных.`,

  aiNotice: 'ИИ: Claude на платформе Atlassian.',
  aiNoticeDetail: 'Каждый номер, число и дата сверяются с вашими данными.',
  askLabel: 'Спросите о поставках, остатках или рисках',
  askPlaceholder: 'например: статус SHP-1004',
  ask: 'Спросить',
  answering: 'Отвечаем…',
  examplesLabel: 'Примеры вопросов',
  examples: ['Сводка рисков на сегодня', 'Какие задержки сильнее всего бьют по остаткам?', 'Почему SHP-1004 — проблема и что делать?', 'Остаток SKU-10', 'Где SHP-9999?'],
  ruleBasedAnswer: 'Ответ по правилам.',
  // The server's English reason is not repeated here; it is the same few causes.
  fallbackText: (_reason) => 'Ответ ИИ сейчас недоступен или не прошёл проверку, поэтому показан ответ по правилам. Такие ответы пока формируются на английском.',
  verifiedFacts: 'Проверенные факты',
  noMatchingRecords: 'В текущих данных подходящих записей нет.',
  nextSteps: 'Что сделать дальше',
  noActionSuggested: 'Данные не дают оснований что-либо советовать.',
  priority: { high: 'высокий приоритет', medium: 'средний приоритет', low: 'низкий приоритет' },
  confidence: { high: 'высокая', medium: 'средняя', low: 'низкая' },
  basedOn: (evidence, confidence) => `Основание: ${evidence} · уверенность ${confidence}`,
  unknownData: 'Неизвестные или недостающие данные',
  sources: 'Источники',
  shipmentsImportedAt: (date) => `поставки импортированы ${date}`,
  inventoryImportedAt: (date) => `остатки импортированы ${date}`,
  evaluated: (date) => `Данные на ${date}`,
  modeRules: 'режим: правила, без ИИ',
  modeLlm: 'режим: ИИ (Forge LLM), номера и числа проверены',

  importTitle: 'Импорт CSV',
  importIntro:
    'Загрузите CSV с поставками или остатками (UTF-8; разделитель — запятая, точка с запятой или табуляция, как при экспорте из Excel; до 1 МБ). Тип файла определяется по заголовку; если у поставщика другие названия колонок, ИИ предложит сопоставление, а вы его подтвердите. Каждый импорт заменяет текущие данные этого типа; строки с ошибками отклоняются и перечисляются ниже — молча они никогда не используются.',
  adminOnly: 'Импортировать, загружать и удалять данные могут только администраторы Jira. Всё остальное вам доступно для просмотра.',
  csvFiles: 'Файлы CSV',
  importingAi: 'Импортируем… (нераспознанные колонки сопоставляет ИИ)',
  confirmMappingFirst: 'Сначала подтвердите или отмените сопоставление колонок ниже.',
  pasteSummary: 'Или вставьте строки, скопированные из Excel',
  pasteHelp: 'Скопируйте ячейки вместе со строкой заголовков из Excel или Google Таблиц и вставьте сюда.',
  importPasted: 'Импортировать вставленные строки',
  fileTooLarge: 'Файл больше 1 МБ',
  fileFormats: 'Форматы файлов',
  formatShipments: 'Поставки',
  formatInventory: 'Остатки',
  formatNote: '* обязательные. Даты в формате YYYY-MM-DD. Статус: planned, confirmed, in_transit, customs, delivered, cancelled.',
  demoTitle: 'Демо-данные и управление данными',
  demoText: 'Загрузите синтетический набор (30 поставок, 12 складских позиций) с датами относительно сегодняшнего дня. Текущие данные будут заменены.',
  rowLimit: 'В одном файле — не более 2 000 строк.',
  deleteAll: 'Удалить все данные…',
  confirmDelete: 'Подтвердите удаление',
  deleteQuestion: 'Удалить все поставки, остатки, историю импорта и связи рисков с задачами? Сами задачи в Jira не удаляются.',
  delete: 'Удалить',
  deleting: 'Удаляем…',
  importHistory: 'История импорта',
  noImportsYet: 'Импортов пока не было.',
  importedRows: (valid, total, kind) => `Импортировано строк (${kind}): ${valid} из ${total}`,
  rejectedRows: (n) => `, отклонено: ${n}`,
  keptExisting: ' Корректных строк нет — прежние данные сохранены.',
  notImported: 'Файл не импортирован.',
  colLine: 'Строка',
  colField: 'Поле',
  colProblem: 'Проблема (текст проверки на английском)',

  mappingFor: (file) => `Сопоставление колонок для ${file}`,
  columnsNotRecognised: 'колонки не распознаны.',
  aiProposed: 'ИИ (Forge LLM на платформе Atlassian) предложил сопоставление по названиям колонок и первым строкам.',
  checkBeforeImport: 'Проверьте его перед импортом.',
  matchedByName: 'Колонки сопоставлены по названиям.',
  onlyNamesMapped: 'Сопоставляются только названия колонок: значения не меняются, и каждая строка проходит обычную проверку.',
  fileType: 'Тип файла',
  fileKind: { shipments: 'Поставки', inventory: 'Остатки' },
  dataRows: (n) => `${n} ${plural(n, 'строка', 'строки', 'строк')} данных`,
  colInYourFile: 'Колонка в вашем файле',
  colFirstValues: 'Первые значения',
  colLogiMindField: 'Поле LogiMind',
  noName: '(без названия)',
  fieldForColumn: (name) => `Поле для колонки ${name}`,
  ignoreColumn: '— не использовать —',
  shapeWholeNumbers: 'целые числа',
  shapeDates: 'даты (YYYY-MM-DD)',
  shapeNumbers: 'числа',
  shapeWarning: (label) => `Не все первые значения — ${label}; проверьте, та ли это колонка. Неподходящие строки будут отклонены.`,
  mapRequiredFirst: (fields) => `Сначала сопоставьте обязательные поля: ${fields}`,
  importWithMapping: 'Импортировать с этим сопоставлением',
  importing: 'Импортируем…',
  fieldHelp: {
    shipment_id: 'уникальный номер поставки / партии / доставки',
    order_id: 'номер заказа на закупку',
    supplier: 'поставщик',
    sku: 'артикул / код товара',
    product_name: 'наименование товара',
    qty: 'количество в поставке (целое число)',
    planned_arrival: 'изначально обещанная дата прибытия',
    eta: 'последняя ожидаемая дата прибытия',
    actual_arrival: 'фактическая дата получения',
    status: 'статус поставки (planned, confirmed, in transit, customs, delivered, cancelled)',
    warehouse: 'склад / площадка',
    carrier: 'перевозчик / экспедитор',
    tracking_ref: 'трек-номер, AWB или коносамент',
    on_hand: 'физический остаток на складе (целое число)',
    reserved: 'зарезервированное количество',
    inbound_qty: 'количество в заказе / в пути',
    safety_stock: 'страховой запас / минимальный остаток',
    unit_cost: 'цена за единицу',
    updated_at: 'дата, на которую снят остаток',
  },

  jiraIntegration: 'Интеграция с Jira',
  issuesCreatedIn: (project, key, type) => `Задачи по рискам создаются в проекте ${project} (${key}) с типом «${type}»`,
  updatedAt: (date) => `обновлено ${date}`,
  noProjectChosen: 'Проект Jira ещё не выбран, поэтому кнопка «Создать задачу в Jira» недоступна.',
  createdAsUser: 'Задачи создаются от имени пользователя, нажавшего кнопку, поэтому действуют права доступа проекта Jira.',
  project: 'Проект',
  chooseProject: 'Выберите проект…',
  issueType: 'Тип задачи',
  save: 'Сохранить',
  saving: 'Сохраняем…',
  savedConfig: (project, type) => `Сохранено: новые задачи будут создаваться в ${project} с типом «${type}».`,
};
