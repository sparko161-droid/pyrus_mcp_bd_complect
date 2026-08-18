import {
    BotHookRequest,
    BotHookResponse,
    PyrusApiClient,
    TaskComment
} from "pyrus-api";

// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  КОНФИГУРАЦИЯ БОТА И НАСТРОЙКИ ПОЛЕЙ
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════

const FIELD_CODES = {
    STATE: "tehnikal_text",
    RESTORAN_TABLE: "restoran_table",
    TABLE_REST_CRMID: "u_crmid",      // Код колонки CRMID заведения в таблице
    TABLE_REST_LINK: "u_set",         // Код колонки для ссылки на задачу (карточку ресторана)
    TABLE_REST: "u_set",              // Алиас для обратной совместимости с TABLE_REST_LINK
    TABLE_REST_NAME: "u_client",      // Код колонки названия заведения
    TABLE_REST_INN: "Dadata_inn",     // Код колонки ИНН заведения
    RESTORAN: "restoran",
    SENDER_NAME: "SenderName",
    START_BOT_CHECKBOX: "zapusk_bota",
    TASK_CLIENTS: "task_clients",
    CHANNEL_TASK: "channel_task",
    OPERATOR: "Operator",
    RESPONSIBLE: "Responsible",
    MANAGER: "Manager",
    PUSK_RESPONS: "pusk_respons",
    TASK_TYPE: "Task_type",
    PRIORITY: "priority",
    TYPE_OF_SERVICE: "type_of_service",
    STATUS: "Status",
    CLIENT_CARD_NAME: "client_name",
    SD_MSG_CHANNEL_ID: "message_chanell_id",
    PHONE_NUMBER: "PhoneNumberFrom",
} as const;

const FORM_RESTAURANT_ID = 1101763;
const FIELD_CRMID_ID = 92;
const FORM_CLIENT_CARD_ID = 2441100;
const FORM_SD_ID = 2441923;

// Идентификаторы колонок таблицы заведений в форме заявок (Service Desk)
const SD_TABLE_CRMID_COL = 39;
const SD_TABLE_LINK_COL = 41;
const SD_TABLE_NAME_COL = 42;
const SD_TABLE_INN_COL = 40;

// Идентификаторы колонок таблицы заведений в карточке клиента
const CC_TABLE_CRMID_COL = 6;
const CC_TABLE_LINK_COL = 8;
const CC_TABLE_NAME_COL = 11;
const CC_TABLE_INN_COL = 13;

// Альтернативные идентификаторы колонок (соответствуют форме заявок SD)
const SD_FALLBACK_CRMID_COL = SD_TABLE_CRMID_COL;
const SD_FALLBACK_LINK_COL = SD_TABLE_LINK_COL;

// Жестко зашитые ID полей формы SD (необходимы для пустых полей внутри групп, которые Pyrus API не возвращает в хуках)
const SD_FIELD_IDS: Record<string, number> = {
    state: 31,         // tehnikal_text      (внутри группы 78)
    zapusk: 32,        // zapusk_bota        (внутри группы 78)
    clients: 34,       // task_clients        (внутри группы 21)
    msgChannel: 37,    // message_chanell_id (внутри группы 21)
    senderName: 4,     // SenderName         (внутри группы 21)
    channelTask: 14,    // channel_task        (внутри группы 16)
    priority: 15,       // priority            (внутри группы 16)
    taskType: 35,       // Task_type          (внутри группы 8)
    restoranTable: 38, // restoran_table     (внутри группы 21)
};

const DEBUG_ENABLED = false;

// ═══════════════════════════════════════════════════════════════
// Включение/выключение шагов диалога (установите false для отключения вопроса)
// ═══════════════════════════════════════════════════════════════
const STEPS_ENABLED = {
    /** Шаг 1: Показать список заведений из таблицы для выбора */
    RESTAURANT_SELECTION: true,
    /** Шаг 2: Запросить ИНН/CRMID если нет заведений */
    CRMID_REQUEST: true,
    /** Шаг 3: Подтверждение найденного ресторана (Да/Нет) */
    RESTAURANT_CONFIRMATION: true,
    /** Шаг 4: Уточнить класс обращения (Консультация/Удалённо/Выезд) */
    TASK_TYPE_QUESTION: true,
    /** Шаг 5: Уточнить приоритет (Day/Normal/Low/High) */
    PRIORITY_QUESTION: false,
};

// ═══════════════════════════════════════════════════════════════
// Включение/выключение уведомлений об изменениях полей задачи
// ═══════════════════════════════════════════════════════════════
const NOTIFICATIONS_ENABLED = {
    OPERATOR_CHANGED: false,
    RESPONSIBLE_CHANGED: true,
    STATUS_CHANGED: true,
    PRIORITY_CHANGED: true,
    TASK_TYPE_CHANGED: true,
    RESTAURANT_LINKED: true,
};

// ═══════════════════════════════════════════════════════════════
// Настройки синхронизации данных между формами
// ═══════════════════════════════════════════════════════════════
const SYNC_ENABLED = {
    /** Синхронизация полей из Карточки Ресторана → SD (по совпадению кодов) */
    RESTAURANT_FIELDS_TO_SD: true,
    /** Синхронизация таблицы ресторанов → SD */
    RESTAURANT_TABLE_TO_SD: true,
    /** Синхронизация таблицы → Карточка клиента */
    TABLE_TO_CLIENT_PROFILE: true,
};


const TASK_TYPE_MAP: Record<number, { choice_id: number; label: string }> = {
    1: { choice_id: 2, label: "Консультация" },
    2: { choice_id: 1, label: "Удалённо" },
    3: { choice_id: 3, label: "Выезд" },
};

const PRIORITY_MAP: Record<number, { choice_id: number; label: string; desc: string }> = {
    1: { choice_id: 2, label: "Day", desc: "решить сегодня" },
    2: { choice_id: 3, label: "Normal", desc: "в течение 12 часов" },
    3: { choice_id: 4, label: "Low", desc: "проблема не критична, нужно разобраться" },
    4: { choice_id: 1, label: "High", desc: "проблема срочная — невозможен расчёт гостей" },
};

const RESTORAN_FIELD_MAP: Record<number, { id: number; code?: string }> = {
    [FORM_SD_ID]: { id: 33, code: "restoran" },
};

// ═══════════════════════════════════════════════════════════════
//  ОПИСАНИЕ ИНТЕРФЕЙСОВ И ТИПОВ ДАННЫХ
// ═══════════════════════════════════════════════════════════════

interface BotState {
    step: "WAITING_SELECTION" | "WAITING_CRMID" | "WAITING_CONFIRMATION"
    | "WAITING_TASK_TYPE" | "WAITING_PRIORITY" | "LISTENING" | "WAITING_PHONE" | "WAITING_PHONE_ONCE";
    options?: RestaurantOption[];
    pending_selection?: RestaurantOption;
    retry_count?: number;
    client_author_id?: number;

    prev_operator?: string;
    prev_responsible?: string;
    prev_status?: string;
    prev_priority?: string;
    prev_task_type?: string;
    prev_restoran_id?: number;
    prev_table_crmids?: string[];
    prev_active?: boolean;
    prev_client_card_id?: number;
    prev_sd_phone?: string;

    // Резервирование пространства имен для состояния другого бота (Access Sync)
    access_sync?: any;
    [key: string]: any;
}

interface RestaurantOption {
    name: string;
    crmid: string;
    task_id: number;
    inn?: string;
    existing?: boolean;
}

interface BotContext {
    client: PyrusApiClient;
    task: any;
    channel: any;
    state: BotState;
    stateFieldId?: number;
    restoranFieldId?: number;
    restoranTableFieldId?: number;
    senderName: string;
    isAssistantChannel: boolean;
}

// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
//  КЭШИРОВАНИЕ И ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════

const SCHEMA_CACHE: Record<number, Record<string, number>> = {};
let cachedClientColumns: { formId: number; crmidColId: number; linkColId: number; nameColId?: number; innColId?: number } | null = null;
let cachedClientCardIdFieldId = 0;
let cachedClientCardNameFieldId = 0;
let cachedClientCardChannelFieldId = 0;
let logs: string[] = [];

/**
 * Записывает и форматирует обновленное состояние бота в массив обновлений полей Pyrus.
 * @param updates Массив планируемых обновлений полей задачи Pyrus.
 * @param stateFieldId Уникальный идентификатор поля технического текста (состояния) в Pyrus.
 * @param state Текущий объект состояния бота для сохранения.
 */
/**
 * Записывает и форматирует обновленное состояние бота в массив обновлений полей Pyrus.
 * @param updates Массив планируемых обновлений полей задачи Pyrus.
 * @param stateFieldId Уникальный идентификатор поля технического текста (состояния) в Pyrus.
 * @param state Текущий объект состояния бота для сохранения.
 */
function pushStateUpdate(updates: any[], stateFieldId: number | undefined, state: BotState) {
    if (stateFieldId) updates.push({ id: stateFieldId, value: JSON.stringify(state) });
}

/**
 * Логирует отладочные сообщения. Если отладка (DEBUG_ENABLED) включена,
 * сохраняет лог во внутренний массив для последующей отправки в задачу и выводит в консоль.
 * @param msg Текст отладочного сообщения.
 */
/**
 * Логирует отладочные сообщения. Если отладка (DEBUG_ENABLED) включена,
 * сохраняет лог во внутренний массив для последующей отправки в задачу и выводит в консоль.
 * @param msg Текст отладочного сообщения.
 */
function log(msg: string) {
    if (!DEBUG_ENABLED) return;
    const time = new Date().toISOString().split("T")[1].split(".")[0];
    logs.push(`[${time}] ${msg}`);
    console.log(`[${time}] ${msg}`);
}

/**
 * Загружает схему формы по её ID и кэширует маппинг "код поля -> числовой ID".
 * Это позволяет быстро определять числовые ID полей по их символьным кодам в коде бота.
 * @param client Клиент Pyrus API для выполнения запросов.
 * @param formId Числовой идентификатор формы Pyrus.
 * @returns Объект-сопоставление: символьный код поля (в нижнем регистре) -> числовой ID поля.
 */
async function getFieldMap(client: PyrusApiClient, formId: number): Promise<Record<string, number>> {
    if (SCHEMA_CACHE[formId]) return SCHEMA_CACHE[formId];
    try {
        const schema = await client.forms.get({ id: formId });
        const map: Record<string, number> = {};
        const traverse = (fields: any[]) => {
            for (const f of fields) {
                const code = (f.code || f.info?.code || "").toLowerCase().trim();
                if (code) map[code] = f.id;
                const nested = f.fields || f.info?.fields || f.info?.columns || 
                              (f.type === 'group' && Array.isArray(f.value) ? f.value : undefined) ||
                              (f.value?.fields);
                if (Array.isArray(nested)) traverse(nested);
            }
        };
        if (schema.fields) traverse(schema.fields);
        SCHEMA_CACHE[formId] = map;
        return map;
    } catch (e: any) {
        log(`Schema Error (${formId}): ${e.message}`);
        return {};
    }
}

/**
 * Рекурсивный поиск объекта поля по его числовому идентификатору.
 * Выполняет обход структуры, заглядывая внутрь групп и таблиц для поиска нужного элемента.
 * @param fields Массив полей из задачи или схемы Pyrus.
 * @param id Уникальный числовой ID искомого поля.
 * @returns Объект поля со всеми его свойствами или undefined, если поле не найдено.
 */
function findFieldById(fields: any[], id: number): any {
    if (!fields || !Array.isArray(fields)) return undefined;
    for (const f of fields) {
        if (f.id === id) return f;
        const nested = f.fields || f.info?.fields || f.info?.columns || 
                      (f.type === 'group' && Array.isArray(f.value) ? f.value : f.value?.fields);
        if (Array.isArray(nested)) {
            const found = findFieldById(nested, id);
            if (found) return found;
        }
    }
    return undefined;
}

/**
 * Возвращает числовой ID поля по его коду (с поддержкой кэширования схем).
 * @param client Клиент Pyrus API.
 * @param formId ID формы Pyrus.
 * @param code Символьный код поля.
 * @returns Числовой ID поля или undefined, если поле с таким кодом не найдено в форме.
 */
async function resolveFieldId(client: PyrusApiClient, formId: number, code: string): Promise<number | undefined> {
    const target = code.toLowerCase().trim();
    if (target === FIELD_CODES.RESTORAN && RESTORAN_FIELD_MAP[formId]) return RESTORAN_FIELD_MAP[formId].id;
    const map = await getFieldMap(client, formId);
    return map[target];
}

/**
 * Получает текущее значение поля задачи по его коду или числовому идентификатору.
 * @param client Клиент Pyrus API.
 * @param task Объект задачи, в которой выполняется поиск поля.
 * @param codeOrId Код поля (строка) или числовой ID поля.
 * @param clientForMap Опциональный клиент API для загрузки схемы формы (если передан текстовый код поля).
 * @returns Значение поля или undefined, если поле отсутствует.
 */
async function getVal(client: PyrusApiClient, task: any, codeOrId: string | number, clientForMap?: PyrusApiClient): Promise<any> {
    if (!task?.fields) return undefined;
    
    // Особый случай: поиск состояния бота по сигнатуре JSON в полях
    if (codeOrId === FIELD_CODES.STATE) {
        let id: number | undefined;
        if (clientForMap) id = await resolveFieldId(clientForMap, task.form_id, FIELD_CODES.STATE);
        const val = id ? findFieldById(task.fields, id)?.value : undefined;
        if (val) return val;
        // Резервный вариант: эвристический поиск состояния во всех полях задачи
        const traverse = (fs: any[]): any => {
            for (const f of fs) {
                if (typeof f.value === 'string' && f.value.includes('"step"')) return f.value;
                const nested = f.fields || (f.type === 'group' && Array.isArray(f.value) ? f.value : f.value?.fields);
                if (Array.isArray(nested)) {
                    const res = traverse(nested);
                    if (res) return res;
                }
            }
        };
        return traverse(task.fields);
    }

    const id = typeof codeOrId === 'number' ? codeOrId : (clientForMap ? await resolveFieldId(clientForMap, task.form_id, codeOrId) : undefined);
    return id ? findFieldById(task.fields, id)?.value : undefined;
}

/**
 * Выполняет поиск идентификатора колонки таблицы по её коду без учёта регистра.
 * @param columns Список колонок таблицы из схемы Pyrus.
 * @param code Код колонки, ID которой нужно найти.
 * @returns Числовой ID колонки или undefined, если колонка не найдена.
 */
/**
 * Выполняет поиск идентификатора колонки таблицы по её коду без учёта регистра.
 * @param columns Список колонок таблицы из схемы Pyrus.
 * @param code Код колонки, ID которой нужно найти.
 * @returns Числовой ID колонки или undefined, если колонка не найдена.
 */
function findColumnId(columns: any[] | undefined, code: string): number | undefined {
    const target = code.toLowerCase().trim();
    return columns?.find((c: any) => (c.code || c.info?.code || "").toLowerCase().trim() === target)?.id;
}

/**
 * Находит ячейку строки таблицы по её коду без учёта регистра.
 * @param cells Список ячеек строки таблицы.
 * @param code Код искомой колонки ячейки.
 * @returns Объект ячейки или undefined, если ячейка не найдена.
 */
/**
 * Находит ячейку строки таблицы по её коду без учёта регистра.
 * @param cells Список ячеек строки таблицы.
 * @param code Код искомой колонки ячейки.
 * @returns Объект ячейки или undefined, если ячейка не найдена.
 */
function findCellByCode(cells: any[] | undefined, code: string): any {
    const target = code.toLowerCase().trim();
    return cells?.find((c: any) => {
        const cellCode = (c.code || c.info?.code || "").toLowerCase().trim();
        return cellCode === target;
    });
}


/**
 * Вычисляет следующий уникальный идентификатор строки (row_id) для добавления в таблицу Pyrus.
 * Ищет максимальный row_id среди существующих строк и прибавляет 1.
 * @param rows Список существующих строк таблицы.
 * @returns Новый уникальный row_id (начиная с 0).
 */
/**
 * Вычисляет следующий уникальный идентификатор строки (row_id) для добавления в таблицу Pyrus.
 * Ищет максимальный row_id среди существующих строк и прибавляет 1.
 * @param rows Список существующих строк таблицы.
 * @returns Новый уникальный row_id (начиная с 0).
 */
function calcNextRowId(rows: any[]): number {
    return (rows || []).reduce((max, r) => Math.max(max, r.row_id ?? -1), -1) + 1;
}

/**
 * Создаёт структурированный объект строки таблицы Pyrus для добавления или обновления.
 * @param rowId Идентификатор новой строки.
 * @param crmidColId ID колонки CRMID.
 * @param linkColId ID колонки ссылки на карточку ресторана.
 * @param nameColId ID колонки названия заведения.
 * @param innColId ID колонки ИНН.
 * @param crmid Значение CRMID заведения.
 * @param taskId ID задачи Pyrus (карточки заведения) для ссылки.
 * @param name Название заведения.
 * @param inn ИНН заведения.
 * @returns Объект новой строки таблицы для Pyrus API.
 */
function buildTableRow(
    rowId: number,
    crmidColId: number,
    linkColId: number,
    nameColId: number,
    innColId: number,
    crmid: string,
    taskId: number,
    name?: string,
    inn?: string
) {
    const cells: any[] = [
        { id: crmidColId, value: crmid },
        { id: linkColId, value: name ? { task_id: taskId, subject: name } : { task_id: taskId } },
    ];
    if (name && nameColId) {
        cells.push({ id: nameColId, value: name });
    }
    if (inn && innColId) {
        cells.push({ id: innColId, value: inn });
    }
    return {
        row_id: rowId,
        cells
    };
}

/**
 * Рекурсивно обходит и разворачивает все поля задачи (включая вложенные в группы и таблицы) в плоский одномерный массив.
 * Это необходимо для удобного поиска полей без учёта вложенности структуры.
 * @param fields Массив полей из задачи или схемы Pyrus.
 * @returns Плоский массив всех найденных полей.
 */
/**
 * Рекурсивно обходит и разворачивает все поля задачи (включая вложенные в группы и таблицы) в плоский одномерный массив.
 * Это необходимо для удобного поиска полей без учёта вложенности структуры.
 * @param fields Массив полей из задачи или схемы Pyrus.
 * @returns Плоский массив всех найденных полей.
 */
function flattenFields(fields: any[]): any[] {
    let result: any[] = [];
    for (const f of fields || []) {
        result.push(f);
        const nested = f.fields || f.info?.fields || f.value?.fields ||
            ((f.type === "group" || f.type === "title") && Array.isArray(f.value) ? f.value : undefined);
        if (Array.isArray(nested)) result = result.concat(flattenFields(nested));
    }
    return result;
}

/**
 * Возвращает имя следующего шага диалога на основе текущего шага в соответствии с линейным сценарием.
 * @param currentStep Текущий активный шаг диалога бота.
 * @returns Имя следующего шага диалога.
 */
/**
 * Возвращает имя следующего шага диалога на основе текущего шага в соответствии с линейным сценарием.
 * @param currentStep Текущий активный шаг диалога бота.
 * @returns Имя следующего шага диалога.
 */
function getNextStepName(currentStep: BotState["step"]): BotState["step"] {
    const stepsOrder: BotState["step"][] = [
        "WAITING_SELECTION",
        "WAITING_CRMID",
        "WAITING_CONFIRMATION",
        "WAITING_TASK_TYPE",
        "WAITING_PRIORITY",
        "LISTENING"
    ];
    const idx = stepsOrder.indexOf(currentStep);
    if (idx === -1 || idx === stepsOrder.length - 1) return "LISTENING";
    return stepsOrder[idx + 1];
}

/**
 * Определяет первый доступный и включенный шаг диалога, начиная с указанного шага.
 * Учитывает настройки STEPS_ENABLED и наличие выбранного ресторана в pending_selection.
 * @param startFrom Шаг, с которого необходимо начать проверку.
 * @param pendingSelection Временный объект выбранного заведения (если есть).
 * @returns Ближайший включенный шаг диалога или "LISTENING" для завершения диалога.
 */
