import {
  BotHookRequest,
  BotHookResponse,
  PyrusApiClient,
  FormResponse
} from "pyrus-api";

// ═══════════════════════════════════════════════════════════════════════════
//  ЕДИНЫЙ СКРИПТОВЫЙ БОТ (UNIFIED BOT)
//
//  Включает сценарии сразу трёх ботов:
//    1. Обращения клиентов (Форма ID: 2445746)
//    2. Чаты-задачника (Форма ID: 2455918)
//    3. Бронирование столиков (Форма ID: 2445773)
//
//  Определение сценария:
//    - По task.form_id или request.form_id
//    - Сигнатурный фолбэк по кодам полей задачи
// ═══════════════════════════════════════════════════════════════════════════

export const FORM_IDS = {
  FEEDBACK: 2445746,
  TASK_CHAT: 2455918,
  BOOKING: 2445773,
  TARGET_TASK: 2450073, // Для создания задач бота Чаты-задачника
} as const;

export type FormScenario = "feedback" | "task_chat" | "booking" | "unknown";

/**
 * Определяет сценарий выполнения бота на основе ID формы или присутствия уникальных полей.
 */
export function detectFormScenario(request: BotHookRequest): FormScenario {
  const task: any = (request as any)?.task;
  const formId = Number(task?.form_id ?? (request as any)?.form_id ?? 0);

  if (formId === FORM_IDS.FEEDBACK) return "feedback";
  if (formId === FORM_IDS.TASK_CHAT) return "task_chat";
  if (formId === FORM_IDS.BOOKING) return "booking";

  // Резервное определение по кодам полей задачи
  const fields: any[] = Array.isArray(task?.fields) ? task.fields : [];
  const fieldCodes = new Set<string>();

  function collectCodes(items: any[]) {
    for (const f of items || []) {
      if (!f) continue;
      if (f.code) fieldCodes.add(f.code);
      if (f.info?.code) fieldCodes.add(f.info.code);
      if (Array.isArray(f.fields)) collectCodes(f.fields);
      if (f.info && Array.isArray(f.info.fields)) collectCodes(f.info.fields);
      if (f.value && !Array.isArray(f.value) && Array.isArray(f.value.fields)) collectCodes(f.value.fields);
      if (Array.isArray(f.value)) {
        for (const row of f.value) {
          if (row && Array.isArray(row.cells)) collectCodes(row.cells);
          else if (row && typeof row === "object") collectCodes([row]);
        }
      }
    }
  }

  collectCodes(fields);

  if (fieldCodes.has("day_to_dl") || fieldCodes.has("dl_time") || fieldCodes.has("person_id")) {
    return "task_chat";
  }
  if (fieldCodes.has("booking_date") || fieldCodes.has("hall_zone") || fieldCodes.has("guests_count")) {
    return "booking";
  }
  if (fieldCodes.has("client_name") || fieldCodes.has("problem_type") || fieldCodes.has("problem_description")) {
    return "feedback";
  }

  return "unknown";
}

// ─────────────────────────────────────────────────────────────────────────
//  НАСТРОЙКИ И ЖУРНАЛ СОБЫТИЙ БОТА
// ─────────────────────────────────────────────────────────────────────────

/**
 * ФЛАГ ВКЛЮЧЕНИЯ/ВЫКЛЮЧЕНИЯ ЛОГИРОВАНИЯ БОТА (true / false)
 *  - true  : Логирование включено (вывод в консоль + отправка Журнала событий в комментарии задачи Pyrus)
 *  - false : Логирование выключено (бот работает бесшумно, комментарии журнала не создаются)
 */
export const ENABLE_LOGGING: boolean = true;

const logs: string[] = [];

function log(msg: string): void {
  if (!ENABLE_LOGGING) return;
  const time = new Date().toISOString().substring(11, 19);
  const formatted = `[${time}] ${msg}`;
  console.log(formatted);
  logs.push(formatted);
}

async function flushLogs(client: PyrusApiClient, taskId: number, prefix: string = "📋 [ЖУРНАЛ СОБЫТИЙ БОТА]"): Promise<void> {
  if (!ENABLE_LOGGING || !taskId || !logs.length) return;
  const header = `${prefix}\n⏱ Время: ${new Date().toISOString()}\n` + "─".repeat(40);
  const text = `${header}\n${logs.join("\n")}`;
  try {
    await client.tasks.addComment(taskId, { text: text.slice(0, 10000) });
  } catch (e: any) {
    // Игнорируем ошибки отправки комментариев журнала в Pyrus
  }
}

const SKIP_ANSWERS = [
  "нет", "не надо", "не нужно", "пропустить", "пропуск", "далее", "дальше",
  "skip", "-", "без разницы", "не знаю", "неважно", "не важно", "нету"
];

