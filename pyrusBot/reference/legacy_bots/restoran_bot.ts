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
  STATE:              "tehnikal_text",
  RESTORAN:           "restoran",
  
  // Access data sync fields
  HOST_RMS:           "host_rms",
  HOST_CHAIN:         "host_chain",
  DOST_TABLE_VIZUAL:  "dost_table_vizual",
  DOST_TABLE:         "dost_table",
  IIKO_LOGIN:         "iiko_login",
  IIKO_PASS:          "iiko_pass",
  IIKO_RMS:           "iiko_rms",
  IIKO_CHAIN:         "iiko_chain",
  
  DOST_NAME:          "dost_name",
  DOST_TYPE:          "dost_type",
  DOST_LOGIN:         "dost_login",
  DOST_PASS:          "dost_pass",
  DOST_HOST:          "dost_host",
} as const;

const FORM_RESTAURANT_ID     = 1310341;
const FORM_SD_ID             = 1463678;

const SYNC_TARGET_FORMS = [FORM_SD_ID];

/** 
 * Map of Form ID -> { field_id, code } for the 'restoran' task link.
 * Used for both extraction and search filtering.
 */
const RESTORAN_FIELD_MAP: Record<number, { id: number; code?: string }> = {
  [FORM_SD_ID]:             { id: 6, code: "restoran" },
};

const DEBUG_ENABLED = false;

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

interface BotContext {
  client:           PyrusApiClient;
  task:             any;
}

// Debug logging (slim — only tracked fields)
let logs: string[] = [];
function log(msg: string) {
  if (!DEBUG_ENABLED) return;
  const time = new Date().toISOString().split('T')[1].split('.')[0];
  logs.push(`[${time}] ${msg}`);
  console.log(`[${time}] ${msg}`);
}

// ═══════════════════════════════════════════════════════════════
//  CACHING & HELPERS
// ═══════════════════════════════════════════════════════════════

// Cache for field ID mappings: formId -> { code -> id }
const FORM_FIELD_MAP_CACHE: Record<number, Record<string, number>> = {};
const FIELD_ID_CACHE: Record<string, any> = {};

async function getFormFieldMap(client: PyrusApiClient, formId: number): Promise<Record<string, number>> {
  if (FORM_FIELD_MAP_CACHE[formId]) return FORM_FIELD_MAP_CACHE[formId];
  
  try {
    const response = await client.forms.get({ id: formId });
    const map: Record<string, number> = {};
    
    const traverse = (fs: any[], depth = 0) => {
      for (const f of fs) {
        const code = f.code || f.info?.code;
        if (code) {
          map[code] = f.id;
        }
        
        // Recurse into: schema children (info.fields), table columns (info.columns),
        // group value arrays, and any other array-of-objects child list
        const nested =
          f.fields ||
          f.info?.fields ||
          f.info?.columns ||
          (f.type === 'group' && Array.isArray(f.value) ? f.value : undefined) ||
          (Array.isArray(f.value) && f.value.length > 0 && typeof f.value[0] === 'object' ? f.value : undefined);
        if (Array.isArray(nested)) traverse(nested, depth + 1);
      }
    };
    
    if (response.fields) traverse(response.fields);
    FORM_FIELD_MAP_CACHE[formId] = map;
    return map;
  } catch (e: any) {
    log(`Mapping Error: Failed to fetch schema for form ${formId}: ${e.message}`);
    return {};
  }
}

/** Resolve a field ID by its code in a different form's schema */
async function resolveFieldIdInForm(client: PyrusApiClient, formId: number, code: string): Promise<number | undefined> {
  // Check hardcoded map first (user provided)
  if (code === FIELD_CODES.RESTORAN && RESTORAN_FIELD_MAP[formId]) {
    return RESTORAN_FIELD_MAP[formId].id;
  }
  const map = await getFormFieldMap(client, formId);
  return map[code];
}

// ═══════════════════════════════════════════════════════════════
//  ACCESS DATA SYNC
// ═══════════════════════════════════════════════════════════════

interface AccessData {
  host_rms?:   string;
  host_chain?: string;
  dost_table?: any[];
  dost_table_vizual?: string;
  iiko_login?: string;
  iiko_pass?:  string;
  iiko_rms?:   string;
  iiko_chain?: string;
}