/**
 * Определяет первый доступный и включенный шаг диалога, начиная с указанного шага.
 * Учитывает настройки STEPS_ENABLED и наличие выбранного ресторана в pending_selection.
 * @param startFrom Шаг, с которого необходимо начать проверку.
 * @param pendingSelection Временный объект выбранного заведения (если есть).
 * @returns Ближайший включенный шаг диалога или "LISTENING" для завершения диалога.
 */
function getFirstEnabledStep(startFrom: BotState["step"], pendingSelection?: any): BotState["step"] {
    const stepsOrder: BotState["step"][] = [
        "WAITING_SELECTION",
        "WAITING_CRMID",
        "WAITING_CONFIRMATION",
        "WAITING_TASK_TYPE",
        "WAITING_PRIORITY",
        "LISTENING"
    ];
    let idx = stepsOrder.indexOf(startFrom);
    if (idx === -1) idx = 0;
    for (let i = idx; i < stepsOrder.length; i++) {
        const step = stepsOrder[i];
        if (step === "WAITING_SELECTION") {
            if (STEPS_ENABLED.RESTAURANT_SELECTION) return step;
        } else if (step === "WAITING_CRMID") {
            if (STEPS_ENABLED.CRMID_REQUEST) return step;
        } else if (step === "WAITING_CONFIRMATION") {
            if (STEPS_ENABLED.RESTAURANT_CONFIRMATION && pendingSelection) return step;
        } else if (step === "WAITING_TASK_TYPE") {
            if (STEPS_ENABLED.TASK_TYPE_QUESTION) return step;
        } else if (step === "WAITING_PRIORITY") {
            if (STEPS_ENABLED.PRIORITY_QUESTION) return step;
        } else if (step === "LISTENING") {
            return "LISTENING";
        }
    }
    return "LISTENING";
}

/**
 * Осуществляет переход к следующему активному шагу диалога бота.
 * Формирует соответствующий вопрос пользователю в зависимости от шага (ввод CRMID, класс обращения, приоритет или завершение).
 * @param ctx Контекст бота, содержащий API-клиент, текущую задачу и состояние.
 * @param currentStep Текущий шаг, с которого выполняется переход.
 * @param notifications Массив накопленных уведомлений для отправки пользователю.
 * @param syncUpdates Накопленный массив обновлений полей задачи.
 * @param msgIntro Необязательное вступительное сообщение перед основным вопросом.
 * @returns Объект ответа бота (reply) или null, если отправка сообщения не требуется.
 */
async function goToNextStep(
    ctx: BotContext,
    currentStep: BotState["step"],
    notifications: string[],
    syncUpdates: any[],
    msgIntro = ""
): Promise<any> {
    const nextStep = getFirstEnabledStep(getNextStepName(currentStep), ctx.state.pending_selection);
    log(`goToNextStep: currentStep=${currentStep} nextStep=${nextStep} msgIntro="${msgIntro}"`);

    if (nextStep === "WAITING_CRMID") {
        return requestCRMID(ctx, notifications, syncUpdates);
    }

    if (nextStep === "WAITING_TASK_TYPE") {
        ctx.state.step = "WAITING_TASK_TYPE";
        ctx.state.pending_selection = undefined;
        ctx.state.options = undefined;
        ctx.state.retry_count = 0;

        const updates: any[] = [...syncUpdates];
        pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

        let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
        if (msgIntro) {
            msg += msgIntro + "\n\n";
        }
        msg += `Пока мы с Вами ждём специалиста, уточните, пожалуйста, класс Вашего обращения\n`;
        msg += `(это поможет нам быстрее выбрать для Вас квалифицированного инженера):\n\n`;

        const textMsg =
            msg +
            `1. Консультация\n` +
            `2. Нужна удалённая помощь инженера\n` +
            `3. Необходим выезд специалиста!`;

        const reqFormattedText = ctx.channel?.type === "mobile_app"
            ? msg.replace(/\n/g, "<br>") +
            `<button>1. Консультация</button><br>` +
            `<button>2. Нужна удалённая помощь инженера</button><br>` +
            `<button>3. Необходим выезд специалиста!</button>`
            : undefined;

        return reply(textMsg, ctx.channel, updates, undefined, reqFormattedText);
    }

    if (nextStep === "WAITING_PRIORITY") {
        ctx.state.step = "WAITING_PRIORITY";
        ctx.state.retry_count = 0;

        const updates: any[] = [...syncUpdates];
        pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

        let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
        if (msgIntro) {
            msg += msgIntro + "\n\n";
        }
        
        const curPriority = statusName(await getVal(ctx.client, ctx.task, FIELD_CODES.PRIORITY, ctx.client)) || "не указан";
        msg += `Уточните, пожалуйста, критичность Вашей проблемы.\n`;
        msg += `На данный момент ей назначен приоритет: "${curPriority}"\n\n`;
        msg += `Мы можем с Вами изменить его:\n`;

        let plainMsg = msg;
        let reqFormattedText = msg.replace(/\n/g, "<br>");

        for (const [k, v] of Object.entries(PRIORITY_MAP)) {
            plainMsg += `${k}. ${v.label} (${v.desc})\n`;
            reqFormattedText += `<button>${k}. ${v.label} (${v.desc})</button><br>`;
        }

        return reply(
            plainMsg,
            ctx.channel,
            updates,
            undefined,
            ctx.channel?.type === "mobile_app" ? reqFormattedText : undefined
        );
    }

    // Состояние LISTENING: диалог завершен, бот пассивно следит за обновлениями
    ctx.state.step = "LISTENING";
    ctx.state.pending_selection = undefined;
    ctx.state.options = undefined;
    ctx.state.retry_count = 0;

    const updates: any[] = [...syncUpdates];
    pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

    let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
    if (msgIntro) {
        msg += msgIntro + "\n\n";
    }
    
    if (msg.trim()) {
        msg += `\n\nОператор скоро свяжется с Вами!`;
        return reply(msg.trim(), ctx.channel, updates);
    }
    
    return null;
}

/**
 * Форматирует имя контакта Pyrus (Имя Фамилия).
 * @param val Объект пользователя/контакта из Pyrus.
 * @returns Отформатированное имя или undefined, если объект пуст.
 */
/**
 * Форматирует имя контакта Pyrus (Имя Фамилия).
 * @param val Объект пользователя/контакта из Pyrus.
 * @returns Отформатированное имя или undefined, если объект пуст.
 */
const contactName = (val: any) => val?.first_name ? `${val.first_name} ${val.last_name || ""}`.trim() : undefined;

/**
 * Получает имя выбранного элемента справочника или статуса.
 * @param val Объект поля выбора/статуса из Pyrus.
 * @returns Название статуса или undefined.
 */
/**
 * Получает имя выбранного элемента справочника или статуса.
 * @param val Объект поля выбора/статуса из Pyrus.
 * @returns Название статуса или undefined.
 */
const statusName = (val: any) => val?.choice_names?.[0] || val?.choice_value || undefined;

/**
 * Безопасно парсит сериализованную строку состояния бота из Pyrus в объект BotState.
 * При ошибке парсинга возвращает объект состояния по умолчанию с начальным шагом "WAITING_SELECTION".
 * @param raw Строка состояния в формате JSON.
 * @returns Объект состояния бота BotState.
 */
/**
 * Безопасно парсит сериализованную строку состояния бота из Pyrus в объект BotState.
 * При ошибке парсинга возвращает объект состояния по умолчанию с начальным шагом "WAITING_SELECTION".
 * @param raw Строка состояния в формате JSON.
 * @returns Объект состояния бота BotState.
 */
function safeParseState(raw: string | undefined): BotState {
    try {
        const parsed = raw ? JSON.parse(raw) : {};
        if (!parsed.step) parsed.step = "WAITING_SELECTION";
        return parsed;
    } catch (e: any) {
        log(`State parse error: ${e.message}`);
        return { step: "WAITING_SELECTION" };
    }
}

/**
 * Проверяет, изменилось ли состояние бота, и при наличии изменений сохраняет его в техническое поле задачи Pyrus.
 * @param client Клиент Pyrus API для комментариев.
 * @param task Объект задачи Pyrus.
 * @param stateFieldId ID технического поля для хранения состояния.
 * @param state Текущий объект состояния бота.
 */
/**
 * Проверяет, изменилось ли состояние бота, и при наличии изменений сохраняет его в техническое поле задачи Pyrus.
 * @param client Клиент Pyrus API для комментариев.
 * @param task Объект задачи Pyrus.
 * @param stateFieldId ID технического поля для хранения состояния.
 * @param state Текущий объект состояния бота.
 */
async function persistStateIfChanged(client: PyrusApiClient, task: any, stateFieldId: number | undefined, state: BotState) {
    if (!stateFieldId) return;
    const next = JSON.stringify(state);
    const cur = await getVal(client, task, FIELD_CODES.STATE, client);
    if (next !== cur) await client.tasks.addComment(task.id, { field_updates: [{ id: stateFieldId, value: next }] });
}

/**
 * Формирует стандартизированный объект ответа бота для отправки в Pyrus.
 * Поддерживает форматированный текст (HTML) для мобильного приложения Pyrus.
 * @param text Обычный текст ответа.
 * @param channel Канал связи для отправки ответа.
 * @param fieldUpdates Массив обновлений полей задачи.
 * @param attachments Массив вложений для отправки.
 * @param formattedText Форматированный текст ответа (HTML).
 * @returns Структурированный объект ответа бота.
 */
/**
 * Формирует стандартизированный объект ответа бота для отправки в Pyrus.
 * Поддерживает форматированный текст (HTML) для мобильного приложения Pyrus.
 * @param text Обычный текст ответа.
 * @param channel Канал связи для отправки ответа.
 * @param fieldUpdates Массив обновлений полей задачи.
 * @param attachments Массив вложений для отправки.
 * @param formattedText Форматированный текст ответа (HTML).
 * @returns Структурированный объект ответа бота.
 */
function reply(text: string, channel: any, fieldUpdates?: any[], attachments?: any[], formattedText?: string): any {
    const r: any = { channel, field_updates: fieldUpdates, attachments };
    if (formattedText) r.formatted_text = formattedText; else r.text = text;
    log(`REPLY: ${text?.substring(0, 50)}...`);
    return r;
}

/**
 * Отправляет накопленные отладочные логи в виде внутреннего комментария к задаче Pyrus.
 * Выполняется только если отладка (DEBUG_ENABLED) включена и есть накопленные логи.
 * @param client Клиент Pyrus API.
 * @param taskId ID задачи Pyrus.
 * @param reason Причина логирования (метка контекста).
 */
/**
 * Отправляет накопленные отладочные логи в виде внутреннего комментария к задаче Pyrus.
 * Выполняется только если отладка (DEBUG_ENABLED) включена и есть накопленные логи.
 * @param client Клиент Pyrus API.
 * @param taskId ID задачи Pyrus.
 * @param reason Причина логирования (метка контекста).
 */
async function sendDebugLogsIfNeeded(client: PyrusApiClient, taskId: number, reason = "debug") {
    if (!DEBUG_ENABLED || taskId === 0 || logs.length === 0) return;
    const logText = `--- DEBUG (${reason}) ---\n${logs.join("\n")}`;
    logs = [];
    try { await client.tasks.addComment(taskId, { text: logText }); } catch (e: any) { console.error("Log error", e); }
}

/**
 * Отправляет сформированный ответ бота в задачу Pyrus.
 * Содержит обходной путь для интеграции с Max Messenger и логику отладки.
 * @param client Клиент Pyrus API.
 * @param taskId ID задачи Pyrus.
 * @param accessToken Токен авторизации Pyrus API.
 * @param replyRes Объект ответа, сформированный функцией reply.
 * @returns null при успешной отправке или сам объект ответа в случае ошибки отправки через API.
 */
/**
 * Отправляет сформированный ответ бота в задачу Pyrus.
 * Содержит обходной путь для интеграции с Max Messenger и логику отладки.
 * @param client Клиент Pyrus API.
 * @param taskId ID задачи Pyrus.
 * @param accessToken Токен авторизации Pyrus API.
 * @param replyRes Объект ответа, сформированный функцией reply.
 * @returns null при успешной отправке или сам объект ответа в случае ошибки отправки через API.
 */
async function dispatchReply(client: PyrusApiClient, taskId: number, accessToken: string, replyRes: any) {
    if (!replyRes) { await sendDebugLogsIfNeeded(client, taskId); return null; }
    
    // Обходной путь для интеграции с Max Messenger (форматирование ответов)
    if (replyRes.channel?.type === "max_messenger") {
        log("Max workaround...");
        try {
            await client.tasks.addComment(taskId, replyRes);
        } catch (e: any) {
            await fetch(`https://api.pyrus.com/v4/tasks/${taskId}/comments`, {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
                body: JSON.stringify(replyRes)
            });
        }
        await sendDebugLogsIfNeeded(client, taskId, "max");
        return null;
    }

    try {
        await client.tasks.addComment(taskId, replyRes);
        await sendDebugLogsIfNeeded(client, taskId, "reply");
        return null;
    } catch (e: any) {
        log(`Dispatch error: ${e.message}`);
        await sendDebugLogsIfNeeded(client, taskId, "dispatch-error");
        return replyRes;
    }
}


// ═══════════════════════════════════════════════════════════════
//  ФУНКЦИИ НЕЧЕТКОГО СРАВНЕНИЯ ТЕКСТА (Да / Нет)
// ═══════════════════════════════════════════════════════════════

/**
 * Вычисляет расстояние Левенштейна между двумя строками.
 * Используется для нечеткого сравнения ответов пользователя (например, названий ресторанов или "Да/Нет").
 * @param a Первая строка для сравнения.
 * @param b Вторая строка для сравнения.
 * @returns Количество операций вставки, удаления или замены символов.
 */
/**
 * Вычисляет расстояние Левенштейна между двумя строками.
 * Используется для нечеткого сравнения ответов пользователя (например, названий ресторанов или "Да/Нет").
 * @param a Первая строка для сравнения.
 * @param b Вторая строка для сравнения.
 * @returns Количество операций вставки, удаления или замены символов.
 */
function levenshtein(a: string, b: string): number {
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const m: number[][] = [];

    for (let i = 0; i <= b.length; i++) m[i] = [i];
    for (let j = 1; j <= a.length; j++) m[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            m[i][j] = b[i - 1] === a[j - 1]
                ? m[i - 1][j - 1]
                : Math.min(m[i - 1][j - 1], m[i][j - 1], m[i - 1][j]) + 1;
        }
    }

    return m[b.length][a.length];
}

const NORM_RE = /[^\wа-яё]/gi;

/**
 * Нормализует строку для нечеткого поиска: приводит к нижнему регистру и удаляет спецсимволы и знаки препинания.
 * @param s Исходная строка.
 * @returns Нормализованная строка, содержащая только буквы и цифры.
 */
/**
 * Нормализует строку для нечеткого поиска: приводит к нижнему регистру и удаляет спецсимволы и знаки препинания.
 * @param s Исходная строка.
 * @returns Нормализованная строка, содержащая только буквы и цифры.
 */
function normalize(s: string): string {
    return s.toLowerCase().replace(NORM_RE, "");
}

/**
 * Выполняет нечеткое сравнение двух строк с использованием расстояния Левенштейна и поиска подстрок.
 * @param input Входная строка (ответ пользователя).
 * @param target Целевая строка (шаблон для сравнения).
 * @param threshold Порог схожести строк (по умолчанию 0.7, от 0 до 1).
 * @returns true, если строки похожи, иначе false.
 */
/**
 * Выполняет нечеткое сравнение двух строк с использованием расстояния Левенштейна и поиска подстрок.
 * @param input Входная строка (ответ пользователя).
 * @param target Целевая строка (шаблон для сравнения).
 * @param threshold Порог схожести строк (по умолчанию 0.7, от 0 до 1).
 * @returns true, если строки похожи, иначе false.
 */
function fuzzyMatch(input: string, target: string, threshold = 0.7): boolean {
    const a = normalize(input);
    const b = normalize(target);

    if (!a || !b) return false;
    if (b.includes(a) && a.length >= 3) return true;
    if (a.includes(b) && b.length >= 3) return true;

    const ratio = (Math.max(a.length, b.length) - levenshtein(a, b)) / Math.max(a.length, b.length);
    const matched = ratio >= threshold;

    if (matched) {
        log(`fuzzyMatch: "${input}" vs "${target}" ratio=${ratio.toFixed(2)}`);
    }

    return matched;
}

const OTHER_WORDS = ["другое", "другой", "другому", "дургой", "иное", "other", "иной", "новый", "ново", "нет в списке"];
const YES_WORDS = ["1", "да", "yes", "д", "y", "ок", "ok", "lf", "ага", "нуда", "давай", "верно", "подтверждаю", "конечно", "именно"];
const NO_WORDS = ["2", "нет", "no", "н", "n", "ybn", "не", "неверно", "другой", "другое"];
const HUMAN_WORDS = [
    "оператор", "человек", "живой", "менеджер", "специалист", "позовите", "переключите",
    "хочу говорить", "соедините", "помощь", "помогите", "не понимаю", "не могу", "не получается",
    "свяжите", "инженер", "поддержка", "сотрудник", "агент"
];

const MAX_RETRIES = 3;

/**
 * Проверяет, выразил ли пользователь намерение переключиться на живого оператора/человека.
 * Сканирует сообщение на наличие ключевых слов (оператор, человек, позовите и т.д.).
 * @param msg Текст сообщения пользователя.
 * @returns true, если пользователь просит оператора, иначе false.
 */
/**
 * Проверяет, выразил ли пользователь намерение переключиться на живого оператора/человека.
 * Сканирует сообщение на наличие ключевых слов (оператор, человек, позовите и т.д.).
 * @param msg Текст сообщения пользователя.
 * @returns true, если пользователь просит оператора, иначе false.
 */
function wantsHuman(msg: string): boolean {
    const lower = msg.toLowerCase();
    return HUMAN_WORDS.some(w => lower.includes(w));
}

/**
 * Проверяет, совпадает ли нормализованная входная строка с любым словом из переданного списка с учетом нечеткого поиска.
 * @param input Входная строка.
 * @param words Список слов для сопоставления.
 * @param threshold Порог схожести для нечеткого сравнения.
 * @returns true, если найдено совпадение, иначе false.
 */
/**
 * Проверяет, совпадает ли нормализованная входная строка с любым словом из переданного списка с учетом нечеткого поиска.
 * @param input Входная строка.
 * @param words Список слов для сопоставления.
 * @param threshold Порог схожести для нечеткого сравнения.
 * @returns true, если найдено совпадение, иначе false.
 */
function matchesAny(input: string, words: string[], threshold = 0.8): boolean {
    const n = normalize(input);
    return words.includes(n) || words.some(w => w.length >= 3 && fuzzyMatch(n, w, threshold));
}

/**
 * Строит текстовое или HTML-меню со списком найденных заведений для выбора пользователем.
 * Добавляет в конец пункт "ДРУГОЕ ЗАВЕДЕНИЕ".
 * @param options Массив доступных ресторанов для выбора.
 * @param prefix Вступительный текст перед меню.
 * @param asHtml Флаг форматирования в HTML-кнопки (для мобильного приложения).
 * @returns Отформатированная строка меню.
 */
/**
 * Строит текстовое или HTML-меню со списком найденных заведений для выбора пользователем.
 * Добавляет в конец пункт "ДРУГОЕ ЗАВЕДЕНИЕ".
 * @param options Массив доступных ресторанов для выбора.
 * @param prefix Вступительный текст перед меню.
 * @param asHtml Флаг форматирования в HTML-кнопки (для мобильного приложения).
 * @returns Отформатированная строка меню.
 */
function buildOptionsMenu(options: RestaurantOption[], prefix = "", asHtml = false): string {
    let msg = prefix;

    options.forEach((opt, i) => {
        if (asHtml) msg += `<button>${i + 1}. ${opt.name} (${opt.crmid})</button><br>`;
        else msg += `${i + 1}. ${opt.name} (${opt.crmid})\n`;
    });

    if (asHtml) msg += `<button>${options.length + 1}. ДРУГОЕ ЗАВЕДЕНИЕ</button>`;
    else msg += `${options.length + 1}. ДРУГОЕ ЗАВЕДЕНИЕ`;

    return msg;
}