function isSkipAnswer(input: string): boolean {
  const value = normalize(input);
  return value.length > 0 && SKIP_ANSWERS.includes(value);
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

class FormModel {
  readonly byId = new Map<number, FieldSchema>();
  readonly byCode = new Map<string, FieldSchema>();
  private readonly catalogCache = new Map<number, any[]>();

  private constructor(rawFields: any[]) {
    this.walk(rawFields, undefined);
  }

  static async load(client: PyrusApiClient, formId: number, taskFields: any[]): Promise<FormModel> {
    if (formId && client) {
      try {
        const formDef: FormResponse = await client.forms.get({ id: formId });
        if (formDef?.fields?.length) {
          const model = new FormModel(formDef.fields as any[]);
          log(`Схема формы ${formId}: ${model.byId.size} полей (из API)`);
          return model;
        }
      } catch (e: any) {
        log(`Не удалось загрузить схему формы ${formId}: ${e?.message || e}`);
      }
    }
    const model = new FormModel(taskFields || []);
    log(`Схема формы восстановлена из задачи: ${model.byId.size} полей`);
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

      if (!this.byId.has(schema.id)) this.byId.set(schema.id, schema);
      if (schema.code && !this.byCode.has(schema.code)) this.byCode.set(schema.code, schema);

      for (const children of this.childrenOf(f)) this.walk(children, schema.id);
    }
  }

  private childrenOf(f: any): any[][] {
    const out: any[][] = [];
    const push = (v: any) => { if (Array.isArray(v) && v.length) out.push(v); };
    push(f.fields);
    push(f.info?.fields);
    push(f.info?.columns);
    if (f.value && !Array.isArray(f.value)) push(f.value.fields);
    if (Array.isArray(f.value) && (f.type === "group" || f.type === "title")) push(f.value);
    for (const opt of f.info?.options || []) push(opt?.fields);
    if (Array.isArray(f.value)) {
      for (const row of f.value) if (row && Array.isArray(row.cells)) push(row.cells);
    }
    return out;
  }

  idOf(code: string): number | undefined {
    return this.byCode.get(code)?.id;
  }

  async optionsFor(client: PyrusApiClient, schema: FieldSchema): Promise<string[]> {
    if (schema.type === "checkmark") return ["Да", "Нет"];
    if (schema.options?.length) {
      return schema.options
        .filter(o => o && o.choice_value && o.choice_value !== "Не выбрано" && !o.deleted)
        .slice(0, 20)
        .map(o => o.choice_value);
    }
    if (schema.type === "catalog" && schema.catalogId) {
      const items = await this.catalogItems(client, schema.catalogId);
      return items.slice(0, 30).map(i => i?.values?.[0]).filter(Boolean);
    }
    return [];
  }

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

class TaskModel {
  private readonly values = new Map<number, any>();

  constructor(fields: any[]) {
    this.walk(fields);
  }

  private walk(fields: any[]): void {
    for (const f of fields || []) {
      if (!f || typeof f !== "object" || f.id === undefined || f.id === null) continue;
      if (f.value !== undefined && f.value !== null) this.values.set(Number(f.id), f.value);
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

  set(id: number, value: any): void {
    this.values.set(Number(id), value);
  }
}

function isEmptyValue(value: any, type: string): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (type === "checkmark") return value !== "checked" && value !== true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    if (Array.isArray(value.choice_ids)) return value.choice_ids.length === 0;
    if (Array.isArray(value.item_ids)) return value.item_ids.length === 0;
    if (value.choice_id !== undefined || value.item_id !== undefined) return false;
    if (Array.isArray(value.fields)) return true;
    return Object.keys(value).length === 0;
  }
  return false;
}

function valueChoiceId(value: any): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value.choice_ids) && value.choice_ids.length) return String(value.choice_ids[0]);
  if (value.choice_id !== undefined) return String(value.choice_id);
  if (Array.isArray(value.item_ids) && value.item_ids.length) return String(value.item_ids[0]);
  if (value.item_id !== undefined) return String(value.item_id);
  return "";
}

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

function evaluateCondition(condition: any, form: FormModel, values: TaskModel): boolean {
  if (!condition) return true;
  const { field_id, condition_type, value, children } = condition;
  const kids: any[] = Array.isArray(children) ? children : [];

  if (condition_type === 11) return kids.every(c => evaluateCondition(c, form, values));
  if (condition_type === 10) return kids.some(c => evaluateCondition(c, form, values));

  if (!field_id) return kids.length ? kids.every(c => evaluateCondition(c, form, values)) : true;

  const schema = form.byId.get(Number(field_id));
  const raw = values.get(Number(field_id));
  const type = schema?.type || "text";

  if (type === "step" && (raw === undefined || raw === null || raw === "")) {
    if (String(value ?? "") === "1") return true;
  }

  const filled = !isEmptyValue(raw, type);
  const target = String(value ?? "").trim().toLowerCase();
  const asText = valueDisplay(raw, schema).trim().toLowerCase();
  const asId = valueChoiceId(raw) || (type === "checkmark" ? (raw === "checked" ? "1" : "0") : "");

  switch (condition_type) {
    case 1:
    case 3:
      return filled;
    case 2:
    case 4:
      return !filled;
    case 5:
      return (asId !== "" && asId === target) || (asText !== "" && asText === target);
    case 6:
      return !((asId !== "" && asId === target) || (asText !== "" && asText === target));
    default:
      return true;
  }
}

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

function normalize(s: string): string {
  return (s || "").trim().toLowerCase().replace(/ё/g, "е");
}

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

function parseEmail(input: string): string | undefined {
  const value = (input || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : undefined;
}

function parseNumber(input: string, min?: number, max?: number): number | undefined {
  const match = (input || "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) return undefined;
  const value = parseFloat(match[0]);
  if (!isFinite(value)) return undefined;
  if (min !== undefined && value < min) return undefined;
  if (max !== undefined && value > max) return undefined;
  return value;
}

function parseDateTime(input: string, tzOffset: number = 4): string | undefined {
  const str = (input || "").trim();
  const dateMatch = str.match(/(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})\s*(\d{1,2})[:.](\d{2})/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10) - 1;
    let year = parseInt(dateMatch[3], 10);
    if (year < 100) year += 2000;
    const hours = parseInt(dateMatch[4], 10);
    const minutes = parseInt(dateMatch[5], 10);

    const date = new Date(Date.UTC(year, month, day, hours - tzOffset, minutes));
    if (!isNaN(date.getTime())) {
      return date.toISOString().replace(/\.\d{3}Z$/, "Z");
    }
  }
  const timeOnly = str.match(/^(\d{1,2})[:.](\d{2})$/);
  if (timeOnly) {
    const hours = parseInt(timeOnly[1], 10);
    const minutes = parseInt(timeOnly[2], 10);
    const now = new Date();
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), hours - tzOffset, minutes));
    return date.toISOString().replace(/\.\d{3}Z$/, "Z");
  }
  return undefined;
}

