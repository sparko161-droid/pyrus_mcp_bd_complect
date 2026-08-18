/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ЗНАЧЕНИЯ ПОЛЕЙ: ПУСТО / ИДЕНТИФИКАТОР ВЫБОРА / ОТОБРАЖЕНИЕ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Зависимости при вставке в Pyrus: нет.
 *
 *  Pyrus отдаёт значение поля десятком разных форм: строкой, числом, объектом
 *  с `choice_ids`, объектом с `item_ids`, массивом строк таблицы. Эти три
 *  функции — единственное место, где такое разнообразие разбирается.
 */

/** Опция выбора в схеме поля Pyrus. */
export interface ChoiceOption {
  choice_id: number;
  choice_value: string;
  deleted?: boolean;
}

/**
 * Значение отсутствует с точки зрения бота.
 *
 * Снятая галочка считается пустой намеренно: `unchecked` — это состояние по
 * умолчанию, гость его не подтверждал, и спрашивать про такое поле надо.
 */
export function isEmptyValue(value: any, type: string): boolean {
  if (value === undefined || value === null || value === "") return true;
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

/** Идентификатор выбранного варианта или элемента каталога — для сравнения в условиях видимости. */
export function valueChoiceId(value: any): string {
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value.choice_ids) && value.choice_ids.length) return String(value.choice_ids[0]);
  if (value.choice_id !== undefined) return String(value.choice_id);
  if (Array.isArray(value.item_ids) && value.item_ids.length) return String(value.item_ids[0]);
  if (value.item_id !== undefined) return String(value.item_id);
  return "";
}

/**
 * Человекочитаемое представление значения — для сравнения по тексту и для логов.
 *
 * `options` передаются отдельно, потому что Pyrus не всегда кладёт `choice_names`
 * в значение: у поля выбора в задаче может прийти только `choice_id`, а расшифровка
 * лежит в схеме формы.
 */
export function valueDisplay(value: any, options?: ChoiceOption[]): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(v => valueDisplay(v, options)).join(", ");

  if (typeof value === "object") {
    if (Array.isArray(value.choice_names) && value.choice_names.length) return String(value.choice_names[0]);
    const choiceId = valueChoiceId(value);
    if (choiceId && options?.length) {
      const opt = options.find(o => String(o.choice_id) === choiceId);
      if (opt) return opt.choice_value;
    }
    if (Array.isArray(value.values) && value.values.length) return String(value.values[0]);
    if (Array.isArray(value.item_names) && value.item_names.length) return String(value.item_names[0]);
    if (choiceId) return choiceId;
  }
  return "";
}