/**
 * Строит текстовое или HTML-меню со списком найденных заведений по ИНН.
 * Учитывает, какие заведения уже присутствуют в списке, и при необходимости выводит кнопку "Добавить все".
 * @param options Массив найденных по ИНН ресторанов.
 * @param prefix Вступительный текст перед меню.
 * @param asHtml Флаг форматирования в HTML-кнопки.
 * @returns Отформатированная строка меню.
 */
/**
 * Строит текстовое или HTML-меню со списком найденных заведений по ИНН.
 * Учитывает, какие заведения уже присутствуют в списке, и при необходимости выводит кнопку "Добавить все".
 * @param options Массив найденных по ИНН ресторанов.
 * @param prefix Вступительный текст перед меню.
 * @param asHtml Флаг форматирования в HTML-кнопки.
 * @returns Отформатированная строка меню.
 */
function buildInnOptionsMenu(options: RestaurantOption[], prefix = "", asHtml = false): string {
    let msg = prefix;

    options.forEach((opt, i) => {
        const statusText = opt.existing ? " (уже в списке)" : "";
        if (asHtml) msg += `<button>${i + 1}. ${opt.name} (${opt.crmid})${statusText}</button><br>`;
        else msg += `${i + 1}. ${opt.name} (${opt.crmid})${statusText}\n`;
    });

    const hasNewOptions = options.some(opt => !opt.existing);
    let nextIdx = options.length + 1;
    if (hasNewOptions) {
        if (asHtml) msg += `<button>${nextIdx}. Добавить ВСЕ найденные заведения в список</button><br>`;
        else msg += `${nextIdx}. Добавить ВСЕ найденные заведения в список\n`;
        nextIdx++;
    }

    if (asHtml) msg += `<button>${nextIdx}. ДРУГОЕ ЗАВЕДЕНИЕ / УКАЗАТЬ ДРУГОЙ ИНН/CRMID</button>`;
    else msg += `${nextIdx}. ДРУГОЕ ЗАВЕДЕНИЕ / УКАЗАТЬ ДРУГОЙ ИНН/CRMID`;

    return msg;
}

/**
 * Переводит диалог на оператора техподдержки.
 * Сбрасывает состояние бота в "LISTENING" и отправляет пользователю уведомление о переключении.
 * @param ctx Контекст бота.
 * @param reason Причина эскалации (для внутреннего логирования).
 * @param syncUpdates Массив планируемых обновлений полей задачи.
 * @returns Объект ответа бота с сообщением о переключении на оператора.
 */
/**
 * Переводит диалог на оператора техподдержки.
 * Сбрасывает состояние бота в "LISTENING" и отправляет пользователю уведомление о переключении.
 * @param ctx Контекст бота.
 * @param reason Причина эскалации (для внутреннего логирования).
 * @param syncUpdates Массив планируемых обновлений полей задачи.
 * @returns Объект ответа бота с сообщением о переключении на оператора.
 */
function escalateToHuman(ctx: BotContext, reason: string, syncUpdates: any[] = []): any {
    ctx.state.step = "LISTENING";
    ctx.state.options = undefined;
    ctx.state.pending_selection = undefined;
    ctx.state.retry_count = 0;

    const updates: any[] = [...syncUpdates];
    pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

    log(`ESCALATE: ${reason}`);

    return reply(
        "Переключаем Вас на оператора, ожидайте, пожалуйста. Специалист скоро с Вами свяжется!",
        ctx.channel,
        updates
    );
}

// ═══════════════════════════════════════════════════════════════
//  СОЗДАНИЕ И ПОИСК КАРТОЧКИ КЛИЕНТА
// ═══════════════════════════════════════════════════════════════

/**
 * Обработчик создания/поиска карточки клиента при входящем запросе.
 * Ищет существующую карточку клиента по внешнему ID канала (Telegram/MAX).
 * Если карточка не найдена, создаёт новую. При наличии привязанных к карточке заведений
 * копирует их в таблицу текущей заявки SD.
 * @param client Клиент Pyrus API.
 * @param task Объект задачи Pyrus.
 * @param sdTaskClientsId ID поля ссылки на карточку клиента в форме SD.
 * @param senderName Имя отправителя сообщения.
 * @param externalId Внешний ID чата/канала.
 * @param channelTypeStr Тип канала связи (telegram или max_messenger).
 * @returns Массив обновлений полей для привязки карточки клиента и синхронизации таблицы.
 */
/**
 * Очищает и приводит номер телефона к единому 11-значному формату.
 * Удаляет все нецифровые символы и при необходимости заменяет 8 на 7
 * или добавляет префикс 7 для 10-значных номеров.
 * @param input Исходная строка с номером телефона.
 * @returns 11-значный номер телефона (строка только из цифр, начинающаяся с 7) или null, если формат некорректен.
 */
export function normalizePhone(input: string): string | null {
    if (!input) return null;
    const digits = input.replace(/\D/g, "");
    if (digits.length === 11) {
        if (digits.startsWith("8")) {
            return "7" + digits.substring(1);
        }
        return digits;
    } else if (digits.length === 10) {
        return "7" + digits;
    } else if (digits.length > 11 && digits.startsWith("7")) {
        return digits.substring(0, 11);
    }
    return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/**
 * Ищет карточку клиента по номеру телефона в форме Карточек клиентов.
 * @param client Клиент Pyrus API.
 * @param phone Нормализованный 11-значный номер телефона.
 * @returns Объект задачи карточки клиента или null, если карточка не найдена.
 */
export async function findClientCardByPhone(client: PyrusApiClient, phone: string): Promise<any | null> {
    const phoneFieldId = await resolveFieldId(client, FORM_CLIENT_CARD_ID, FIELD_CODES.PHONE_NUMBER);
    if (!phoneFieldId) return null;

    const filters = [
        {
            field_id: phoneFieldId,
            operator_id: 1,
            values: [phone]
        }
    ];

    log(`findClientCardByPhone: поиск по phone=${phone} (fieldId=${phoneFieldId})`);
    const searchRes = await client.forms.getTasks(FORM_CLIENT_CARD_ID, { filters });
    if (searchRes.tasks && searchRes.tasks.length > 0) {
        log(`findClientCardByPhone: найдена карточка ID=${searchRes.tasks[0].id}`);
        return searchRes.tasks[0];
    }
    log(`findClientCardByPhone: карточка по телефону не найдена`);
    return null;
}

/**
 * Ищет карточку клиента по внешнему ID канала связи (Telegram или Max Messenger).
 * @param client Клиент Pyrus API.
 * @param externalId Внешний ID чата/канала.
 * @param channelTypeStr Тип канала связи (telegram или max_messenger).
 * @returns Объект задачи карточки клиента или null, если карточка не найдена.
 */
export async function findClientCardByChannel(
    client: PyrusApiClient,
    externalId: string,
    channelTypeStr?: string
): Promise<any | null> {
    let targetFieldId = 0;
    if (channelTypeStr === "telegram") {
        targetFieldId = 1;
    } else if (channelTypeStr === "max_messenger") {
        targetFieldId = 9;
    }

    if (!targetFieldId) return null;

    const filters = [
        {
            field_id: targetFieldId,
            operator_id: 1,
            values: [externalId]
        }
    ];

    log(`findClientCardByChannel: поиск карточки по каналу ${channelTypeStr} ID=${externalId}`);
    const searchRes = await client.forms.getTasks(FORM_CLIENT_CARD_ID, { filters });
    if (searchRes.tasks && searchRes.tasks.length > 0) {
        for (const t of searchRes.tasks) {
            const val = findFieldById(t.fields || [], targetFieldId)?.value || await getVal(client, t, targetFieldId, client);
            if (!val || val === externalId || String(val) === String(externalId)) {
                log(`findClientCardByChannel: найдена карточка ID=${t.id}`);
                return t;
            }
        }
    }
    log(`findClientCardByChannel: карточка по каналу связи не найдена`);
    return null;
}

/**
 * Создаёт новую задачу карточки клиента в форме Карточек клиентов.
 * @param client Клиент Pyrus API.
 * @param senderName Имя отправителя сообщения (имя клиента).
 * @param externalId Внешний ID чата/канала.
 * @param channelTypeStr Тип канала связи (telegram или max_messenger).
 * @param phone Номер телефона клиента (опционально).
 * @returns ID созданной задачи карточки клиента.
 */
export async function createClientCard(
    client: PyrusApiClient,
    senderName: string,
    externalId: string,
    channelTypeStr?: string,
    phone?: string
): Promise<number> {
    let targetFieldId = 0;
    if (channelTypeStr === "telegram") {
        targetFieldId = 1;
    } else if (channelTypeStr === "max_messenger") {
        targetFieldId = 9;
    }

    if (!cachedClientCardNameFieldId) {
        cachedClientCardNameFieldId = await resolveFieldId(client, FORM_CLIENT_CARD_ID, FIELD_CODES.CLIENT_CARD_NAME) || 2;
    }

    const createFields: any[] = [];
    if (targetFieldId) {
        createFields.push({ id: targetFieldId, value: externalId });
    }
    if (cachedClientCardNameFieldId) {
        createFields.push({ id: cachedClientCardNameFieldId, value: senderName });
    }
    if (phone) {
        const phoneFieldId = await resolveFieldId(client, FORM_CLIENT_CARD_ID, FIELD_CODES.PHONE_NUMBER);
        if (phoneFieldId) {
            createFields.push({ id: phoneFieldId, value: phone });
        }
    }

    log(`createClientCard: создание новой карточки. payload=${JSON.stringify(createFields)}`);
    const createRes = await client.tasks.create({
        form_id: FORM_CLIENT_CARD_ID,
        fields: createFields
    });

    if (!createRes.task?.id) {
        throw new Error("Не удалось создать карточку клиента в Pyrus API");
    }

    log(`createClientCard: создана карточка ID=${createRes.task.id}`);
    return createRes.task.id;
}

/**
 * Обработчик создания/поиска карточки клиента при входящем запросе.
 * Ищет существующую карточку клиента по внешнему ID канала (Telegram/MAX) или принимает готовую.
 * При наличии привязанных к карточке заведений копирует их в таблицу текущей заявки SD.
 * @param client Клиент Pyrus API.
 * @param task Объект задачи Pyrus.
 * @param sdTaskClientsId ID поля ссылки на карточку клиента в форме SD.
 * @param senderName Имя отправителя сообщения.
 * @param externalId Внешний ID чата/канала.
 * @param channelTypeStr Тип канала связи (telegram или max_messenger).
 * @param clientCardTaskId ID уже известной карточки клиента (если найден по телефону/передан).
 * @returns Массив обновлений полей для привязки карточки клиента и синхронизации таблицы.
 */
export async function findOrCreateClientHook(
    client: PyrusApiClient,
    task: any,
    sdTaskClientsId: number,
    senderName: string,
    externalId: string,
    channelTypeStr?: string,
    passedClientCardTaskId?: number
): Promise<any[]> {
    const updates: any[] = [];

    try {
        let targetFieldId = 0;
        let targetFieldCode = "";
        // Определяем ID и код поля мессенджера в зависимости от типа канала связи
        if (channelTypeStr === "telegram") {
            targetFieldId = 1;
            targetFieldCode = "telegram_id";
        } else if (channelTypeStr === "max_messenger") {
            targetFieldId = 9;
            targetFieldCode = "max_id";
        }

        if (!targetFieldId) {
            log(`Hook Warning: unsupported channel type ${channelTypeStr} for client card lookup.`);
            return updates;
        }

        if (!cachedClientCardNameFieldId) {
            log(`Hook: Fetching client card schema ${FORM_CLIENT_CARD_ID}`);
            cachedClientCardNameFieldId = await resolveFieldId(client, FORM_CLIENT_CARD_ID, FIELD_CODES.CLIENT_CARD_NAME) || 2;
        }

        // clientCardTaskId используется для отслеживания ID карточки клиента (переданного или найденного/созданного)
        let clientCardTaskId: number | undefined = passedClientCardTaskId;
        let foundTableRows: any[] = [];
        const hookDebugLines: string[] = [
            `--- HOOK CLIENT CARD DEBUG ---`,
            `externalId: ${externalId}`,
            `channel: ${channelTypeStr} (targetFieldId=${targetFieldId})`,
        ];

        // Шаг 1: Если ID карточки уже был передан (например, найден по номеру телефона при регистрации)
        if (clientCardTaskId) {
            log(`Hook: Using passed clientCardTaskId=${clientCardTaskId}`);
            hookDebugLines.push(`→ USING passed card: task_id=${clientCardTaskId}`);
            try {
                const tRes = await client.tasks.get({ id: clientCardTaskId });
                const t = tRes?.task;
                if (t) {
                    // Загружаем список ресторанов, привязанных к этой карточке
                    const tableFieldId = await resolveFieldId(client, t.form_id as number, FIELD_CODES.RESTORAN_TABLE) || 5;
                    const tableField = tableFieldId ? findFieldById(t.fields || [], tableFieldId) : 
                        (t.fields || []).find((f: any) => f.type === "table");

                    hookDebugLines.push(`tableField found: ${tableField ? `id=${tableField.id} rows=${Array.isArray(tableField.value) ? tableField.value.length : 0}` : "NOT FOUND"}`);

                    if (tableField && Array.isArray(tableField.value) && tableField.value.length > 0) {
                        foundTableRows = tableField.value;
                    }
                }
            } catch (e: any) {
                log(`Hook error loading passed task ${clientCardTaskId}: ${e.message}`);
            }
        } else {
            // Шаг 2: Если карточка не передана, ищем её в Pyrus по ID мессенджера (telegram_id / max_id)
            const filters: any[] = [
                {
                    field_id: targetFieldId,
                    operator_id: 1,
                    values: [externalId]
                }
            ];

            const searchFiltersLog = JSON.stringify(filters);
            log(`Hook: searching client card form=${FORM_CLIENT_CARD_ID} externalId=${externalId} targetFieldId=${targetFieldId}`);
            log(`Hook: filters=${searchFiltersLog}`);

            const searchRes = await client.forms.getTasks(FORM_CLIENT_CARD_ID, { filters });
            log(`Hook: search result count=${searchRes.tasks?.length ?? 0}`);
            hookDebugLines.push(`search results: ${searchRes.tasks?.length ?? 0}`);
            hookDebugLines.push(`filters: ${searchFiltersLog}`);

            if (searchRes.tasks && searchRes.tasks.length > 0) {
                for (const t of searchRes.tasks) {
                    // Дополнительная валидация: проверяем значение поля мессенджера
                    const val =
                        await getVal(client, t, targetFieldCode, client) ||
                        (targetFieldId ? findFieldById(t.fields || [], targetFieldId)?.value : undefined);

                    const taskFieldIds = (t.fields || []).map((f: any) => `${f.id}:${f.type || "?"}`).join(", ");
                    log(`Hook: candidate task_id=${t.id} val=${JSON.stringify(val)} fields=[${taskFieldIds}]`);
                    hookDebugLines.push(`candidate: task_id=${t.id} val=${JSON.stringify(val)} fields=[${taskFieldIds}]`);

                    // Если ID мессенджера совпадает, считаем карточку найденной
                    if (!val || val === externalId || String(val) === String(externalId)) {
                        clientCardTaskId = t.id as number;
                        log(`Hook: found existing client card task_id=${clientCardTaskId}, val=${val}`);
                        hookDebugLines.push(`→ FOUND existing card: task_id=${clientCardTaskId}`);

                        const tableFieldId = await resolveFieldId(client, t.form_id as number, FIELD_CODES.RESTORAN_TABLE) || 5;
                        const tableField = tableFieldId ? findFieldById(t.fields || [], tableFieldId) : 
                            (t.fields || []).find((f: any) => f.type === "table");

                        hookDebugLines.push(`tableField found: ${tableField ? `id=${tableField.id} rows=${Array.isArray(tableField.value) ? tableField.value.length : 0}` : "NOT FOUND"}`);

                        if (tableField && Array.isArray(tableField.value) && tableField.value.length > 0) {
                            foundTableRows = tableField.value;
                            hookDebugLines.push(`tableRows: ${JSON.stringify(foundTableRows.map((r: any) => r.cells?.map((c: any) => `${c.id}=${JSON.stringify(c.value)}`).join(",")))}`);
                        }

                        // Копируем телефон из существующей карточки в заявку SD, если в SD он не заполнен
                        const clientPhone = findFieldById(t.fields || [], await resolveFieldId(client, t.form_id as number, FIELD_CODES.PHONE_NUMBER) || 0)?.value ||
                                           await getVal(client, t, FIELD_CODES.PHONE_NUMBER, client);
                        const sdPhone = await getVal(client, task, FIELD_CODES.PHONE_NUMBER, client);
                        if (clientPhone && !sdPhone) {
                            const sdPhoneFieldId = await resolveFieldId(client, task.form_id, FIELD_CODES.PHONE_NUMBER);
                            if (sdPhoneFieldId) {
                                log(`Hook: Copying phone from existing Client Card (${clientPhone}) to SD task`);
                                updates.push({ id: sdPhoneFieldId, value: clientPhone });
                            }
                        }

                        break;
                    } else {
                        log(`Hook: candidate REJECTED task_id=${t.id} val=${JSON.stringify(val)} !== externalId=${externalId}`);
                        hookDebugLines.push(`→ REJECTED: val mismatch`);
                    }
                }
            }
        }

        // Шаг 3: Если карточка не найдена и не передана, создаем новую карточку клиента
        if (!clientCardTaskId) {
            const createFields: any[] = [
                { id: targetFieldId, value: externalId }
            ];

            if (cachedClientCardNameFieldId) {
                createFields.push({ id: cachedClientCardNameFieldId, value: senderName });
            }

            // Копируем номер телефона из заявки SD в новую карточку клиента, если он там есть
            const sdPhone = await getVal(client, task, FIELD_CODES.PHONE_NUMBER, client);
            if (sdPhone) {
                const clientPhoneFieldId = await resolveFieldId(client, FORM_CLIENT_CARD_ID, FIELD_CODES.PHONE_NUMBER);
                if (clientPhoneFieldId) {
                    createFields.push({ id: clientPhoneFieldId, value: sdPhone });
                }
            }

            log(`Hook: client card NOT found — creating. payload=${JSON.stringify(createFields)}`);
            hookDebugLines.push(`→ NOT FOUND — creating new card`);
            hookDebugLines.push(`create payload: ${JSON.stringify(createFields)}`);

            const createRes = await client.tasks.create({
                form_id: FORM_CLIENT_CARD_ID,
                fields: createFields
            });

            if (createRes.task) {
                clientCardTaskId = createRes.task.id;
                log(`Hook: created new client card task_id=${clientCardTaskId}`);
                hookDebugLines.push(`→ CREATED: task_id=${clientCardTaskId}`);
            }
        }

        // Отправка отладочных логов во внутренний комментарий (если DEBUG_ENABLED)
        try {
            if (DEBUG_ENABLED) await client.tasks.addComment(task.id, { text: hookDebugLines.join("\n") });
        } catch (_) {}

        if (clientCardTaskId) {
            updates.push({ id: sdTaskClientsId, value: { task_id: clientCardTaskId } });

            if (foundTableRows.length > 0) {
                const sdTableId =
                    await resolveFieldId(client, task.form_id, FIELD_CODES.RESTORAN_TABLE) ||
                    SD_FIELD_IDS.restoranTable;

                if (sdTableId) {
                    const newSdRows: any[] = [];
                    const tableFieldId = await resolveFieldId(client, task.form_id, FIELD_CODES.RESTORAN_TABLE);
                    const tableField = tableFieldId ? findFieldById(task.fields, tableFieldId) :
                        findFieldById(task.fields || [], SD_FIELD_IDS.restoranTable);

                    const crmidColId =
                        findColumnId(tableField?.info?.columns, FIELD_CODES.TABLE_REST_CRMID) ||
                        SD_TABLE_CRMID_COL;

                    const linkColId =
                        findColumnId(tableField?.info?.columns, FIELD_CODES.TABLE_REST_LINK) ||
                        SD_TABLE_LINK_COL;

                    const nameColId =
                        findColumnId(tableField?.info?.columns, FIELD_CODES.TABLE_REST_NAME) ||
                        SD_TABLE_NAME_COL;

                    const innColId =
                        findColumnId(tableField?.info?.columns, FIELD_CODES.TABLE_REST_INN) ||
                        SD_TABLE_INN_COL;

                    let nextId = calcNextRowId(Array.isArray(tableField?.value) ? tableField.value : []);

                    hookDebugLines.push(`SD table: id=${sdTableId} crmidCol=${crmidColId} linkCol=${linkColId} nextRowId=${nextId}`);

                    for (const r of foundTableRows) {
                        const rCrmid =
                            r.cells?.find((c: any) => c.id === crmidColId)?.value ||
                            r.cells?.find((c: any) => c.id === CC_TABLE_CRMID_COL)?.value ||
                            findCellByCode(r.cells, FIELD_CODES.TABLE_REST_CRMID)?.value;

                        const rLink =
                            r.cells?.find((c: any) => c.id === linkColId)?.value ||
                            r.cells?.find((c: any) => c.id === CC_TABLE_LINK_COL)?.value ||
                            findCellByCode(r.cells, FIELD_CODES.TABLE_REST)?.value ||
                            r.cells?.find((c: any) => c.value?.task_id)?.value;

                        const rName =
                            r.cells?.find((c: any) => c.id === CC_TABLE_NAME_COL)?.value ||
                            findCellByCode(r.cells, FIELD_CODES.TABLE_REST_NAME)?.value;

                        const rInn =
                            r.cells?.find((c: any) => c.id === CC_TABLE_INN_COL)?.value ||
                            findCellByCode(r.cells, FIELD_CODES.TABLE_REST_INN)?.value;

                        hookDebugLines.push(`  row cells: ${r.cells?.map((c: any) => `id=${c.id} val=${JSON.stringify(c.value)}`).join(" | ")}`);
                        hookDebugLines.push(`  → rCrmid=${rCrmid} rLink.task_id=${rLink?.task_id}`);

                        if (rCrmid && rLink?.task_id) {
                            newSdRows.push(buildTableRow(
                                nextId++,
                                crmidColId,
                                linkColId,
                                nameColId,
                                innColId,
                                String(rCrmid),
                                rLink.task_id,
                                rName || rLink.subject,
                                rInn
                            ));
                        }
                    }

                    hookDebugLines.push(`SD table rows to copy: ${newSdRows.length}`);

                    if (newSdRows.length > 0 && SYNC_ENABLED.RESTAURANT_TABLE_TO_SD) {
                        updates.push({ id: sdTableId, value: newSdRows });
                    }
                }
            }
        }
    } catch (e: any) {
        log(`Hook Error: ${e.message}`);
    }

    return updates;
}

// ═══════════════════════════════════════════════════════════════
//  СИНХРОНИЗАЦИЯ ТАБЛИЦ И СВЯЗАННЫХ ПРОФИЛЕЙ КЛИЕНТОВ
// ═══════════════════════════════════════════════════════════════

/**
 * Добавляет запись о ресторане в таблицу заведений формы заявки SD, если его там еще нет.
 * @param ctx Контекст бота.
 * @param updates Массив для накопления обновлений полей задачи.
 * @param crmid CRMID заведения.
 * @param taskId ID задачи Pyrus (карточки заведения).
 * @param name Название заведения.
 * @param inn ИНН заведения.
 */
async function appendToSdTable(
    ctx: BotContext,
    updates: any[],
    crmid: string,
    taskId: number,
    name?: string,
    inn?: string
) {
    const tableId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.RESTORAN_TABLE);
    const tableField = tableId ? findFieldById(ctx.task.fields, tableId) : undefined;
    if (!tableField) return;

    const rows = Array.isArray(tableField.value) ? tableField.value : [];

    const exists = rows.some((row: any) => {
        const cellCrmid = findCellByCode(row.cells, FIELD_CODES.TABLE_REST_CRMID)?.value;
        return String(cellCrmid) === String(crmid);
    });

    if (exists) return;

    const crmidColId =
        findColumnId(tableField.info?.columns, FIELD_CODES.TABLE_REST_CRMID) ||
        SD_TABLE_CRMID_COL;

    const linkColId =
        findColumnId(tableField.info?.columns, FIELD_CODES.TABLE_REST_LINK) ||
        SD_TABLE_LINK_COL;

    const nameColId =
        findColumnId(tableField.info?.columns, FIELD_CODES.TABLE_REST_NAME) ||
        SD_TABLE_NAME_COL;

    const innColId =
        findColumnId(tableField.info?.columns, FIELD_CODES.TABLE_REST_INN) ||
        SD_TABLE_INN_COL;

    const nextId = calcNextRowId(tableField.value || []);

    updates.push({
        id: tableField.id,
        value: [buildTableRow(nextId, crmidColId, linkColId, nameColId, innColId, crmid, taskId, name, inn)]
    });
}

