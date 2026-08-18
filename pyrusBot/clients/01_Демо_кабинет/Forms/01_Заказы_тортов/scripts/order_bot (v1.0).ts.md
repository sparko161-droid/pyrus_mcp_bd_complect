---
title: "14.01.1.1.1 Код: order_bot (v1.0).ts"
audience: "tech"
pyrus_id: "MfPi4sjfoIG"
pyrus_parent: "LrfgGQAHI7s"
synced_at: "2026-08-12T17:15:37.000Z"
synced_hash: "sha256:49c721325ad102b0fb8543b6114eedbf"
---

```typescript
import {
  BotHookRequest,
  BotHookResponse,
  PyrusApiClient,
  FormResponse
} from "pyrus-api";

// ═══════════════════════════════════════════════════════════════════════════
//  БОТ ЗАКАЗА ТОРТОВ (форма «Заказы тортов»)
//
//  Порядок работы (важно — именно в этом порядке):
//    1. Читаем схему формы (client.forms.get) и строим FormModel:
//       ВСЕ поля рекурсивно, включая вложенные в title/группы/таблицы.
//       Если API схемы недоступен — схема восстанавливается из самой задачи.
//    2. Строим TaskModel: значения всех полей задачи, тоже рекурсивно
//       (у поля типа `title` дети лежат в value.fields, а не в fields).
//    3. Только после этого читаем состояние из технического поля,
//       обрабатываем ответ гостя и выбираем следующий вопрос.
//
//  Почему бот раньше бесконечно спрашивал телефон:
//  техническое поле `technical_bot_state` (id 26) вложено в поле-заголовок
//  «Данные о госте» (id 32) и лежит в task.fields[32].value.fields[].
//  Старый код искал его перебором ТОЛЬКО по верхнему уровню task.fields,
//  поэтому состояние всегда читалось как пустое: step_field_code = null →
//  ответ гостя не обрабатывался → следующим шагом снова оказывался телефон.
//  Запись при этом работала (Pyrus принимает плоский id вложенного поля),
//  поэтому в поле было видно корректное состояние — но бот его не видел.
// ═══════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────
//  КОНФИГУРАЦИЯ
// ─────────────────────────────────────────────────────────────────────────

const FIELD_CODES = {
  STATE: "technical_bot_state",
  GUEST_NAME: "guest_name",
  GUEST_PHONE: "guest_phone",
  EVENT_TYPE: "event_type",
  CAKE_FOR: "cake_for",
  CHILD_GENDER: "child_gender",
  CAKE_WEIGHT: "cake_weight",
  GUESTS_COUNT: "guests_count",
  FOOD_ALLERGY: "food_allergy",
  ALLERGY_COMMENT: "allergy_comment",
  CAKE_FILLING: "cake_filling",
  DESIGN_COMMENT: "design_comment",
  DESIGN_IMAGE: "design_image",
  DELIVERY_TYPE: "delivery_type",
  PICKUP_POINT: "pickup_point",
  PICKUP_TIME: "pickup_time",
  DELIVERY_ADDRESS: "delivery_address",
  DELIVERY_TIME_RANGE: "delivery_time_range",
  DELIVERY_CONTACT: "delivery_contact",
  BONUS_CARD_EXISTS: "bonus_card_exists",
  BONUS_CARD_CREATE: "bonus_card_create",
  BONUS_WRITE_OFF: "bonus_write_off",
  BONUS_ACCRUAL: "bonus_accrual",
} as const;

/** Логи бота уходят ОТДЕЛЬНЫМ внутренним комментарием (без channel), гость их не видит. */
const DEBUG_ENABLED = true;

/** Сколько раз подряд гость может ответить непонятно, прежде чем позовём оператора. */
const MAX_ERRORS = 3;

/** Предохранитель от зацикливания: сколько раз можно задать один и тот же вопрос. */
const MAX_ASKS_PER_FIELD = 4;

/** Сдвиг локального времени относительно UTC (Pyrus хранит поля `time` в UTC). */
const TIMEZONE_OFFSET_HOURS = 4;

const OPERATOR_TRIGGERS = [
  "оператор", "позовите", "человек", "менеджер", "поговорить с человеком",
];

/** Ответы, которыми гость пропускает необязательный шаг. */
const SKIP_ANSWERS = [
  "нет", "не надо", "не нужно", "пропустить", "пропуск", "далее", "дальше",
  "skip", "-", "без разницы", "не знаю", "неважно", "не важно",
];

type StepType =
  | "text" | "phone" | "number" | "choice" | "catalog"
  | "checkmark" | "file" | "time" | "date";

interface StepDefinition {
  code: string;
  question: string;
  /** Подсказка по формату — добавляется к вопросу. */
  hint?: string;
  /** Тип обработки. Если не задан — берём из схемы формы. */
  type?: StepType;
  /** Необязательный шаг: гость может ответить «нет»/«пропустить». */
  optional?: boolean;
  min?: number;
  max?: number;
}

/**
 * Порядок опроса. Это единственный источник истины по тому, ЧТО спрашивает бот:
 * поля, которых здесь нет (технические, служебные, вложенные данные о госте),
 * бот не тронет, даже если они появятся в форме.
 * Типы, варианты ответа и условия видимости при этом берутся из схемы формы.
 */
const ASK_SEQUENCE: StepDefinition[] = [
  { code: FIELD_CODES.GUEST_NAME, question: "Здравствуйте! Подскажите, пожалуйста, как к Вам можно обращаться?", min: 2, max: 60 },
  { code: FIELD_CODES.GUEST_PHONE, question: "Укажите, пожалуйста, номер телефона.", hint: "Подойдёт номер в формате 79XXXXXXXXX или 89XXXXXXXXX." },
  { code: FIELD_CODES.EVENT_TYPE, question: "На какое мероприятие планируется торт?" },
  { code: FIELD_CODES.CAKE_FOR, question: "Для кого готовим торт?" },
  { code: FIELD_CODES.CHILD_GENDER, question: "Укажите, пожалуйста, пол ребёнка." },
  { code: FIELD_CODES.CAKE_WEIGHT, question: "Какой вес торта нужен (в кг)?", min: 0.5, max: 50 },
  { code: FIELD_CODES.GUESTS_COUNT, question: "На какое количество гостей рассчитываем торт?", min: 1, max: 1000 },
  { code: FIELD_CODES.FOOD_ALLERGY, question: "Есть ли пищевая аллергия у кого-то из гостей?" },
  { code: FIELD_CODES.ALLERGY_COMMENT, question: "Уточните, пожалуйста, на что именно аллергия." },
  { code: FIELD_CODES.CAKE_FILLING, question: "Выберите начинку торта." },
  { code: FIELD_CODES.DESIGN_COMMENT, question: "Опишите пожелания по оформлению торта.", optional: true },
  { code: FIELD_CODES.DESIGN_IMAGE, question: "Если есть пример оформления — приложите, пожалуйста, фото.", hint: "Если примера нет, напишите «нет».", type: "file", optional: true },
  { code: FIELD_CODES.DELIVERY_TYPE, question: "Как удобнее получить заказ?" },
  { code: FIELD_CODES.PICKUP_POINT, question: "Укажите, пожалуйста, точку самовывоза." },
  { code: FIELD_CODES.PICKUP_TIME, question: "Во сколько планируете забрать заказ?", hint: "Формат: ЧЧ:ММ, например 14:30." },
  { code: FIELD_CODES.DELIVERY_ADDRESS, question: "Укажите, пожалуйста, адрес доставки." },
  { code: FIELD_CODES.DELIVERY_TIME_RANGE, question: "В какой интервал удобно принять доставку?", hint: "Например: 14:00–16:00." },
  { code: FIELD_CODES.DELIVERY_CONTACT, question: "Кто встретит курьера? Укажите имя и телефон контактного лица." },
  { code: FIELD_CODES.BONUS_CARD_EXISTS, question: "У Вас уже есть наша бонусная карта?" },
  { code: FIELD_CODES.BONUS_CARD_CREATE, question: "Хотите оформить бонусную карту?" },
  { code: FIELD_CODES.BONUS_WRITE_OFF, question: "Списать бонусы с карты при оплате заказа?" },
  { code: FIELD_CODES.BONUS_ACCRUAL, question: "Начислить бонусы за этот заказ?" },
];

const MSG = {
  OPERATOR: "Уже зову коллегу — оператор подключится к диалогу в ближайшее время.",
  GIVE_UP: "Не получается разобрать ответ. Передаю диалог оператору, он свяжется с Вами.",
  DONE: "Спасибо! Все данные по заказу собраны, передаю заявку кондитеру. С Вами свяжутся для подтверждения.",
  INTERNAL_ERROR: "Извините, произошёл технический сбой. Передаю диалог оператору.",
};

// ─────────────────────────────────────────────────────────────────────────
//  ТИПЫ
// ─────────────────────────────────────────────────────────────────────────

interface BotState {
  /** Код поля, ответ на который мы сейчас ждём. */
  step_field_code: string | null;
  /** Подряд идущие нераспознанные ответы на текущий шаг. */
  error_count: number;
  /** Коды шагов, которые уже пройдены (в т.ч. осознанно пропущенные). */
  completed_steps: string[];
  /** Сколько раз задавали каждый вопрос — предохранитель от зацикливания. */
  ask_counts: Record<string, number>;
  /** Диалог завершён (передан человеку либо всё собрано) — бот больше не пишет. */
  finished: boolean;
  /** id последнего обработанного комментария — защита от повторного вызова хука. */
  last_event_key: string | null;
}

interface FieldSchema {
  id: number;
  code?: string;
  name: string;
  type: string;
  parentId?: number;
  options?: Array<{ choice_id: number; choice_value: string; deleted?: boolean }>;
  catalogId?: number;
  multiple: boolean;
  visibility?: any;
  required: boolean;
}

interface Trigger {
  key: string | null;
  text: string;
  attachments: any[];
  channel: any;
}

// ─────────────────────────────────────────────────────────────────────────
//  ЛОГИ
// ─────────────────────────────────────────────────────────────────────────

const logs: string[] = [];
function log(msg: string): void {
  if (!DEBUG_ENABLED) return;
  logs.push(msg);
}

// ─────────────────────────────────────────────────────────────────────────
//  МОДЕЛЬ СХЕМЫ ФОРМЫ
//  Плоский индекс всех полей формы (включая вложенные) по id и по коду.
// ─────────────────────────────────────────────────────────────────────────

class FormModel {
  readonly byId = new Map<number, FieldSchema>();
  readonly byCode = new Map<string, FieldSchema>();
  private readonly catalogCache = new Map<number, any[]>();

  private constructor(rawFields: any[], readonly source: "form_api" | "task_fallback") {
    this.walk(rawFields, undefined);
  }

  /**
   * Схема формы: сначала пробуем API форм, при ошибке — восстанавливаем структуру
   * из самой задачи (в задаче приходят и code, и type, и visibility_condition).
   */
  static async load(client: PyrusApiClient, formId: number, taskFields: any[]): Promise<FormModel> {
    if (formId) {
      try {
        const formDef: FormResponse = await client.forms.get({ id: formId });
        if (formDef?.fields?.length) {
          const model = new FormModel(formDef.fields as any[], "form_api");
          log(`Схема формы ${formId}: ${model.byId.size} полей (из API), с кодами: ${model.byCode.size}`);
          return model;
        }
        log(`Схема формы ${formId} пустая — падаю на структуру из задачи`);
      } catch (e: any) {
        log(`Не удалось получить схему формы ${formId}: ${e?.message || e}. Падаю на структуру из задачи`);
      }
    }
    const model = new FormModel(taskFields || [], "task_fallback");
    log(`Схема восстановлена из задачи: ${model.byId.size} полей, с кодами: ${model.byCode.size}`);
    return model;
  }

  private walk(fields: any[], parentId: number | undefined): void {
    for (const f of fields || []) {
      if (!f || typeof f !== "object" || f.id === undefined || f.id === null) continue;

      const info = f.info || {};
      const schema: FieldSchema = {
        id: Number(f.id),
        code: f.code || info.code || undefined,
        name: f.name || "",
        type: String(f.type || "text"),
        parentId,
        options: info.options || f.options,
        catalogId: info.catalog_id ?? f.catalog_id,
        multiple: Boolean(info.multiple_choice ?? f.multiple_choice),
        visibility: f.visibility_condition || info.visibility_condition,
        required: Boolean(info.is_required ?? f.is_required),
      };

      // Дочерние поля таблицы/строки не должны перетирать описание колонки,
      // поэтому первое описание поля выигрывает.
      if (!this.byId.has(schema.id)) this.byId.set(schema.id, schema);
      if (schema.code && !this.byCode.has(schema.code)) this.byCode.set(schema.code, schema);

      for (const children of this.childrenOf(f)) this.walk(children, schema.id);
    }
  }

  /** Все места, где Pyrus прячет вложенные поля (схема формы и данные задачи). */
  private childrenOf(f: any): any[][] {
    const out: any[][] = [];
    const push = (v: any) => { if (Array.isArray(v) && v.length) out.push(v); };

    push(f.fields);
    push(f.info?.fields);      // поля внутри заголовка/раздела (схема формы)
    push(f.info?.columns);     // колонки таблицы (схема формы)
    if (f.value && !Array.isArray(f.value)) push(f.value.fields); // поля внутри title (задача)
    if (Array.isArray(f.value) && (f.type === "group" || f.type === "title")) push(f.value);
    for (const opt of f.info?.options || []) push(opt?.fields);   // поля, привязанные к варианту выбора
    if (Array.isArray(f.value)) {
      for (const row of f.value) if (row && Array.isArray(row.cells)) push(row.cells); // строки таблицы
    }
    return out;
  }

  idOf(code: string): number | undefined {
    return this.byCode.get(code)?.id;
  }

  /** Варианты ответа для поля: выбор, каталог или «Да/Нет» для галочки. */
  async optionsFor(client: PyrusApiClient, schema: FieldSchema): Promise<string[]> {
    if (schema.type === "checkmark") return ["Да", "Нет"];

    if (schema.options?.length) {
      return schema.options
        .filter(o => o && o.choice_value && o.choice_value !== "Не выбрано" && !o.deleted)
        .slice(0, 15)
        .map(o => o.choice_value);
    }

    if (schema.type === "catalog" && schema.catalogId) {
      const items = await this.catalogItems(client, schema.catalogId);
      return items.slice(0, 20).map(i => i?.values?.[0]).filter(Boolean);
    }

    return [];
  }

  /** Элементы каталога с кэшем на время одного запуска скрипта. */
  async catalogItems(client: PyrusApiClient, catalogId: number): Promise<any[]> {
    const cached = this.catalogCache.get(catalogId);
    if (cached) return cached;
    try {
      const response = await client.catalogs.get({ id: catalogId });
      const items = response?.items || [];
      this.catalogCache.set(catalogId, items);
      return items;
    } catch (e: any) {
      log(`Каталог ${catalogId} недоступен: ${e?.message || e}`);
      this.catalogCache.set(catalogId, []);
      return [];
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  МОДЕЛЬ ЗНАЧЕНИЙ ЗАДАЧИ
//  Плоская карта id → value, собранная рекурсивно по всей задаче.
// ─────────────────────────────────────────────────────────────────────────

class TaskModel {
  private readonly values = new Map<number, any>();

  constructor(fields: any[]) {
    this.walk(fields);
  }

  private walk(fields: any[]): void {
    for (const f of fields || []) {
      if (!f || typeof f !== "object" || f.id === undefined || f.id === null) continue;
      if (f.value !== undefined && f.value !== null) this.values.set(Number(f.id), f.value);

      // Дети поля-заголовка лежат в value.fields; у группы value — массив полей.
      const value = f.value;
      if (value && !Array.isArray(value) && Array.isArray(value.fields)) this.walk(value.fields);
      else if (Array.isArray(value) && (f.type === "group" || f.type === "title")) this.walk(value);
      if (Array.isArray(f.fields)) this.walk(f.fields);
    }
  }

  get(id: number | undefined): any {
    return id === undefined ? undefined : this.values.get(Number(id));
  }

  getByCode(form: FormModel, code: string): any {
    return this.get(form.idOf(code));
  }

  /** Локально применяем только что записанное значение — чтобы условия видимости
   *  следующего шага считались уже с учётом свежего ответа гостя. */
  set(id: number, value: any): void {
    this.values.set(Number(id), value);
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  ЗНАЧЕНИЯ: ПУСТО / ОТОБРАЖЕНИЕ / СРАВНЕНИЕ
// ─────────────────────────────────────────────────────────────────────────

function isEmptyValue(value: any, type: string): boolean {
  if (value === undefined || value === null || value === "") return true;
  // Снятая галочка = значение по умолчанию, гость его не подтверждал.
  if (type === "checkmark") return value !== "checked" && value !== true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    if (Array.isArray(value.choice_ids)) return value.choice_ids.length === 0;
    if (Array.isArray(value.item_ids)) return value.item_ids.length === 0;
    if (value.choice_id !== undefined || value.item_id !== undefined) return false;
    if (Array.isArray(value.fields)) return true; // контейнер (title) — собственного значения нет
    return Object.keys(value).length === 0;
  }
  return false;
}

/** Идентификатор выбранного варианта/элемента каталога — для сравнения в условиях видимости. */
function valueChoiceId(value: any): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value.choice_ids) && value.choice_ids.length) return String(value.choice_ids[0]);
  if (value.choice_id !== undefined) return String(value.choice_id);
  if (Array.isArray(value.item_ids) && value.item_ids.length) return String(value.item_ids[0]);
  if (value.item_id !== undefined) return String(value.item_id);
  return "";
}

/** Человекочитаемое представление значения (для сравнения по тексту и для логов). */
function valueDisplay(value: any, schema: FieldSchema | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(v => valueDisplay(v, schema)).join(", ");

  if (typeof value === "object") {
    if (Array.isArray(value.choice_names) && value.choice_names.length) return String(value.choice_names[0]);
    const choiceId = valueChoiceId(value);
    if (choiceId && schema?.options?.length) {
      const opt = schema.options.find(o => String(o.choice_id) === choiceId);
      if (opt) return opt.choice_value;
    }
    if (Array.isArray(value.values) && value.values.length) return String(value.values[0]);
    if (Array.isArray(value.item_names) && value.item_names.length) return String(value.item_names[0]);
    if (choiceId) return choiceId;
  }
  return "";
}

// ─────────────────────────────────────────────────────────────────────────
//  ВИДИМОСТЬ ПОЛЕЙ (visibility_condition)
//
//  Типы условий Pyrus: 11 — И (children), 10 — ИЛИ (children),
//  1/3 — заполнено (для галочки: отмечено), 2/4 — пусто (галочка: снята),
//  5 — равно, 6 — не равно.
// ─────────────────────────────────────────────────────────────────────────

function evaluateCondition(condition: any, form: FormModel, values: TaskModel): boolean {
  if (!condition) return true;

  const { field_id, condition_type, value, children } = condition;
  const kids: any[] = Array.isArray(children) ? children : [];

  if (condition_type === 11) return kids.every(c => evaluateCondition(c, form, values));
  if (condition_type === 10) return kids.some(c => evaluateCondition(c, form, values));

  if (!field_id) {
    // Узел-группировка без явного типа: трактуем как И по детям.
    return kids.length ? kids.every(c => evaluateCondition(c, form, values)) : true;
  }

  const schema = form.byId.get(Number(field_id));
  const raw = values.get(Number(field_id));
  const type = schema?.type || "text";
  const filled = !isEmptyValue(raw, type);

  const target = String(value ?? "").trim().toLowerCase();
  const asText = valueDisplay(raw, schema).trim().toLowerCase();
  const asId = valueChoiceId(raw) || (type === "checkmark" ? (raw === "checked" ? "1" : "0") : "");

  let result: boolean;
  switch (condition_type) {
    case 1:
    case 3:
      result = filled;
      break;
    case 2:
    case 4:
      result = !filled;
      break;
    case 5:
      result = (asId !== "" && asId === target) || (asText !== "" && asText === target);
      break;
    case 6:
      result = !((asId !== "" && asId === target) || (asText !== "" && asText === target));
      break;
    default:
      // Неизвестное условие: показываем поле, чтобы диалог не встал молча.
      log(`Неизвестный condition_type=${condition_type} для поля ${field_id} — считаю видимым`);
      result = true;
  }

  log(`  условие: поле ${field_id} (${schema?.code || schema?.name || "?"}) значение='${asText || asId || "-"}' op=${condition_type} target='${target}' → ${result}`);
  return result;
}

/** Поле видно, если выполнено его условие и видны все его родители-контейнеры. */
function isFieldVisible(schema: FieldSchema, form: FormModel, values: TaskModel): boolean {
  let current: FieldSchema | undefined = schema;
  const guard = new Set<number>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    if (current.visibility && !evaluateCondition(current.visibility, form, values)) return false;
    current = current.parentId === undefined ? undefined : form.byId.get(current.parentId);
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
//  РАСПОЗНАВАНИЕ ОТВЕТОВ
// ─────────────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return (s || "").trim().toLowerCase().replace(/ё/g, "е");
}

/** Подбор варианта ответа: точное совпадение → вхождение → совпадение по началу слов. */
function findBestMatch(input: string, options: string[]): string | undefined {
  const value = normalize(input);
  if (!value || !options.length) return undefined;

  const exact = options.find(o => normalize(o) === value);
  if (exact) return exact;

  const contains = options.filter(o => {
    const opt = normalize(o);
    return opt.includes(value) || value.includes(opt);
  });
  if (contains.length === 1) return contains[0];

  const inputWords = value.split(/\s+/).filter(w => w.length >= 3);
  const matches = options.filter(o => {
    const optWords = normalize(o).split(/\s+/).filter(w => w.length >= 3);
    return inputWords.some(iw =>
      optWords.some(ow => ow.startsWith(iw.substring(0, 3)) || iw.startsWith(ow.substring(0, 3)))
    );
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function parsePhone(input: string): string | undefined {
  const digits = (input || "").replace(/\D/g, "");
  let normalized = digits;
  if (digits.length === 11 && (digits.startsWith("8") || digits.startsWith("7"))) normalized = "7" + digits.slice(1);
  else if (digits.length === 10 && digits.startsWith("9")) normalized = "7" + digits;
  return /^7\d{10}$/.test(normalized) ? normalized : undefined;
}

function parseCheckmark(input: string): "checked" | "unchecked" | undefined {
  const value = normalize(input);
  if (!value) return undefined;
  if (value === "1") return "checked";
  if (value === "2") return "unchecked";
  if (/^(нет|no|не|неа|не надо|не нужно|отказ|отказываюсь|нету|0|false)\b/.test(value)) return "unchecked";
  if (/^(да|yes|ага|конечно|хочу|есть|имеется|нужно|надо|true)\b/.test(value)) return "checked";
  if (value.includes("не надо") || value.includes("не нужно") || value.includes("не хочу")) return "unchecked";
  if (value.includes("нет")) return "unchecked";
  if (value.includes("да") || value.includes("хочу") || value.includes("есть")) return "checked";
  return undefined;
}

function parseNumber(input: string, step: StepDefinition): number | undefined {
  const match = (input || "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) return undefined;
  const value = parseFloat(match[0]);
  if (!isFinite(value)) return undefined;
  if (step.min !== undefined && value < step.min) return undefined;
  if (step.max !== undefined && value > step.max) return undefined;
  return value;
}

/** «14:30» / «14.30» / «14 30» / «в 14» → UTC-строка «HH:MM». */
function parseTime(input: string): string | undefined {
  const match = (input || "").match(/(\d{1,2})\s*[:.\-\s]?\s*(\d{2})?/);
  if (!match) return undefined;
  const localHours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  if (isNaN(localHours) || localHours > 23 || minutes > 59) return undefined;
  const utcHours = (localHours - TIMEZONE_OFFSET_HOURS + 24) % 24;
  return `${String(utcHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Выбор по номеру из списка вариантов («2»), иначе — по тексту. */
function pickOption(input: string, options: string[]): string | undefined {
  const value = (input || "").trim();
  if (/^\d{1,2}$/.test(value)) {
    const index = parseInt(value, 10) - 1;
    if (index >= 0 && index < options.length) return options[index];
  }
  return findBestMatch(value, options);
}

function isSkipAnswer(input: string): boolean {
  const value = normalize(input);
  return value.length > 0 && SKIP_ANSWERS.includes(value);
}

// ─────────────────────────────────────────────────────────────────────────
//  РАЗБОР ОТВЕТА → ЗНАЧЕНИЕ ПОЛЯ PYRUS
// ─────────────────────────────────────────────────────────────────────────

interface ParseResult {
  /** Готовое значение для field_updates. */
  value?: any;
  /** Шаг осознанно пропущен (необязательное поле). */
  skipped?: boolean;
  /** Не удалось распознать. */
  failed?: boolean;
}

async function parseAnswer(
  step: StepDefinition,
  schema: FieldSchema,
  type: StepType,
  text: string,
  attachments: any[],
  options: string[],
  client: PyrusApiClient,
  form: FormModel
): Promise<ParseResult> {
  // Файл: сначала вложения, иначе — возможность пропустить шаг.
  if (type === "file") {
    if (attachments.length) {
      const uploaded = await uploadAttachments(attachments, client);
      return uploaded.length ? { value: uploaded } : { failed: true };
    }
    return step.optional && text ? { skipped: true } : { failed: true };
  }

  if (!text) return { failed: true };
  if (step.optional && isSkipAnswer(text)) return { skipped: true };

  switch (type) {
    case "phone": {
      const phone = parsePhone(text);
      return phone ? { value: phone } : { failed: true };
    }
    case "number": {
      const num = parseNumber(text, step);
      return num === undefined ? { failed: true } : { value: num };
    }
    case "time": {
      const time = parseTime(text);
      return time ? { value: time } : { failed: true };
    }
    case "checkmark": {
      const mark = parseCheckmark(text);
      return mark ? { value: mark } : { failed: true };
    }
    case "choice": {
      const label = pickOption(text, options);
      if (!label) return { failed: true };
      const option = schema.options?.find(o => o.choice_value === label);
      if (!option) return { failed: true };
      return { value: schema.multiple ? { choice_ids: [option.choice_id] } : { choice_id: option.choice_id } };
    }
    case "catalog": {
      const label = pickOption(text, options);
      if (!label || !schema.catalogId) return { failed: true };
      const items = await form.catalogItems(client, schema.catalogId);
      const item = items.find(i => i?.values?.[0] === label);
      if (!item) return { failed: true };
      return { value: schema.multiple ? { item_ids: [item.item_id] } : { item_id: item.item_id } };
    }
    default: {
      const value = text.trim();
      if (step.min !== undefined && value.length < step.min) return { failed: true };
      if (step.max !== undefined && value.length > step.max) return { failed: true };
      return { value };
    }
  }
}

/** Перекладываем вложения гостя в поле-файл задачи. */
async function uploadAttachments(attachments: any[], client: PyrusApiClient): Promise<any[]> {
  const files: any[] = [];
  for (const att of attachments) {
    if (!att?.id) continue;
    try {
      const blob = await client.files.download({ id: att.id });
      const uploaded = await client.files.upload(blob, att.name || `file_${att.id}`);
      if (uploaded?.guid) files.push({ guid: uploaded.guid, name: att.name });
    } catch (e: any) {
      log(`Не удалось перенести вложение ${att.name || att.id}: ${e?.message || e}`);
    }
  }
  return files;
}

/** Тип обработки шага: из конфигурации, иначе — из схемы формы. */
function resolveStepType(step: StepDefinition, schema: FieldSchema): StepType {
  if (step.type) return step.type;
  switch (schema.type) {
    case "phone": return "phone";
    case "number":
    case "money": return "number";
    case "multiple_choice":
    case "choice": return "choice";
    case "catalog": return "catalog";
    case "checkmark": return "checkmark";
    case "file": return "file";
    case "time": return "time";
    case "date":
    case "due_date": return "date";
    default: return "text";
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  СОСТОЯНИЕ
// ─────────────────────────────────────────────────────────────────────────

function emptyState(): BotState {
  return {
    step_field_code: null,
    error_count: 0,
    completed_steps: [],
    ask_counts: {},
    finished: false,
    last_event_key: null,
  };
}

function parseState(raw: any): BotState {
  const state = emptyState();
  if (typeof raw !== "string" || !raw.trim()) return state;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return state;
    if (typeof parsed.step_field_code === "string") state.step_field_code = parsed.step_field_code;
    if (typeof parsed.error_count === "number") state.error_count = parsed.error_count;
    if (Array.isArray(parsed.completed_steps)) {
      state.completed_steps = parsed.completed_steps.filter((s: any) => typeof s === "string");
    }
    if (parsed.ask_counts && typeof parsed.ask_counts === "object") state.ask_counts = parsed.ask_counts;
    state.finished = parsed.finished === true;
    if (parsed.last_event_key !== undefined && parsed.last_event_key !== null) {
      state.last_event_key = String(parsed.last_event_key);
    }
  } catch (e: any) {
    log(`Состояние повреждено (${e?.message || e}) — начинаю с чистого`);
  }
  return state;
}

// ─────────────────────────────────────────────────────────────────────────
//  КОММЕНТАРИЙ-ТРИГГЕР
// ─────────────────────────────────────────────────────────────────────────

/**
 * Последний комментарий гостя: идём с конца, пропуская собственные комментарии
 * бота и исходящие сообщения. Канал ответа берём из последнего входящего.
 */
function extractTrigger(task: any, botUserId: number): Trigger {
  const comments: any[] = Array.isArray(task?.comments) ? task.comments : [];
  const result: Trigger = { key: null, text: "", attachments: [], channel: undefined };

  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (!c) continue;
    if (c.author?.id === botUserId) continue;
    if (c.channel?.direction === "outbound") continue;

    if (!result.channel && c.channel?.type) result.channel = { type: c.channel.type };

    const text = (c.text || c.formatted_text || "").trim();
    const attachments = Array.isArray(c.attachments) ? c.attachments : [];
    if (!result.key && (text || attachments.length)) {
      result.key = c.id !== undefined ? String(c.id) : null;
      result.text = text;
      result.attachments = attachments;
    }
    if (result.key && result.channel) break;
  }

  // Канал не нашёлся среди входящих — берём из любого комментария с каналом.
  if (!result.channel) {
    for (let i = comments.length - 1; i >= 0; i--) {
      const type = comments[i]?.channel?.type;
      if (type) { result.channel = { type }; break; }
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────
//  ОСНОВНОЙ СЦЕНАРИЙ
// ─────────────────────────────────────────────────────────────────────────

export default async function (request: BotHookRequest): Promise<BotHookResponse | null> {
  logs.length = 0;
  const task: any = (request as any)?.task;
  const client = new PyrusApiClient(request.access_token);
  const taskId = Number(task?.id ?? (request as any)?.task_id ?? 0);

  let reply: any = null;
  try {
    reply = await run(request, task, client);
  } catch (e: any) {
    // Технические детали — только во внутренний комментарий, гостю нейтральный текст.
    log(`ФАТАЛЬНАЯ ОШИБКА: ${e?.message || e}\n${e?.stack || ""}`);
    reply = {
      text: MSG.INTERNAL_ERROR,
      approval_choice: "approved",
      channel: extractTrigger(task, request.user_id).channel,
    };
  }

  await flushLogs(client, taskId);
  return reply;
}

async function run(request: BotHookRequest, task: any, client: PyrusApiClient): Promise<any> {
  if (!task) { log("В запросе нет задачи — выходим"); return null; }

  // ── 1. Схема формы целиком (с вложенными полями) ────────────────────────
  const formId = Number(task.form_id ?? (request as any).form_id ?? 0);
  const form = await FormModel.load(client, formId, task.fields || []);

  // ── 2. Значения задачи целиком (с вложенными полями) ────────────────────
  const values = new TaskModel(task.fields || []);

  // ── 3. Состояние из технического поля (оно вложено в «Данные о госте») ──
  const stateFieldId = form.idOf(FIELD_CODES.STATE);
  const state = parseState(values.get(stateFieldId));
  log(`Техническое поле состояния: id=${stateFieldId ?? "НЕ НАЙДЕНО"}, состояние=${JSON.stringify(state)}`);

  if (!stateFieldId) {
    // Без состояния бот не сможет двигаться по шагам — лучше сразу отдать человеку.
    log(`Поле ${FIELD_CODES.STATE} отсутствует в форме — работа бота невозможна`);
    return { text: MSG.INTERNAL_ERROR, approval_choice: "approved" };
  }

  if (state.finished) { log("Диалог уже завершён — бот молчит"); return null; }

  // ── 4. Комментарий-триггер и защита от повторного вызова хука ───────────
  const trigger = extractTrigger(task, request.user_id);
  log(`Триггер: key=${trigger.key}, текст="${trigger.text}", вложений=${trigger.attachments.length}, канал=${trigger.channel?.type || "-"}`);

  if (trigger.key && trigger.key === state.last_event_key) {
    log("Этот комментарий уже обработан — повторный вызов хука, выходим");
    return null;
  }

  const channel = trigger.channel;
  const finish = (text: string, updates: any[], approve: boolean) => {
    const response: any = { text, field_updates: updates };
    if (channel) response.channel = channel;
    if (approve) response.approval_choice = "approved";
    return response;
  };
  const saveState = (updates: any[]) => {
    state.last_event_key = trigger.key ?? state.last_event_key;
    updates.push({ id: stateFieldId, value: JSON.stringify(state) });
    return updates;
  };

  // ── 5. Просьба позвать оператора ────────────────────────────────────────
  if (trigger.text && OPERATOR_TRIGGERS.some(t => normalize(trigger.text).includes(t))) {
    log("Гость просит оператора — передаём диалог");
    state.finished = true;
    return finish(MSG.OPERATOR, saveState([]), true);
  }

  // ── 6. Обработка ответа на текущий шаг ──────────────────────────────────
  const fieldUpdates: any[] = [];
  const pendingCode = state.step_field_code;

  if (pendingCode && (trigger.text || trigger.attachments.length)) {
    const step = ASK_SEQUENCE.find(s => s.code === pendingCode);
    const schema = form.byCode.get(pendingCode);

    if (!step || !schema) {
      log(`Шаг ${pendingCode} больше не существует в форме — сбрасываю его`);
      state.step_field_code = null;
    } else {
      const type = resolveStepType(step, schema);
      const options = await form.optionsFor(client, schema);
      const parsed = await parseAnswer(step, schema, type, trigger.text, trigger.attachments, options, client, form);
      log(`Разбор ответа на «${pendingCode}» (${type}): ${JSON.stringify(parsed)}`);

      if (parsed.failed) {
        state.error_count++;
        if (state.error_count >= MAX_ERRORS) {
          log(`${state.error_count} нераспознанных ответа подряд — зову оператора`);
          state.finished = true;
          return finish(MSG.GIVE_UP, saveState([]), true);
        }
        return finish(buildQuestion(step, options, "Не удалось разобрать ответ. "), saveState([]), false);
      }

      if (!parsed.skipped && parsed.value !== undefined) {
        fieldUpdates.push({ id: schema.id, value: parsed.value });
        values.set(schema.id, parsed.value); // видимость следующих шагов — уже с новым ответом
      }
      state.error_count = 0;
      if (!state.completed_steps.includes(pendingCode)) state.completed_steps.push(pendingCode);
      state.step_field_code = null;
    }
  }

  // ── 7. Следующий вопрос ─────────────────────────────────────────────────
  const next = pickNextStep(form, values, state);

  if (!next) {
    log("Все шаги пройдены — утверждаю этап");
    state.finished = true;
    state.step_field_code = null;
    return finish(MSG.DONE, saveState(fieldUpdates), true);
  }

  const asked = (state.ask_counts[next.step.code] || 0) + 1;
  state.ask_counts[next.step.code] = asked;
  if (asked > MAX_ASKS_PER_FIELD) {
    // Предохранитель: что бы ни сломалось, бот не будет спрашивать одно и то же бесконечно.
    log(`Вопрос «${next.step.code}» задан ${asked} раз — зову оператора`);
    state.finished = true;
    return finish(MSG.GIVE_UP, saveState(fieldUpdates), true);
  }

  state.step_field_code = next.step.code;
  const options = await form.optionsFor(client, next.schema);
  log(`Следующий шаг: ${next.step.code} (задан ${asked}-й раз), пройдено: [${state.completed_steps.join(", ")}]`);

  return finish(buildQuestion(next.step, options), saveState(fieldUpdates), false);
}

/** Первый незаданный, видимый и незаполненный шаг из ASK_SEQUENCE. */
function pickNextStep(form: FormModel, values: TaskModel, state: BotState): { step: StepDefinition; schema: FieldSchema } | null {
  for (const step of ASK_SEQUENCE) {
    const schema = form.byCode.get(step.code);
    if (!schema) { log(`Пропуск ${step.code}: нет в форме`); continue; }
    if (state.completed_steps.includes(step.code)) continue;
    if (!isFieldVisible(schema, form, values)) { log(`Пропуск ${step.code}: скрыто условиями`); continue; }
    if (!isEmptyValue(values.get(schema.id), schema.type)) { log(`Пропуск ${step.code}: уже заполнено`); continue; }
    return { step, schema };
  }
  return null;
}

function buildQuestion(step: StepDefinition, options: string[], prefix = ""): string {
  const parts = [prefix + step.question];
  if (step.hint) parts.push(step.hint);
  if (options.length) {
    parts.push("Можно ответить цифрой:\n" + options.map((o, i) => `${i + 1}. ${o}`).join("\n"));
  } else if (step.optional) {
    parts.push("Если нечего добавить — напишите «нет».");
  }
  return parts.join("\n\n");
}

/** Логи уходят отдельным внутренним комментарием — без channel гость их не увидит. */
async function flushLogs(client: PyrusApiClient, taskId: number): Promise<void> {
  if (!DEBUG_ENABLED || !taskId || !logs.length) return;
  const text = "[BOT-DEBUG]\n" + logs.join("\n");
  try {
    await client.tasks.addComment(taskId, { text: text.slice(0, 10000) });
  } catch (e: any) {
    console.error("Не удалось отправить лог бота:", e?.message || e);
  }
}
```
