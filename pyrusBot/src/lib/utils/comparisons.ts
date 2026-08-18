/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  СРАВНЕНИЕ И КОПИРОВАНИЕ ЗНАЧЕНИЙ ПОЛЕЙ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Зависимости при вставке в Pyrus: нет.
 *
 *  `same_value` решает, нужно ли вообще писать значение в задачу. Каждая запись
 *  порождает комментарий в ленте и новый вызов хука — бот, пишущий то же самое
 *  значение повторно, спамит участников и рискует упереться в лимит
 *  «10 запусков за 10 секунд».
 *
 *  Имена оставлены в snake_case намеренно: код серверных ботов переносится
 *  между этим репозиторием и редактором Pyrus копированием, а в шаблонных
 *  ботах Pyrus эти функции называются именно так.
 */

/** Минимум от поля Pyrus, нужный для сравнения. `FormField` подходит структурно. */
export interface ComparableField {
  type: string;
  value?: any;
}

/**
 * Глубокое копирование значения, включая `Date` и вложенные структуры.
 * Возвращает значение, не связанное с исходным по ссылке: правка копии
 * не должна менять то, что бот собирается сравнивать с оригиналом.
 */
export function copy_by_value<T>(value: T): T {
  if (value === null) return null as unknown as T;
  if (value === undefined) return undefined as unknown as T;
  if (typeof value !== "object") return value;
  if (value instanceof Date) return new Date(value.getTime()) as unknown as T;
  if (Array.isArray(value)) return value.map(item => copy_by_value(item)) as unknown as T;

  const result = Object.create(Object.getPrototypeOf(value));
  for (const key of Object.keys(value as object)) {
    result[key] = copy_by_value((value as any)[key]);
  }
  return result;
}

/** Набор строк для сравнения без учёта порядка. */
function sameStringSet(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map(String).slice().sort();
  const right = b.map(String).slice().sort();
  return left.every((v, i) => v === right[i]);
}

function asDate(value: any): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Совпадают ли значения двух полей одного типа.
 *
 * Возвращает строку с причиной, если сравнение невозможно, — молчаливый `false`
 * заставил бы бота переписывать поле на каждом запуске.
 *
 * Отличия от шаблонной реализации Pyrus, сделанные намеренно:
 *  - `file` больше не проваливается в ветку `table`. В оригинале у `case 'file'`
 *    нет `return`, поэтому файлы сравнивались логикой таблиц и любые два набора
 *    равной длины считались одинаковыми — замена вложения не замечалась.
 *  - входные поля не мутируются. Оригинал присваивал `old_field.value = 'unchecked'`
 *    прямо в переданный объект, то есть сравнение меняло задачу.
 */
export function same_value(old_field: ComparableField, new_field: ComparableField): boolean | string {
  if (old_field.type !== new_field.type) return "Сравнение разных типов не поддерживается";

  const type = new_field.type;
  const oldValue = old_field.value;
  const newValue = new_field.value;

  // У галочки и мультивыбора «пусто» и «ничего не выбрано» — одно и то же,
  // поэтому общая проверка на null для них не применяется.
  if (type !== "checkmark" && type !== "multiple_choice") {
    const oldEmpty = oldValue === null || oldValue === undefined;
    const newEmpty = newValue === null || newValue === undefined;
    if (oldEmpty !== newEmpty) return false;
    if (oldEmpty && newEmpty) return true;
  }

  switch (type) {
    case "text":
    case "number":
    case "money":
    case "phone":
    case "email":
    case "time":
      return newValue === oldValue;

    case "checkmark": {
      const left = oldValue === "checked" || oldValue === true ? "checked" : "unchecked";
      const right = newValue === "checked" || newValue === true ? "checked" : "unchecked";
      return left === right;
    }

    case "multiple_choice": {
      const left: any[] = oldValue?.choice_names ?? [];
      const right: any[] = newValue?.choice_names ?? [];
      // Выбранное «пустое» значение (choice_id 0) равносильно отсутствию значения.
      const leftEmpty = !oldValue || left.length === 0 || (oldValue.choice_ids ?? []).includes(0);
      const rightEmpty = !newValue || right.length === 0 || (newValue.choice_ids ?? []).includes(0);
      if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty;
      return sameStringSet(left, right);
    }

    case "catalog": {
      const left: any[] = (oldValue?.rows ?? []).map((r: any[]) => r?.[0]);
      const right: any[] = (newValue?.rows ?? []).map((r: any[]) => r?.[0]);
      return sameStringSet(left, right);
    }

    case "form_link":
      return String(oldValue?.task_id) === String(newValue?.task_id);

    case "date":
    case "due_date":
    case "due_date_time": {
      const left = asDate(oldValue);
      const right = asDate(newValue);
      if (!left || !right) return "Значение даты не разбирается";
      return left.getTime() === right.getTime();
    }

    case "person":
      return String(oldValue?.id ?? "") === String(newValue?.id ?? "");

    case "file": {
      const left: any[] = Array.isArray(oldValue) ? oldValue : [];
      const right: any[] = Array.isArray(newValue) ? newValue : [];
      if (left.length !== right.length) return false;
      // Файл без id ещё не загружен в Pyrus — считать его совпадающим нельзя.
      if (right.some(f => f?.id === null || f?.id === undefined)) return false;
      return sameStringSet(left.map(f => f?.id), right.map(f => f?.id));
    }

    case "table": {
      const left: any[] = Array.isArray(oldValue) ? oldValue : [];
      const right: any[] = Array.isArray(newValue) ? newValue : [];
      if (left.length !== right.length) return false;
      for (const row of right) {
        if (row?.delete || row?.added_now) return false;
        const oldRow = left.find(x => x?.row_id === row?.row_id);
        if (!oldRow) return false;
        for (const cell of row?.cells ?? []) {
          const oldCell = (oldRow.cells ?? []).find((x: any) => x?.id === cell?.id);
          if (!oldCell) return false;
          if (same_value(oldCell, cell) !== true) return false;
        }
      }
      return true;
    }

    default:
      return `Тип поля «${type}» не поддерживается сравнением`;
  }
}
