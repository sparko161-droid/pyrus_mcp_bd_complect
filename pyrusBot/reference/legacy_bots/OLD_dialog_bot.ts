// ═══════════════════════════════════════════════════════════════
//  УСТАРЕЛО — НЕ ДОКУМЕНТИРУЕТСЯ И НЕ РАЗВИВАЕТСЯ
//
//  Ранняя версия той же линии, что и locanta_bot_pyrus_temp.ts:
//  те же коды полей, те же формы (карточка ресторана 1101763,
//  карточка клиента 2441100, Service Desk 2441923).
//
//  Актуальная версия — locanta_bot_pyrus_temp.ts. В ней добавлены
//  сбор телефона, работа с ИНН и машина шагов диалога.
//
//  Решение владельца от 10.08.2026: файл сохраняется как история,
//  документация по нему не пишется. Не берите его за основу.
// ═══════════════════════════════════════════════════════════════

import {
    BotHookRequest,
    BotHookResponse,
    PyrusApiClient,
    TaskComment
} from "pyrus-api";

// ═══════════════════════════════════════════════════════════════
//  CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const FIELD_CODES = {
    STATE: "tehnikal_text",
    RESTORAN_TABLE: "restoran_table",
    TABLE_REST: "u_client",
    TABLE_REST_CRMID: "u_crmid",
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
} as const;

const FORM_RESTAURANT_ID = 1101763;
const FIELD_CRMID_ID = 92;
const FORM_CLIENT_CARD_ID = 2441100;
const FORM_SD_ID = 2441923;

const SD_FALLBACK_CRMID_COL = 39;  // SD form: restoran_table column for CRMID
const SD_FALLBACK_LINK_COL = 42;   // SD form: restoran_table column for restaurant link

// Client card form (2441100) table column IDs
const CC_TABLE_LINK_COL = 11;   // u_client — restaurant task link
const CC_TABLE_CRMID_COL = 6;   // u_crmid  — CRMID text

// Hardcoded field IDs for SD form (fields nested in groups — not returned by API when empty)
const SD_FIELD_IDS: Record<string, number> = {
    state: 31,         // tehnikal_text      (inside group 78)
    zapusk: 32,        // zapusk_bota        (inside group 78)
    clients: 34,       // task_clients        (inside group 21)
    msgChannel: 37,    // message_chanell_id (inside group 21)
    senderName: 4,     // SenderName         (inside group 21)
    channelTask: 14,    // channel_task        (inside group 16)
    priority: 15,       // priority            (inside group 16)
    taskType: 35,       // Task_type          (inside group 8)
    restoranTable: 38, // restoran_table     (inside group 21)
};

const DEBUG_ENABLED = false;

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
//  TYPES
// ═══════════════════════════════════════════════════════════════

interface BotState {
    step: "WAITING_SELECTION" | "WAITING_CRMID" | "WAITING_CONFIRMATION"
    | "WAITING_TASK_TYPE" | "WAITING_PRIORITY" | "LISTENING";
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

    // allow Access Sync Bot to store its own namespace in the same JSON field
    access_sync?: any;
    [key: string]: any;
}