/**
 * Определяет числовые идентификаторы колонок в таблице заведений по их строковым кодам.
 * @param tableField Объект поля таблицы из Pyrus.
 * @param formId ID формы, которой принадлежит таблица.
 * @returns Объект с ID колонок или null при невозможности сопоставления.
 */
/**
 * Определяет числовые идентификаторы колонок в таблице заведений по их строковым кодам.
 * @param tableField Объект поля таблицы из Pyrus.
 * @param formId ID формы, которой принадлежит таблица.
 * @returns Объект с ID колонок или null при невозможности сопоставления.
 */
function resolveColumnIds(tableField: any, formId: number): { formId: number; crmidColId: number; linkColId: number; nameColId?: number; innColId?: number } | null {
    const cols = tableField.info?.columns;
    if (!cols) return null;

    const cId = findColumnId(cols, FIELD_CODES.TABLE_REST_CRMID);
    const lId = findColumnId(cols, FIELD_CODES.TABLE_REST);
    const nId = findColumnId(cols, FIELD_CODES.TABLE_REST_NAME);
    const iId = findColumnId(cols, FIELD_CODES.TABLE_REST_INN);

    return cId && lId
        ? { formId, crmidColId: cId, linkColId: lId, nameColId: nId, innColId: iId }
        : null;
}

/**
 * Добавляет ресторан в таблицу заведений карточки клиента, если его там еще нет.
 * Отправляет комментарий в карточку клиента с указанием автора добавления.
 * @param ctx Контекст бота.
 * @param crmid CRMID заведения.
 * @param taskId ID задачи Pyrus (карточки заведения).
 * @param name Название заведения.
 * @param authorName Имя пользователя, добавившего заведение.
 * @param inn ИНН заведения.
 */
async function appendToClientProfile(
    ctx: BotContext,
    crmid: string,
    taskId: number,
    name: string,
    authorName: string,
    inn?: string
) {
    const clientLink = await getVal(ctx.client, ctx.task, FIELD_CODES.TASK_CLIENTS, ctx.client);
    if (!clientLink?.task_id) return;

    const clientTaskId = clientLink.task_id as number;
    const clientTask = await ctx.client.tasks.get({ id: clientTaskId });
    const clientFormId = clientTask.task?.form_id;
    if (!clientFormId) return;

    const clientTableId = await resolveFieldId(ctx.client, clientFormId, FIELD_CODES.RESTORAN_TABLE);
    const clientTableField = clientTableId ? findFieldById(clientTask.task?.fields || [], clientTableId) : undefined;
    if (!clientTableField) return;

    let cols = resolveColumnIds(clientTableField, clientFormId);

    if (!cols && cachedClientColumns?.formId === clientFormId) {
        cols = cachedClientColumns;
    }

    if (!cols) {
        const schema = await ctx.client.forms.get({ id: clientFormId });
        const clientTableIdSchema = await resolveFieldId(ctx.client, clientFormId, FIELD_CODES.RESTORAN_TABLE);
        const schemaTable = clientTableIdSchema ? findFieldById(schema.fields || [], clientTableIdSchema) : undefined;

        if (schemaTable?.info?.columns) {
            const cId = findColumnId(schemaTable.info.columns, FIELD_CODES.TABLE_REST_CRMID);
            const lId = findColumnId(schemaTable.info.columns, FIELD_CODES.TABLE_REST_LINK) || findColumnId(schemaTable.info.columns, FIELD_CODES.TABLE_REST);
            const nId = findColumnId(schemaTable.info.columns, FIELD_CODES.TABLE_REST_NAME);
            const iId = findColumnId(schemaTable.info.columns, FIELD_CODES.TABLE_REST_INN);

            if (cId && lId) {
                cols = { formId: clientFormId, crmidColId: cId, linkColId: lId, nameColId: nId, innColId: iId };
                cachedClientColumns = cols;
            }
        }
    }

    if (!cols) return;

    const rows = Array.isArray(clientTableField.value) ? clientTableField.value : [];

    const exists = rows.some((row: any) => {
        const cellCrmid = findCellByCode(row.cells, FIELD_CODES.TABLE_REST_CRMID)?.value;
        return String(cellCrmid) === String(crmid);
    });

    if (exists) {
        log(`appendToClientProfile: CRMID ${crmid} already exists`);
        return;
    }

    const nextId = calcNextRowId(clientTableField.value || []);
    const newRow = buildTableRow(
        nextId,
        cols.crmidColId,
        cols.linkColId,
        cols.nameColId || CC_TABLE_NAME_COL,
        cols.innColId || CC_TABLE_INN_COL,
        crmid,
        taskId,
        name,
        inn
    );

    await ctx.client.tasks.addComment(clientTaskId, {
        text: `Добавлено заведение (${authorName}): ${name} (${crmid})`,
        field_updates: [{ id: clientTableField.id, value: [newRow] }],
    });
}

/**
 * Добавляет несколько заведений в таблицу формы SD за один раз.
 * Исключает дублирование с учетом планируемых обновлений в массиве updates.
 * @param ctx Контекст бота.
 * @param updates Накопленный массив обновлений полей.
 * @param items Список добавляемых заведений.
 */
async function appendMultipleToSdTable(
    ctx: BotContext,
    updates: any[],
    items: { crmid: string; taskId: number; name?: string; inn?: string }[]
) {
    const tableId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.RESTORAN_TABLE);
    const tableField = tableId ? findFieldById(ctx.task.fields, tableId) : undefined;
    if (!tableField) return;

    const existingRows = Array.isArray(tableField.value) ? tableField.value : [];
    
    // Проверяем, нет ли уже этой строки в планируемых обновлениях таблицы
    const tableUpdateIndex = updates.findIndex(u => u.id === tableField.id);
    const pendingNewRows = tableUpdateIndex !== -1 ? updates[tableUpdateIndex].value : [];
    
    const allCurrentRows = [...existingRows, ...pendingNewRows];
    const newRowsToBuild: any[] = [];
    
    let nextId = calcNextRowId(allCurrentRows);
    
    const crmidColId =
        findColumnId(tableField.info?.columns, FIELD_CODES.TABLE_REST_CRMID) ||
        SD_TABLE_CRMID_COL;

    const linkColId =
        findColumnId(tableField.info?.columns, FIELD_CODES.TABLE_REST_LINK) ||
        SD_TABLE_LINK_COL;

    const nameColId =
        findColumnId(tableField.info?.columns, FIELD_CODES.TABLE_REST_NAME) ||
        SD_TABLE_NAME_COL;

    const innColId =
        findColumnId(tableField.info?.columns, FIELD_CODES.TABLE_REST_INN) ||
        SD_TABLE_INN_COL;

    for (const item of items) {
        const exists = allCurrentRows.some((row: any) => {
            const cellCrmid = row.cells?.find((c: any) =>
                c.code === FIELD_CODES.TABLE_REST_CRMID ||
                c.info?.code === FIELD_CODES.TABLE_REST_CRMID
            )?.value;

            return String(cellCrmid) === String(item.crmid);
        });
        
        if (!exists) {
            const newRow = buildTableRow(nextId, crmidColId, linkColId, nameColId, innColId, item.crmid, item.taskId, item.name, item.inn);
            newRowsToBuild.push(newRow);
            allCurrentRows.push(newRow);
            nextId++;
        }
    }
    
    if (newRowsToBuild.length > 0) {
        if (tableUpdateIndex !== -1) {
            updates[tableUpdateIndex].value.push(...newRowsToBuild);
        } else {
            updates.push({
                id: tableField.id,
                value: newRowsToBuild
            });
        }
    }
}

/**
 * Массово добавляет список заведений в таблицу карточки клиента и логирует это единым комментарием.
 * @param ctx Контекст бота.
 * @param items Список добавляемых заведений.
 * @param authorName Имя пользователя, инициировавшего добавление.
 */
async function appendMultipleToClientProfile(
    ctx: BotContext,
    items: { crmid: string; taskId: number; name: string; inn?: string }[],
    authorName: string
) {
    const clientLink = await getVal(ctx.client, ctx.task, FIELD_CODES.TASK_CLIENTS, ctx.client);
    if (!clientLink?.task_id) return;

    const clientTaskId = clientLink.task_id as number;
    const clientTask = await ctx.client.tasks.get({ id: clientTaskId });
    const clientFormId = clientTask.task?.form_id;
    if (!clientFormId) return;

    const clientTableId = await resolveFieldId(ctx.client, clientFormId, FIELD_CODES.RESTORAN_TABLE);
    const clientTableField = clientTableId ? findFieldById(clientTask.task?.fields || [], clientTableId) : undefined;
    if (!clientTableField) return;

    let cols = resolveColumnIds(clientTableField, clientFormId);
    if (!cols && cachedClientColumns?.formId === clientFormId) {
        cols = cachedClientColumns;
    }
    if (!cols) {
        const schema = await ctx.client.forms.get({ id: clientFormId });
        const clientTableIdSchema = await resolveFieldId(ctx.client, clientFormId, FIELD_CODES.RESTORAN_TABLE);
        const schemaTable = clientTableIdSchema ? findFieldById(schema.fields || [], clientTableIdSchema) : undefined;

        if (schemaTable?.info?.columns) {
            const cId = findColumnId(schemaTable.info.columns, FIELD_CODES.TABLE_REST_CRMID);
            const lId = findColumnId(schemaTable.info.columns, FIELD_CODES.TABLE_REST_LINK) || findColumnId(schemaTable.info.columns, FIELD_CODES.TABLE_REST);
            const nId = findColumnId(schemaTable.info.columns, FIELD_CODES.TABLE_REST_NAME);
            const iId = findColumnId(schemaTable.info.columns, FIELD_CODES.TABLE_REST_INN);

            if (cId && lId) {
                cols = { formId: clientFormId, crmidColId: cId, linkColId: lId, nameColId: nId, innColId: iId };
                cachedClientColumns = cols;
            }
        }
    }
    if (!cols) return;

    const rows = Array.isArray(clientTableField.value) ? clientTableField.value : [];
    const newRowsToBuild: any[] = [];
    let nextId = calcNextRowId(rows);

    const logTexts: string[] = [];

    for (const item of items) {
        const exists = rows.some((row: any) => {
            const cellCrmid = row.cells?.find((c: any) =>
                c.code === FIELD_CODES.TABLE_REST_CRMID ||
                c.info?.code === FIELD_CODES.TABLE_REST_CRMID
            )?.value;

            return String(cellCrmid) === String(item.crmid);
        });

        if (!exists) {
            const newRow = buildTableRow(
                nextId,
                cols.crmidColId,
                cols.linkColId,
                cols.nameColId || CC_TABLE_NAME_COL,
                cols.innColId || CC_TABLE_INN_COL,
                item.crmid,
                item.taskId,
                item.name,
                item.inn
            );
            newRowsToBuild.push(newRow);
            rows.push(newRow);
            nextId++;
            logTexts.push(`${item.name} (${item.crmid})`);
        }
    }

    if (newRowsToBuild.length > 0) {
        await ctx.client.tasks.addComment(clientTaskId, {
            text: `Добавлены заведения (${authorName}):\n${logTexts.map(t => `- ${t}`).join("\n")}`,
            field_updates: [{ id: clientTableField.id, value: newRowsToBuild }],
        });
    }
}

/**
 * Выполняет автоматическую синхронизацию значений полей из карточки Ресторана в заявку SD.
 * Сопоставляет поля двух форм по их строковым кодам (code) и типам данных.
 * Исключает системные поля, структурные поля и поле статуса.
 * @param ctx Контекст бота.
 * @param restaurantTaskId ID карточки ресторана.
 * @returns Массив обновлений полей для задачи SD.
 */
/**
 * Выполняет автоматическую синхронизацию значений полей из карточки Ресторана в заявку SD.
 * Сопоставляет поля двух форм по их строковым кодам (code) и типам данных.
 * Исключает системные поля, структурные поля и поле статуса.
 * @param ctx Контекст бота.
 * @param restaurantTaskId ID карточки ресторана.
 * @returns Массив обновлений полей для задачи SD.
 */
async function buildRestaurantSyncUpdates(ctx: BotContext, restaurantTaskId: number): Promise<any[]> {
    const updates: any[] = [];
    if (!SYNC_ENABLED.RESTAURANT_FIELDS_TO_SD) {
        log("buildRestaurantSyncUpdates: sync of restaurant fields is disabled by SYNC_ENABLED toggle.");
        return updates;
    }

    try {
        const restTaskRes = await ctx.client.tasks.get({ id: restaurantTaskId });
        const restTask = restTaskRes.task;
        if (!restTask || !restTask.form_id || !restTask.fields) return updates;

        const sdFormId = ctx.task.form_id;
        if (!sdFormId) return updates;

        // Загружаем актуальные схемы обеих форм для сопоставления полей
        const sdSchema = await ctx.client.forms.get({ id: sdFormId });
        const restSchema = await ctx.client.forms.get({ id: restTask.form_id });

        if (!sdSchema.fields || !restSchema.fields) return updates;

        // Формируем карту полей формы SD: "код -> { id, тип_данных }"
        const sdCodeMap = new Map<string, { id: number, type: string }>();
        const sdSchemaFlat = flattenFields(sdSchema.fields);
        for (const sf of sdSchemaFlat) {
            const code = (sf.code || sf.info?.code || "").toLowerCase().trim();
            const type = sf.type || sf.info?.type;
            if (code && type) {
                sdCodeMap.set(code, { id: sf.id, type });
            }
        }

        // Формируем карту полей формы Ресторана: "id -> { код, тип_данных }"
        const restIdMap = new Map<number, { code: string, type: string }>();
        const restSchemaFlat = flattenFields(restSchema.fields);
        for (const rf of restSchemaFlat) {
            const code = (rf.code || rf.info?.code || "").toLowerCase().trim();
            const type = rf.type || rf.info?.type;
            if (code && type) {
                restIdMap.set(rf.id, { code, type });
            }
        }

        // Обходим все заполненные поля в карточке Ресторана
        const restTaskFieldsFlat = flattenFields(restTask.fields);
        for (const rtf of restTaskFieldsFlat) {
            const val = rtf.value;
            // Пропускаем пустые поля
            if (val === undefined || val === null || val === "") continue;
            if (Array.isArray(val) && val.length === 0) continue;

            const schemaInfo = restIdMap.get(rtf.id);
            if (!schemaInfo) {
                log(`buildRestaurantSyncUpdates: rest field ${rtf.id} has value but not found in schema mapping`);
                continue;
            }

            const { code, type: restType } = schemaInfo;

            // ИСПРАВЛЕНИЕ: Пропускаем технические поля, карточки и поле Status (status), чтобы бот не менял статус тикета на статус ресторана!
            if (code === FIELD_CODES.STATE || code === FIELD_CODES.RESTORAN || code === FIELD_CODES.RESTORAN_TABLE || code === "status") {
                log(`buildRestaurantSyncUpdates: Skipping system field code=${code}`);
                continue;
            }
            if (restType === "group" || restType === "title" || restType === "table") {
                log(`buildRestaurantSyncUpdates: Skipping structural field code=${code} type=${restType}`);
                continue;
            }

            const sdFieldInfo = sdCodeMap.get(code);
            if (!sdFieldInfo) {
                log(`buildRestaurantSyncUpdates: Field code=${code} type=${restType} exists in Restaurant but not in SD form`);
                continue;
            }

            if (sdFieldInfo.type !== restType) {
                log(`buildRestaurantSyncUpdates: Type mismatch for code=${code}: Rest has ${restType}, SD has ${sdFieldInfo.type}`);
                continue;
            }

            // Исключаем дублирование обновлений для одного поля
            if (!updates.find(u => u.id === sdFieldInfo.id)) {
                let mappedVal = val;
                if (restType === "multiple_choice") {
                    if (val && typeof val === "object") {
                        const choiceValue = val.choice_value || (val.choice_names && val.choice_names[0]);
                        if (choiceValue) {
                            mappedVal = { choice_value: choiceValue };
                        }
                    }
                } else if (restType === "multiselect") {
                    if (val && typeof val === "object") {
                        const choiceValues = val.choice_values || val.choice_names || (Array.isArray(val) ? val.map((v: any) => v.choice_value || v.choice_names?.[0] || v) : undefined);
                        if (choiceValues) {
                            mappedVal = { choice_values: choiceValues };
                        }
                    }
                } else if (restType === "date") {
                    // Особый случай: Pyrus API возвращает даты в формате ISO или в виде объектов Date с временной частью (например, "2036-07-01T00:00:00.000Z"),
                    // но при записи в поле типа "date" требует строго формат "YYYY-MM-DD".
                    // Извлекаем только дату (YYYY-MM-DD) из строкового или объектного представления.
                    let strVal = "";
                    if (val instanceof Date) {
                        strVal = val.toISOString();
                    } else if (val && typeof val === "object" && typeof val.toISOString === "function") {
                        strVal = (val as any).toISOString();
                    } else {
                        strVal = String(val);
                    }
                    const match = strVal.match(/^\d{4}-\d{2}-\d{2}/);
                    if (match) {
                        mappedVal = match[0];
                    }
                }
                log(`buildRestaurantSyncUpdates: Match found! Syncing code=${code} (restField=${rtf.id} -> sdField=${sdFieldInfo.id}) type=${restType} value=${JSON.stringify(mappedVal)}`);
                updates.push({
                    id: sdFieldInfo.id,
                    value: mappedVal
                });
            }
        }

        log(`buildRestaurantSyncUpdates: Generated ${updates.length} field updates`);

    } catch (e: any) {
        log(`buildRestaurantSyncUpdates Error: ${e.message}`);
    }

    return updates;
}

