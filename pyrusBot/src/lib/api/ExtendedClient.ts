/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  РАСШИРЕННЫЙ КЛИЕНТ PYRUS — кэш и безопасные обёртки
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Зависимости при вставке в Pyrus: `models/FormModel.ts`.
 *
 *  Зачем нужен поверх `PyrusApiClient`:
 *
 *  1. **Кэш на время одного запуска.** У бота 60 секунд (1 секунда на бесплатном
 *     тарифе) и лимит 10 запусков за 10 секунд. Повторно запрашивать ту же форму
 *     на каждом шаге диалога — верный способ не уложиться.
 *  2. **Ошибка не должна ронять диалог.** Штатный клиент бросает `ApiError`;
 *     здесь недоступность справочника возвращается как `null`, а бот решает сам,
 *     продолжать или звать оператора.
 *  3. **Ошибки копятся, а не спамят.** Одна и та же ошибка в одной задаче
 *     отправляется один раз за запуск.
 */

import { PyrusApiClient } from "pyrus-api";
import { FormModel } from "../models/FormModel";

export type Logger = (msg: string) => void;

export class ExtendedClient extends PyrusApiClient {
  private readonly formCache = new Map<number, any>();
  private readonly formModelCache = new Map<number, FormModel>();
  private readonly catalogCache = new Map<number, any[]>();
  private readonly taskCache = new Map<number, any>();
  private readonly errors = new Map<number, Set<string>>();

  constructor(
    token: string,
    /** `request.user_id` — чтобы бот не реагировал на собственные комментарии. */
    readonly botUserId?: number,
    private readonly log: Logger = () => {}
  ) {
    super(token);
  }

  /** Сырая схема формы. `null`, если форма недоступна. */
  async getForm(formId: number): Promise<any | null> {
    if (!formId) return null;
    if (this.formCache.has(formId)) return this.formCache.get(formId);
    try {
      const form = await this.forms.get({ id: formId });
      this.formCache.set(formId, form ?? null);
      return form ?? null;
    } catch (e: any) {
      this.log(`Форма ${formId} недоступна: ${e?.message || e}`);
      this.formCache.set(formId, null);
      return null;
    }
  }

  /**
   * Плоский индекс полей формы. При недоступности API схема восстанавливается
   * из переданных полей задачи — бот продолжает работать вслепую, но работать.
   */
  async getFormModel(formId: number, taskFields: any[] = []): Promise<FormModel> {
    const cached = this.formModelCache.get(formId);
    if (cached) return cached;

    // Через getForm, а не через FormModel.load: load ходит в API напрямую и
    // мимо кэша, из-за чего одна и та же форма запрашивалась дважды за запуск.
    const form = await this.getForm(formId);
    const model = form?.fields?.length
      ? new FormModel(form.fields, "form_api")
      : new FormModel(taskFields || [], "task_fallback");

    this.log(
      model.source === "form_api"
        ? `Схема формы ${formId}: ${model.byId.size} полей (из API), с кодами: ${model.byCode.size}`
        : `Схема формы ${formId} восстановлена из задачи: ${model.byId.size} полей, с кодами: ${model.byCode.size}`
    );

    this.formModelCache.set(formId, model);
    return model;
  }

  /** Строки справочника. Пустой результат тоже кэшируется — второй раз не спрашиваем. */
  async getCatalogItems(catalogId: number): Promise<any[]> {
    if (!catalogId) return [];
    const cached = this.catalogCache.get(catalogId);
    if (cached) return cached;
    try {
      const response = await this.catalogs.get({ id: catalogId });
      const items = response?.items ?? [];
      this.catalogCache.set(catalogId, items);
      return items;
    } catch (e: any) {
      this.log(`Каталог ${catalogId} недоступен: ${e?.message || e}`);
      this.catalogCache.set(catalogId, []);
      return [];
    }
  }

  /** Задача с комментариями. `null`, если недоступна. */
  async getTask(taskId: number, refresh = false): Promise<any | null> {
    if (!refresh && this.taskCache.has(taskId)) return this.taskCache.get(taskId);
    try {
      const response: any = await this.tasks.get({ id: taskId });
      const task = response?.task ?? response ?? null;
      this.taskCache.set(taskId, task);
      return task;
    } catch (e: any) {
      this.log(`Задача ${taskId} недоступна: ${e?.message || e}`);
      return null;
    }
  }

  /**
   * Комментарий, который не роняет бота.
   * Возвращает `false`, если Pyrus отказал: у вызывающего остаётся выбор —
   * попробовать иначе или молча закончить, но не упасть с необработанным исключением.
   */
  async safeComment(taskId: number, comment: any): Promise<boolean> {
    try {
      await this.tasks.addComment(taskId, comment);
      this.taskCache.delete(taskId); // задача изменилась — кэш устарел
      return true;
    } catch (e: any) {
      this.log(`Не удалось прокомментировать задачу ${taskId}: ${e?.message || e}`);
      return false;
    }
  }

  /** Накопить ошибку для задачи. Дубликаты внутри одного запуска схлопываются. */
  addError(taskId: number, error: string): void {
    const bucket = this.errors.get(taskId) ?? new Set<string>();
    bucket.add(error);
    this.errors.set(taskId, bucket);
    this.log(`Ошибка в задаче ${taskId}: ${error}`);
  }

  hasErrors(): boolean {
    return this.errors.size > 0;
  }

  /**
   * Разослать накопленные ошибки внутренними комментариями.
   * Комментарий идёт без `channel`, поэтому клиент во внешнем канале его не видит.
   */
  async flushErrors(): Promise<void> {
    for (const [taskId, messages] of this.errors) {
      const text = Array.from(messages).join("\n");
      await this.safeComment(taskId, { text: text.slice(0, 10000) });
    }
    this.errors.clear();
  }
}
