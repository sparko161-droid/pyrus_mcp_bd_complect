/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  МИНИМАЛЬНЫЙ НАБОР ПРОВЕРОК ДЛЯ ЛОКАЛЬНЫХ ТЕСТОВ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Тестового фреймворка в проекте нет намеренно: серверные скрипты Pyrus не
 *  принимают сторонние npm-пакеты, и тянуть jest ради двух десятков проверок
 *  значит завести в проекте зависимость, которой нет в среде исполнения.
 */

export interface Checker {
  /** Проверка условия. `details` печатается только при провале. */
  check(name: string, condition: boolean, details?: unknown): void;
  /** Проверка равенства — сама покажет ожидаемое и полученное. */
  equal(name: string, actual: unknown, expected: unknown): void;
  readonly passed: number;
  readonly failed: number;
}

export function createChecker(): Checker {
  let passed = 0;
  let failed = 0;

  const checker = {
    check(name: string, condition: boolean, details?: unknown): void {
      if (condition) {
        passed++;
        console.log(`  ✅ ${name}`);
        return;
      }
      failed++;
      console.error(`  ❌ ${name}`);
      if (details !== undefined) console.error("     ", details);
    },
    equal(name: string, actual: unknown, expected: unknown): void {
      const same = JSON.stringify(actual) === JSON.stringify(expected);
      checker.check(name, same, same ? undefined : { ожидалось: expected, получено: actual });
    },
    get passed() { return passed; },
    get failed() { return failed; }
  };

  return checker;
}