/** Extract access fields from task fields array into structured object */
async function extractAccessData(client: PyrusApiClient, task: any, overrideFormId?: number): Promise<AccessData> {
  const fields = task.fields || [];
  const formId = overrideFormId || task.form_id;
  if (!formId) {
    return {};
  }
  const fieldMap = await getFormFieldMap(client, formId);
  const data: AccessData = {};

  const getVal = (code: string) => {
    const id = fieldMap[code];
    return id ? findFieldById(fields, id)?.value : undefined;
  };

  data.host_rms   = getVal(FIELD_CODES.HOST_RMS);
  data.host_chain = getVal(FIELD_CODES.HOST_CHAIN);
  data.iiko_login = getVal(FIELD_CODES.IIKO_LOGIN);
  data.iiko_pass  = getVal(FIELD_CODES.IIKO_PASS);
  data.iiko_rms   = getVal(FIELD_CODES.IIKO_RMS);
  data.iiko_chain = getVal(FIELD_CODES.IIKO_CHAIN);
  data.dost_table_vizual = getVal(FIELD_CODES.DOST_TABLE_VIZUAL);
  
  const tableId = fieldMap[FIELD_CODES.DOST_TABLE];
  const tableField = tableId ? findFieldById(fields, tableId) : undefined;
  const tableRaw = tableField?.value;

  if (Array.isArray(tableRaw) && tableRaw.length > 0) {
    // For table cells, we need the column mapping from the schema
    const response = await client.forms.get({ id: formId });
    const schemaTable = findFieldById(response.fields || [], tableId!);
    const colMap: Record<string, number> = {};
    (schemaTable?.info?.columns || []).forEach((c: any) => {
        const code = c.code || c.info?.code;
        if (code) colMap[code] = c.id;
    });

    data.dost_table = tableRaw.map(row => {
        const cells: any[] = [];
        (row.cells || []).forEach((c: any) => {
           for (const [code, id] of Object.entries(colMap)) {
               if (c.id == id) {
                   cells.push({ value: c.value, code });
                   break;
               }
           }
        });
        return { cells };
    });
  }

  return data;
}

/** Resolve a choice ID by its string label in a specific field/form */
async function resolveChoiceId(client: PyrusApiClient, formId: number, fieldCode: string, choiceLabel: string): Promise<number | undefined> {
  if (!choiceLabel) return undefined;
  
  const cacheKey = `choice:${formId}:${fieldCode}:${choiceLabel}`;
  if (FIELD_ID_CACHE[cacheKey]) return FIELD_ID_CACHE[cacheKey];

  try {
    const response = await client.forms.get({ id: formId });
    const field = findField(response?.fields || [], fieldCode);
    if (field?.info?.options) {
      const option = field.info.options.find((opt: any) => opt.choice_value === choiceLabel || opt.choice_names?.includes(choiceLabel));
      if (option) {
        FIELD_ID_CACHE[cacheKey] = option.choice_id;
        return option.choice_id;
      }
    }
  } catch (e: any) {
    log(`Choice Resolve Error (form ${formId}, field ${fieldCode}): ${e.message}`);
  }
  return undefined;
}