/**
 * Извлекает данные (CRMID и ID задач карточек ресторанов) из текущей таблицы заведений в заявке SD.
 * @param ctx Контекст бота.
 * @returns Список объектов с CRMID и taskId.
 */
/**
 * Извлекает данные (CRMID и ID задач карточек ресторанов) из текущей таблицы заведений в заявке SD.
 * @param ctx Контекст бота.
 * @returns Список объектов с CRMID и taskId.
 */
async function extractTableData(ctx: BotContext): Promise<{ crmid: string; taskId: number }[]> {
    const tableId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.RESTORAN_TABLE) || 38;
    const tableValue = await getVal(ctx.client, ctx.task, tableId, ctx.client);
    const rows = Array.isArray(tableValue) ? tableValue : [];
    const data: { crmid: string; taskId: number }[] = [];

    for (const row of rows) {
        const crmid = findCellByCode(row.cells, FIELD_CODES.TABLE_REST_CRMID)?.value;
        const restForm = findCellByCode(row.cells, FIELD_CODES.TABLE_REST)?.value;

        if (crmid && restForm?.task_id) {
            data.push({ crmid: String(crmid), taskId: Number(restForm.task_id) });
        }
    }

    return data;
}

/**
 * Удаляет заведение из таблицы карточки клиента по его CRMID.
 * Вызывается при удалении строки с рестораном из таблицы заявки SD.
 * @param ctx Контекст бота.
 * @param crmid CRMID удаляемого заведения.
 * @param authorName Имя пользователя, удалившего заведение.
 */
/**
 * Удаляет заведение из таблицы карточки клиента по его CRMID.
 * Вызывается при удалении строки с рестораном из таблицы заявки SD.
 * @param ctx Контекст бота.
 * @param crmid CRMID удаляемого заведения.
 * @param authorName Имя пользователя, удалившего заведение.
 */
async function removeFromClientProfile(ctx: BotContext, crmid: string, authorName: string): Promise<void> {
    const clientLink = await getVal(ctx.client, ctx.task, FIELD_CODES.TASK_CLIENTS, ctx.client);
    if (!clientLink?.task_id) return;

    const clientTaskId = clientLink.task_id as number;
    const clientTask = await ctx.client.tasks.get({ id: clientTaskId });
    const clientFormId = clientTask.task?.form_id;
    if (!clientFormId) return;

    const clientTableId = await resolveFieldId(ctx.client, clientFormId, FIELD_CODES.RESTORAN_TABLE) || 5;
    const clientTableField = clientTableId ? findFieldById(clientTask.task?.fields || [], clientTableId) : undefined;

    if (!clientTableField || !Array.isArray(clientTableField.value)) return;

    const rowToDelete = clientTableField.value.find((row: any) => {
        const cellCrmid = findCellByCode(row.cells, FIELD_CODES.TABLE_REST_CRMID)?.value;
        return String(cellCrmid) === String(crmid);
    });

    if (!rowToDelete) {
        log(`removeFromClientProfile: CRMID ${crmid} not found`);
        return;
    }

    await ctx.client.tasks.addComment(clientTaskId, {
        text: `Удалено заведение (${authorName}): ${crmid}`,
        field_updates: [
            {
                id: clientTableField.id,
                value: [{ row_id: rowToDelete.row_id, delete: true }]
            }
        ],
    });
}

/**
 * Основная функция синхронизации привязанного к заявке ресторана и таблицы заведений.
 * Обрабатывает три сценария:
 * 1. Выбор/изменение ресторана в поле "Ресторан" -> привязка к таблице SD и карточке клиента, запуск синхронизации полей.
 * 2. Ручное удаление строки из таблицы заведений SD -> удаление из карточки клиента.
 * 3. Ручное добавление строки в таблицу заведений SD -> добавление в карточку клиента.
 * @param ctx Контекст бота.
 * @param updates Массив для накопления обновлений полей.
 * @param notifications Массив для накопления текстовых уведомлений.
 * @param authorName Имя автора изменения.
 */
async function syncRestoranAndTable(
    ctx: BotContext,
    updates: any[],
    notifications: string[],
    authorName: string
): Promise<void> {
    const restoranVal = await getVal(ctx.client, ctx.task, FIELD_CODES.RESTORAN, ctx.client);
    const curRestoranId = restoranVal?.task_id as number | undefined;

    if (curRestoranId && curRestoranId !== ctx.state.prev_restoran_id) {
        log(`Restoran changed: ${ctx.state.prev_restoran_id || "none"} -> ${curRestoranId}`);
        ctx.state.prev_restoran_id = curRestoranId;

        try {
            const restTask = await ctx.client.tasks.get({ id: curRestoranId });

            const crmField = findFieldById(restTask.task?.fields || [], FIELD_CRMID_ID);

            const crmid =
                crmField?.value ||
                await getVal(ctx.client, restTask.task, "CRMID", ctx.client) ||
                await getVal(ctx.client, restTask.task, "crmid", ctx.client) ||
                await getVal(ctx.client, restTask.task, "crm_id", ctx.client) ||
                "";

            const name =
                await getVal(ctx.client, restTask.task, "u_client", ctx.client) ||
                await getVal(ctx.client, restTask.task, "restoran", ctx.client) ||
                await getVal(ctx.client, restTask.task, "Название заведения", ctx.client) ||
                await getVal(ctx.client, restTask.task, "Resto", ctx.client) ||
                await getVal(ctx.client, restTask.task, "resto", ctx.client) ||
                restTask.task?.subject ||
                "заведение";

            const inn =
                await getVal(ctx.client, restTask.task, "Dadata Inn", ctx.client) ||
                await getVal(ctx.client, restTask.task, "dadata_inn", ctx.client) ||
                await getVal(ctx.client, restTask.task, "Dadata_inn", ctx.client) ||
                await getVal(ctx.client, restTask.task, "инн", ctx.client) ||
                findFieldById(restTask.task?.fields || [], 6)?.value ||
                "";

            const crmidStr = String(crmid);

            if (NOTIFICATIONS_ENABLED.RESTAURANT_LINKED) {
                notifications.push(`К Вашей заявке привязано заведение: "${name}"`);
            }

            // Синхронизируем совпадающие по коду поля карточки ресторана в заявку SD
            if (SYNC_ENABLED.RESTAURANT_FIELDS_TO_SD) {
                const syncUpdatesForSD = await buildRestaurantSyncUpdates(ctx, curRestoranId);
                updates.push(...syncUpdatesForSD);
            }

            const tableId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.RESTORAN_TABLE) || 38;
            const tableValue = await getVal(ctx.client, ctx.task, tableId, ctx.client);
            const rows = Array.isArray(tableValue) ? tableValue : [];

            const alreadyInTable = rows.some((row: any) => {
                const restForm = row.cells?.find((c: any) =>
                    c.code === FIELD_CODES.TABLE_REST ||
                    c.info?.code === FIELD_CODES.TABLE_REST
                )?.value;

                return restForm?.task_id === curRestoranId;
            });

            if (!alreadyInTable && crmidStr) {
                if (ctx.isAssistantChannel) {
                    log("Sync skipped for Assistant channel");
                } else {
                    await appendToSdTable(ctx, updates, crmidStr, curRestoranId, name, String(inn));
                    await appendToClientProfile(ctx, crmidStr, curRestoranId, name, authorName, String(inn));
                }
            }
        } catch (e: any) {
            log(`Failed to fetch restoran task ${curRestoranId}: ${e.message}`);
        }
    } else if (curRestoranId) {
        ctx.state.prev_restoran_id = curRestoranId;
    }

    const curTableData = await extractTableData(ctx);
    const curCrmids = curTableData.map(d => d.crmid);
    const prevCrmids = ctx.state.prev_table_crmids || [];

    const deletedCrmids = prevCrmids.filter(c => !curCrmids.includes(c));

    if (deletedCrmids.length > 0) {
        log(`Table rows deleted: [${deletedCrmids.join(", ")}]`);

        if (!ctx.isAssistantChannel) {
            for (const crmid of deletedCrmids) {
                await removeFromClientProfile(ctx, crmid, authorName);
            }
        }
    }

    const addedRows = curTableData.filter(d => !prevCrmids.includes(d.crmid));

    if (addedRows.length > 0) {
        log(`Table rows manually added: [${addedRows.map(r => r.crmid).join(", ")}]`);

        if (!ctx.isAssistantChannel) {
            for (const row of addedRows) {
                try {
                    const restTask = await ctx.client.tasks.get({ id: row.taskId });
                    const name =
                        await getVal(ctx.client, restTask.task, "u_client", ctx.client) ||
                        await getVal(ctx.client, restTask.task, "restoran", ctx.client) ||
                        await getVal(ctx.client, restTask.task, "Resto", ctx.client) ||
                        restTask.task?.subject ||
                        "заведение";
                    await appendToClientProfile(ctx, row.crmid, row.taskId, name, authorName);
                } catch (e: any) {
                    log(`Failed to fetch restoran details for manual add ${row.taskId}: ${e.message}`);
                }
            }
        }
    }

    ctx.state.prev_table_crmids = curCrmids;
}

/**
 * Синхронизирует номер телефона между заявкой SD и карточкой клиента.
 * Выполняет копирование телефона из карточки в SD (если в SD пусто),
 * либо из SD в карточку клиента (если в карточке пусто и не перезаписывает).
 * @param ctx Контекст бота.
 * @param syncUpdates Накапливаемые обновления полей заявки SD.
 */
async function syncClientPhone(
    ctx: BotContext,
    syncUpdates: any[]
): Promise<void> {
    try {
        const clientLink = await getVal(ctx.client, ctx.task, FIELD_CODES.TASK_CLIENTS, ctx.client);
        const clientTaskId = clientLink?.task_id as number | undefined;

        const sdPhone = await getVal(ctx.client, ctx.task, FIELD_CODES.PHONE_NUMBER, ctx.client);

        const prevClientCardId = ctx.state.prev_client_card_id;
        const prevSdPhone = ctx.state.prev_sd_phone;

        if (clientTaskId) {
            const isNewLink = clientTaskId !== prevClientCardId;
            const isPhoneChanged = sdPhone !== prevSdPhone;

            if (isNewLink || isPhoneChanged) {
                log(`syncClientPhone: обнаружено изменение. isNewLink=${isNewLink}, isPhoneChanged=${isPhoneChanged}`);

                const clientTaskRes = await ctx.client.tasks.get({ id: clientTaskId });
                if (clientTaskRes?.task) {
                    const clientTask = clientTaskRes.task;
                    const clientFormId = clientTask.form_id;
                    if (clientFormId) {
                        const clientPhone = await getVal(ctx.client, clientTask, FIELD_CODES.PHONE_NUMBER, ctx.client);

                        // 1. При привязке карточки клиента в заявку: если в карточке есть номер, а в SD пусто - прокидываем в SD
                        if (clientPhone && !sdPhone) {
                            const sdPhoneFieldId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.PHONE_NUMBER);
                            if (sdPhoneFieldId) {
                                const existingUpdate = syncUpdates.find((u: any) => u.id === sdPhoneFieldId);
                                if (!existingUpdate) {
                                    log(`syncClientPhone: Копируем телефон из Карточки Клиента (${clientPhone}) в заявку SD`);
                                    syncUpdates.push({ id: sdPhoneFieldId, value: clientPhone });
                                }
                            }
                        }

                        // 2. Если в SD вписали телефон, а в карточке клиента пусто - копируем телефон в карточку клиента
                        if (sdPhone && !clientPhone) {
                            const clientPhoneFieldId = await resolveFieldId(ctx.client, clientFormId, FIELD_CODES.PHONE_NUMBER);
                            if (clientPhoneFieldId) {
                                log(`syncClientPhone: Копируем телефон из заявки SD (${sdPhone}) в Карточку Клиента`);
                                await ctx.client.tasks.addComment(clientTaskId, {
                                    text: "Контактный номер телефона обновлён из заявки Service Desk",
                                    field_updates: [{ id: clientPhoneFieldId, value: sdPhone }]
                                });
                            }
                        }
                    }
                }

                ctx.state.prev_client_card_id = clientTaskId;
                ctx.state.prev_sd_phone = sdPhone;
            }
        } else {
            if (prevClientCardId) {
                log(`syncClientPhone: Карточка клиента была отвязана (была ${prevClientCardId})`);
                ctx.state.prev_client_card_id = undefined;
                ctx.state.prev_sd_phone = undefined;
            }
        }
    } catch (e: any) {
        log(`syncClientPhone Error: ${e.message}`);
    }
}

// ═══════════════════════════════════════════════════════════════
//  ОБРАБОТЧИКИ ВЫБОРА И ПОДТВЕРЖДЕНИЯ РЕСТОРАНОВ
// ═══════════════════════════════════════════════════════════════

/**
 * Обрабатывает первое текстовое обращение от внешнего клиента.
 * Проверяет наличие заведений в таблице задачи:
 * - Если заведения есть и включен выбор: выводит меню выбора заведения.
 * - Если заведений нет или выбор отключен: переходит к запросу ИНН/CRMID или на следующий шаг.
 * @param ctx Контекст бота.
 * @param notifications Накопленные текстовые уведомления.
 * @param syncUpdates Планируемые обновления полей.
 * @returns Объект ответа бота или результат следующего шага.
 */
/**
 * Обрабатывает первое текстовое обращение от внешнего клиента.
 * Проверяет наличие заведений в таблице задачи:
 * - Если заведения есть и включен выбор: выводит меню выбора заведения.
 * - Если заведений нет или выбор отключен: переходит к запросу ИНН/CRMID или на следующий шаг.
 * @param ctx Контекст бота.
 * @param notifications Накопленные текстовые уведомления.
 * @param syncUpdates Изменения полей задачи.
 * @returns Объект ответа бота или результат следующего шага.
 */
async function handleFirstContact(ctx: BotContext, notifications: string[], syncUpdates: any[]): Promise<any> {
    if (STEPS_ENABLED.RESTAURANT_SELECTION) {
        const sdTableId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.RESTORAN_TABLE) || 38;
        const tableValue = await getVal(ctx.client, ctx.task, sdTableId, ctx.client);

        const tableUpdate = syncUpdates.find((u: any) => u.id === sdTableId);
        const rows = tableUpdate ? tableUpdate.value : (Array.isArray(tableValue) ? tableValue : []);

        if (rows.length > 0) {
            const options: RestaurantOption[] = [];
            const seenCrmids = new Set<string>();

            for (const row of rows) {
                const restForm =
                    row.cells?.find((c: any) => c.id === CC_TABLE_LINK_COL)?.value ||      // Колонка ссылки карточки клиента (id=8)
                    row.cells?.find((c: any) => c.id === SD_FALLBACK_LINK_COL)?.value ||   // Колонка ссылки задачи SD (id=150)
                    findCellByCode(row.cells, FIELD_CODES.TABLE_REST)?.value;

                const crmid =
                    row.cells?.find((c: any) => c.id === CC_TABLE_CRMID_COL)?.value ||     // Колонка CRMID карточки клиента (id=10)
                    row.cells?.find((c: any) => c.id === SD_FALLBACK_CRMID_COL)?.value ||  // Колонка CRMID задачи SD (id=151)
                    findCellByCode(row.cells, FIELD_CODES.TABLE_REST_CRMID)?.value;

                const crmidStr = String(crmid || "");

                if (restForm?.task_id && crmidStr && !seenCrmids.has(crmidStr)) {
                    seenCrmids.add(crmidStr);

                    // Извлекаем название ресторана из темы задачи (все, что после двоеточия)
                    const rawName = restForm.subject
                        ? restForm.subject.substring(restForm.subject.indexOf(":") + 1).trim().replace(/;+$/, "").trim()
                        : undefined;

                    options.push({
                        name: rawName || restForm.subject || "Заведение",
                        crmid: crmidStr,
                        task_id: restForm.task_id,
                    });
                }
            }

            if (options.length > 0) {
                ctx.state.options = options;

                const updates: any[] = [...syncUpdates];
                pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

                let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
                const prefix = `Уважаемый(ая) ${ctx.senderName}, выберите, пожалуйста, по какому заведению Вы обращаетесь:\n\n`;

                const textMsg = msg + buildOptionsMenu(options, prefix, false);
                const reqFormattedText = ctx.channel?.type === "mobile_app"
                    ? msg.replace(/\n/g, "<br>") + buildOptionsMenu(options, prefix.replace(/\n/g, "<br>"), true)
                    : undefined;

                return reply(textMsg, ctx.channel, updates, undefined, reqFormattedText);
            }
        }
    }

    if (STEPS_ENABLED.CRMID_REQUEST) {
        return requestCRMID(ctx, notifications, syncUpdates);
    }

    // Если выбор из списка и ввод CRMID отключены, пропускаем шаг выбора заведения.
    // Переходим к следующему активному шагу диалога.
    return goToNextStep(ctx, "WAITING_CONFIRMATION", notifications, syncUpdates);
}

/**
 * Обрабатывает ответ пользователя на шаге выбора заведения из предложенного списка.
 * Поддерживает выбор по номеру пункта, по точному совпадению CRMID, нечеткое сравнение названия,
 * выбор пункта "Другое заведение" или массовое добавление ("Добавить все").
 * @param ctx Контекст бота.
 * @param userMessage Сообщение пользователя с выбором.
 * @param notifications Накопленные уведомления.
 * @param syncUpdates Планируемые обновления полей.
 * @returns Объект ответа бота.
 */
/**
 * Обрабатывает ответ пользователя на шаге выбора заведения из предложенного списка.
 * Поддерживает выбор по номеру пункта, по точному совпадению CRMID, нечеткое сравнение названия,
 * выбор пункта "Другое заведение" или массовое добавление ("Добавить все").
 * @param ctx Контекст бота.
 * @param userMessage Сообщение пользователя с выбором.
 * @param notifications Накопленные уведомления.
 * @param syncUpdates Планируемые обновления полей.
 * @returns Объект ответа бота.
 */
