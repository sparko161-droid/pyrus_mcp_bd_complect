/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ПАРСЕРЫ ОТВЕТОВ ГОСТЯ И НЕЧЁТКИЙ ПОИСК
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Зависимости при вставке в Pyrus: нет.
 *
 *  Гость пишет в мессенджер живым текстом: с опечатками, лишними словами и
 *  не теми формулировками, которых ждёт форма. Эти функции превращают его
 *  реплику в значение поля Pyrus — либо честно возвращают `undefined`,
 *  и тогда бот переспрашивает.
 */

/** Нижний регистр, обрезка краёв, `ё` → `е`: две одинаковые по смыслу строки должны совпасть. */
export function normalize(s: string): string {
  return (s || "").trim().toLowerCase().replace(/ё/g, "е");
}

/**
 * Подбор варианта: точное совпадение → взаимное вхождение → совпадение по началу слов.
 *
 * Неоднозначность разрешается в пользу переспроса: если под критерий подошло
 * больше одного варианта, возвращается `undefined`. Угадывать за гостя нельзя —
 * ошибка попадёт в заказ и всплывёт уже у кондитера.
 */
export function findBestMatch(input: string, options: string[]): string | undefined {
  const value = normalize(input);
  if (!value || !options.length) return undefined;

  const exact = options.find(o => normalize(o) === value);
  if (exact) return exact;

  const contains = options.filter(o => {
    const opt = normalize(o);
    return opt.includes(value) || value.includes(opt);
  });
  if (contains.length === 1) return contains[0];

  const inputWords = value.split(/\s+/).filter(w => w.length >= 3);
  const matches = options.filter(o => {
    const optWords = normalize(o).split(/\s+/).filter(w => w.length >= 3);
    return inputWords.some(iw =>
      optWords.some(ow => ow.startsWith(iw.substring(0, 3)) || iw.startsWith(ow.substring(0, 3)))
    );
  });
  return matches.length === 1 ? matches[0] : undefined;
}

/** Выбор по номеру пункта («2»), иначе — по тексту через `findBestMatch`. */
export function pickOption(input: string, options: string[]): string | undefined {
  const value = (input || "").trim();
  if (/^\d{1,2}$/.test(value)) {
    const index = parseInt(value, 10) - 1;
    if (index >= 0 && index < options.length) return options[index];
  }
  return findBestMatch(value, options);
}

/** Телефон в формате `7XXXXXXXXXX`. Всё, что не сводится к нему, — отказ. */
export function parsePhone(input: string): string | undefined {
  const digits = (input || "").replace(/\D/g, "");
  let normalized = digits;
  if (digits.length === 11 && (digits.startsWith("8") || digits.startsWith("7"))) normalized = "7" + digits.slice(1);
  else if (digits.length === 10 && digits.startsWith("9")) normalized = "7" + digits;
  return /^7\d{10}$/.test(normalized) ? normalized : undefined;
}

/**
 * Галочка из живого ответа.
 *
 * Порядок проверок важен: отрицания разбираются раньше согласий, иначе
 * «не надо» поймается подстрокой «да» из «надо» и превратится в согласие.
 */
export function parseCheckmark(input: string): "checked" | "unchecked" | undefined {
  const value = normalize(input);
  if (!value) return undefined;
  if (value === "1") return "checked";
  if (value === "2") return "unchecked";
  if (/^(нет|no|не|неа|не надо|не нужно|отказ|отказываюсь|нету|0|false)\b/.test(value)) return "unchecked";
  if (/^(да|yes|ага|конечно|хочу|есть|имеется|нужно|надо|true)\b/.test(value)) return "checked";
  if (value.includes("не надо") || value.includes("не нужно") || value.includes("не хочу")) return "unchecked";
  if (value.includes("нет")) return "unchecked";
  if (value.includes("да") || value.includes("хочу") || value.includes("есть")) return "checked";
  return undefined;
}

export interface NumberBounds {
  min?: number;
  max?: number;
}

/** Первое число из реплики, с проверкой границ. Значение вне границ — отказ, а не обрезка. */
export function parseNumber(input: string, bounds: NumberBounds = {}): number | undefined {
  const match = (input || "").replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!match) return undefined;
  const value = parseFloat(match[0]);
  if (!isFinite(value)) return undefined;
  if (bounds.min !== undefined && value < bounds.min) return undefined;
  if (bounds.max !== undefined && value > bounds.max) return undefined;
  return value;
}

/**
 * «14:30» / «14.30» / «14 30» / «в 14» → строка «HH:MM» в UTC.
 *
 * Pyrus хранит поля типа `time` в UTC, а гость называет своё местное время,
 * поэтому смещение часового пояса аккаунта клиента передаётся явно —
 * зашитая константа ломается при первом же клиенте из другого пояса.
 */
export function parseTime(input: string, timezoneOffsetHours: number): string | undefined {
  const match = (input || "").match(/(\d{1,2})\s*[:.\-\s]?\s*(\d{2})?/);
  if (!match) return undefined;
  const localHours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  if (isNaN(localHours) || localHours > 23 || minutes > 59) return undefined;
  const utcHours = (localHours - timezoneOffsetHours + 24 * 2) % 24;
  return `${String(utcHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