interface RestaurantOption {
    name: string;
    crmid: string;
    task_id: number;
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
//  CACHES & HELPERS
// ═══════════════════════════════════════════════════════════════

const SCHEMA_CACHE: Record<number, Record<string, number>> = {};
let cachedClientColumns: { formId: number; crmidColId: number; linkColId: number } | null = null;
let cachedClientCardIdFieldId = 0;
let cachedClientCardNameFieldId = 0;
let cachedClientCardChannelFieldId = 0;
let logs: string[] = [];

function pushStateUpdate(updates: any[], stateFieldId: number | undefined, state: BotState) {
    if (stateFieldId) updates.push({ id: stateFieldId, value: JSON.stringify(state) });
}

function log(msg: string) {
    if (!DEBUG_ENABLED) return;
    const time = new Date().toISOString().split("T")[1].split(".")[0];
    logs.push(`[${time}] ${msg}`);
    console.log(`[${time}] ${msg}`);
}

/** Fetches and caches form schema to map codes to IDs */
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

/** Robust recursive search for a field by ID */
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

/** Unified function to get field ID by code */
async function resolveFieldId(client: PyrusApiClient, formId: number, code: string): Promise<number | undefined> {
    const target = code.toLowerCase().trim();
    if (target === FIELD_CODES.RESTORAN && RESTORAN_FIELD_MAP[formId]) return RESTORAN_FIELD_MAP[formId].id;
    const map = await getFieldMap(client, formId);
    return map[target];
}

/** Unified function to get field value by code or ID */
async function getVal(client: PyrusApiClient, task: any, codeOrId: string | number, clientForMap?: PyrusApiClient): Promise<any> {
    if (!task?.fields) return undefined;
    
    // Special case: State JSON signature search
    if (codeOrId === FIELD_CODES.STATE) {
        let id: number | undefined;
        if (clientForMap) id = await resolveFieldId(clientForMap, task.form_id, FIELD_CODES.STATE);
        const val = id ? findFieldById(task.fields, id)?.value : undefined;
        if (val) return val;
        // Fallback: heuristic search in all fields
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

function findColumnId(columns: any[] | undefined, code: string): number | undefined {
    return columns?.find((c: any) => c.code === code || c.info?.code === code)?.id;
}

function calcNextRowId(rows: any[]): number {
    return (rows || []).reduce((max, r) => Math.max(max, r.row_id ?? -1), -1) + 1;
}

function buildTableRow(rowId: number, crmidColId: number, linkColId: number, crmid: string, taskId: number, subject?: string) {
    return {
        row_id: rowId,
        cells: [
            { id: crmidColId, value: crmid },
            { id: linkColId, value: subject ? { task_id: taskId, subject } : { task_id: taskId } },
        ],
    };
}

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

const contactName = (val: any) => val?.first_name ? `${val.first_name} ${val.last_name || ""}`.trim() : undefined;
const statusName = (val: any) => val?.choice_names?.[0] || val?.choice_value || undefined;

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

async function persistStateIfChanged(client: PyrusApiClient, task: any, stateFieldId: number | undefined, state: BotState) {
    if (!stateFieldId) return;
    const next = JSON.stringify(state);
    const cur = await getVal(client, task, FIELD_CODES.STATE, client);
    if (next !== cur) await client.tasks.addComment(task.id, { field_updates: [{ id: stateFieldId, value: next }] });
}

function reply(text: string, channel: any, fieldUpdates?: any[], attachments?: any[], formattedText?: string): any {
    const r: any = { channel, field_updates: fieldUpdates, attachments };
    if (formattedText) r.formatted_text = formattedText; else r.text = text;
    log(`REPLY: ${text?.substring(0, 50)}...`);
    return r;
}

async function sendDebugLogsIfNeeded(client: PyrusApiClient, taskId: number, reason = "debug") {
    if (!DEBUG_ENABLED || taskId === 0 || logs.length === 0) return;
    const logText = `--- DEBUG (${reason}) ---\n${logs.join("\n")}`;
    logs = [];
    try { await client.tasks.addComment(taskId, { text: logText }); } catch (e: any) { console.error("Log error", e); }
}

async function dispatchReply(client: PyrusApiClient, taskId: number, accessToken: string, replyRes: any) {
    if (!replyRes) { await sendDebugLogsIfNeeded(client, taskId); return null; }
    
    // Max Messenger workaround
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
        return null;
    } catch (e: any) {
        log(`Dispatch error: ${e.message}`);
        return replyRes;
    }
}


// ═══════════════════════════════════════════════════════════════
//  FUZZY MATCHING
// ═══════════════════════════════════════════════════════════════

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

function normalize(s: string): string {
    return s.toLowerCase().replace(NORM_RE, "");
}

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

function wantsHuman(msg: string): boolean {
    const lower = msg.toLowerCase();
    return HUMAN_WORDS.some(w => lower.includes(w));
}

function matchesAny(input: string, words: string[], threshold = 0.8): boolean {
    const n = normalize(input);
    return words.includes(n) || words.some(w => w.length >= 3 && fuzzyMatch(n, w, threshold));
}

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
//  CLIENT CARD HOOK
// ═══════════════════════════════════════════════════════════════

async function findOrCreateClientHook(
    client: PyrusApiClient,
    task: any,
    sdTaskClientsId: number,
    senderName: string,
    externalId: string,
    channelTypeStr?: string
): Promise<any[]> {
    const updates: any[] = [];

    try {
        let targetFieldId = 0;
        let targetFieldCode = "";
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

        let clientCardTaskId: number | undefined;
        let foundTableRows: any[] = [];
        const hookDebugLines: string[] = [
            `--- HOOK CLIENT CARD DEBUG ---`,
            `externalId: ${externalId}`,
            `channel: ${channelTypeStr} (targetFieldId=${targetFieldId})`,
            `search results: ${searchRes.tasks?.length ?? 0}`,
            `filters: ${searchFiltersLog}`,
        ];

        if (searchRes.tasks && searchRes.tasks.length > 0) {
            for (const t of searchRes.tasks) {
                // API already filtered by externalId — re-check via both findField and findFieldById
                const val =
                    await getVal(client, t, targetFieldCode, client) ||
                    (targetFieldId ? findFieldById(t.fields || [], targetFieldId)?.value : undefined);

                const taskFieldIds = (t.fields || []).map((f: any) => `${f.id}:${f.type || "?"}`).join(", ");
                log(`Hook: candidate task_id=${t.id} val=${JSON.stringify(val)} fields=[${taskFieldIds}]`);
                hookDebugLines.push(`candidate: task_id=${t.id} val=${JSON.stringify(val)} fields=[${taskFieldIds}]`);

                // Accept if value matches, or if no value readable but search returned exactly this result
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

                    break;
                } else {
                    log(`Hook: candidate REJECTED task_id=${t.id} val=${JSON.stringify(val)} !== externalId=${externalId}`);
                    hookDebugLines.push(`→ REJECTED: val mismatch`);
                }
            }
        }

        if (!clientCardTaskId) {
            const createFields: any[] = [
                { id: targetFieldId, value: externalId }
            ];

            if (cachedClientCardNameFieldId) {
                createFields.push({ id: cachedClientCardNameFieldId, value: senderName });
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

        // Send immediate debug comment (internal, no channel)
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
                        SD_FALLBACK_CRMID_COL;

                    const linkColId =
                        findColumnId(tableField?.info?.columns, FIELD_CODES.TABLE_REST) ||
                        SD_FALLBACK_LINK_COL;

                    let nextId = calcNextRowId(Array.isArray(tableField?.value) ? tableField.value : []);

                    hookDebugLines.push(`SD table: id=${sdTableId} crmidCol=${crmidColId} linkCol=${linkColId} nextRowId=${nextId}`);

                    for (const r of foundTableRows) {
                        // Primary: lookup by SD column ID; secondary: by client card column ID (8/10);
                        // tertiary: by code; final: any cell with task_id
                        const rCrmid =
                            r.cells?.find((c: any) => c.id === crmidColId)?.value ||
                            r.cells?.find((c: any) => c.id === CC_TABLE_CRMID_COL)?.value ||
                            r.cells?.find((c: any) =>
                                c.code === FIELD_CODES.TABLE_REST_CRMID ||
                                c.info?.code === FIELD_CODES.TABLE_REST_CRMID
                            )?.value;

                        const rLink =
                            r.cells?.find((c: any) => c.id === linkColId)?.value ||
                            r.cells?.find((c: any) => c.id === CC_TABLE_LINK_COL)?.value ||
                            r.cells?.find((c: any) =>
                                c.code === FIELD_CODES.TABLE_REST ||
                                c.info?.code === FIELD_CODES.TABLE_REST
                            )?.value ||
                            // fallback: any cell with task_id in its value
                            r.cells?.find((c: any) => c.value?.task_id)?.value;

                        hookDebugLines.push(`  row cells: ${r.cells?.map((c: any) => `id=${c.id} val=${JSON.stringify(c.value)}`).join(" | ")}`);
                        hookDebugLines.push(`  → rCrmid=${rCrmid} rLink.task_id=${rLink?.task_id}`);

                        if (rCrmid && rLink?.task_id) {
                            newSdRows.push(buildTableRow(nextId++, crmidColId, linkColId, String(rCrmid), rLink.task_id, rLink.subject));
                        }
                    }

                    hookDebugLines.push(`SD table rows to copy: ${newSdRows.length}`);

                    if (newSdRows.length > 0) {
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
//  TABLE / CLIENT PROFILE SYNC FOR RESTAURANT LINKS ONLY
// ═══════════════════════════════════════════════════════════════

async function appendToSdTable(ctx: BotContext, updates: any[], crmid: string, taskId: number) {
    const tableId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.RESTORAN_TABLE);
    const tableField = tableId ? findFieldById(ctx.task.fields, tableId) : undefined;
    if (!tableField) return;

    const rows = Array.isArray(tableField.value) ? tableField.value : [];

    const exists = rows.some((row: any) => {
        const cellCrmid = row.cells?.find((c: any) =>
            c.code === FIELD_CODES.TABLE_REST_CRMID ||
            c.info?.code === FIELD_CODES.TABLE_REST_CRMID
        )?.value;

        return String(cellCrmid) === String(crmid);
    });

    if (exists) return;

    const crmidColId =
        findColumnId(tableField.info?.columns, FIELD_CODES.TABLE_REST_CRMID) ||
        SD_FALLBACK_CRMID_COL;

    const linkColId =
        findColumnId(tableField.info?.columns, FIELD_CODES.TABLE_REST) ||
        SD_FALLBACK_LINK_COL;

    const nextId = calcNextRowId(tableField.value || []);

    updates.push({
        id: tableField.id,
        value: [buildTableRow(nextId, crmidColId, linkColId, crmid, taskId)]
    });
}

function resolveColumnIds(tableField: any, formId: number): { formId: number; crmidColId: number; linkColId: number } | null {
    const cols = tableField.info?.columns;
    if (!cols) return null;

    const cId = findColumnId(cols, FIELD_CODES.TABLE_REST_CRMID);
    const lId = findColumnId(cols, FIELD_CODES.TABLE_REST);

    return cId && lId
        ? { formId, crmidColId: cId, linkColId: lId }
        : null;
}

async function appendToClientProfile(
    ctx: BotContext,
    crmid: string,
    taskId: number,
    name: string,
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
            const lId = findColumnId(schemaTable.info.columns, FIELD_CODES.TABLE_REST);

            if (cId && lId) {
                cols = { formId: clientFormId, crmidColId: cId, linkColId: lId };
                cachedClientColumns = cols;
            }
        }
    }

    if (!cols) return;

    const rows = Array.isArray(clientTableField.value) ? clientTableField.value : [];

    const exists = rows.some((row: any) => {
        const cellCrmid = row.cells?.find((c: any) =>
            c.code === FIELD_CODES.TABLE_REST_CRMID ||
            c.info?.code === FIELD_CODES.TABLE_REST_CRMID
        )?.value;

        return String(cellCrmid) === String(crmid);
    });

    if (exists) {
        log(`appendToClientProfile: CRMID ${crmid} already exists`);
        return;
    }

    const nextId = calcNextRowId(clientTableField.value || []);
    const newRow = buildTableRow(nextId, cols.crmidColId, cols.linkColId, crmid, taskId, name);

    await ctx.client.tasks.addComment(clientTaskId, {
        text: `Добавлено заведение (${authorName}): ${name} (${crmid})`,
        field_updates: [{ id: clientTableField.id, value: [newRow] }],
    });
}

async function buildRestaurantSyncUpdates(ctx: BotContext, restaurantTaskId: number): Promise<any[]> {
    const updates: any[] = [];
    try {
        const restTaskRes = await ctx.client.tasks.get({ id: restaurantTaskId });
        const restTask = restTaskRes.task;
        if (!restTask || !restTask.form_id || !restTask.fields) return updates;

        const sdFormId = ctx.task.form_id;
        if (!sdFormId) return updates;

        // Fetch schemas
        const sdSchema = await ctx.client.forms.get({ id: sdFormId });
        const restSchema = await ctx.client.forms.get({ id: restTask.form_id });

        if (!sdSchema.fields || !restSchema.fields) return updates;

        // Map SD Schema fields: code -> { id, type }
        const sdCodeMap = new Map<string, { id: number, type: string }>();
        const sdSchemaFlat = flattenFields(sdSchema.fields);
        for (const sf of sdSchemaFlat) {
            const code = (sf.code || sf.info?.code || "").toLowerCase().trim();
            const type = sf.type || sf.info?.type;
            if (code && type) {
                sdCodeMap.set(code, { id: sf.id, type });
            }
        }

        // Map Rest Schema fields: id -> { code, type }
        const restIdMap = new Map<number, { code: string, type: string }>();
        const restSchemaFlat = flattenFields(restSchema.fields);
        for (const rf of restSchemaFlat) {
            const code = (rf.code || rf.info?.code || "").toLowerCase().trim();
            const type = rf.type || rf.info?.type;
            if (code && type) {
                restIdMap.set(rf.id, { code, type });
            }
        }

        // Iterate over Rest Task fields with values
        const restTaskFieldsFlat = flattenFields(restTask.fields);
        for (const rtf of restTaskFieldsFlat) {
            const val = rtf.value;
            // Check if empty
            if (val === undefined || val === null || val === "") continue;
            if (Array.isArray(val) && val.length === 0) continue;

            const schemaInfo = restIdMap.get(rtf.id);
            if (!schemaInfo) continue; // No code or type for this field in Rest schema

            const { code, type: restType } = schemaInfo;

            // ИСПРАВЛЕНИЕ: Пропускаем технические поля, карточки и поле Status (status), чтобы бот не менял статус тикета на статус ресторана!
            if (code === FIELD_CODES.STATE || code === FIELD_CODES.RESTORAN || code === FIELD_CODES.RESTORAN_TABLE || code === "status") continue;
            if (restType === "group" || restType === "title" || restType === "table") continue;

            const sdFieldInfo = sdCodeMap.get(code);
            if (sdFieldInfo && sdFieldInfo.type === restType) {
                // Prevent duplicate updates
                if (!updates.find(u => u.id === sdFieldInfo.id)) {
                    updates.push({
                        id: sdFieldInfo.id,
                        value: val
                    });
                }
            }
        }

        log(`buildRestaurantSyncUpdates: Generated ${updates.length} field updates`);

    } catch (e: any) {
        log(`buildRestaurantSyncUpdates Error: ${e.message}`);
    }

    return updates;
}


async function extractTableData(ctx: BotContext): Promise<{ crmid: string; taskId: number }[]> {
    const tableId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.RESTORAN_TABLE) || 38;
    const tableValue = await getVal(ctx.client, ctx.task, tableId, ctx.client);
    const rows = Array.isArray(tableValue) ? tableValue : [];
    const data: { crmid: string; taskId: number }[] = [];

    for (const row of rows) {
        const crmid = row.cells?.find((c: any) =>
            c.code === FIELD_CODES.TABLE_REST_CRMID ||
            c.info?.code === FIELD_CODES.TABLE_REST_CRMID
        )?.value;

        const restForm = row.cells?.find((c: any) =>
            c.code === FIELD_CODES.TABLE_REST ||
            c.info?.code === FIELD_CODES.TABLE_REST
        )?.value;

        if (crmid && restForm?.task_id) {
            data.push({ crmid: String(crmid), taskId: Number(restForm.task_id) });
        }
    }

    return data;
}

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
        const cellCrmid = row.cells?.find((c: any) =>
            c.code === FIELD_CODES.TABLE_REST_CRMID ||
            c.info?.code === FIELD_CODES.TABLE_REST_CRMID
        )?.value;

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
                await getVal(ctx.client, restTask.task, "restoran", ctx.client) ||
                await getVal(ctx.client, restTask.task, "Название заведения", ctx.client) ||
                await getVal(ctx.client, restTask.task, "Resto", ctx.client) ||
                await getVal(ctx.client, restTask.task, "resto", ctx.client) ||
                restTask.task?.subject ||
                "заведение";

                        const crmidStr = String(crmid);

            notifications.push(`К Вашей заявке привязано заведение: "${name}"`);

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
                    await appendToSdTable(ctx, updates, crmidStr, curRestoranId);
                    await appendToClientProfile(ctx, crmidStr, curRestoranId, name, authorName);
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
                    const name = await getVal(ctx.client, restTask.task, "Resto", ctx.client) || restTask.task?.subject || "заведение";
                    await appendToClientProfile(ctx, row.crmid, row.taskId, name, authorName);
                } catch (e: any) {
                    log(`Failed to fetch restoran details for manual add ${row.taskId}: ${e.message}`);
                }
            }
        }
    }

    ctx.state.prev_table_crmids = curCrmids;
}