async function handleSelection(ctx: BotContext, userMessage: string, notifications: string[], syncUpdates: any[]): Promise<any> {
    const options = ctx.state.options!;
    const input = userMessage.toLowerCase();

    const numMatch = userMessage.match(/^(\d+)$/);

    const hasNewOptions = options.some(opt => !opt.existing);
    const showAddAll = ctx.state.inn_search && hasNewOptions;

    if (numMatch) {
        const idx = parseInt(numMatch[1], 10) - 1;

        if (idx >= 0 && idx < options.length) {
            return finishWithSelection(ctx, options[idx], notifications, syncUpdates);
        }

        let nextIdx = options.length;
        if (showAddAll) {
            if (idx === nextIdx) {
                // Обработка выбора "Добавить ВСЕ найденные заведения"
                const nonExisting = options.filter(opt => !opt.existing);
                if (nonExisting.length > 0) {
                    await appendMultipleToSdTable(ctx, syncUpdates, nonExisting.map(o => ({ crmid: o.crmid, taskId: o.task_id, name: o.name, inn: o.inn })));
                    await appendMultipleToClientProfile(ctx, nonExisting.map(o => ({ crmid: o.crmid, taskId: o.task_id, name: o.name, inn: o.inn })), ctx.senderName);
                }

                // Обновляем состояние заведений, отмечая их как уже существующие в списке
                options.forEach(opt => opt.existing = true);
                ctx.state.inn_search = false; // Выбрано добавление всех, очищаем флаг поиска по ИНН

                const updates: any[] = [...syncUpdates];
                pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

                let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
                msg += `Все найденные заведения были добавлены в Ваш список!\n\n`;
                const prefix = `Какое из заведений Вы хотите привязать к текущей заявке? Выберите номер:\n\n`;

                const textMsg = msg + buildInnOptionsMenu(options, prefix, false);
                const reqFormattedText = ctx.channel?.type === "mobile_app"
                    ? msg.replace(/\n/g, "<br>") + buildInnOptionsMenu(options, prefix.replace(/\n/g, "<br>"), true)
                    : undefined;

                return reply(textMsg, ctx.channel, updates, undefined, reqFormattedText);
            }
            nextIdx++;
        }

        if (idx === nextIdx) {
            return requestCRMID(ctx, notifications, syncUpdates);
        }
    }

    const match = options.find(opt =>
        input === opt.crmid.toLowerCase() ||
        fuzzyMatch(userMessage, opt.name, 0.65)
    );

    if (match) return finishWithSelection(ctx, match, notifications, syncUpdates);

    if (OTHER_WORDS.some(w => input.includes(w) || (w.length >= 4 && fuzzyMatch(userMessage, w, 0.75)))) {
        return requestCRMID(ctx, notifications, syncUpdates);
    }

    if (/^\d{5,}$/.test(userMessage)) {
        const digits = userMessage.replace(/\D/g, "");
        if (digits.length === 10 || digits.length === 12) {
            ctx.state.retry_count = 0;
            return searchAndConfirmInn(ctx, digits, notifications, syncUpdates);
        }
        return searchAndConfirm(ctx, digits, notifications, syncUpdates);
    }

    ctx.state.retry_count = (ctx.state.retry_count || 0) + 1;

    if (ctx.state.retry_count >= MAX_RETRIES) {
        return escalateToHuman(ctx, "max retries on selection", syncUpdates);
    }

    const updates: any[] = [...syncUpdates];
    pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

    let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
    const prefix = "Извините, не удалось распознать выбор. Пожалуйста, ответьте номером пункта:\n\n";

    const textMsg = msg + (ctx.state.inn_search ? buildInnOptionsMenu(options, prefix, false) : buildOptionsMenu(options, prefix, false));
    const reqFormattedText = ctx.channel?.type === "mobile_app"
        ? msg.replace(/\n/g, "<br>") + (ctx.state.inn_search ? buildInnOptionsMenu(options, prefix.replace(/\n/g, "<br>"), true) : buildOptionsMenu(options, prefix.replace(/\n/g, "<br>"), true))
        : undefined;

    return reply(textMsg, ctx.channel, updates, undefined, reqFormattedText);
}

/**
 * Обрабатывает ввод CRMID или ИНН от пользователя на шаге ручного указания заведения.
 * Определяет тип ввода по количеству цифр и запускает соответствующий поиск в Pyrus.
 * @param ctx Контекст бота.
 * @param userMessage Введенная строка.
 * @param notifications Накопленные уведомления.
 * @param syncUpdates Планируемые обновления полей.
 * @returns Объект ответа бота.
 */
/**
 * Обрабатывает ввод CRMID или ИНН от пользователя на шаге ручного указания заведения.
 * Определяет тип ввода по количеству цифр и запускает соответствующий поиск в Pyrus.
 * @param ctx Контекст бота.
 * @param userMessage Введенная строка.
 * @param notifications Накопленные уведомления.
 * @param syncUpdates Планируемые обновления полей.
 * @returns Объект ответа бота.
 */
async function handleCrmidInput(ctx: BotContext, userMessage: string, notifications: string[], syncUpdates: any[]): Promise<any> {
    const digits = userMessage.replace(/\D/g, "");

    if (digits.length === 10 || digits.length === 12) {
        ctx.state.retry_count = 0;
        return searchAndConfirmInn(ctx, digits, notifications, syncUpdates);
    }

    if (digits.length >= 5) {
        ctx.state.retry_count = 0;
        return searchAndConfirm(ctx, digits, notifications, syncUpdates);
    }

    ctx.state.retry_count = (ctx.state.retry_count || 0) + 1;

    if (ctx.state.retry_count >= MAX_RETRIES) {
        return escalateToHuman(ctx, "max retries on CRMID/INN", syncUpdates);
    }

    const updates: any[] = [...syncUpdates];
    pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

    let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
    msg += "Пожалуйста, введите корректный CRMID (не менее 5 цифр) или ИНН (10 или 12 цифр).";

    return reply(msg, ctx.channel, updates);
}

/**
 * Обрабатывает подтверждение ("Да" или "Нет") найденного заведения на шаге подтверждения.
 * В случае согласия завершает выбор, в случае отказа возвращает пользователя на шаг ввода CRMID/ИНН.
 * @param ctx Контекст бота.
 * @param userMessage Текст ответа пользователя.
 * @param notifications Накопленные уведомления.
 * @param syncUpdates Планируемые обновления полей.
 * @returns Объект ответа бота.
 */
/**
 * Обрабатывает подтверждение ("Да" или "Нет") найденного заведения на шаге подтверждения.
 * В случае согласия завершает выбор, в случае отказа возвращает пользователя на шаг ввода CRMID/ИНН.
 * @param ctx Контекст бота.
 * @param userMessage Текст ответа пользователя.
 * @param notifications Накопленные уведомления.
 * @param syncUpdates Планируемые обновления полей.
 * @returns Объект ответа бота.
 */
async function handleConfirmation(ctx: BotContext, userMessage: string, notifications: string[], syncUpdates: any[]): Promise<any> {
    const lower = userMessage.toLowerCase();

    let isYes = matchesAny(userMessage, YES_WORDS);
    let isNo = matchesAny(userMessage, NO_WORDS);

    if (lower.includes("да ") || lower.includes("подтвержд")) isYes = true;
    if (lower.includes("нет ") || lower.includes("не тот")) isNo = true;

    if (isYes && isNo) {
        isYes = false;
        isNo = false;
    }

    if (isYes) {
        return finishWithSelection(ctx, ctx.state.pending_selection!, notifications, syncUpdates);
    }

    if (isNo) {
        return requestCRMID(ctx, notifications, syncUpdates);
    }

    ctx.state.retry_count = (ctx.state.retry_count || 0) + 1;

    if (ctx.state.retry_count >= MAX_RETRIES) {
        return escalateToHuman(ctx, "max retries on confirmation", syncUpdates);
    }

    const updates: any[] = [...syncUpdates];
    pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

    let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
    msg += "Пожалуйста, ответьте '1' (Да) или '2' (Нет).";

    return reply(msg, ctx.channel, updates);
}

/**
 * Отправляет пользователю сообщение с запросом ИНН или CRMID заведения.
 * Прикрепляет к сообщению скриншоты-инструкции по поиску CRMID.
 * @param ctx Контекст бота.
 * @param notifications Накопленные уведомления.
 * @param syncUpdates Планируемые обновления полей.
 * @returns Объект ответа бота с текстом запроса и скриншотами.
 */
/**
 * Отправляет пользователю сообщение с запросом ИНН или CRMID заведения.
 * Прикрепляет к сообщению скриншоты-инструкции по поиску CRMID.
 * @param ctx Контекст бота.
 * @param notifications Накопленные уведомления.
 * @param syncUpdates Планируемые обновления полей.
 * @returns Объект ответа бота с текстом запроса и скриншотами.
 */
async function requestCRMID(ctx: BotContext, notifications: string[], syncUpdates: any[]): Promise<any> {
    ctx.state.step = "WAITING_CRMID";
    ctx.state.options = undefined;
    ctx.state.pending_selection = undefined;
    ctx.state.retry_count = 0;
    ctx.state.prev_table_crmids = [];

    const updates: any[] = [...syncUpdates];
    pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

    let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";

    msg += `Добрый день!\n`;
    msg += `Для обработки заявки нам потребуется ИНН или CRMID Вашего заведения.\n\n`;
    msg += `📍 ИНН юридического лица (10 или 12 цифр).\n`;
    msg += `📍 CRMID (можно найти в iikoOffice в разделе «Помощь» → «О программе» или в iikoFront на кассе, нажав на номер версии).\n\n`;
    msg += `Для наглядности мы прикрепили скриншоты ниже (как найти CRMID). Ждём ваш номер!`;

    const attachments: any[] = [
        { attachment_id: "440003227" },
        { attachment_id: "440003229" }
    ];

    return reply(msg, ctx.channel, updates, attachments);
}

/**
 * Ищет ресторан по CRMID в системе Pyrus.
 * Сначала проверяет таблицу заведений текущей заявки, затем ищет во всей форме карточек ресторанов.
 * Если ресторан найден, выводит сообщение для подтверждения (если включен шаг подтверждения).
 * @param ctx Контекст бота.
 * @param crmid CRMID для поиска.
 * @param notifications Накопленные уведомления.
 * @param syncUpdates Планируемые обновления полей.
 * @returns Объект ответа бота с предложением подтвердить найденное заведение.
 */
/**
 * Ищет ресторан по CRMID в системе Pyrus.
 * Сначала проверяет таблицу заведений текущей заявки, затем ищет во всей форме карточек ресторанов.
 * Если ресторан найден, выводит сообщение для подтверждения (если включен шаг подтверждения).
 * @param ctx Контекст бота.
 * @param crmid CRMID для поиска.
 * @param notifications Накопленные уведомления.
 * @param syncUpdates Планируемые обновления полей.
 * @returns Объект ответа бота с предложением подтвердить найденное заведение.
 */
async function searchAndConfirm(ctx: BotContext, crmid: string, notifications: string[], syncUpdates: any[]): Promise<any> {
    const sdTableId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.RESTORAN_TABLE) || 38;
    const tableValue = await getVal(ctx.client, ctx.task, sdTableId, ctx.client);
    const tableUpdate = syncUpdates.find(u => u.id === (ctx.restoranTableFieldId || sdTableId));
    const rows = tableUpdate ? tableUpdate.value : (Array.isArray(tableValue) ? tableValue : []);

    if (rows && rows.length > 0) {
        let existingTaskId = 0;
        let existingName = "";
        let existingInn = "";

        for (const row of rows) {
            const restForm = row.cells?.find((c: any) =>
                c.code === FIELD_CODES.TABLE_REST ||
                c.info?.code === FIELD_CODES.TABLE_REST ||
                c.id === CC_TABLE_LINK_COL ||
                c.id === SD_TABLE_LINK_COL
            )?.value;

            const rowCrmid = row.cells?.find((c: any) =>
                c.code === FIELD_CODES.TABLE_REST_CRMID ||
                c.info?.code === FIELD_CODES.TABLE_REST_CRMID ||
                c.id === CC_TABLE_CRMID_COL ||
                c.id === SD_TABLE_CRMID_COL
            )?.value;

            const rowInn = row.cells?.find((c: any) =>
                c.code === FIELD_CODES.TABLE_REST_INN ||
                c.info?.code === FIELD_CODES.TABLE_REST_INN ||
                c.id === CC_TABLE_INN_COL ||
                c.id === SD_TABLE_INN_COL
            )?.value;

            if (String(rowCrmid) === crmid && restForm?.task_id) {
                existingTaskId = restForm.task_id;
                existingName = restForm.subject?.split(":")?.[1]?.trim() || restForm.subject || "Заведение";
                existingInn = String(rowInn || "");
                break;
            }
        }

        if (existingTaskId) {
            if (!STEPS_ENABLED.RESTAURANT_CONFIRMATION) {
                return finishWithSelection(ctx, {
                    task_id: existingTaskId,
                    name: existingName,
                    crmid,
                    inn: existingInn,
                    existing: true
                }, notifications, syncUpdates);
            }
            ctx.state.step = "WAITING_CONFIRMATION";
            ctx.state.pending_selection = {
                task_id: existingTaskId,
                name: existingName,
                crmid,
                inn: existingInn,
                existing: true
            };

            const updates: any[] = [...syncUpdates];
            pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

            let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";

            msg += `Мы обнаружили, что ресторан "${existingName}" (CRMID: ${crmid}) уже есть в Вашем списке.\n`;
            msg += `Хотите оставить обращение именно по нему?\n`;
            msg += `1. Да\n`;
            msg += `2. Нет, указать другой ИНН/CRMID`;

            return reply(msg, ctx.channel, updates);
        }
    }

    log(`searchAndConfirm: API search for CRMID ${crmid}`);

    const response = await ctx.client.forms.getTasks(FORM_RESTAURANT_ID, {
        filters: [
            {
                field_id: FIELD_CRMID_ID,
                operator_id: 1,
                values: [crmid]
            }
        ],
    });

    const foundHeader = response.tasks?.[0];

    if (!foundHeader) {
        let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
        msg += `К сожалению, заведение с CRMID ${crmid} не найдено. Пожалуйста, проверьте номер и попробуйте ещё раз.`;

        return reply(msg, ctx.channel, [...syncUpdates]);
    }

    // ИСПРАВЛЕНИЕ БАГА: Подгружаем детальные данные задачи ресторана через API,
    // так как getTasks возвращает урезанные метаданные без вложенных полей в группах
    let found = foundHeader;
    try {
        const fullTask = await ctx.client.tasks.get({ id: foundHeader.id });
        if (fullTask?.task) {
            found = fullTask.task;
        }
    } catch (e: any) {
        log(`searchAndConfirm: Failed to load detailed fields for restaurant ${foundHeader.id}: ${e.message}`);
    }

    // Надежная выгрузка названия ресторана (сканируем возможные коды полей, затем тему)
    const name = 
        await getVal(ctx.client, found, "u_client", ctx.client) ||
        await getVal(ctx.client, found, "restoran", ctx.client) ||
        await getVal(ctx.client, found, "Название заведения", ctx.client) ||
        await getVal(ctx.client, found, "Resto", ctx.client) ||
        await getVal(ctx.client, found, "resto", ctx.client) ||
        found.subject || 
        "заведение";

    const inn =
        await getVal(ctx.client, found, "Dadata Inn", ctx.client) ||
        await getVal(ctx.client, found, "dadata_inn", ctx.client) ||
        await getVal(ctx.client, found, "Dadata_inn", ctx.client) ||
        await getVal(ctx.client, found, "инн", ctx.client) ||
        findFieldById(found.fields || [], 6)?.value ||
        "";

    if (!STEPS_ENABLED.RESTAURANT_CONFIRMATION) {
        return finishWithSelection(ctx, {
            task_id: found.id,
            name,
            crmid,
            inn: String(inn)
        }, notifications, syncUpdates);
    }

    ctx.state.step = "WAITING_CONFIRMATION";
    ctx.state.pending_selection = {
        task_id: found.id,
        name,
        crmid,
        inn: String(inn)
    };

    const updates: any[] = [...syncUpdates];
    pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

    let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";

    msg += `По Вашему CRMID: ${crmid} в нашей системе нашёлся ресторан "${name}"\n`;
    msg += `Подтвердите, что Вы хотите оставить обращение именно по этому ресторану:\n`;
    msg += `1. Да\n`;
    msg += `2. Нет, указать другой ИНН/CRMID`;

    return reply(msg, ctx.channel, updates);
}

/**
 * Ищет рестораны по ИНН во всей форме карточек ресторанов Pyrus.
 * - Если найдено 0: выводит сообщение об ошибке.
 * - Если найден 1: предлагает подтвердить его (аналогично поиску по CRMID).
 * - Если найдено несколько: строит меню выбора заведения из списка.
 * @param ctx Контекст бота.
 * @param inn ИНН для поиска.
 * @param notifications Накопленные уведомления.
 * @param syncUpdates Планируемые обновления полей.
 * @returns Объект ответа бота.
 */
/**
 * Ищет рестораны по ИНН во всей форме карточек ресторанов Pyrus.
 * - Если найдено 0: выводит сообщение об ошибке.
 * - Если найден 1: предлагает подтвердить его (аналогично поиску по CRMID).
 * - Если найдено несколько: строит меню выбора заведения из списка.
 * @param ctx Контекст бота.
 * @param inn ИНН для поиска.
 * @param notifications Накопленные уведомления.
 * @param syncUpdates Планируемые обновления полей.
 * @returns Объект ответа бота.
 */
