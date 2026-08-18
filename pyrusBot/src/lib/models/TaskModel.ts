/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  МОДЕЛЬ ЗНАЧЕНИЙ ЗАДАЧИ — плоская карта id → значение
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Зависимости при вставке в Pyrus: `models/FormModel.ts` (только для `getByCode`).
 *
 *  Обход зеркалит `FormModel`, но по данным задачи, а не по схеме: у поля-заголовка
 *  дети лежат в `value.fields`, у группы `value` — сам массив полей.
 */

import { FormModel } from "./FormModel";

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

  /**
   * Локально применить только что записанное значение.
   * Нужно, чтобы условия видимости следующего шага считались уже с учётом
   * свежего ответа: задача в Pyrus обновится позже, а решение принимается сейчас.
   */
  set(id: number, value: any): void {
    this.values.set(Number(id), value);
  }

  /** Все известные значения — для отладки и для сравнения состояний. */
  entries(): Array<[number, any]> {
    return Array.from(this.values.entries());
  }
}