// ═══════════════════════════════════════════════════════════════
//  RESTAURANT SELECTION HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleFirstContact(ctx: BotContext, notifications: string[], syncUpdates: any[]): Promise<any> {
    const sdTableId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.RESTORAN_TABLE) || 38;
    const tableValue = await getVal(ctx.client, ctx.task, sdTableId, ctx.client);

    const tableUpdate = syncUpdates.find((u: any) => u.id === sdTableId);
    const rows = tableUpdate ? tableUpdate.value : (Array.isArray(tableValue) ? tableValue : []);

    if (rows.length > 0) {
        const options: RestaurantOption[] = [];
        const seenCrmids = new Set<string>();

        for (const row of rows) {
            const restForm =
                row.cells?.find((c: any) => c.id === CC_TABLE_LINK_COL)?.value ||      // client card col id=8
                row.cells?.find((c: any) => c.id === SD_FALLBACK_LINK_COL)?.value ||   // SD task col id=150
                row.cells?.find((c: any) =>
                    c.code === FIELD_CODES.TABLE_REST ||
                    c.info?.code === FIELD_CODES.TABLE_REST
                )?.value;

            const crmid =
                row.cells?.find((c: any) => c.id === CC_TABLE_CRMID_COL)?.value ||     // client card col id=10
                row.cells?.find((c: any) => c.id === SD_FALLBACK_CRMID_COL)?.value ||  // SD task col id=151
                row.cells?.find((c: any) =>
                    c.code === FIELD_CODES.TABLE_REST_CRMID ||
                    c.info?.code === FIELD_CODES.TABLE_REST_CRMID
                )?.value;

            const crmidStr = String(crmid || "");

            if (restForm?.task_id && crmidStr && !seenCrmids.has(crmidStr)) {
                seenCrmids.add(crmidStr);

                // subject format: "04.02 КАРТОЧКА РЕСТОРАНА: Офис СМ;" — take everything after first ":"
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

    return requestCRMID(ctx, notifications, syncUpdates);
}

async function handleSelection(ctx: BotContext, userMessage: string, notifications: string[], syncUpdates: any[]): Promise<any> {
    const options = ctx.state.options!;
    const input = userMessage.toLowerCase();

    const numMatch = userMessage.match(/^(\d+)$/);

    if (numMatch) {
        const idx = parseInt(numMatch[1], 10) - 1;

        if (idx >= 0 && idx < options.length) {
            return finishWithSelection(ctx, options[idx], notifications, syncUpdates);
        }

        if (idx === options.length) {
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
        return searchAndConfirm(ctx, userMessage, notifications, syncUpdates);
    }

    ctx.state.retry_count = (ctx.state.retry_count || 0) + 1;

    if (ctx.state.retry_count >= MAX_RETRIES) {
        return escalateToHuman(ctx, "max retries on selection", syncUpdates);
    }

    const updates: any[] = [...syncUpdates];
    pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

    let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
    const prefix = "Извините, не удалось распознать выбор. Пожалуйста, ответьте номером пункта:\n\n";

    const textMsg = msg + buildOptionsMenu(options, prefix, false);
    const reqFormattedText = ctx.channel?.type === "mobile_app"
        ? msg.replace(/\n/g, "<br>") + buildOptionsMenu(options, prefix.replace(/\n/g, "<br>"), true)
        : undefined;

    return reply(textMsg, ctx.channel, updates, undefined, reqFormattedText);
}

async function handleCrmidInput(ctx: BotContext, userMessage: string, notifications: string[], syncUpdates: any[]): Promise<any> {
    const digits = userMessage.replace(/\D/g, "");

    if (digits.length >= 5) {
        ctx.state.retry_count = 0;
        return searchAndConfirm(ctx, digits, notifications, syncUpdates);
    }

    ctx.state.retry_count = (ctx.state.retry_count || 0) + 1;

    if (ctx.state.retry_count >= MAX_RETRIES) {
        return escalateToHuman(ctx, "max retries on CRMID", syncUpdates);
    }

    const updates: any[] = [...syncUpdates];
    pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

    let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
    msg += "Пожалуйста, введите корректный CRMID (не менее 5 цифр).";

    return reply(msg, ctx.channel, updates);
}

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
    msg += `Для обработки заявки нам потребуется CRMID Вашего заведения.\n\n`;
    msg += `Найти его можно двумя способами:\n`;
    msg += `📍 В iikoOffice (раздел «Помощь» → «О программе»).\n`;
    msg += `📍 В iikoFront на кассе (нажмите на номер версии в левом верхнем углу — iiko v.0.0.00).\n\n`;
    msg += `Для наглядности мы прикрепили скриншоты ниже. Ждём ваш номер!`;

    const attachments: any[] = [
        { attachment_id: "418274221" },
        { attachment_id: "418274222" }
    ];

    return reply(msg, ctx.channel, updates, attachments);
}

async function searchAndConfirm(ctx: BotContext, crmid: string, notifications: string[], syncUpdates: any[]): Promise<any> {
    const sdTableId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.RESTORAN_TABLE) || 38;
    const tableValue = await getVal(ctx.client, ctx.task, sdTableId, ctx.client);
    const tableUpdate = syncUpdates.find(u => u.id === (ctx.restoranTableFieldId || sdTableId));
    const rows = tableUpdate ? tableUpdate.value : (Array.isArray(tableValue) ? tableValue : []);

    if (rows && rows.length > 0) {
        let existingTaskId = 0;
        let existingName = "";

        for (const row of rows) {
            const restForm = row.cells?.find((c: any) =>
                c.code === FIELD_CODES.TABLE_REST ||
                c.info?.code === FIELD_CODES.TABLE_REST
            )?.value;

            const rowCrmid = row.cells?.find((c: any) =>
                c.code === FIELD_CODES.TABLE_REST_CRMID ||
                c.info?.code === FIELD_CODES.TABLE_REST_CRMID
            )?.value;

            if (String(rowCrmid) === crmid && restForm?.task_id) {
                existingTaskId = restForm.task_id;
                existingName = restForm.subject?.split(":")?.[1]?.trim() || restForm.subject || "Заведение";
                break;
            }
        }

        if (existingTaskId) {
            ctx.state.step = "WAITING_CONFIRMATION";
            ctx.state.pending_selection = {
                task_id: existingTaskId,
                name: existingName,
                crmid,
                existing: true
            };

            const updates: any[] = [...syncUpdates];
            pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

            let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";

            msg += `Мы обнаружили, что ресторан с CRMID ${crmid} уже есть в Вашем списке — это "${existingName}".\n`;
            msg += `Хотите оставить обращение именно по нему?\n`;
            msg += `1. Да\n`;
            msg += `2. Нет, указать другой CRMID`;

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
        await getVal(ctx.client, found, "restoran", ctx.client) ||
        await getVal(ctx.client, found, "Название заведения", ctx.client) ||
        await getVal(ctx.client, found, "Resto", ctx.client) ||
        await getVal(ctx.client, found, "resto", ctx.client) ||
        found.subject || 
        "заведение";

    ctx.state.step = "WAITING_CONFIRMATION";
    ctx.state.pending_selection = {
        task_id: found.id,
        name,
        crmid
    };

    const updates: any[] = [...syncUpdates];
    pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

    let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";

    msg += `По Вашему CRMID: ${crmid} в нашей системе нашёлся ресторан "${name}"\n`;
    msg += `Подтвердите, что Вы хотите оставить обращение именно по этому ресторану:\n`;
    msg += `1. Да\n`;
    msg += `2. Нет, указать другой CRMID`;

    return reply(msg, ctx.channel, updates);
}

async function finishWithSelection(
    ctx: BotContext,
    selection: RestaurantOption,
    notifications: string[],
    syncUpdates: any[]
): Promise<any> {
    const { task_id: taskId, name, crmid, existing } = selection;

    ctx.state.step = "WAITING_TASK_TYPE";
    ctx.state.pending_selection = undefined;
    ctx.state.options = undefined;
    ctx.state.retry_count = 0;
    ctx.state.prev_restoran_id = taskId;

    const updates: any[] = [...syncUpdates];

    if (ctx.restoranFieldId) {
        updates.push({
            id: ctx.restoranFieldId,
            value: { task_id: taskId }
        });
        
        const syncUpdatesForSD = await buildRestaurantSyncUpdates(ctx, taskId);
        updates.push(...syncUpdatesForSD);
    }

    if (!existing) {
        await appendToSdTable(ctx, updates, crmid, taskId);
        await appendToClientProfile(ctx, crmid, taskId, name, ctx.senderName);
    }

    pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

    let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";

    msg += `Спасибо за уточнение, мы записали что эта заявка по заведению "${name}".\n\n`;
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

// ═══════════════════════════════════════════════════════════════
//  TASK TYPE / PRIORITY HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleTaskTypeInput(ctx: BotContext, userMessage: string, notifications: string[]): Promise<any> {
    const num = parseInt(userMessage.trim(), 10);
    const choice = TASK_TYPE_MAP[num];

    if (choice) {
        ctx.state.retry_count = 0;
        ctx.state.step = "WAITING_PRIORITY";
        ctx.state.prev_task_type = choice.label;

        const taskTypeFieldId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.TASK_TYPE);
        const updates: any[] = [];

        if (taskTypeFieldId) {
            updates.push({
                id: taskTypeFieldId,
                value: { choice_id: choice.choice_id }
            });
        }

        pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

        const curPriority = statusName(await getVal(ctx.client, ctx.task, FIELD_CODES.PRIORITY, ctx.client)) || "не указан";

        let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";

        msg += `Спасибо! Уточните, пожалуйста, критичность Вашей проблемы.\n`;
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

async function handlePriorityInput(ctx: BotContext, userMessage: string, notifications: string[]): Promise<any> {
    const num = parseInt(userMessage.trim(), 10);
    const choice = PRIORITY_MAP[num];

    if (choice) {
        ctx.state.retry_count = 0;
        ctx.state.step = "LISTENING";
        ctx.state.prev_priority = choice.label;

        const priorityFieldId = await resolveFieldId(ctx.client, ctx.task.form_id, FIELD_CODES.PRIORITY);
        const updates: any[] = [];

        if (priorityFieldId) {
            updates.push({
                id: priorityFieldId,
                value: { choice_id: choice.choice_id }
            });
        }

        pushStateUpdate(updates, ctx.stateFieldId, ctx.state);

        let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";
        msg += `Спасибо! Приоритет установлен: "${choice.label}".\n\nОператор скоро свяжется с Вами!`;

        return reply(msg, ctx.channel, updates);
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
//  MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════

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

    // This bot is not for restaurant card access sync.
    if (isRestaurantCard) {
        log("Exit: restaurant card form, client dialog bot skipped.");
        await sendDebugLogsIfNeeded(client, taskId, "restaurant card skipped");
        return null;
    }

    log(`--- CLIENT BOT REQ Task:${taskId} Form:${formId} user_id:${request.user_id} ---`);
    log(`Task debug: id=${taskId}, form=${formId}, comments=${task.comments?.length || 0}`);
    log(`Fields debug (hook): ${(task.fields || []).map((f: any) => `${f.id}:${f.code || f.name || f.info?.code || "-"}`).join(", ")}`);

    // Pyrus bot hook only provides top-level fields (groups without their children).
    // Fetch the full task via REST API to get all nested field values.
    try {
        const hookComments = task.comments;
        const fullTaskRes = await client.tasks.get({ id: taskId });
        if (fullTaskRes?.task) {
            task = fullTaskRes.task;
            // Restore hook comments if full task somehow has fewer
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
    log(`State read: stateFieldId=${stateFieldId}, step=${(safeParseState(stateRaw)).step}`);

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

        const channel = channelType ? { type: channelType } : (lastComment.channel || undefined);
        const effectiveChannelType = channelType || (channel as any)?.type;

        const isAssistant =
            choiceId === 5 ||
            choiceValue === "Помощник" ||
            choiceNames.includes("Помощник");

        // Check any comment's channel for "custom" — Helpy's initial message always comes via custom channel
        // This is stable across re-triggers (system comments have no channel, but Helpy's first comment remains)
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

        // Only lightweight restaurant/table sync here. Access fields are handled by the second bot.
        await syncRestoranAndTable(ctx, syncUpdates, notifications, authorName);

        if (syncUpdates.length > 0) {
            await client.tasks.addComment(taskId, { field_updates: syncUpdates });

            const reload = await client.tasks.get({ id: taskId });

            if (reload?.task) {
                task = reload.task;
                ctx.task = reload.task;
            }
        }

        // Helpy_iiko auto-association by CRMID
        if (isHelpyIiko) {
            const restoranVal = await getVal(client, task, FIELD_CODES.RESTORAN, client);

            // Flatten all fields (including nested) to find CrmId regardless of where it lives
            const allFields = flattenFields(task.fields || []);
            const helpyDebug: string[] = [];
            if (DEBUG_ENABLED) {
                helpyDebug.push(`--- HELPY DEBUG ---`);
                helpyDebug.push(`isHelpyIiko=true, choiceValue="${choiceValue}", effectiveChannel=${effectiveChannelType || "none"}`);
                helpyDebug.push(`restoranVal=${JSON.stringify(restoranVal)}`);
                helpyDebug.push(`all fields (${allFields.length}): ${allFields.map((f: any) => `${f.id}:${f.code || f.name || "?"}=${JSON.stringify(f.value)?.substring(0, 40)}`).join(", ")}`);
            }

            // Look for CrmId/CRMID field by code or name (case-insensitive)
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
                // Send immediate debug comment
                try {
                    await client.tasks.addComment(taskId, { text: helpyDebug.join("\n") });
                } catch (_) {}
            }
        }

        // Use findFieldById — nested fields returned by API lack code/name, only have {id, value}
        const active =
            findFieldById(task.fields, SD_FIELD_IDS.zapusk)?.value ||
            await getVal(client, task, FIELD_CODES.START_BOT_CHECKBOX, client);
        let isChecked = active === "checked" || active === true || active === "true";
        log(`isChecked=${isChecked}, active=${JSON.stringify(active)}`);

        let hookFieldUpdates: any[] = [];

        if (!isChecked && (effectiveChannelType === "max_messenger" || effectiveChannelType === "telegram")) {
            const clientsLink =
                findFieldById(task.fields, SD_FIELD_IDS.clients)?.value ||
                await getVal(client, task, FIELD_CODES.TASK_CLIENTS, client);
            log(`Hook check: clientsLink=${JSON.stringify(clientsLink)}`);

            // Only use external channel ID (field or channel.id) — never author.id (may be system/integration user)
            const externalId =
                findFieldById(task.fields, SD_FIELD_IDS.msgChannel)?.value ||
                await getVal(client, task, FIELD_CODES.SD_MSG_CHANNEL_ID, client) ||
                (lastComment.channel as any)?.id;

            const taskClientsId =
                await resolveFieldId(client, task.form_id, FIELD_CODES.TASK_CLIENTS) ||
                SD_FIELD_IDS.clients;

            log(`Hook check: externalId=${externalId}, taskClientsId=${taskClientsId}, channel=${JSON.stringify(lastComment.channel)}`);

            // Create/link client card only when we have a real external channel ID
            if (externalId && taskClientsId && !clientsLink?.task_id) {
                const hookRes = await findOrCreateClientHook(
                    client,
                    task,
                    taskClientsId,
                    ctx.senderName,
                    externalId,
                    effectiveChannelType  // use effectiveChannelType (includes lastComment.channel fallback)
                );
                log(`Hook result: length=${hookRes.length}`);
                hookFieldUpdates.push(...hookRes);
            } else if (!externalId) {
                log(`Hook: no external channel ID — skipping client card creation`);
            }

            // Always activate zapusk_bota for external channels (MAX/Telegram)
            const zapuskId =
                await resolveFieldId(client, task.form_id, FIELD_CODES.START_BOT_CHECKBOX) ||
                SD_FIELD_IDS.zapusk;
            log(`zapuskId=${zapuskId}`);

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
        const isExternalSource = EXTERNAL_CHANNELS.includes(lastComment.channel?.type || "");

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

        if (shouldSpeakConversationally && wantsHuman(userMessage)) {
            return await dispatchReply(client, taskId, request.access_token, escalateToHuman(ctx, `user requested human: "${userMessage}"`));
        }

        const curOperator = contactName(await getVal(client, task, FIELD_CODES.OPERATOR, client));
        const curResponsible = contactName(await getVal(client, task, FIELD_CODES.RESPONSIBLE, client));
        const curStatus = statusName(await getVal(client, task, FIELD_CODES.STATUS, client));
        const curPriority = statusName(await getVal(client, task, FIELD_CODES.PRIORITY, client));
        const curTaskType = statusName(await getVal(client, task, FIELD_CODES.TASK_TYPE, client));

        if (curOperator && curOperator !== state.prev_operator) {
            if (!state.prev_operator) {
                notifications.push(`В Вашу задачу назначен Оператор обращения: ${curOperator}`);
            } else {
                notifications.push(`По Вашей задаче изменился Оператор, теперь с Вами будет работать: ${curOperator}`);
            }
        }

        if (curResponsible && curResponsible !== state.prev_responsible) {
            if (!state.prev_responsible) {
                notifications.push(`Вам назначен инженер: ${curResponsible}`);
            } else {
                notifications.push(`По Вашей задаче изменился инженер, теперь с Вами будет работать: ${curResponsible}`);
            }
        }

        if (curStatus && curStatus !== state.prev_status) {
            notifications.push(`Статус задачи изменён на: "${curStatus}"`);
        }

        if (curPriority && curPriority !== state.prev_priority && state.prev_priority) {
            notifications.push(`Приоритет по заявке изменён с "${state.prev_priority}" на "${curPriority}"`);
        }

        if (curTaskType && curTaskType !== state.prev_task_type && state.prev_task_type) {
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
            state.step = "WAITING_TASK_TYPE";
            state.pending_selection = undefined;
            state.options = undefined;

            let msg = notifications.length > 0 ? notifications.join("\n") + "\n\n" : "";

            msg += `Пока мы с Вами ждём специалиста, уточните, пожалуйста, класс Вашего обращения\n`;
            msg += `(это поможет нам быстрее выбрать для Вас квалифицированного инженера):\n\n`;

            const textMsg =
                msg +
                `1. Консультация\n` +
                `2. Нужна удалённая помощь инженера\n` +
                `3. Необходим выезд специалиста!`;

            const reqFormattedText = channel?.type === "mobile_app"
                ? msg.replace(/\n/g, "<br>") +
                `<button>1. Консультация</button><br>` +
                `<button>2. Нужна удалённая помощь инженера</button><br>` +
                `<button>3. Необходим выезд специалиста!</button>`
                : undefined;

            const updates: any[] = [];
            pushStateUpdate(updates, stateFieldId, state);

            return await dispatchReply(client, taskId, request.access_token, reply(textMsg, channel, updates, undefined, reqFormattedText));
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