/** Compare two AccessData objects for equality */
function isAccessDataEqual(a: AccessData, b: AccessData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Convert AccessData to Pyrus field updates array */
async function accessDataToUpdates(client: PyrusApiClient, data: AccessData, targetTask: any, filterCodes?: string[], overrideFormId?: number): Promise<any[]> {
  const formId = overrideFormId || targetTask.form_id;
  if (!formId) {
    return [];
  }
  const updates: any[] = [];
  const fieldsMap = [
    { code: FIELD_CODES.HOST_RMS,   val: data.host_rms },
    { code: FIELD_CODES.HOST_CHAIN, val: data.host_chain },
    { code: FIELD_CODES.IIKO_LOGIN, val: data.iiko_login },
    { code: FIELD_CODES.IIKO_PASS,  val: data.iiko_pass },
    { code: FIELD_CODES.IIKO_RMS,   val: data.iiko_rms },
    { code: FIELD_CODES.IIKO_CHAIN, val: data.iiko_chain },
    { code: FIELD_CODES.DOST_TABLE_VIZUAL, val: data.dost_table_vizual },
  ];
  
  const fieldMap = await getFormFieldMap(client, formId);

  const isEmpty = (val: any) => {
    if (val === undefined || val === null || val === "") return true;
    if (Array.isArray(val) && val.length === 0) return true;
    return false;
  };

  for (const f of fieldsMap) {
    if (filterCodes && !filterCodes.includes(f.code)) continue;

    if (!isEmpty(f.val)) {
      if (fieldMap[f.code]) {
        updates.push({ code: f.code, value: f.val });
      }
    }
  }
  
  if (data.dost_table && !isEmpty(data.dost_table) && (!filterCodes || filterCodes.includes(FIELD_CODES.DOST_TABLE))) {
    if (fieldMap[FIELD_CODES.DOST_TABLE]) {
      let targetColumnCodes: string[] = [];
      try {
        const response = await client.forms.get({ id: formId });
        const tableField = findField(response?.fields || [], FIELD_CODES.DOST_TABLE);
        targetColumnCodes = (tableField?.info?.columns || []).map((c: any) => c.code || c.info?.code).filter(Boolean);
      } catch (e: any) {
        log(`Schema Warning: Failed to fetch table columns for form ${formId}: ${e.message}`);
      }

      let existingRowIds: number[] = [];
      const targetTableField = findFieldById(targetTask.fields || [], fieldMap[FIELD_CODES.DOST_TABLE]);
      if (targetTableField && Array.isArray(targetTableField.value)) {
        existingRowIds = targetTableField.value.map((r: any) => r.row_id).filter((id: any) => id !== undefined);
      }

      const cleanRows = [];
      let nextNewRowId = existingRowIds.length > 0 ? Math.max(...existingRowIds) + 1 : 0;
      let rowIndex = 0;

      for (const sourceRow of data.dost_table) {
        const targetCells = [];
        for (const sourceCell of (sourceRow.cells || [])) {
          if (!targetColumnCodes.includes(sourceCell.code)) continue;

          let finalValue = sourceCell.value;

          // Special logic for Choice columns (like dost_type)
          if (sourceCell.code === FIELD_CODES.DOST_TYPE && sourceCell.value) {
            const label = typeof sourceCell.value === 'string' ? sourceCell.value : sourceCell.value.choice_value;
            const choiceId = await resolveChoiceId(client, formId, FIELD_CODES.DOST_TYPE, label);
            if (choiceId) {
                finalValue = { choice_id: choiceId };
            } else if (typeof sourceCell.value === 'object' && sourceCell.value.choice_id) {
                finalValue = { choice_id: sourceCell.value.choice_id };
            }
          }

          targetCells.push({ code: sourceCell.code, value: finalValue });
        }
        if (targetCells.length > 0) {
          const rowId = rowIndex < existingRowIds.length ? existingRowIds[rowIndex] : nextNewRowId++;
          cleanRows.push({ row_id: rowId, cells: targetCells });
          rowIndex++;
        }
      }
      
      for (let i = rowIndex; i < existingRowIds.length; i++) {
        cleanRows.push({ row_id: existingRowIds[i], delete: true });
      }
      
      if (cleanRows.length > 0) {
        updates.push({ code: FIELD_CODES.DOST_TABLE, value: cleanRows });
      }
    }
  }
  
  return updates;
}

function formatValue(val: any): string {
  if (val === undefined || val === null || val === "") return "пусто";
  if (Array.isArray(val)) return `[${val.length} строк]`;
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

/** Sync access data to restaurant card and all open associated tasks. */
async function broadcastAccessDataUpdates(ctx: BotContext, restoranId: number, data: AccessData, excludeTaskId: number, authorName: string, changedFieldsCodes: string[]) {
  if (changedFieldsCodes.length === 0) {
    return;
  }

  const map: Record<string, string> = {
    [FIELD_CODES.HOST_RMS]:   "RMS Хостинг",
    [FIELD_CODES.HOST_CHAIN]: "Chain Хостинг",
    [FIELD_CODES.DOST_TABLE]: "Таблица доступов",
    [FIELD_CODES.IIKO_LOGIN]: "iiko Логин",
    [FIELD_CODES.IIKO_PASS]:  "iiko Пароль",
    [FIELD_CODES.IIKO_RMS]:   "iiko RMS",
    [FIELD_CODES.IIKO_CHAIN]: "iiko Chain",
    [FIELD_CODES.DOST_TABLE_VIZUAL]: "Доступы (текст)",
  };

  const CODE_TO_KEY: Record<string, keyof AccessData> = {
    [FIELD_CODES.HOST_RMS]:   "host_rms",
    [FIELD_CODES.HOST_CHAIN]: "host_chain",
    [FIELD_CODES.DOST_TABLE]: "dost_table",
    [FIELD_CODES.IIKO_LOGIN]: "iiko_login",
    [FIELD_CODES.IIKO_PASS]:  "iiko_pass",
    [FIELD_CODES.IIKO_RMS]:   "iiko_rms",
    [FIELD_CODES.IIKO_CHAIN]: "iiko_chain",
    [FIELD_CODES.DOST_TABLE_VIZUAL]: "dost_table_vizual",
  };

  const buildAuditMessage = (existingData: AccessData) => {
    const lines = [];
    for (const code of changedFieldsCodes) {
      const key = CODE_TO_KEY[code];
      if (!key) continue;
      const oldVal = existingData[key];
      const newVal = data[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        lines.push(`- ${map[code]}: было "${formatValue(oldVal)}", стало "${formatValue(newVal)}"`);
      }
    }
    if (lines.length === 0) return null;
    return `Сотрудник ${authorName} синхронизировал данные из задачи #${excludeTaskId}:\n` + lines.join('\n');
  };

  // 1. Update Restaurant Card (if not already updating from it)
  if (restoranId !== excludeTaskId) {
    try {
      const restTask = await ctx.client.tasks.get({ id: restoranId });
      if (restTask?.task) {
        const existingData = await extractAccessData(ctx.client, restTask.task, FORM_RESTAURANT_ID);
        const auditMsg = buildAuditMessage(existingData);
        if (auditMsg) {
          const cardUpdates = await accessDataToUpdates(ctx.client, data, restTask.task, changedFieldsCodes, FORM_RESTAURANT_ID);
          if (cardUpdates.length > 0) {
            await ctx.client.tasks.addComment(restoranId, { 
              text: auditMsg,
              field_updates: cardUpdates 
            });
          }
        }
      }
    } catch (e: any) {
      log(`Card Sync FATAL: ${e.message}`);
    }
  }

  // 2. Update other open tasks (SD and Implementation)
  const formsToSearch = [...SYNC_TARGET_FORMS];
  if (ctx.task.form_id && !formsToSearch.includes(ctx.task.form_id) && ctx.task.form_id !== FORM_RESTAURANT_ID) {
    formsToSearch.push(ctx.task.form_id);
  }
  const uniqueForms = Array.from(new Set(formsToSearch));

  for (const formId of uniqueForms) {
    try {
      const targetFieldId = await resolveFieldIdInForm(ctx.client, formId, FIELD_CODES.RESTORAN);
      if (!targetFieldId) continue;

      const searchRes = await ctx.client.forms.getTasks(formId!, {
        filters: [{ field_id: targetFieldId, operator_id: 1, values: [String(restoranId)] }]
      });

      if (searchRes.tasks) {
        for (const t of searchRes.tasks) {
          if (t.id === excludeTaskId) continue;
          
          const existingData = await extractAccessData(ctx.client, t, formId);
          if (isAccessDataEqual(existingData, data)) continue;

          const auditMsg = buildAuditMessage(existingData);
          if (auditMsg) {
            const updates = await accessDataToUpdates(ctx.client, data, t, changedFieldsCodes, formId);
            if (updates.length > 0) {
              await ctx.client.tasks.addComment(t.id, {
                text: auditMsg,
                field_updates: updates
              });
            }
          }
        }
      }
    } catch (e: any) {
      log(`Broadcast Error (form ${formId}): ${e.message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  UTILITY HELPERS
// ═══════════════════════════════════════════════════════════════

function findField(fields: any[], code: string): any {
  if (!fields || !Array.isArray(fields)) return undefined;
  const target = code.toLowerCase().trim();
  
  for (const f of fields) {
    const fCode = (f.code || f.info?.code || "").toLowerCase().trim();
    const fName = (f.name || f.info?.name || "").toLowerCase().trim();
    
    if (fCode === target || fName === target) return f;
    
    const nested = f.fields || f.info?.fields || f.info?.columns;
    if (Array.isArray(nested)) {
      const found = findField(nested, code);
      if (found) return found;
    }

    if (f.type === 'group' && Array.isArray(f.value)) {
      const found = findField(f.value, code);
      if (found) return found;
    }

    for (const key in f) {
      if (key === 'parent' || key === 'value') continue;
      const val = f[key];
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
        const found = findField(val, code);
        if (found) return found;
      }
    }
  }
  return undefined;
}

function findFieldById(fields: any[], id: number): any {
  if (!fields || !Array.isArray(fields)) return undefined;
  for (const f of fields) {
    if (f.id === id) return f;
    
    for (const key in f) {
      const val = f[key];
      if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
        const found = findFieldById(val, id);
        if (found) return found;
      } else if (val && typeof val === 'object' && key !== 'parent') {
        const nested = val.fields || val.info?.fields || val.info?.columns;
        if (Array.isArray(nested)) {
          const found = findFieldById(nested, id);
          if (found) return found;
        }
      }
    }
  }
  return undefined;
}

function getFieldId(task: any, code: string): number | undefined {
  if (code === FIELD_CODES.RESTORAN && task.form_id && RESTORAN_FIELD_MAP[task.form_id]) {
      return RESTORAN_FIELD_MAP[task.form_id].id;
  }
  const f = findField(task.fields, code);
  return f?.id;
}

function getFieldValue(task: any, code: string): any {
  if (!task || !task.fields) return undefined;

  if (code === FIELD_CODES.STATE) {
    const normal = findField(task.fields, code);
    if (normal?.value) return normal.value;

    const allFields = flattenFields(task.fields);
    for (const f of allFields) {
      if (typeof f.value === 'string' && f.value.includes('"prev_access_data"')) {
        return f.value;
      }
    }
  }

  if (code === FIELD_CODES.RESTORAN && task.form_id && RESTORAN_FIELD_MAP[task.form_id]) {
      const field = findFieldById(task.fields, RESTORAN_FIELD_MAP[task.form_id].id);
      if (field) return field.value;
  }

  const f = findField(task.fields, code);
  return f?.value;
}

function flattenFields(fields: any[]): any[] {
  let result: any[] = [];
  for (const f of fields) {
    result.push(f);
    const nested = f.fields || f.info?.fields || (f.type === 'group' && Array.isArray(f.value) ? f.value : undefined);
    if (Array.isArray(nested)) {
      result = result.concat(flattenFields(nested));
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
//  MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════

export default async function(request: BotHookRequest): Promise<BotHookResponse | null> {
  logs = [];
  let task = (request as any).task;
  if (!task) return null;

  const client = new PyrusApiClient(request.access_token);
  const taskId = task.id as number;
  const formId = task.form_id as number;
  const isRestaurantCard = formId === FORM_RESTAURANT_ID;

  log(`--- REQ Task:${taskId} Form:${formId} Type:${isRestaurantCard ? 'RESTAURANT_CARD' : 'SERVICE_TASK'} user_id:${request.user_id} ---`);

  try {
    const lastComment = task.comments?.[task.comments.length - 1] as TaskComment;
    if (!lastComment || lastComment.author?.id === request.user_id) {
      return null;
    }

    const authorName = `${lastComment.author?.first_name || ""} ${lastComment.author?.last_name || ""}`.trim() || "Сотрудник";

    const ctx: BotContext = { client, task };

    // Find which fields were changed
    const changedFieldIds = new Set<number>();
    const fieldMap = await getFormFieldMap(client, formId);

    if (task.comments && task.comments.length === 1) {
        // First comment (task creation) - consider all access fields as changed
        Object.values(fieldMap).forEach(id => changedFieldIds.add(id));
    } else if (lastComment && (lastComment.field_updates || (lastComment as any).changed_fields)) {
        const updates = lastComment.field_updates || (lastComment as any).changed_fields || [];
        updates.forEach((u: any) => changedFieldIds.add(u.id));
    }

    const TARGET_CODES = [
      FIELD_CODES.HOST_RMS, FIELD_CODES.HOST_CHAIN, FIELD_CODES.DOST_TABLE_VIZUAL,
      FIELD_CODES.DOST_TABLE, FIELD_CODES.IIKO_LOGIN, FIELD_CODES.IIKO_PASS,
      FIELD_CODES.IIKO_RMS, FIELD_CODES.IIKO_CHAIN,
      FIELD_CODES.DOST_NAME, FIELD_CODES.DOST_TYPE, FIELD_CODES.DOST_LOGIN,
      FIELD_CODES.DOST_PASS, FIELD_CODES.DOST_HOST
    ];

    const changedFieldsCodes: string[] = [];
    for (const code of TARGET_CODES) {
      const id = fieldMap[code];
      if (id && changedFieldIds.has(id)) {
        changedFieldsCodes.push(code);
      }
    }

    if (changedFieldsCodes.length > 0) {
      const curAccessData = await extractAccessData(client, task);
      const existingRestoran = getFieldValue(task, FIELD_CODES.RESTORAN);
      const restoranId = isRestaurantCard ? taskId : existingRestoran?.task_id;

      if (restoranId) {
          log(`Access data change detected in fields: [${changedFieldsCodes.join(', ')}]. Triggering broadcast...`);
          await broadcastAccessDataUpdates(ctx, restoranId, curAccessData, taskId, authorName, changedFieldsCodes);
      } else {
          log("Access data sync skip: no restaurant linked to this task.");
      }
    } else {
      log("Access data sync: no relevant field changes detected in this comment.");
    }

    const debugText = DEBUG_ENABLED && logs.length > 0 ? ("\n\n📝 ЖУРНАЛ ДЕЙСТВИЙ БОТА:\n" + logs.join("\n")) : "";
    if (debugText) {
        return { text: debugText } as any;
    }
    return null;

  } catch (err: any) {
    log(`FATAL ERROR: ${err.message}`);
    return { text: `⚠️ Системная ошибка бота (Синхронизация доступов)!\n\n${err.message}` } as any;
  }
}