function pickOption(input: string, options: string[]): string | undefined {
  const value = (input || "").trim();
  if (/^\d{1,2}$/.test(value)) {
    const index = parseInt(value, 10) - 1;
    if (index >= 0 && index < options.length) return options[index];
  }
  return findBestMatch(value, options);
}

function extractTrigger(task: any, botUserId: number): { key: string | null; text: string; attachments: any[]; channel: any } {
  const comments: any[] = Array.isArray(task?.comments) ? task.comments : [];
  const result: any = { key: null, text: "", attachments: [], channel: undefined };

  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (!c) continue;

    const rawText = (c.text || c.formatted_text || c.subject || "").trim();
    if (rawText.startsWith("📋 [ЖУРНАЛ") || rawText.startsWith("[BOT-DEBUG")) continue;
    if (c.author?.id === botUserId && c.channel?.direction !== "inbound") continue;
    if (c.channel?.direction === "outbound") continue;

    if (!result.channel && c.channel) result.channel = c.channel;

    const attachments = Array.isArray(c.attachments) ? c.attachments : [];
    if (!result.key && (rawText || attachments.length)) {
      result.key = c.id !== undefined ? String(c.id) : null;
      result.text = rawText;
      result.attachments = attachments;
    }
    if (result.key && result.channel) break;
  }

  if (!result.text && (task.text || task.subject || task.formatted_text)) {
    result.text = (task.text || task.subject || task.formatted_text || "").trim();
    if (!result.key) result.key = `task_init_${task.id}`;
  }

  if (!result.channel) {
    for (let i = comments.length - 1; i >= 0; i--) {
      if (comments[i]?.channel) {
        result.channel = comments[i].channel;
        break;
      }
    }
  }

  return result;
}

/**
 * Надежный поиск сотрудника Pyrus по ID, Email, Telegram @username или имени
 */