async function searchAndConfirmInn(ctx: BotContext, inn: string, notifications: string[], syncUpdates: any[]): Promise<any> {
    const sdTableId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.RESTORAN_TABLE) || 38;
    const tableValue = await getVal(ctx.client, ctx.task, sdTableId, ctx.client);
    const tableUpdate = syncUpdates.find(u => u.id === (ctx.restoranTableFieldId || sdTableId));
    const rows = tableUpdate ? tableUpdate.value : (Array.isArray(tableValue) ? tableValue : []);

    log(`searchAndConfirmInn: API search for INN ${inn}`);

    const response = await ctx.client.forms.getTasks(FORM_RESTAURANT_ID, {
        filters: [
            {
                field_id: 6, // ID поля ИНН заведения равен 6
                operator_id: 1,
                values: [inn]
            }
        ],
    });

    if (!response.tasks || response.tasks.length === 0) {
        let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
        msg += `К сожалению, заведения с ИНН ${inn} не найдены. Пожалуйста, проверьте номер и попробуйте ещё раз.`;
        return reply(msg, ctx.channel, [...syncUpdates]);
    }

    const options: RestaurantOption[] = [];
    
    // Собираем ID ресторанов, которые уже добавлены в таблицу заявки
    const existingTaskIds = new Set<number>();
    for (const row of rows) {
        const restForm = row.cells?.find((c: any) =>
            c.code === FIELD_CODES.TABLE_REST ||
            c.info?.code === FIELD_CODES.TABLE_REST ||
            c.id === CC_TABLE_LINK_COL ||
            c.id === SD_TABLE_LINK_COL
        )?.value;
        if (restForm?.task_id) {
            existingTaskIds.add(restForm.task_id);
        }
    }

    for (const taskHeader of response.tasks) {
        try {
            const fullTask = await ctx.client.tasks.get({ id: taskHeader.id });
            const restTask = fullTask.task;
            if (!restTask) continue;

            const name = 
                await getVal(ctx.client, restTask, "u_client", ctx.client) ||
                await getVal(ctx.client, restTask, "restoran", ctx.client) ||
                await getVal(ctx.client, restTask, "Название заведения", ctx.client) ||
                await getVal(ctx.client, restTask, "Resto", ctx.client) ||
                await getVal(ctx.client, restTask, "resto", ctx.client) ||
                restTask.subject ||
                "заведение";

            const crmField = findFieldById(restTask.fields || [], FIELD_CRMID_ID);
            const crmid = crmField?.value || 
                await getVal(ctx.client, restTask, "CRMID", ctx.client) || 
                await getVal(ctx.client, restTask, "crmid", ctx.client) || 
                "";

            const rInn =
                await getVal(ctx.client, restTask, "Dadata Inn", ctx.client) ||
                await getVal(ctx.client, restTask, "dadata_inn", ctx.client) ||
                await getVal(ctx.client, restTask, "Dadata_inn", ctx.client) ||
                await getVal(ctx.client, restTask, "инн", ctx.client) ||
                findFieldById(restTask.fields || [], 6)?.value ||
                inn ||
                "";

            options.push({
                task_id: restTask.id,
                name,
                crmid: String(crmid),
                inn: String(rInn),
                existing: existingTaskIds.has(restTask.id)
            });
        } catch (e: any) {
            log(`Failed to fetch full restaurant details for INN search: ${e.message}`);
        }
    }

    if (options.length === 0) {
        let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
        msg += `К сожалению, заведения с ИНН ${inn} не найдены. Пожалуйста, проверьте номер и попробуйте ещё раз.`;
        return reply(msg, ctx.channel, [...syncUpdates]);
    }

    if (options.length === 1) {
        // Найдено ровно одно заведение по ИНН — обрабатываем аналогично поиску по CRMID
        const singleOption = options[0];
        if (!STEPS_ENABLED.RESTAURANT_CONFIRMATION) {
            return finishWithSelection(ctx, singleOption, notifications, syncUpdates);
        }
        if (singleOption.existing) {
            ctx.state.step = "WAITING_CONFIRMATION";
            ctx.state.pending_selection = singleOption;
            
            const updates: any[] = [...syncUpdates];
            pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

            let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
            msg += `Мы обнаружили, что ресторан "${singleOption.name}" (CRMID: ${singleOption.crmid}) уже есть в Вашем списке.\n`;
            msg += `Хотите оставить обращение именно по нему?\n`;
            msg += `1. Да\n`;
            msg += `2. Нет, указать другой ИНН/CRMID`;
            
            return reply(msg, ctx.channel, updates);
        } else {
            ctx.state.step = "WAITING_CONFIRMATION";
            ctx.state.pending_selection = singleOption;

            const updates: any[] = [...syncUpdates];
            pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

            let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
            msg += `По Вашему ИНН: ${inn} в нашей системе нашёлся ресторан "${singleOption.name}" (CRMID: ${singleOption.crmid})\n`;
            msg += `Подтвердите, что Вы хотите оставить обращение именно по этому ресторану:\n`;
            msg += `1. Да\n`;
            msg += `2. Нет, указать другой ИНН/CRMID`;

            return reply(msg, ctx.channel, updates);
        }
    }

    // Найдено несколько заведений по ИНН — переходим в выбор заведения из списка
    ctx.state.step = "WAITING_SELECTION";
    ctx.state.options = options;
    ctx.state.inn_search = true;

    const updates: any[] = [...syncUpdates];
    pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

    let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
    const prefix = `По ИНН ${inn} найдено несколько заведений. Выберите, по какому из них Вы обращаетесь:\n\n`;

    const textMsg = msg + buildInnOptionsMenu(options, prefix, false);
    const reqFormattedText = ctx.channel?.type === "mobile_app"
        ? msg.replace(/\n/g, "<br>") + buildInnOptionsMenu(options, prefix.replace(/\n/g, "<br>"), true)
        : undefined;

    return reply(textMsg, ctx.channel, updates, undefined, reqFormattedText);
}

/**
 * Завершает процесс выбора заведения.
 * Заполняет поле "Ресторан" в заявке SD, синхронизирует поля карточки ресторана в SD,
 * добавляет ресторан в таблицу SD и в карточку клиента (если его там еще нет),
 * и перенаправляет пользователя на следующий активный шаг сценария.
 * @param ctx Контекст бота.
 * @param selection Выбранное заведение.
 * @param notifications Накопленные уведомления.
 * @param syncUpdates Планируемые обновления полей.
 * @returns Результат работы следующего шага диалога.
 */
async function finishWithSelection(
    ctx: BotContext,
    selection: RestaurantOption,
    notifications: string[],
    syncUpdates: any[]
): Promise<any> {
    const { task_id: taskId, name, crmid, inn, existing } = selection;

    ctx.state.prev_restoran_id = taskId;

    const updates: any[] = [...syncUpdates];

    if (ctx.restoranFieldId) {
        updates.push({
            id: ctx.restoranFieldId,
            value: { task_id: taskId }
        });
        
        if (SYNC_ENABLED.RESTAURANT_FIELDS_TO_SD) {
            const syncUpdatesForSD = await buildRestaurantSyncUpdates(ctx, taskId);
            updates.push(...syncUpdatesForSD);
        }
    }

    if (!existing) {
        if (SYNC_ENABLED.RESTAURANT_TABLE_TO_SD) {
            await appendToSdTable(ctx, updates, crmid, taskId, name, inn);
        }
        if (SYNC_ENABLED.TABLE_TO_CLIENT_PROFILE) {
            await appendToClientProfile(ctx, crmid, taskId, name, ctx.senderName, inn);
        }
    }

    const msgIntro = `Спасибо за уточнение, мы записали что эта заявка по заведению "${name}".`;

    return goToNextStep(ctx, "WAITING_CONFIRMATION", notifications, updates, msgIntro);
}

// ═══════════════════════════════════════════════════════════════
//  ОБРАБОТЧИКИ КЛАССА ОБРАЩЕНИЯ И ПРИОРИТЕТА
// ═══════════════════════════════════════════════════════════════

/**
 * Обрабатывает ответ пользователя на шаге выбора класса обращения (Консультация, Удаленно, Выезд).
 * Устанавливает выбранный класс обращения в соответствующее поле заявки.
 * @param ctx Контекст бота.
 * @param userMessage Ответ пользователя (номер пункта).
 * @param notifications Накопленные уведомления.
 * @returns Результат работы следующего шага диалога.
 */
/**
 * Обрабатывает ответ пользователя на шаге выбора класса обращения (Консультация, Удаленно, Выезд).
 * Устанавливает выбранный класс обращения в соответствующее поле заявки.
 * @param ctx Контекст бота.
 * @param userMessage Ответ пользователя (номер пункта).
 * @param notifications Накопленные уведомления.
 * @returns Результат работы следующего шага диалога.
 */
async function handleTaskTypeInput(ctx: BotContext, userMessage: string, notifications: string[]): Promise<any> {
    const num = parseInt(userMessage.trim(), 10);
    const choice = TASK_TYPE_MAP[num];

    if (choice) {
        ctx.state.retry_count = 0;
        ctx.state.prev_task_type = choice.label;

        const taskTypeFieldId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.TASK_TYPE);
        const updates: any[] = [];

        if (taskTypeFieldId) {
            updates.push({
                id: taskTypeFieldId,
                value: { choice_id: choice.choice_id }
            });
        }

        const msgIntro = `Спасибо! Тип заявки установлен: "${choice.label}".`;

        return goToNextStep(ctx, "WAITING_TASK_TYPE", notifications, updates, msgIntro);
    }

    ctx.state.retry_count = (ctx.state.retry_count || 0) + 1;

    if (ctx.state.retry_count >= MAX_RETRIES) {
        return escalateToHuman(ctx, "max retries on task type");
    }

    let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";

    msg += `Пожалуйста, ответьте номером (1, 2 или 3):\n\n`;

    const plainMsg =
        msg +
        `1. Консультация\n` +
        `2. Нужна удалённая помощь инженера\n` +
        `3. Необходим выезд специалиста!`;

    const reqFormattedText = ctx.channel?.type === "mobile_app"
        ? msg.replace(/\n/g, "<br>") +
        `<button>1. Консультация</button><br>` +
        `<button>2. Нужна удалённая помощь инженера</button><br>` +
        `<button>3. Необходим выезд специалиста!</button>`
        : undefined;

    const updates: any[] = [];
    pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

    return reply(plainMsg, ctx.channel, updates, undefined, reqFormattedText);
}

/**
 * Обрабатывает ответ пользователя на шаге выбора приоритета обращения.
 * Устанавливает выбранный приоритет в поле задачи.
 * @param ctx Контекст бота.
 * @param userMessage Ответ пользователя (номер пункта).
 * @param notifications Накопленные уведомления.
 * @returns Результат работы следующего шага диалога.
 */
/**
 * Обрабатывает ответ пользователя на шаге выбора приоритета обращения.
 * Устанавливает выбранный приоритет в поле задачи.
 * @param ctx Контекст бота.
 * @param userMessage Ответ пользователя (номер пункта).
 * @param notifications Накопленные уведомления.
 * @returns Результат работы следующего шага диалога.
 */
async function handlePriorityInput(ctx: BotContext, userMessage: string, notifications: string[]): Promise<any> {
    const num = parseInt(userMessage.trim(), 10);
    const choice = PRIORITY_MAP[num];

    if (choice) {
        ctx.state.retry_count = 0;
        ctx.state.prev_priority = choice.label;

        const priorityFieldId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.PRIORITY);
        const updates: any[] = [];

        if (priorityFieldId) {
            updates.push({
                id: priorityFieldId,
                value: { choice_id: choice.choice_id }
            });
        }

        const msgIntro = `Спасибо! Приоритет установлен: "${choice.label}".`;

        return goToNextStep(ctx, "WAITING_PRIORITY", notifications, updates, msgIntro);
    }

    ctx.state.retry_count = (ctx.state.retry_count || 0) + 1;

    if (ctx.state.retry_count >= MAX_RETRIES) {
        return escalateToHuman(ctx, "max retries on priority");
    }

    let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";

    msg += `Пожалуйста, ответьте номером (1, 2, 3 или 4):\n\n`;

    let plainMsg = msg;
    let reqFormattedText = msg.replace(/\n/g, "<br>");

    for (const [k, v] of Object.entries(PRIORITY_MAP)) {
        plainMsg += `${k}. ${v.label} (${v.desc})\n`;
        reqFormattedText += `<button>${k}. ${v.label} (${v.desc})</button><br>`;
    }

    const updates: any[] = [];
    pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

    return reply(
        plainMsg,
        ctx.channel,
        updates,
        undefined,
        ctx.channel?.type === "mobile_app" ? reqFormattedText : undefined
    );
}

// ═══════════════════════════════════════════════════════════════
//  ГЛАВНАЯ ТОЧКА ВХОДА БОТА (ОБРАБОТЧИК ХУКА PYRUS)
// ═══════════════════════════════════════════════════════════════

/**
 * Главная точка входа бота (обработчик вебхука Pyrus).
 * Принимает запрос от вебхука Pyrus, проверяет форму задачи, инициализирует контекст,
 * обрабатывает автоматическую связь по CRMID для Helpy iiko, запускает автоматическое
 * создание карточек клиентов для внешних каналов (Telegram, Max Messenger),
 * отслеживает изменения операторов/инженеров/статусов/приоритетов для уведомлений,
 * маршрутизирует сообщения пользователя на текущий активный шаг диалога и
 * отправляет сформированный ответ в Pyrus.
 * @param request Данные вебхука Pyrus.
 * @returns Объект ответа вебхука Pyrus.
 */
/**
 * Главная точка входа бота (обработчик вебхука Pyrus).
 * Принимает запрос от вебхука Pyrus, проверяет форму задачи, инициализирует контекст,
 * обрабатывает автоматическую связь по CRMID для Helpy iiko, запускает автоматическое
 * создание карточек клиентов для внешних каналов (Telegram, Max Messenger),
 * отслеживает изменения операторов/инженеров/статусов/приоритетов для уведомлений,
 * маршрутизирует сообщения пользователя на текущий активный шаг диалога и
 * отправляет сформированный ответ в Pyrus.
 * @param request Данные вебхука Pyrus.
 * @returns Объект ответа вебхука Pyrus.
 */
