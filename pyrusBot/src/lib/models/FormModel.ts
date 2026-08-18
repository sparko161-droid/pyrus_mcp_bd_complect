/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  МОДЕЛЬ СХЕМЫ ФОРМЫ — плоский индекс всех полей, включая вложенные
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Зависимости при вставке в Pyrus: `utils/values.ts` (тип ChoiceOption).
 *
 *  Pyrus не отдаёт поля формы плоским списком. Поле может лежать:
 *    - внутри заголовка (`title`) или группы (`group`);
 *    - в колонках таблицы (`info.columns`);
 *    - быть привязанным к варианту ответа (`info.options[].fields`);
 *    - а в данных задачи дети заголовка лежат в `value.fields`, а не в `fields`.
 *
 *  Перебор ТОЛЬКО верхнего уровня `task.fields` — источник самой дорогой ошибки
 *  в этом проекте: бот «Заказы тортов» не видел техническое поле состояния,
 *  вложенное в заголовок, читал состояние как пустое и бесконечно повторял
 *  один и тот же вопрос. Запись при этом работала — Pyrus принимает плоский id
 *  вложенного поля, — поэтому в форме состояние выглядело корректным.
 */

import { ChoiceOption } from "../utils/values";

export interface FieldSchema {
  id: number;
  code?: string;
  name: string;
  type: string;
  /** Ближайший контейнер: заголовок, группа или таблица. */
  parentId?: number;
  options?: ChoiceOption[];
  catalogId?: number;
  multiple: boolean;
  visibility?: any;
  required: boolean;
}

/** Минимум от клиента Pyrus, нужный для чтения каталогов. `PyrusApiClient` подходит структурно. */
export interface CatalogReader {
  catalogs: { get(request: { id: number }): Promise<{ items?: any[] } | any> };
}

/** Откуда взята схема: из API форм или восстановлена из самой задачи. */
export type FormModelSource = "form_api" | "task_fallback";

export class FormModel {
  readonly byId = new Map<number, FieldSchema>();
  readonly byCode = new Map<string, FieldSchema>();
  private readonly catalogCache = new Map<number, any[]>();

  constructor(rawFields: any[], readonly source: FormModelSource = "form_api") {
    this.walk(rawFields, undefined);
  }

  /**
   * Схема формы: сначала API форм, при ошибке — восстановление из самой задачи.
   * В задаче приходят и `code`, и `type`, и `visibility_condition`, поэтому
   * фоллбэк рабочий: бот продолжает отвечать, даже когда схема недоступна.
   */
  static async load(
    client: { forms: { get(request: { id: number }): Promise<any> } },
    formId: number,
    taskFields: any[],
    log: (msg: string) => void = () => {}
  ): Promise<FormModel> {
    if (formId) {
      try {
        const formDef = await client.forms.get({ id: formId });
        if (formDef?.fields?.length) {
          const model = new FormModel(formDef.fields, "form_api");
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
        required: Boolean(info.is_required ?? f.is_required)
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
  async optionsFor(client: CatalogReader, schema: FieldSchema, limit = 20): Promise<string[]> {
    if (schema.type === "checkmark") return ["Да", "Нет"];

    if (schema.options?.length) {
      return schema.options
        .filter(o => o && o.choice_value && o.choice_value !== "Не выбрано" && !o.deleted)
        .slice(0, 15)
        .map(o => o.choice_value);
    }

    if (schema.type === "catalog" && schema.catalogId) {
      const items = await this.catalogItems(client, schema.catalogId);
      return items.slice(0, limit).map(i => i?.values?.[0]).filter(Boolean);
    }

    return [];
  }

  /**
   * Элементы каталога с кэшем на время одного запуска скрипта.
   * Кэшируется и пустой результат: недоступный каталог не должен опрашиваться
   * повторно на каждом шаге — у бота всего 60 секунд (1 секунда на бесплатном тарифе).
   */
  async catalogItems(
    client: CatalogReader,
    catalogId: number,
    log: (msg: string) => void = () => {}
  ): Promise<any[]> {
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