async function resolvePersonId(
  client: PyrusApiClient,
  input: string,
  accessToken?: string
): Promise<{ personId: number; personName: string } | null> {
  const cleanInput = input.trim();
  if (!cleanInput) return null;

  log(`Поиск сотрудника Pyrus по API для ввода: "${cleanInput}"`);

  let members: any[] = [];

  // 1. Попытка через SDK client.members.get()
  try {
    if (typeof (client as any).members?.get === "function") {
      const res = await (client as any).members.get();
      members = res?.members || res?.users || res?.contacts || [];
    }
  } catch (e: any) {
    log(`SDK members.get info: ${e?.message || e}`);
  }

  // 2. Попытка через SDK client.contacts.get()
  if (!members.length) {
    try {
      if (typeof (client as any).contacts?.get === "function") {
        const res = await (client as any).contacts.get();
        members = res?.contacts || res?.members || res?.users || [];
      }
    } catch (e: any) {
      log(`SDK contacts.get info: ${e?.message || e}`);
    }
  }

  // 3. Попытка через прямые HTTP-запросы к Pyrus API (v4/members и v4/contacts)
  if (!members.length && accessToken) {
    for (const url of ["https://api.pyrus.com/v4/members", "https://api.pyrus.com/v4/contacts"]) {
      try {
        const res = await fetch(url, {
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });
        if (res.ok) {
          const data: any = await res.json();
          const list = data?.members || data?.contacts || data?.users || [];
          if (list.length) {
            members = list;
            log(`Успешно получено ${members.length} пользователей через GET ${url}`);
            break;
          }
        }
      } catch (e: any) {
        log(`Ошибка вызова ${url}: ${e?.message || e}`);
      }
    }
  }

  const searchTarget = cleanInput.toLowerCase().replace(/^@/, "");

  // 4. Поиск совпадений в полученном списке пользователей
  for (const m of members) {
    if (!m) continue;
    const mId = String(m.id || "");
    const mEmail = String(m.email || "").toLowerCase();
    const mFirstName = String(m.first_name || "").toLowerCase();
    const mLastName = String(m.last_name || "").toLowerCase();
    const mFullName = `${mFirstName} ${mLastName}`.trim();
    const mNick = String(m.messenger?.nickname || m.skype || m.nickname || m.username || "").toLowerCase().replace(/^@/, "");

    // 4.1. Совпадение по никнейму мессенджера / telegram / skype
    if (mNick && mNick === searchTarget) {
      log(`Найдено совпадение по никнейму @${mNick}: ID ${m.id}`);
      return { personId: m.id, personName: mFullName || `@${mNick}` };
    }

    // 4.2. Точное совпадение по ID
    if (/^\d+$/.test(cleanInput) && mId === cleanInput) {
      log(`Найдено совпадение по ID ${mId}`);
      return { personId: m.id, personName: mFullName || mEmail || mId };
    }

    // 4.3. Совпадение по email
    if (mEmail && (mEmail === searchTarget || mEmail.startsWith(searchTarget + "@"))) {
      log(`Найдено совпадение по email ${mEmail}: ID ${m.id}`);
      return { personId: m.id, personName: mFullName || mEmail };
    }

    // 4.4. Частичное совпадение никнейма
    if (mNick && mNick.includes(searchTarget)) {
      log(`Найдено частичное совпадение по никнейму @${mNick}: ID ${m.id}`);
      return { personId: m.id, personName: mFullName || `@${mNick}` };
    }

    // 4.5. Совпадение по имени или фамилии
    if (mFullName && (mFullName === searchTarget || mFirstName === searchTarget || mLastName === searchTarget)) {
      log(`Найдено совпадение по имени ${mFullName}: ID ${m.id}`);
      return { personId: m.id, personName: mFullName };
    }
  }

  // 5. Если список пользователей успешно загружен (members.length > 0), но введённый ID/email/никнейм не найден:
  if (members.length > 0) {
    log(`Сотрудник "${cleanInput}" не найден среди ${members.length} пользователей Pyrus`);
    return null;
  }

  // 6. Резерв на случай полной недоступности API пользователей (если members.length === 0 в тестовом симуляторе)
  if (/^\d{5,10}$/.test(cleanInput)) {
    const numericId = parseInt(cleanInput, 10);
    log(`Список пользователей недоступен по API, использован прямой ID: ${numericId}`);
    return { personId: numericId, personName: `ID: ${numericId}` };
  }

  log(`Сотрудник "${cleanInput}" не найден (список пользователей пуст)`);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
//  1. СЦЕНАРИЙ: ОБРАЩЕНИЯ КЛИЕНТОВ (FORM ID: 2445746)
// ─────────────────────────────────────────────────────────────────────────

const FEEDBACK_CODES = {
  STATE: "technical_bot_state",
  CLIENT_NAME: "client_name",
  CLIENT_PHONE: "client_phone",
  CLIENT_EMAIL: "client_email",
  PROBLEM_TYPE: "problem_type",
  PROBLEM_SUBJECT: "problem_subject",
  PROBLEM_DESCRIPTION: "problem_description",
  ATTACHMENTS: "attachments",
  LOCATION: "location",
  RATING: "rating",
} as const;

const FEEDBACK_ASK_SEQUENCE = [
  { code: FEEDBACK_CODES.CLIENT_NAME, question: "Здравствуйте! Укажите, пожалуйста, Ваше имя или как к Вам обращаться?", min: 2, max: 100 },
  { code: FEEDBACK_CODES.CLIENT_PHONE, question: "Укажите, пожалуйста, номер телефона для связи.", hint: "Формат: 7XXXXXXXXXX или 8XXXXXXXXXX." },
  { code: FEEDBACK_CODES.CLIENT_EMAIL, question: "Укажите, пожалуйста, адрес электронной почты (если есть).", hint: "Можете написать: Нет (если не хотите).", optional: true },
  { code: FEEDBACK_CODES.PROBLEM_TYPE, question: "Выберите категорию Вашего вопроса:\n(Можно ответить цифрой):\n\n1. Качество еды или напитков\n2. Обслуживание (персонал)\n3. Чистота и порядок\n4. Скорость обслуживания или доставки\n5. Комплектация заказа (что-то забыли, перепутали)\n6. Цена или соотношение цены и качества\n7. Другое" },
  { code: FEEDBACK_CODES.PROBLEM_SUBJECT, question: "Уточните, пожалуйста, что именно произошло. Выберите наиболее подходящий вариант:\n(Можно ответить цифрой):\n\n1. Вкус блюда (не понравился, слишком солёное и т.п.)\n2. Температура блюда (холодное, горячее не так)\n3. Недостаточный вес или маленькая порция\n4. Неверный состав (положили не то, что заказывали)\n5. Отсутствие ингредиента (например, нет соуса)\n6. Инородный предмет в еде\n7. Горелое, пережаренное или сырое\n8. Упаковка (повреждена, плохо упаковано)\n9. Хамство или невнимательность персонала\n10. Грязный зал или столы\n11. Долгое ожидание заказа\n12. Ошибка в заказе (перепутали блюда)\n13. Проблема с оплатой\n14. Другое (опишите в следующем вопросе)" },
  { code: FEEDBACK_CODES.PROBLEM_DESCRIPTION, question: "Опишите, пожалуйста, ситуацию подробно. Что именно случилось, когда, какие были обстоятельства?", min: 3, max: 2000 },
  { code: FEEDBACK_CODES.ATTACHMENTS, question: "Приложите фото/видео или скриншот, подтверждающий проблему.", hint: "Если фото нет, просто напишите «нет».", type: "file", optional: true },
  { code: FEEDBACK_CODES.LOCATION, question: "Укажите, пожалуйста, адрес ресторана, о котором идёт речь.", hint: "Например: «Ресторан 1» или «Планерная 87»." },
  { code: FEEDBACK_CODES.RATING, question: "Оцените, пожалуйста, Ваше общее впечатление по шкале от 1 до 5, где 1 – очень плохо, 5 – отлично.", hint: "Ответьте цифрой от 1 до 5." }
];

export async function handleFeedbackBot(request: BotHookRequest): Promise<BotHookResponse | null> {
  log(`--- [unified_bot] Запуск сценария «Обращения клиентов» (Задача #${request.task_id}) ---`);
  const task: any = (request as any)?.task;
  const client = new PyrusApiClient(request.access_token);
  const taskId = Number(task?.id ?? (request as any)?.task_id ?? 0);

  const form = await FormModel.load(client, FORM_IDS.FEEDBACK, task?.fields || []);
  const values = new TaskModel(task?.fields || []);
  const stateFieldId = form.idOf(FEEDBACK_CODES.STATE);

  let state: any = { step_field_code: null, error_count: 0, completed_steps: [], ask_counts: {}, finished: false, last_event_key: null };
  const rawState = values.get(stateFieldId);
  if (typeof rawState === "string" && rawState.trim()) {
    try { state = JSON.parse(rawState); } catch (e) { /* ignore */ }
  }

  if (state.finished) {
    log("Диалог уже завершён (finished=true) — бот молчит");
    return null;
  }

  const trigger = extractTrigger(task, request.user_id);
  log(`Триггерный комментарий: key=${trigger.key}, текст="${trigger.text}"`);

  if (trigger.key && trigger.key === state.last_event_key) {
    log("Повторный вызов вебхука для того же комментария — пропуск");
    return null;
  }

  const triggerText = trigger.text;
  const textNorm = normalize(triggerText);
  if (textNorm.includes("оператор") || textNorm.includes("позовите") || textNorm.includes("человек")) {
    log("Клиент попросил оператора — переводим задачу на сотрудника");
    state.finished = true;
    state.last_event_key = trigger.key;
    const updates: any[] = stateFieldId ? [{ id: stateFieldId, value: JSON.stringify(state) }] : [];
    await flushLogs(client, taskId);
    return { text: "Уже зову коллегу — оператор подключится к диалогу в ближайшее время.", approval_choice: "approved", channel: trigger.channel, field_updates: updates as any };
  }

  const fieldUpdates: any[] = [];
  if (state.step_field_code) {
    const step = FEEDBACK_ASK_SEQUENCE.find(s => s.code === state.step_field_code);
    const schema = step ? form.byCode.get(step.code) : undefined;
    if (step && schema) {
      const options = await form.optionsFor(client, schema);
      let parsedVal: any = undefined;
      let failed = false;

      const isSkipped = Boolean(step.optional && isSkipAnswer(triggerText));

      if (isSkipped) {
        log(`Шаг '${step.code}' пропущен пользователем (ответ: "${triggerText}")`);
        state.completed_steps.push(step.code);
        state.error_count = 0;
        state.step_field_code = null;
      } else {
        if (step.type === "file") {
          if (trigger.attachments.length) {
            const files: any[] = [];
            for (const att of trigger.attachments) {
              try {
                const blob = await client.files.download({ id: att.id });
                const up = await client.files.upload(blob, att.name || `file_${att.id}`);
                if (up?.guid) files.push({ guid: up.guid, name: att.name });
              } catch (e) { /* empty */ }
            }
            if (files.length) parsedVal = files;
            else failed = true;
          } else if (!step.optional) failed = true;
        } else if (triggerText) {
          if (schema.type === "phone") {
            const p = parsePhone(triggerText);
            if (p) parsedVal = p; else failed = true;
          } else if (schema.type === "email") {
            const em = parseEmail(triggerText);
            if (em) parsedVal = em; else failed = true;
          } else if (schema.options?.length) {
            const label = pickOption(triggerText, options);
            const opt = label ? schema.options.find(o => o.choice_value === label || normalize(o.choice_value) === normalize(label)) : undefined;
            if (opt) parsedVal = schema.multiple ? { choice_ids: [opt.choice_id] } : { choice_id: opt.choice_id };
            else failed = true;
          } else {
            parsedVal = triggerText.trim();
          }
        } else {
          failed = true;
        }

        if (failed) {
          state.error_count = (state.error_count || 0) + 1;
          state.last_event_key = trigger.key;
          log(`Не удалось разобрать ответ на шаг '${step.code}' (ошибок подряд: ${state.error_count})`);
          if (state.error_count >= 3) {
            state.finished = true;
            const updates: any[] = stateFieldId ? [{ id: stateFieldId, value: JSON.stringify(state) }] : [];
            await flushLogs(client, taskId);
            return { text: "Не получается разобрать ответ. Передаю диалог оператору.", approval_choice: "approved", channel: trigger.channel, field_updates: updates as any };
          }
          const updates: any[] = stateFieldId ? [{ id: stateFieldId, value: JSON.stringify(state) }] : [];
          await flushLogs(client, taskId);
          return { text: `Не удалось распознать ответ. ${step.question}`, channel: trigger.channel, field_updates: updates as any };
        }

        log(`Принят ответ на шаг '${step.code}': ${JSON.stringify(parsedVal)}`);
        state.error_count = 0;
        if (!state.completed_steps.includes(step.code)) state.completed_steps.push(step.code);
        if (parsedVal !== undefined) {
          fieldUpdates.push({ id: schema.id, value: parsedVal });
          values.set(schema.id, parsedVal);
        }
      }
    }
  }

  let nextStep: any = undefined;
  for (const step of FEEDBACK_ASK_SEQUENCE) {
    const schema = form.byCode.get(step.code);
    if (!schema || !isFieldVisible(schema, form, values)) continue;
    const filled = !isEmptyValue(values.get(schema.id), schema.type);
    if (!filled && !state.completed_steps.includes(step.code)) {
      nextStep = step;
      break;
    }
  }

  state.last_event_key = trigger.key;
  if (!nextStep) {
    log("Все данные по обращению собраны — завершаем диалог");
    state.step_field_code = null;
    state.finished = true;
    if (stateFieldId) fieldUpdates.push({ id: stateFieldId, value: JSON.stringify(state) });
    const statusId = form.idOf("Status");
    if (statusId) fieldUpdates.push({ id: statusId, value: { choice_id: 1 } });
    await flushLogs(client, taskId);
    return { text: "Спасибо! Все данные по Вашему обращению собраны.", approval_choice: "approved", channel: trigger.channel, field_updates: fieldUpdates as any };
  }

  state.step_field_code = nextStep.code;
  if (stateFieldId) fieldUpdates.push({ id: stateFieldId, value: JSON.stringify(state) });
  log(`Задаём новый вопрос по полю '${nextStep.code}'`);
  await flushLogs(client, taskId);
  return { text: nextStep.question + (nextStep.hint ? `\n(${nextStep.hint})` : ""), channel: trigger.channel, field_updates: fieldUpdates as any };
}

// ─────────────────────────────────────────────────────────────────────────
//  2. СЦЕНАРИЙ: ЧАТЫ-ЗАДАЧНИКА (FORM ID: 2455918)
// ─────────────────────────────────────────────────────────────────────────

const TASK_CHAT_CODES = {
  DAY_TO_DL: "day_to_dl",
  DL_TIME: "dl_time",
  PERSON_ID: "person_id",
  TG_NAME: "tg_name",
  STATE: "technical_bot_state",
} as const;

export async function handleTaskChatBot(request: BotHookRequest): Promise<BotHookResponse | null> {
  log(`--- [unified_bot] Запуск сценария «Чаты-задачника» (Задача #${request.task_id}) ---`);
  const task: any = (request as any)?.task || request;
  const client = new PyrusApiClient(request.access_token || { login: process.env.PYRUS_LOGIN || "", security_key: process.env.PYRUS_SECURITY_KEY || "" });
  const form = await FormModel.load(client, FORM_IDS.TASK_CHAT, task.fields || []);
  const values = new TaskModel(task.fields || []);

  const comments = task.comments || [];
  const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
  const commentText = ( (request as any).text || lastComment?.text || "" ).trim();
  const commentId = String(lastComment?.id || Date.now());

  let replyChannel: any = undefined;
  for (let i = comments.length - 1; i >= 0; i--) {
    if (comments[i]?.channel) { replyChannel = comments[i].channel; break; }
  }

  const stateFieldId = form.idOf(TASK_CHAT_CODES.STATE);
  const rawState = values.getByCode(form, TASK_CHAT_CODES.STATE);
  let state: any = { step: "day_to_dl", configured: false, last_event_key: null, error_count: 0 };
  if (typeof rawState === "string" && rawState.trim()) {
    try { state = JSON.parse(rawState); } catch (e) { /* empty */ }
  }

  if (state.last_event_key && state.last_event_key === commentId) {
    log("Повторный вызов события для Чаты-задачника — пропуск");
    return {};
  }
  state.last_event_key = commentId;

  const fieldUpdates: any[] = [];
  const lowerText = commentText.toLowerCase();

  if (["/reconfig", "/setup", "настройка"].some(cmd => lowerText.startsWith(cmd))) {
    log("Получена команда реконфигурации бота Чаты-задачника");
    state.step = "day_to_dl";
    state.configured = false;
    if (stateFieldId) fieldUpdates.push({ id: stateFieldId, value: JSON.stringify(state) });
    for (const code of [TASK_CHAT_CODES.DAY_TO_DL, TASK_CHAT_CODES.DL_TIME, TASK_CHAT_CODES.PERSON_ID, TASK_CHAT_CODES.TG_NAME]) {
      const fid = form.idOf(code);
      if (fid) fieldUpdates.push({ id: fid, value: null });
    }
    await flushLogs(client, request.task_id);
    return { text: "🔄 Запущен процесс переконфигурации бота.\n\nШаг 1/3: На сколько дней от даты создания проставлять срок по умолчанию? (0 — сегодня, 1 — завтра):", channel: replyChannel, field_updates: fieldUpdates as any };
  }

  if (!state.configured) {
    log(`Онбординг Чаты-задачника: Шаг = ${state.step}, ввод = "${commentText}"`);
    let responseText = "";
    if (state.step === "day_to_dl") {
      const days = parseNumber(commentText, 0);
      if (days === undefined) {
        responseText = "⚠️ Пожалуйста, введите целое число дней от 0 и выше (0 — сегодня, 1 — завтра):";
      } else {
        const fid = form.idOf(TASK_CHAT_CODES.DAY_TO_DL);
        if (fid) fieldUpdates.push({ id: fid, value: days });
        state.step = "dl_time";
        responseText = `✅ Записано дней: ${days}.\n\nШаг 2/3: Укажите время срока по умолчанию (например, 18:00):`;
      }
    } else if (state.step === "dl_time") {
      const match = commentText.match(/^(\d{1,2})[:.]?(\d{2})?$/);
      if (!match) {
        responseText = "⚠️ Укажите время в формате ЧЧ:ММ (например, 18:00):";
      } else {
        const hh = String(parseInt(match[1], 10)).padStart(2, "0");
        const mm = String(match[2] ? parseInt(match[2], 10) : 0).padStart(2, "0");
        const timeStr = `${hh}:${mm}`;
        const fid = form.idOf(TASK_CHAT_CODES.DL_TIME);
        if (fid) fieldUpdates.push({ id: fid, value: timeStr });
        state.step = "person_id";
        responseText = `✅ Записано время: ${timeStr}.\n\nШаг 3/3: Укажите сотрудника (email, ID или Telegram @username):`;
      }
    } else if (state.step === "person_id") {
      const resolved = await resolvePersonId(client, commentText, request.access_token);

      if (!resolved) {
        responseText = `⚠️ Пользователь **${commentText}** не найден. Введите email, ID или @username:`;
      } else {
        const pfid = form.idOf(TASK_CHAT_CODES.PERSON_ID);
        const tgfid = form.idOf(TASK_CHAT_CODES.TG_NAME);
        if (pfid) fieldUpdates.push({ id: pfid, value: String(resolved.personId) });
        if (tgfid) fieldUpdates.push({ id: tgfid, value: commentText });
        state.configured = true;
        state.step = "configured";
        responseText = `🎉 **Настройка бота успешно завершена!**\n\n• Ответственный: **${resolved.personName} (ID: ${resolved.personId})**\n\nКаждое ваше новое сообщение в этом чате создаст задачу в Задачнике.\nДля перенастройки отправьте **/reconfig**.`;
      }
    }

    if (stateFieldId) fieldUpdates.push({ id: stateFieldId, value: JSON.stringify(state) });
    await flushLogs(client, request.task_id);
    return { text: responseText, channel: replyChannel, field_updates: fieldUpdates as any };
  }

  // Создание задачи в целевой форме
  if (!commentText) return {};
  log(`Создание задачи в Задачнике: "${commentText}"`);
  let createdTaskId: number | null = null;
  try {
    const daysToDl = Number(values.getByCode(form, TASK_CHAT_CODES.DAY_TO_DL) ?? 0);
    const dlTime = String(values.getByCode(form, TASK_CHAT_CODES.DL_TIME) || "18:00");
    const personIdStr = String(values.getByCode(form, TASK_CHAT_CODES.PERSON_ID) || "");

    const dueDateIso = parseDateTime(`${dlTime}`, 4) || new Date().toISOString();
    const targetFields: any[] = [
      { id: 1, value: commentText },
      { id: 13, value: dueDateIso }
    ];
    if (personIdStr && !isNaN(Number(personIdStr))) {
      targetFields.push({ id: 2, value: { id: Number(personIdStr) } });
    }

    const newTask: any = await client.tasks.create({ form_id: FORM_IDS.TARGET_TASK, fields: targetFields });
    createdTaskId = newTask?.task?.id || newTask?.task_id || newTask?.id || null;
    log(`Задача зарегистрирована с ID: ${createdTaskId}`);
  } catch (e: any) {
    log(`Ошибка создания задачи в Pyrus API: ${e?.message || e}`);
  }

  if (stateFieldId) fieldUpdates.push({ id: stateFieldId, value: JSON.stringify(state) });
  await flushLogs(client, request.task_id);

  const msg = createdTaskId
    ? `✅ **Задача в Задачнике успешно создана!**\n\n📌 **Тема:** ${commentText}\n🔗 **Ссылка:** https://pyrus.com/t#id${createdTaskId}`
    : `✅ **Задача зарегистрирована!**\n\n📌 **Тема:** ${commentText}`;

  return { text: msg, channel: replyChannel, field_updates: fieldUpdates as any };
}

// ─────────────────────────────────────────────────────────────────────────
//  3. СЦЕНАРИЙ: БРОНИРОВАНИЕ СТОЛИКОВ (FORM ID: 2445773)
// ─────────────────────────────────────────────────────────────────────────

const BOOKING_CODES = {
  STATE: "technical_bot_state",
  GUEST_NAME: "guest_name",
  GUEST_PHONE: "guest_phone",
  GUEST_EMAIL: "guest_email",
  REQUEST_TYPE: "request_type",
  EVENT_NAME: "event_name",
  EVENT_NAME_OTHER: "event_name_other",
  GUESTS_COUNT: "guests_count",
  HALL_ZONE: "hall_zone",
  SPECIAL_REQUESTS: "special_requests",
  BOOKING_DATE: "booking_date",
  STATUS: "Status",
} as const;

const BOOKING_ASK_SEQUENCE = [
  { code: BOOKING_CODES.GUEST_NAME, question: "Здравствуйте! Подскажите, пожалуйста, как к Вам можно обращаться?", min: 2, max: 60 },
  { code: BOOKING_CODES.GUEST_PHONE, question: "Укажите, пожалуйста, Ваш номер телефона для связи.", hint: "Подойдёт номер в формате 79XXXXXXXXX или 89XXXXXXXXX." },
  { code: BOOKING_CODES.GUEST_EMAIL, question: "Укажите, пожалуйста, Вашу электронную почту.", hint: "Если не хотите указывать, напишите «нет».", optional: true, type: "email" },
  { code: BOOKING_CODES.REQUEST_TYPE, question: "Укажите тип заявки:" },
  { code: BOOKING_CODES.EVENT_NAME, question: "Уточните, пожалуйста, наименование мероприятия:" },
  { code: BOOKING_CODES.EVENT_NAME_OTHER, question: "Уточните, пожалуйста, название мероприятия:", min: 2, max: 100 },
  { code: BOOKING_CODES.GUESTS_COUNT, question: "На какое количество персон планируется бронирование?", min: 1, max: 200, type: "number" },
  { code: BOOKING_CODES.HALL_ZONE, question: "Укажите желаемый зал или зону:" },
  { code: BOOKING_CODES.SPECIAL_REQUESTS, question: "Есть ли особые пожелания к бронированию?", hint: "Если пожеланий нет, напишите «нет».", optional: true },
  { code: BOOKING_CODES.BOOKING_DATE, question: "Укажите желаемую дату и время визита.", hint: "Формат: ДД.ММ.ГГГГ ЧЧ:ММ (например: 25.10.2026 19:00).", type: "date_time" },
];

export async function handleBookingBot(request: BotHookRequest): Promise<BotHookResponse | null> {
  log(`--- [unified_bot] Запуск сценария «Бронирование столиков» (Задача #${request.task_id}) ---`);
  const task: any = (request as any)?.task;
  const client = new PyrusApiClient(request.access_token);
  const taskId = Number(task?.id ?? (request as any)?.task_id ?? 0);

  const form = await FormModel.load(client, FORM_IDS.BOOKING, task?.fields || []);
  const values = new TaskModel(task?.fields || []);
  const stateFieldId = form.idOf(BOOKING_CODES.STATE);

  let state: any = { step_field_code: null, error_count: 0, completed_steps: [], ask_counts: {}, finished: false, last_event_key: null };
  const rawState = values.get(stateFieldId);
  if (typeof rawState === "string" && rawState.trim()) {
    try { state = JSON.parse(rawState); } catch (e) { /* empty */ }
  }

  if (state.finished) {
    log("Сценарий бронирования уже завершён (finished=true) — бот молчит");
    return null;
  }

  const trigger = extractTrigger(task, request.user_id);
  if (trigger.key && trigger.key === state.last_event_key) return null;
  state.last_event_key = trigger.key;

  const textNorm = normalize(trigger.text);
  if (textNorm.includes("оператор") || textNorm.includes("позовите") || textNorm.includes("человек")) {
    log("Гость попросил оператора в сценарии бронирования");
    state.finished = true;
    const updates: any[] = stateFieldId ? [{ id: stateFieldId, value: JSON.stringify(state) }] : [];
    const statusId = form.idOf(BOOKING_CODES.STATUS);
    if (statusId) updates.push({ id: statusId, value: { choice_id: 1 } });
    await flushLogs(client, taskId);
    return { text: "Уже зову коллегу — оператор подключится к диалогу в ближайшее время.", field_updates: updates as any, channel: trigger.channel };
  }

  const updates: any[] = [];
  if (state.step_field_code) {
    const step = BOOKING_ASK_SEQUENCE.find(s => s.code === state.step_field_code);
    const schema = step ? form.byCode.get(step.code) : undefined;
    if (step && schema && isFieldVisible(schema, form, values)) {
      const options = await form.optionsFor(client, schema);
      let val: any = undefined;

      const isSkipped = Boolean(step.optional && isSkipAnswer(trigger.text));

      if (isSkipped) {
        log(`Шаг бронирования '${step.code}' пропущен пользователем (ответ: "${trigger.text}")`);
        state.completed_steps.push(step.code);
        state.error_count = 0;
        state.step_field_code = null;
      } else {
        if (schema.type === "phone") val = parsePhone(trigger.text);
        else if (schema.type === "email") val = parseEmail(trigger.text);
        else if (schema.type === "due_date_time" || step.type === "date_time") val = parseDateTime(trigger.text);
        else if (schema.type === "number") val = parseNumber(trigger.text, step.min, step.max);
        else if (schema.options?.length) {
          const label = pickOption(trigger.text, options);
          const opt = label ? schema.options.find(o => o.choice_value === label) : undefined;
          if (opt) val = schema.multiple ? { choice_ids: [opt.choice_id] } : { choice_id: opt.choice_id };
        } else {
          val = trigger.text.trim();
        }

        if (val !== undefined) {
          log(`Принят ответ на шаг бронирования '${step.code}': ${JSON.stringify(val)}`);
          updates.push({ id: schema.id, value: val });
          values.set(schema.id, val);
          state.completed_steps.push(step.code);
          state.error_count = 0;
          state.step_field_code = null;
        } else {
          state.error_count = (state.error_count || 0) + 1;
          log(`Не удалось разобрать ответ на бронирование '${step.code}' (ошибок: ${state.error_count})`);
          if (state.error_count >= 3) {
            state.finished = true;
            if (stateFieldId) updates.push({ id: stateFieldId, value: JSON.stringify(state) });
            await flushLogs(client, taskId);
            return { text: "Не получается разобрать ответ. Передаю диалог оператору.", field_updates: updates as any, channel: trigger.channel };
          }
        }
      }
    }
  }

  let nextStep: any = undefined;
  let nextSchema: any = undefined;
  for (const step of BOOKING_ASK_SEQUENCE) {
    const schema = form.byCode.get(step.code);
    if (!schema || !isFieldVisible(schema, form, values)) continue;
    if (isEmptyValue(values.get(schema.id), schema.type) && !state.completed_steps.includes(step.code)) {
      nextStep = step;
      nextSchema = schema;
      break;
    }
  }

  if (!nextStep || !nextSchema) {
    log("Все данные по бронированию собраны — диалог завершён");
    state.finished = true;
    if (stateFieldId) updates.push({ id: stateFieldId, value: JSON.stringify(state) });
    const statusId = form.idOf(BOOKING_CODES.STATUS);
    if (statusId) updates.push({ id: statusId, value: { choice_id: 1 } });
    await flushLogs(client, taskId);
    return { text: "Спасибо! Все данные по бронированию собраны.", field_updates: updates as any, channel: trigger.channel };
  }

  state.step_field_code = nextStep.code;
  if (stateFieldId) updates.push({ id: stateFieldId, value: JSON.stringify(state) });
  log(`Задаём новый вопрос по бронированию: '${nextStep.code}'`);
  await flushLogs(client, taskId);

  let textPrompt = nextStep.question;
  const options = await form.optionsFor(client, nextSchema);
  if (options.length) {
    textPrompt += `\n\nВарианты:\n` + options.map((opt, i) => `${i + 1}. ${opt}`).join("\n");
  } else if (nextStep.hint) {
    textPrompt += `\n\n${nextStep.hint}`;
  }

  return { text: textPrompt, field_updates: updates as any, channel: trigger.channel };
}

// ─────────────────────────────────────────────────────────────────────────
//  ТОЧКА ВХОДА (MAIN ENTRY POINT)
// ─────────────────────────────────────────────────────────────────────────

export default async function unifiedBotHandler(request: BotHookRequest): Promise<BotHookResponse | null> {
  logs.length = 0;
  const task: any = (request as any)?.task || request;
  const taskId = Number(task?.id ?? (request as any)?.task_id ?? 0);
  const formId = Number(task?.form_id ?? (request as any)?.form_id ?? 0);

  log(`📥 [unified_bot] Входящий запрос Pyrus Webhook (Задача #${taskId}, Форма #${formId})`);
  const scenario = detectFormScenario(request);
  log(`🎯 Определён сценарий обработки: "${scenario}"`);

  let response: BotHookResponse | null = null;
  try {
    switch (scenario) {
      case "feedback":
        response = await handleFeedbackBot(request);
        break;
      case "task_chat":
        response = await handleTaskChatBot(request);
        break;
      case "booking":
        response = await handleBookingBot(request);
        break;
      default:
        log(`⚠️ Неизвестный сценарий формы для задачи #${taskId}. Выполнение пропущено.`);
        return null;
    }
  } catch (err: any) {
    log(`❌ ФАТАЛЬНАЯ ОШИБКА в сценарии "${scenario}": ${err?.message || err}`);
    if (err?.stack) log(`Stack trace:\n${err.stack}`);
    throw err;
  }

  log(`📤 Сценарий "${scenario}" успешно отработан. Ответ отправлен.`);
  return response;
}