export default async function (request: BotHookRequest): Promise<BotHookResponse | null> {
    logs = [];

    let task = (request as any).task;

    if (!task) {
        console.warn("Client Bot Hook: No task in request.");
        return null;
    }

    const client = new PyrusApiClient(request.access_token);
    const taskId = task.id as number;
    const formId = task.form_id as number;
    const isRestaurantCard = formId === FORM_RESTAURANT_ID;

    // Этот бот должен запускаться только на форме заявок Service Desk
    if (formId !== FORM_SD_ID) {
        log(`Exit: form ${formId} is not SD form, client dialog bot skipped.`);
        return null;
    }

    log(`--- CLIENT BOT REQ Task:${taskId} Form:${formId} user_id:${request.user_id} ---`);
    log(`Task debug: id=${taskId}, form=${formId}, comments=${task.comments?.length || 0}`);
    log(`Fields debug (hook): ${(task.fields || []).map((f: any) => `${f.id}:${f.code || f.name || f.info?.code || "-"}`).join(", ")}`);

    // Хуки Pyrus содержат неполные данные для вложенных полей в группах
    // Запрашиваем полную информацию о задаче через Pyrus REST API
    try {
        const hookComments = task.comments;
        const fullTaskRes = await client.tasks.get({ id: taskId });
        if (fullTaskRes?.task) {
            task = fullTaskRes.task;
            // Восстанавливаем комментарии из хука, если в API-ответе их меньше
            if ((!task.comments?.length) && hookComments?.length) {
                task.comments = hookComments;
            }
            log(`Full task fetched OK, fields count: ${(task.fields || []).length}`);
        }
    } catch (e: any) {
        log(`Full task fetch failed (using hook data): ${e.message}`);
    }

    const stateFieldId = await resolveFieldId(client, task.form_id, FIELD_CODES.STATE) || SD_FIELD_IDS.state;
    const stateRaw = await getVal(client, task, stateFieldId, client);
    const state = safeParseState(stateRaw);
    
    // Шаги регистрации/запроса телефона обрабатываются обособленно и не входят в основной
    // линейный порядок шагов getFirstEnabledStep, поэтому пропускаем авто-корректировку шага для них.
    if (state.step !== "WAITING_PHONE" && state.step !== "WAITING_PHONE_ONCE") {
        state.step = getFirstEnabledStep(state.step, state.pending_selection);
    }
    
    log(`State read: stateFieldId=${stateFieldId}, step=${state.step}`);

    try {
        const lastComment = task.comments?.[task.comments.length - 1] as TaskComment;

        if (!lastComment) {
            await sendDebugLogsIfNeeded(client, taskId);
            return null;
        }

        if (lastComment.author?.id === request.user_id) {
            log(`Exit: last comment is from bot itself. author=${lastComment.author?.id}, bot=${request.user_id}`);
            await sendDebugLogsIfNeeded(client, taskId, "self-comment skipped");
            return null;
        }

        const authorName =
            `${lastComment.author?.first_name || ""} ${lastComment.author?.last_name || ""}`.trim() ||
            "Сотрудник";

        const userMessage = (lastComment.text || "").trim();

        const channelTaskFieldId = await resolveFieldId(client, task.form_id, FIELD_CODES.CHANNEL_TASK);
        const channelTaskField = channelTaskFieldId ? findFieldById(task.fields, channelTaskFieldId) : undefined;
        const choiceId = channelTaskField?.value?.choice_id;
        const choiceNames = channelTaskField?.value?.choice_names || [];
        const choiceValue =
            channelTaskField?.value?.choice_value ||
            (choiceNames.length > 0 ? choiceNames[0] : "");

                const CHANNEL_MAP: Record<number, string> = {
            2: "telegram",
            7: "max_messenger",
            5: "mobile_app"
        };

        let channelType = CHANNEL_MAP[choiceId];
        if (!channelType && choiceValue) {
            const lowerVal = choiceValue.toLowerCase();
            if (lowerVal.includes("telegram") || lowerVal.includes("телеграм")) channelType = "telegram";
            else if (lowerVal.includes("max") || lowerVal.includes("макс")) channelType = "max_messenger";
            else if (lowerVal.includes("приложение") || lowerVal.includes("mobile") || lowerVal.includes("помощник")) channelType = "mobile_app";
        }
        // Всегда отдаем приоритет каналу связи из последнего комментария (содержит chat_id и т.д.)
        // Резервный вариант — использование базового объекта типа канала
        const EXTERNAL_CHANNEL_TYPES = ["telegram", "max_messenger", "mobile_app"];
        const lastChannelType = (lastComment.channel as any)?.type as string | undefined;
        const channel =
            (lastComment.channel && EXTERNAL_CHANNEL_TYPES.includes(lastChannelType || ""))
                ? lastComment.channel
                : (channelType ? { type: channelType } : (lastComment.channel || undefined));
        const effectiveChannelType = channelType || lastChannelType || (channel as any)?.type;

        const isAssistant =
            choiceId === 5 ||
            choiceValue === "Помощник" ||
            choiceNames.includes("Помощник");

        // Проверяем комментарии на тип "custom" — первое сообщение Helpy iiko идет через кастомный канал
        // Это обеспечивает стабильность при повторных триггерах бота
        const hasCustomChannelComment = (task.comments || []).some(
            (c: any) => c.channel?.type === "custom"
        );

        const isHelpyIiko =
            choiceValue === "Helpy (iiko)" ||
            choiceNames.includes("Helpy (iiko)") ||
            choiceValue === "Helpy_iiko" ||
            choiceNames.includes("Helpy_iiko") ||
            effectiveChannelType === "custom" ||
            hasCustomChannelComment;

        log(`isHelpyIiko=${isHelpyIiko}, hasCustomChannelComment=${hasCustomChannelComment}, effectiveChannelType=${effectiveChannelType}`);

        const ctx: BotContext = {
            client,
            task,
            state,
            channel,
            senderName: await getVal(client, task, FIELD_CODES.SENDER_NAME, client) || "клиент",
            isAssistantChannel: isAssistant,
            stateFieldId,
            restoranFieldId: await resolveFieldId(client, task.form_id, FIELD_CODES.RESTORAN),
            restoranTableFieldId: await resolveFieldId(client, task.form_id, FIELD_CODES.RESTORAN_TABLE),
        };

        const syncUpdates: any[] = [];
        const notifications: string[] = [];

        // Синхронизируем базовые поля ресторана и таблицу. Доступы обрабатываются другим скриптом.
        await syncRestoranAndTable(ctx, syncUpdates, notifications, authorName);

        // Синхронизируем телефон карточки клиента
        await syncClientPhone(ctx, syncUpdates);

        if (syncUpdates.length > 0) {
            await client.tasks.addComment(taskId, { field_updates: syncUpdates });

            const reload = await client.tasks.get({ id: taskId });

            if (reload?.task) {
                task = reload.task;
                ctx.task = reload.task;
            }
        }

        // Автоматическая привязка ресторана по CRMID для обращений из Helpy iiko
        if (isHelpyIiko) {
            const restoranVal = await getVal(client, task, FIELD_CODES.RESTORAN, client);

            // Обходим все поля задачи для поиска CrmId независимо от структуры группы
            const allFields = flattenFields(task.fields || []);
            const helpyDebug: string[] = [];
            if (DEBUG_ENABLED) {
                helpyDebug.push(`--- HELPY DEBUG ---`);
                helpyDebug.push(`isHelpyIiko=true, choiceValue="${choiceValue}", effectiveChannel=${effectiveChannelType || "none"}`);
                helpyDebug.push(`restoranVal=${JSON.stringify(restoranVal)}`);
                helpyDebug.push(`all fields (${allFields.length}): ${allFields.map((f: any) => `${f.id}:${f.code || f.name || "?"}=${JSON.stringify(f.value)?.substring(0, 40)}`).join(", ")}`);
            }

            // Ищем поле CrmId/CRMID по коду или названию без учета регистра
            const crmIdField = allFields.find((f: any) => {
                const c = (f.code || "").toLowerCase();
                const n = (f.name || "").toLowerCase();
                return c === "crmid" || c === "crm_id" || c === "crmid" ||
                    n === "crmid" || n === "crm id" || n === "crmid" ||
                    c.includes("crmid") || n.includes("crmid");
            });

            const crmIdVal = crmIdField?.value || await getVal(client, task, "CrmId", client) || await getVal(client, task, "CRMID", client);
            helpyDebug.push(`crmIdField=${crmIdField ? `id=${crmIdField.id} code=${crmIdField.code} name=${crmIdField.name}` : "NOT FOUND"}`);
            helpyDebug.push(`crmIdVal=${crmIdVal}`);

            log(`Helpy_iiko: restoranVal=${JSON.stringify(restoranVal)}, crmIdVal=${crmIdVal}`);

            if ((!restoranVal || !restoranVal.task_id) && crmIdVal) {
                log(`Helpy_iiko: searching restaurant by CRMID=${crmIdVal}`);
                helpyDebug.push(`→ searching restaurant by CRMID=${crmIdVal}`);

                const searchRes = await client.forms.getTasks(FORM_RESTAURANT_ID, {
                    filters: [
                        {
                            field_id: FIELD_CRMID_ID,
                            operator_id: 1,
                            values: [String(crmIdVal)]
                        }
                    ]
                });

                const found = searchRes.tasks?.[0];
                helpyDebug.push(`search result: ${found ? `task_id=${found.id}` : "NOT FOUND"}`);
                log(`Helpy_iiko: search result count=${searchRes.tasks?.length ?? 0}, found=${found?.id}`);

                if (found) {
                    const restoranFieldId =
                        await resolveFieldId(client, task.form_id, FIELD_CODES.RESTORAN) ||
                        RESTORAN_FIELD_MAP[FORM_SD_ID]?.id;

                    helpyDebug.push(`restoranFieldId=${restoranFieldId}`);

                    if (restoranFieldId) {
                        const syncUpdatesForSD = await buildRestaurantSyncUpdates(ctx, found.id);
                        await client.tasks.addComment(taskId, {
                            field_updates: [
                                { id: restoranFieldId, value: { task_id: found.id } },
                                ...syncUpdatesForSD
                            ]
                        });

                        log(`Helpy_iiko: restaurant linked task_id=${found.id}`);
                        helpyDebug.push(`→ LINKED restaurant task_id=${found.id}`);

                        const freshTaskRes = await client.tasks.get({ id: taskId });

                        if (freshTaskRes?.task) {
                            task = freshTaskRes.task;
                            ctx.task = freshTaskRes.task;
                        }
                    }
                }
            } else {
                helpyDebug.push(`→ skip: restoranVal already set OR crmIdVal missing`);
            }

            if (DEBUG_ENABLED) {
                // Публикуем отладочное сообщение в задачу в режиме DEBUG
                try {
                    await client.tasks.addComment(taskId, { text: helpyDebug.join("\n") });
                } catch (_) {}
            }
        }

        // Поиск по ID, так как вложенные поля в API-ответах не всегда содержат коды
        const active =
            findFieldById(task.fields, SD_FIELD_IDS.zapusk)?.value ||
            await getVal(client, task, FIELD_CODES.START_BOT_CHECKBOX, client);
        let isChecked = active === "checked" || active === true || active === "true";
        log(`isChecked=${isChecked}, active=${JSON.stringify(active)}`);

        let hookFieldUpdates: any[] = [];

        let clientCardTaskId: number | undefined;
        let cardPhone: string | undefined;
        let cardTask: any = null;

        const clientsLink =
            findFieldById(task.fields, SD_FIELD_IDS.clients)?.value ||
            await getVal(client, task, FIELD_CODES.TASK_CLIENTS, client);

        const taskClientsId =
            await resolveFieldId(client, task.form_id, FIELD_CODES.TASK_CLIENTS) ||
            SD_FIELD_IDS.clients;

        const externalId =
            findFieldById(task.fields, SD_FIELD_IDS.msgChannel)?.value ||
            await getVal(client, task, FIELD_CODES.SD_MSG_CHANNEL_ID, client) ||
            (lastComment.channel as any)?.id;

        const isTelegramOrMax = ["telegram", "max_messenger"].includes(effectiveChannelType || "") ||
            ["telegram", "max_messenger"].includes(lastComment.channel?.type || "");

        if (!isHelpyIiko && isTelegramOrMax && externalId) {
            const foundCard = await findClientCardByChannel(client, externalId, effectiveChannelType);
            if (foundCard) {
                cardTask = foundCard;
                clientCardTaskId = foundCard.id;
            } else if (clientsLink?.task_id) {
                clientCardTaskId = clientsLink.task_id as number;
                const cardRes = await client.tasks.get({ id: clientCardTaskId });
                cardTask = cardRes?.task;
            }

            if (cardTask) {
                cardPhone = await getVal(client, cardTask, FIELD_CODES.PHONE_NUMBER, client);
            }
        }

        // Привязываем карточку к заявке SD, если она найдена по ID канала, но еще не привязана в поле
        if (clientCardTaskId && !clientsLink?.task_id) {
            const hookRes = await findOrCreateClientHook(
                client,
                task,
                taskClientsId,
                ctx.senderName,
                externalId,
                effectiveChannelType,
                clientCardTaskId
            );
            if (hookRes.length > 0) {
                await client.tasks.addComment(taskId, { field_updates: hookRes });
                const reload = await client.tasks.get({ id: taskId });
                if (reload?.task) {
                    task = reload.task;
                    ctx.task = reload.task;
                }
            }
        }

        // 1. СЛУЧАЙ А: Новый клиент (карточка не найдена по ID мессенджера)
        if (!isHelpyIiko && isTelegramOrMax && externalId && !clientCardTaskId) {
            isChecked = true;

            if (state.step === "WAITING_PHONE") {
                const phoneVal = normalizePhone(userMessage);
                if (phoneVal && phoneVal.length === 11) {
                    log(`WAITING_PHONE: Получен корректный телефон ${phoneVal}`);

                    const cardByPhone = await findClientCardByPhone(client, phoneVal);
                    let cardId: number;
                    let greeting = "";

                    if (cardByPhone) {
                        cardId = cardByPhone.id;
                        let targetFieldId = 0;
                        if (effectiveChannelType === "telegram") targetFieldId = 1;
                        else if (effectiveChannelType === "max_messenger") targetFieldId = 9;

                        if (targetFieldId) {
                            const existingMessengerId = findFieldById(cardByPhone.fields || [], targetFieldId)?.value;
                            if (!existingMessengerId) {
                                await client.tasks.addComment(cardId, {
                                    text: `Привязан мессенджер ${effectiveChannelType} ID: ${externalId}`,
                                    field_updates: [{ id: targetFieldId, value: externalId }]
                                });
                            }
                        }

                        const clientName = findFieldById(cardByPhone.fields || [], cachedClientCardNameFieldId || 2)?.value || cardByPhone.subject || "Клиент";
                        greeting = `Здравствуйте, ${clientName}! Мы нашли Ваши предыдущие обращения и для Вашего удобства связали учётную запись мессенджера с Вашим профилем.`;
                    } else {
                        cardId = await createClientCard(client, ctx.senderName, externalId, effectiveChannelType, phoneVal);
                        greeting = "Рады знакомству! Мы создали для Вас карточку клиента.";
                    }

                    const hookRes = await findOrCreateClientHook(client, task, taskClientsId, ctx.senderName, externalId, effectiveChannelType, cardId);

                    const sdPhoneFieldId = await resolveFieldId(client, task.form_id, FIELD_CODES.PHONE_NUMBER);
                    if (sdPhoneFieldId) {
                        hookRes.push({ id: sdPhoneFieldId, value: phoneVal });
                    }

                    const zapuskId = await resolveFieldId(client, task.form_id, FIELD_CODES.START_BOT_CHECKBOX) || SD_FIELD_IDS.zapusk;
                    if (zapuskId) {
                        hookRes.push({ id: zapuskId, value: "checked" });
                    }

                    state.step = getFirstEnabledStep("WAITING_SELECTION");
                    state.prev_client_card_id = cardId;
                    state.prev_sd_phone = phoneVal;
                    pushStateUpdate(hookRes, stateFieldId, state);

                    const replyObj = await handleFirstContact(ctx, [greeting], hookRes);
                    return await dispatchReply(client, taskId, request.access_token, replyObj);
                } else {
                    const attempts = (state.phone_attempts || 0) + 1;
                    if (attempts <= 3) {
                        state.phone_attempts = attempts;
                        const updates: any[] = [];
                        pushStateUpdate(updates, stateFieldId, state);
                        return await dispatchReply(client, taskId, request.access_token, reply(
                            "Пожалуйста, введите корректный номер телефона в формате +7ХХХХХХХХХХ (11 цифр).",
                            channel,
                            updates
                        ));
                    } else {
                        log(`WAITING_PHONE: Превышено количество попыток. Создаем карточку без телефона.`);
                        const cardId = await createClientCard(client, ctx.senderName, externalId, effectiveChannelType, undefined);
                        const hookRes = await findOrCreateClientHook(client, task, taskClientsId, ctx.senderName, externalId, effectiveChannelType, cardId);

                        const zapuskId = await resolveFieldId(client, task.form_id, FIELD_CODES.START_BOT_CHECKBOX) || SD_FIELD_IDS.zapusk;
                        if (zapuskId) {
                            hookRes.push({ id: zapuskId, value: "checked" });
                        }

                        state.step = getFirstEnabledStep("WAITING_SELECTION");
                        state.prev_client_card_id = cardId;
                        pushStateUpdate(hookRes, stateFieldId, state);

                        const greeting = "Не удалось распознать номер телефона. Мы создали для Вас карточку клиента без номера.";
                        const replyObj = await handleFirstContact(ctx, [greeting], hookRes);
                        return await dispatchReply(client, taskId, request.access_token, replyObj);
                    }
                }
            } else {
                state.step = "WAITING_PHONE";
                state.phone_attempts = 1;

                const updates: any[] = [];
                const zapuskId = await resolveFieldId(client, task.form_id, FIELD_CODES.START_BOT_CHECKBOX) || SD_FIELD_IDS.zapusk;
                if (zapuskId) {
                    updates.push({ id: zapuskId, value: "checked" });
                }
                pushStateUpdate(updates, stateFieldId, state);

                return await dispatchReply(client, taskId, request.access_token, reply(
                    `Здравствуйте!\nРады, что Вы присоединились к нам и поддерживаете новые каналы связи.\nМы хотели бы познакомиться с Вами: укажите, пожалуйста, Ваш номер телефона в формате +7ХХХХХХХХХХ.`,
                    channel,
                    updates
                ));
            }
        }

        // 2. СЛУЧАЙ Б: Существующий клиент без телефона (запрос один раз)
        if (!isHelpyIiko && isTelegramOrMax && clientCardTaskId && !cardPhone) {
            isChecked = true;

            if (state.step === "WAITING_PHONE_ONCE") {
                const phoneVal = normalizePhone(userMessage);
                if (phoneVal && phoneVal.length === 11) {
                    log(`WAITING_PHONE_ONCE: Получен корректный телефон ${phoneVal}`);

                    const clientPhoneFieldId = await resolveFieldId(client, cardTask.form_id, FIELD_CODES.PHONE_NUMBER);
                    if (clientPhoneFieldId) {
                        await client.tasks.addComment(clientCardTaskId, {
                            text: "Номер телефона обновлён пользователем из мессенджера",
                            field_updates: [{ id: clientPhoneFieldId, value: phoneVal }]
                        });
                    }

                    const sdPhoneFieldId = await resolveFieldId(client, task.form_id, FIELD_CODES.PHONE_NUMBER);
                    const localSyncUpdates: any[] = [];
                    if (sdPhoneFieldId) {
                        localSyncUpdates.push({ id: sdPhoneFieldId, value: phoneVal });
                    }

                    state.step = getFirstEnabledStep("WAITING_SELECTION");
                    state.prev_client_card_id = clientCardTaskId;
                    state.prev_sd_phone = phoneVal;
                    pushStateUpdate(localSyncUpdates, stateFieldId, state);

                    const greeting = "Спасибо! Мы обновили Ваш номер телефона.";
                    const replyObj = await handleFirstContact(ctx, [greeting], localSyncUpdates);
                    return await dispatchReply(client, taskId, request.access_token, replyObj);
                } else {
                    log(`WAITING_PHONE_ONCE: Введен некорректный телефон, пропускаем шаг без ошибки`);
                    state.step = getFirstEnabledStep("WAITING_SELECTION");
                }
            } else if (!state.asked_phone_once) {
                state.asked_phone_once = true;
                state.step = "WAITING_PHONE_ONCE";

                const updates: any[] = [];
                const zapuskId = await resolveFieldId(client, task.form_id, FIELD_CODES.START_BOT_CHECKBOX) || SD_FIELD_IDS.zapusk;
                if (zapuskId) {
                    updates.push({ id: zapuskId, value: "checked" });
                }
                pushStateUpdate(updates, stateFieldId, state);

                return await dispatchReply(client, taskId, request.access_token, reply(
                    "Пожалуйста, укажите Ваш номер телефона для связи и обновления учётной записи (в формате +7ХХХХХХХХХХ).",
                    channel,
                    updates
                ));
            }
        }

        // Автоматически включаем чекбокс активации для внешних каналов
        if (!isChecked && isTelegramOrMax) {
            const zapuskId = await resolveFieldId(client, task.form_id, FIELD_CODES.START_BOT_CHECKBOX) || SD_FIELD_IDS.zapusk;
            if (zapuskId) {
                hookFieldUpdates.push({ id: zapuskId, value: "checked" });
            }
            isChecked = true;
        }

        if (!isChecked && isAssistant) {
            isChecked = true;
        }

        if (!isChecked) {
            log(`Exit: bot is not activated. active=${JSON.stringify(active)}, channel=${effectiveChannelType || "-"}`);
            await persistStateIfChanged(client, task, stateFieldId, state);
            await sendDebugLogsIfNeeded(client, taskId, "bot not activated");
            return null;
        }

        const justActivated = isChecked && !state.prev_active;
        state.prev_active = isChecked;

        const EXTERNAL_CHANNELS = ["telegram", "max_messenger", "mobile_app"];
        const isExternalSource = EXTERNAL_CHANNELS.includes(lastComment.channel?.type || "") ||
            EXTERNAL_CHANNELS.includes(effectiveChannelType || "");

        log(`[FLOW] justActivated=${justActivated} isExternalSource=${isExternalSource} step=${state.step} channel=${JSON.stringify(channel)} effectiveChannelType=${effectiveChannelType} lastComment.channel=${JSON.stringify(lastComment.channel)} hookFieldUpdates=${hookFieldUpdates.length}`);

        let isExternalClient = false;

        if (isExternalSource) {
            if (!state.client_author_id) {
                state.client_author_id = lastComment.author?.id;
                isExternalClient = true;
            } else if (state.client_author_id === lastComment.author?.id) {
                isExternalClient = true;
            } else {
                isExternalClient = false;

                if (state.step !== "LISTENING") {
                    state.step = "LISTENING";
                    state.options = undefined;
                    state.pending_selection = undefined;
                    state.retry_count = 0;

                    const updates: any[] = [];
                    pushStateUpdate(updates, stateFieldId, state);

                    return await dispatchReply(client, taskId, request.access_token, { field_updates: updates });
                }
            }
        }

        const canSpeak = isChecked && channel;
        const shouldSpeakConversationally =
            canSpeak &&
            state.step !== "LISTENING" &&
            (isExternalClient || justActivated || isAssistant);

        log(`[FLOW] canSpeak=${!!canSpeak} shouldSpeakConversationally=${shouldSpeakConversationally} isExternalClient=${isExternalClient} justActivated=${justActivated} isAssistant=${isAssistant} step=${state.step}`);

        if (shouldSpeakConversationally && wantsHuman(userMessage)) {
            return await dispatchReply(client, taskId, request.access_token, escalateToHuman(ctx, `user requested human: "${userMessage}"`));
        }

        const curOperator = contactName(await getVal(client, task, FIELD_CODES.OPERATOR, client));
        const curResponsible = contactName(await getVal(client, task, FIELD_CODES.RESPONSIBLE, client));
        const curStatus = statusName(await getVal(client, task, FIELD_CODES.STATUS, client));
        const curPriority = statusName(await getVal(client, task, FIELD_CODES.PRIORITY, client));
        const curTaskType = statusName(await getVal(client, task, FIELD_CODES.TASK_TYPE, client));

        if (curOperator && curOperator !== state.prev_operator && NOTIFICATIONS_ENABLED.OPERATOR_CHANGED) {
            if (!state.prev_operator) {
                notifications.push(`В Вашу задачу назначен Оператор обращения: ${curOperator}`);
            } else {
                notifications.push(`По Вашей задаче изменился Оператор, теперь с Вами будет работать: ${curOperator}`);
            }
        }

        if (curResponsible && curResponsible !== state.prev_responsible && NOTIFICATIONS_ENABLED.RESPONSIBLE_CHANGED) {
            if (!state.prev_responsible) {
                notifications.push(`Вам назначен инженер: ${curResponsible}`);
            } else {
                notifications.push(`По Вашей задаче изменился инженер, теперь с Вами будет работать: ${curResponsible}`);
            }
        }

        if (curStatus && curStatus !== state.prev_status && NOTIFICATIONS_ENABLED.STATUS_CHANGED) {
            notifications.push(`Статус задачи изменён на: "${curStatus}"`);
        }

        if (curPriority && curPriority !== state.prev_priority && state.prev_priority && NOTIFICATIONS_ENABLED.PRIORITY_CHANGED) {
            notifications.push(`Приоритет по заявке изменён с "${state.prev_priority}" на "${curPriority}"`);
        }

        if (curTaskType && curTaskType !== state.prev_task_type && state.prev_task_type && NOTIFICATIONS_ENABLED.TASK_TYPE_CHANGED) {
            notifications.push(`Тип заявки изменён с "${state.prev_task_type}" на "${curTaskType}"`);
        }

        state.prev_operator = curOperator;
        state.prev_responsible = curResponsible;
        state.prev_status = curStatus;
        state.prev_priority = curPriority;
        state.prev_task_type = curTaskType;

        const currentExistingRestoran = await getVal(client, task, FIELD_CODES.RESTORAN, client);

        if (
            shouldSpeakConversationally &&
            (currentExistingRestoran || isAssistant) &&
            (
                state.step === "WAITING_SELECTION" ||
                state.step === "WAITING_CRMID" ||
                state.step === "WAITING_CONFIRMATION"
            )
        ) {
            // Пропускаем шаги выбора ресторана и переходим к следующему шагу после WAITING_CONFIRMATION.
            return await dispatchReply(client, taskId, request.access_token, await goToNextStep(ctx, "WAITING_CONFIRMATION", notifications, []));
        }

        if (state.step === "WAITING_TASK_TYPE" && shouldSpeakConversationally) {
            return await dispatchReply(client, taskId, request.access_token, await handleTaskTypeInput(ctx, userMessage, notifications));
        }

        if (state.step === "WAITING_PRIORITY" && shouldSpeakConversationally) {
            return await dispatchReply(client, taskId, request.access_token, await handlePriorityInput(ctx, userMessage, notifications));
        }

        const latestExistingRestoran = await getVal(client, task, FIELD_CODES.RESTORAN, client);

        if (!latestExistingRestoran && !isAssistant && shouldSpeakConversationally) {
            if (state.step === "WAITING_SELECTION" && !state.options) {
                return await dispatchReply(client, taskId, request.access_token, await handleFirstContact(ctx, notifications, hookFieldUpdates));
            }

            if (state.step === "WAITING_SELECTION" && state.options) {
                return await dispatchReply(client, taskId, request.access_token, await handleSelection(ctx, userMessage, notifications, []));
            }

            if (state.step === "WAITING_CRMID") {
                return await dispatchReply(client, taskId, request.access_token, await handleCrmidInput(ctx, userMessage, notifications, []));
            }

            if (state.step === "WAITING_CONFIRMATION" && state.pending_selection) {
                return await dispatchReply(client, taskId, request.access_token, await handleConfirmation(ctx, userMessage, notifications, []));
            }
        }

        if (notifications.length > 0 && canSpeak) {
            const updates: any[] = [];
            pushStateUpdate(updates, stateFieldId, state);

            return await dispatchReply(client, taskId, request.access_token, reply(notifications.join("\n"), channel, updates));
        }

        await persistStateIfChanged(client, task, stateFieldId, state);
        await sendDebugLogsIfNeeded(client, taskId, "normal end without reply");

        return null;
    } catch (err: any) {
        log(`FATAL ERROR: ${err.message}`);
        await sendDebugLogsIfNeeded(client, taskId);

        return {
            text: `⚠️ Системная ошибка клиентского бота!\n\n${err.message}`
        } as any;
    }
}