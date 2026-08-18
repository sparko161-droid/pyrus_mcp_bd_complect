/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ПОИСК ЗНАЧЕНИЙ В СПРАВОЧНИКЕ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Зависимости при вставке в Pyrus: `models/FormModel.ts` (тип CatalogReader).
 *
 *  Форма без актуального справочника перестаёт работать, поэтому поиск строки
 *  по значению — операция, которую делает почти каждый бот копирования.
 */

import { CatalogReader } from "../models/FormModel";

/** Строка справочника в ответе Pyrus. */
export interface CatalogItem {
  item_id: number;
  values: string[];
}

/** Значение поля типа «Справочник» в задаче Pyrus. */
export interface CatalogValue {
  item_id: number | null;
  item_ids: number[];
  item_names: string[];
  rows: string[][];
  values: string[];
}

export interface CatalogLookupOptions {
  /** Номер колонки, по которой идёт поиск. По умолчанию 0 — первая. */
  columnIndex?: number;
  /** Разрешено ли поле с множественным выбором. */
  multiple?: boolean;
  /**
   * Искать вхождение подстроки вместо точного совпадения.
   * По умолчанию выключено: поиск «1» подстрокой находит и «10», и «21»,
   * и бот молча проставляет не ту строку справочника.
   */
  contains?: boolean;
  log?: (msg: string) => void;
}

/**
 * Находит строки справочника по значениям и собирает из них значение поля.
 *
 * Возвращает `null`, когда ничего не найдено или когда нашлось несколько строк,
 * а поле принимает только одну: подставить первую попавшуюся значит тихо
 * записать в задачу неверные данные.
 */
export async function get_values_for_catalog(
  client: CatalogReader,
  values: string | number | Array<string | number>,
  catalogId: number,
  options: CatalogLookupOptions = {}
): Promise<CatalogValue | null> {
  const log = options.log ?? (() => {});
  const columnIndex = options.columnIndex ?? 0;

  if (!catalogId) {
    log("Каталог не указан у поля — поиск невозможен");
    return null;
  }

  let items: CatalogItem[];
  try {
    const catalog = await client.catalogs.get({ id: catalogId });
    items = (catalog?.items ?? []) as CatalogItem[];
  } catch (e: any) {
    log(`Каталог ${catalogId} недоступен: ${e?.message || e}`);
    return null;
  }
  if (!items.length) return null;

  const wanted = (Array.isArray(values) ? values : [values]).map(v => String(v)).filter(v => v !== "");
  if (!wanted.length) return null;

  const found: CatalogItem[] = [];
  for (const value of wanted) {
    const matches = items.filter(item => {
      const cell = item?.values?.[columnIndex];
      if (cell === undefined || cell === null) return false;
      return options.contains ? String(cell).includes(value) : String(cell) === value;
    });
    found.push(...matches);
  }

  // Одна и та же строка могла подойти под несколько искомых значений.
  const unique = Array.from(new Map(found.map(item => [item.item_id, item])).values());
  if (!unique.length) {
    log(`В каталоге ${catalogId} не найдено строк для: ${wanted.join(", ")}`);
    return null;
  }
  if (unique.length > 1 && !options.multiple) {
    log(`В каталоге ${catalogId} найдено ${unique.length} строк для «${wanted.join(", ")}», а поле принимает одну — пропускаю`);
    return null;
  }

  return {
    item_id: unique[unique.length - 1].item_id,
    item_ids: unique.map(i => i.item_id),
    item_names: unique.map(i => i.values?.[0]),
    rows: unique.map(i => i.values),
    values: unique[unique.length - 1].values
  };
}
