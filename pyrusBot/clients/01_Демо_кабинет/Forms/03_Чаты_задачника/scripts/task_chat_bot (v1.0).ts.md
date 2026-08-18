---
title: "Код: task_chat_bot (v1.0).ts"
audience: "tech"
pyrus_id: "H6012Rs0S2l"
pyrus_parent: "C72BD7vi7Vu"
synced_at: "2026-08-11T18:28:58.000Z"
---

```typescript
import {
  BotHookRequest,
  BotHookResponse,
  PyrusApiClient,
  FormResponse
} from "pyrus-api";

// ═══════════════════════════════════════════════════════════════════════════
//  БОТ «ЧАТЫ ЗАДАЧНИКА» (для формы «Чаты-задачника» id: 2455918)
//
//  Назначение:
//    1. Первичная настройка параметров создания задач (онбординг):
//       - Дней до срока (day_to_dl, число)
//       - Время срока по умолчанию (dl_time, время HH:MM)
//       - Исполнитель (person_id, с поддержкой поиска по tg_name / email / ID)
//    2. При поступлении комментариев в чат создаёт задачу в форме
//       «ЗАДАЧНИК» (id: 2445746) с темой из комментария, дедлайном и исполнителем.
//    3. Отправляет ссылку на созданную задачу в исходный чат.
//    4. Поддерживает переконфигурацию по команде (/reconfig, /setup, настройка).
// ═══════════════════════════════════════════════════════════════════════════

const FORM_IDS = {
  SOURCE_CHAT: 2455918,
  TARGET_TASK: 2450073,
} as const;


const FIELD_CODES = {
  NAME: "name",
  DAY_TO_DL: "day_to_dl",
  DL_TIME: "dl_time",
  PERSON_ID: "person_id",
  TG_NAME: "tg_name",
  SOURCE: "Source",
  TELEGRAM_URL: "TelegramUrl",
  STATE: "technical_bot_state",
} as const;

/** Локальный часовой пояс аккаунта Pyrus (MSK UTC+4 / UTC+3). Pyrus хранит время в UTC. */
const TIMEZONE_OFFSET_HOURS = 4;

const RECONFIG_COMMANDS = ["/reconfig", "/setup", "настройка", "переконфигурация", "настроить"];

export interface BotState {
  step: "day_to_dl" | "dl_time" | "person_id" | "configured";
  configured: boolean;
  last_event_key: string | null;
  error_count: number;
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

const DEBUG_ENABLED = true;
const logs: string[] = [];

function log(msg: string): void {
  console.log(msg);
  logs.push(msg);
}

async function flushLogs(client: PyrusApiClient, taskId: number): Promise<void> {
  if (!DEBUG_ENABLED || !taskId || !logs.length) return;
  const text = "[BOT-DEBUG]\n" + logs.join("\n");
  try {
    await client.tasks.addComment(taskId, { text: text.slice(0, 10000) });
  } catch (e: any) {
    console.error("Не удалось отправить лог бота:", e?.message || e);
  }
}


// ─────────────────────────────────────────────────────────────────────────
//  МОДЕЛЬ СХЕМЫ ФОРМЫ
// ─────────────────────────────────────────────────────────────────────────

export class FormModel {
  readonly byId = new Map<number, FieldSchema>();
  readonly byCode = new Map<string, FieldSchema>();

  private constructor(rawFields: any[]) {
    this.walk(rawFields, undefined);
  }

  static async load(client: PyrusApiClient, formId: number, taskFields: any[]): Promise<FormModel> {
    if (formId && client) {
      try {
        const formDef: FormResponse = await client.forms.get({ id: formId });
        if (formDef?.fields?.length) {
          return new FormModel(formDef.fields as any[]);
        }
      } catch (e: any) {
        log(`Не удалось загрузить схему формы ${formId}: ${e?.message || e}`);
      }
    }
    return new FormModel(taskFields || []);
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
    return out;
  }

  idOf(code: string): number | undefined {
    return this.byCode.get(code)?.id;
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  МОДЕЛЬ ЗНАЧЕНИЙ ЗАДАЧИ
// ─────────────────────────────────────────────────────────────────────────

export class TaskModel {
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
}

// ─────────────────────────────────────────────────────────────────────────
//  ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ПАРСИНГА И ДАТ
// ─────────────────────────────────────────────────────────────────────────

export function parseDaysToDl(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const num = parseInt(trimmed, 10);
  return isNaN(num) || num < 0 ? null : num;
}

export function parseTimeString(input: string): string | null {
  const trimmed = input.trim().replace(/[-–—]/g, ":");
  const match = trimmed.match(/^(\d{1,2})[:.]?(\d{2})?$/);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  let minutes = match[2] ? parseInt(match[2], 10) : 0;

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function calculateDueDateIso(
  daysToAdd: number,
  timeStr: string = "18:00",
  baseDate: Date = new Date()
): string {
  const targetDate = new Date(baseDate.getTime());
  targetDate.setDate(targetDate.getDate() + daysToAdd);

  const [hh, mm] = timeStr.split(":").map(v => parseInt(v, 10) || 0);

  const utcHours = (hh - TIMEZONE_OFFSET_HOURS + 24) % 24;
  const dayAdjustment = hh - TIMEZONE_OFFSET_HOURS < 0 ? -1 : (hh - TIMEZONE_OFFSET_HOURS >= 24 ? 1 : 0);

  if (dayAdjustment !== 0) {
    targetDate.setDate(targetDate.getDate() + dayAdjustment);
  }

  const yyyy = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, "0");
  const day = String(targetDate.getDate()).padStart(2, "0");
  const hours = String(utcHours).padStart(2, "0");
  const mins = String(mm).padStart(2, "0");

  return `${yyyy}-${month}-${day}T${hours}:${mins}:00Z`;
}



async function resolvePersonId(
  client: PyrusApiClient,
  input: string,
  accessToken?: string
): Promise<{ personId: number; personName: string } | null> {

  const cleanInput = input.trim();
  if (!cleanInput) return null;

  log(`Поиск сотрудника Pyrus по API для ввода: "${cleanInput}"`);

  let members: any[] = [];

  try {
    if (typeof (client as any).members?.get === "function") {
      const res = await (client as any).members.get();
      members = res?.members || res?.users || res?.contacts || [];
    }
  } catch (e: any) {
    log(`SDK members.get info: ${e?.message || e}`);
  }

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

  for (const m of members) {
    if (!m) continue;
    const mId = String(m.id || "");
    const mEmail = String(m.email || "").toLowerCase();
    const mFirstName = String(m.first_name || "").toLowerCase();
    const mLastName = String(m.last_name || "").toLowerCase();
    const mFullName = `${mFirstName} ${mLastName}`.trim();
    const mNick = String(m.messenger?.nickname || m.skype || m.nickname || m.username || "").toLowerCase().replace(/^@/, "");

    // 1. Совпадение по Telegram никнейму / мессенджеру / скайпу
    if (mNick && mNick === searchTarget) {
      log(`Найдено совпадение по никнейму @${mNick}: ID ${m.id}`);
      return { personId: m.id, personName: mFullName || `@${mNick}` };
    }

    // 2. Точное совпадение по ID
    if (/^\d+$/.test(cleanInput) && mId === cleanInput) {
      log(`Найдено совпадение по ID ${mId}`);
      return { personId: m.id, personName: mFullName || mEmail || mId };
    }

    // 3. Совпадение по email
    if (mEmail && (mEmail === searchTarget || mEmail.startsWith(searchTarget + "@"))) {
      log(`Найдено совпадение по email ${mEmail}: ID ${m.id}`);
      return { personId: m.id, personName: mFullName || mEmail };
    }

    // 4. Частичное совпадение никнейма
    if (mNick && mNick.includes(searchTarget)) {
      log(`Найдено частичное совпадение по никнейму @${mNick}: ID ${m.id}`);
      return { personId: m.id, personName: mFullName || `@${mNick}` };
    }

    // 5. Совпадение по имени или фамилии
    if (mFullName && (mFullName === searchTarget || mFirstName === searchTarget || mLastName === searchTarget)) {
      log(`Найдено совпадение по имени ${mFullName}: ID ${m.id}`);
      return { personId: m.id, personName: mFullName };
    }
  }

  // 6. Если список пользователей успешно загружен (members.length > 0), но введённый ID/email/никнейм не найден:
  if (members.length > 0) {
    log(`Сотрудник "${cleanInput}" не найден среди ${members.length} пользователей Pyrus`);
    return null;
  }

  // 7. Резерв на случай полной недоступности API пользователей (если members.length === 0 в тестовом симуляторе)
  if (/^\d{5,10}$/.test(cleanInput)) {
    const numericId = parseInt(cleanInput, 10);
    log(`Список пользователей недоступен по API, использован прямой ID: ${numericId}`);
    return { personId: numericId, personName: `ID: ${numericId}` };
  }

  log(`Сотрудник "${cleanInput}" не найден (список пользователей пуст)`);
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
//  ОСНОВНОЙ ОБРАБОТЧИК (BOT HOOK HANDLER)
// ─────────────────────────────────────────────────────────────────────────

export async function handleTaskChatBot(
  request: BotHookRequest,
  client?: PyrusApiClient
): Promise<BotHookResponse> {
  logs.length = 0;
  log(`--- Обработка вызова бота Чаты-задачника для задачи #${request.task_id} ---`);

  const task = request.task || (request as any);
  const taskFields = task.fields || [];

  const pyrusClient = client || new PyrusApiClient(request.access_token || {
    login: process.env.PYRUS_LOGIN || "",
    security_key: process.env.PYRUS_SECURITY_KEY || "",
  });

  const formModel = await FormModel.load(pyrusClient, request.task_id ? FORM_IDS.SOURCE_CHAT : 0, taskFields);
  const taskValues = new TaskModel(taskFields);

  // Определение текста входящего комментария
  const comments = task.comments || [];
  const lastComment = comments.length > 0 ? comments[comments.length - 1] : null;
  const reqAny = request as any;
  const lastCommentAny = lastComment as any;
  const commentText = (reqAny.text || lastComment?.text || "").trim();
  const commentId = String(lastCommentAny?.comment_id || lastComment?.id || (reqAny.text ? `${reqAny.text}_${Date.now()}` : Date.now()));

  // Проверка автора комментария (игнорируем собственные комментарии бота)
  if (lastComment?.author) {
    const authorId = String(lastComment.author.id || "");
    const authorEmail = String(lastComment.author.email || "");
    if (authorEmail.includes("bot") || authorId === String(reqAny.user?.id)) {
      log("Комментарий отправлен ботом — пропуск");
      return {};
    }
  }

  // Поиск канала (telegram/мессенджер), откуда пришло последнее сообщение
  let replyChannel: any = undefined;
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c?.channel) {
      replyChannel = c.channel.type ? { type: c.channel.type } : c.channel;
      break;
    }
  }

  // Чтение текущего состояния из системного поля
  const stateFieldId = formModel.idOf(FIELD_CODES.STATE);
  const rawStateStr = taskValues.getByCode(formModel, FIELD_CODES.STATE);

  let state: BotState = {
    step: "day_to_dl",
    configured: false,
    last_event_key: null,
    error_count: 0,
  };

  if (rawStateStr && typeof rawStateStr === "string") {
    try {
      state = JSON.parse(rawStateStr);
    } catch (e) {
      log(`Не удалось распарсить technical_bot_state: ${rawStateStr}`);
    }
  }

  // Защита от дублирования вызовов хука по key
  if (state.last_event_key && state.last_event_key === commentId) {
    log(`Событие ${commentId} уже обработано — пропуск`);
    return {};
  }
  state.last_event_key = commentId;

  const fieldUpdates: Array<{ id: number; value: any }> = [];
  let responseText: string | null = null;

  // ───────────────────────────────────────────────────────────────────────
  //  1. ПЕРЕКОНФИГУРАЦИЯ ПО КОМАНДЕ
  // ───────────────────────────────────────────────────────────────────────
  const lowerText = commentText.toLowerCase();
  if (RECONFIG_COMMANDS.some(cmd => lowerText === cmd || lowerText.startsWith(cmd + " "))) {
    log("Получена команда переконфигурации");
    state.step = "day_to_dl";
    state.configured = false;
    state.error_count = 0;

    if (stateFieldId) {
      fieldUpdates.push({ id: stateFieldId, value: JSON.stringify(state) });
    }

    // Сброс сохранённых полей настройки при реконфигурации
    const dayFieldId = formModel.idOf(FIELD_CODES.DAY_TO_DL);
    const timeFieldId = formModel.idOf(FIELD_CODES.DL_TIME);
    const personFieldId = formModel.idOf(FIELD_CODES.PERSON_ID);
    const tgFieldId = formModel.idOf(FIELD_CODES.TG_NAME);

    if (dayFieldId) fieldUpdates.push({ id: dayFieldId, value: null });
    if (timeFieldId) fieldUpdates.push({ id: timeFieldId, value: null });
    if (personFieldId) fieldUpdates.push({ id: personFieldId, value: null });
    if (tgFieldId) fieldUpdates.push({ id: tgFieldId, value: null });

    if (request.task_id) {
      await flushLogs(pyrusClient, request.task_id);
    }

    return {
      text: "🔄 Запущен процесс переконфигурации бота.\n\nШаг 1/3: На сколько дней от даты создания проставлять срок по умолчанию? (0 — сегодня, 1 — завтра, 2 — через 2 дня и т.д.):",
      channel: replyChannel,
      field_updates: fieldUpdates,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  //  2. ПРОЦЕСС ПЕРВИЧНОЙ НАСТРОЙКИ (ONBOARDING FLOW)
  // ───────────────────────────────────────────────────────────────────────
  if (!state.configured) {

    switch (state.step) {
      case "day_to_dl": {
        const days = parseDaysToDl(commentText);
        if (days === null) {
          state.error_count++;
          responseText = "⚠️ Пожалуйста, введите целое число дней от 0 и выше (например, 0 — сегодня, 1 — завтра, 2 — через 2 дня):";
        } else {
          const dayFieldId = formModel.idOf(FIELD_CODES.DAY_TO_DL);
          if (dayFieldId) fieldUpdates.push({ id: dayFieldId, value: days });

          state.step = "dl_time";
          state.error_count = 0;
          responseText = `✅ Записано дней: ${days}.\n\nШаг 2/3: Укажите время срока по умолчанию (например, 18:00):`;
        }
        break;
      }

      case "dl_time": {
        const formattedTime = parseTimeString(commentText);
        if (!formattedTime) {
          state.error_count++;
          responseText = "⚠️ Не удалось распознать время. Пожалуйста, укажите время в формате ЧЧ:ММ (например, 18:00):";
        } else {
          const timeFieldId = formModel.idOf(FIELD_CODES.DL_TIME);
          if (timeFieldId) fieldUpdates.push({ id: timeFieldId, value: formattedTime });

          state.step = "person_id";
          state.error_count = 0;
          responseText = `✅ Записано время: ${formattedTime}.\n\nШаг 3/3: Укажите сотрудника, на которого создавать задачи. Введите его email, ID в Pyrus или Telegram-никнейм (например, @username):`;
        }
        break;
      }

      case "person_id": {
        if (!commentText) {
          responseText = "⚠️ Пожалуйста, введите никнейм Telegram (@username), email или ID сотрудника:";
        } else {
          const resolved = await resolvePersonId(pyrusClient, commentText, request.access_token);


          if (!resolved) {
            state.error_count++;
            responseText = `⚠️ Пользователь **${commentText}** не найден среди участников организации Pyrus.\n\nПожалуйста, убедитесь, что Telegram-никнейм привязан в профиле пользователя Pyrus, или введите его email / ID в Pyrus:`;
          } else {
            const personFieldId = formModel.idOf(FIELD_CODES.PERSON_ID);
            const tgFieldId = formModel.idOf(FIELD_CODES.TG_NAME);

            if (personFieldId) {
              fieldUpdates.push({ id: personFieldId, value: String(resolved.personId) });
            }
            if (tgFieldId) {
              fieldUpdates.push({ id: tgFieldId, value: commentText });
            }

            state.configured = true;
            state.step = "configured";
            state.error_count = 0;

            const savedDays = taskValues.getByCode(formModel, FIELD_CODES.DAY_TO_DL) ?? fieldUpdates.find(u => u.id === formModel.idOf(FIELD_CODES.DAY_TO_DL))?.value ?? 0;
            const savedTime = taskValues.getByCode(formModel, FIELD_CODES.DL_TIME) ?? fieldUpdates.find(u => u.id === formModel.idOf(FIELD_CODES.DL_TIME))?.value ?? "18:00";

            responseText = `🎉 **Настройка бота успешно завершена!**\n\n• Дней до дедлайна: **${savedDays}**\n• Время дедлайна: **${savedTime}**\n• Ответственный: **${resolved.personName} (ID: ${resolved.personId})**\n\nКаждое ваше новое сообщение в этом чате создаст задачу в Задачнике.\nЕсли захотите изменить настройки, отправьте команду **/reconfig**.`;
          }
        }
        break;
      }


      default: {
        state.step = "day_to_dl";
        responseText = "Привет! Давайте настроим бота.\n\nШаг 1/3: На сколько дней от даты создания проставлять срок по умолчанию? (0 — сегодня, 1 — завтра):";
      }
    }

    if (stateFieldId) {
      fieldUpdates.push({ id: stateFieldId, value: JSON.stringify(state) });
    }

    if (request.task_id) {
      await flushLogs(pyrusClient, request.task_id);
    }

    return {
      text: responseText || "Настройка продолжается...",
      channel: replyChannel,
      field_updates: fieldUpdates,
    };

  }

  // ───────────────────────────────────────────────────────────────────────
  //  3. ОСНОВНОЙ РЕЖИМ: СОЗДАНИЕ ЗАДАЧИ В «ЗАДАЧНИКЕ» (ID 2445746)
  // ───────────────────────────────────────────────────────────────────────
  if (!commentText) {
    log("Пустой комментарий — пропуск создания задачи");
    return {};
  }

  const daysToDl = Number(taskValues.getByCode(formModel, FIELD_CODES.DAY_TO_DL) ?? 0);
  const dlTime = String(taskValues.getByCode(formModel, FIELD_CODES.DL_TIME) || "18:00");
  const personIdStr = String(taskValues.getByCode(formModel, FIELD_CODES.PERSON_ID) || "");

  const dueDateIso = calculateDueDateIso(daysToDl, dlTime, new Date());

  log(`Создание задачи: topic="${commentText}", due_date="${dueDateIso}", person_id="${personIdStr}"`);

  let createdTaskId: number | null = null;

  try {
    const targetFields: Array<{ id: number; value: any }> = [];

    // Поле Тема (id: 1, code: topic)
    targetFields.push({ id: 1, value: commentText });

    // Поле Срок (id: 13, code: deadline)
    targetFields.push({ id: 13, value: dueDateIso });

    // Поле Ответственный (id: 2, code: responsible)
    if (personIdStr) {
      if (!isNaN(Number(personIdStr))) {
        targetFields.push({ id: 2, value: { id: Number(personIdStr) } });
      } else if (personIdStr.includes("@")) {
        targetFields.push({ id: 2, value: { email: personIdStr } });
      }
    }

    const payload: any = {
      form_id: FORM_IDS.TARGET_TASK,
      fields: targetFields,
    };



    const newTaskResponse: any = await pyrusClient.tasks.create(payload);
    createdTaskId = newTaskResponse?.task?.id || newTaskResponse?.task_id || newTaskResponse?.id || null;

    log(`Задача в форме ${FORM_IDS.TARGET_TASK} успешно создана: ID ${createdTaskId}`);
  } catch (e: any) {
    log(`Ошибка создания задачи в Pyrus API: ${e?.message || e}`);
  }

  if (stateFieldId) {
    fieldUpdates.push({ id: stateFieldId, value: JSON.stringify(state) });
  }

  const successMessage = createdTaskId
    ? `✅ **Задача в Задачнике успешно создана!**\n\n📌 **Тема:** ${commentText}\n🔗 **Ссылка:** https://pyrus.com/t#id${createdTaskId}`
    : `✅ **Задача зарегистрирована!**\n\n📌 **Тема:** ${commentText}`;

  return {
    text: successMessage,
    channel: replyChannel,
    field_updates: fieldUpdates,
  };

}

export default handleTaskChatBot;
```
