/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  PYRUS SIMULATOR & TEST HARNESS (Симулятор и тестовая среда Pyrus)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Назначение: Локальное моделирование и тестирование:
 *  1. Серверных скриптов ботов (Server Script Bots: BotHookRequest -> BotHookResponse)
 *  2. Клиентских скриптов форм (Client Form Scripts: form.onChange -> setValue/validate)
 *
 * Сеть в симуляторе подменяется всегда. Бот создаёт `new PyrusApiClient(...)`
 * внутри себя, поэтому подсунуть ему клиент-заглушку нельзя — зато весь
 * pyrus-api ходит через глобальный `fetch`, и подменяется именно он.
 * Тест, забывший объявить маршрут, увидит вызов в `network.unmatched`,
 * а не молчаливый 401 из реального api.pyrus.com.
 */

import { BotHookRequest, BotHookResponse } from "pyrus-api";

// ─────────────────────────────────────────────────────────────────────────
// 0. ПОДМЕНА СЕТИ (Mock network)
// ─────────────────────────────────────────────────────────────────────────

/** Записанный вызов наружу: что бот попытался спросить у Pyrus. */
export interface RecordedCall {
  method: string;
  url: string;
  body?: string;
  /** Нашёлся ли маршрут. Ложь означает, что тест забыл его объявить. */
  matched: boolean;
}

/** Ответ Pyrus, заготовленный тестом. */
export interface MockRoute {
  /** Метод запроса; по умолчанию любой. */
  method?: "GET" | "POST" | "PUT" | "DELETE" | "ANY";
  /** Подстрока URL («/forms/888») или регулярное выражение. */
  url: string | RegExp;
  /** HTTP-код ответа; по умолчанию 200. */
  status?: number;
  /** Тело ответа. Объект сериализуется в JSON. */
  body?: unknown;
  /** Динамический ответ, когда важно, что именно прислал бот. */
  respond?: (call: RecordedCall) => unknown;
}

export interface MockNetwork {
  /** Все исходящие вызовы в порядке совершения. */
  calls: RecordedCall[];
  /** Вызовы, для которых маршрут не объявлен. Тест обязан проверять, что список пуст. */
  unmatched: RecordedCall[];
  /** Вызовы к конкретному адресу — для проверок «бот дописал комментарий». */
  callsTo(url: string | RegExp): RecordedCall[];
  restore(): void;
}

const OFFLINE_STATUS = 599;

function urlOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return String((input as { url?: string })?.url ?? input);
}

function matches(route: MockRoute, call: RecordedCall): boolean {
  const method = route.method ?? "ANY";
  if (method !== "ANY" && method !== call.method) return false;
  return typeof route.url === "string" ? call.url.includes(route.url) : route.url.test(call.url);
}

function jsonResponse(status: number, body: unknown): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body ?? {});
  return new Response(text, {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/**
 * Подменяет глобальный `fetch` на время теста.
 * Незаявленный маршрут получает 599 и попадает в `unmatched` — pyrus-api
 * превратит это в ApiError, а тест увидит, чего именно не хватило.
 */
export function installMockNetwork(routes: MockRoute[] = []): MockNetwork {
  const original = globalThis.fetch;
  const calls: RecordedCall[] = [];
  const unmatched: RecordedCall[] = [];

  globalThis.fetch = (async (input: any, init?: any): Promise<Response> => {
    const call: RecordedCall = {
      method: String(init?.method || "GET").toUpperCase(),
      url: urlOf(input),
      body: typeof init?.body === "string" ? init.body : undefined,
      matched: false
    };

    const route = routes.find(r => matches(r, call));
    call.matched = Boolean(route);
    calls.push(call);

    if (!route) {
      unmatched.push(call);
      return jsonResponse(OFFLINE_STATUS, {
        error: "offline",
        error_code: "simulator_no_route",
        message: `Симулятор: маршрут не объявлен для ${call.method} ${call.url}`
      });
    }

    const body = route.respond ? route.respond(call) : route.body;
    return jsonResponse(route.status ?? 200, body);
  }) as typeof globalThis.fetch;

  return {
    calls,
    unmatched,
    callsTo(url) {
      return calls.filter(c => (typeof url === "string" ? c.url.includes(url) : url.test(c.url)));
    },
    restore() {
      globalThis.fetch = original;
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 1. МОДЕЛИРОВАНИЕ КЛИЕНТСКИХ СКРИПТОВ ФОРМ (Client Form Scripts)
// ─────────────────────────────────────────────────────────────────────────

export interface MockFormState {
  changes: any[];
  prev?: any[];
  commenter?: { id: number; first_name: string; last_name: string };
  assignee?: { id: number; first_name: string; last_name: string };
  currentStep?: number;
  taskId?: number;
}

export class MockFormContext {
  private handlers: Array<{
    fieldNames: string[];
    executeOnLoad: boolean;
    actionType: "setValue" | "setValues" | "validate" | "setVisibility" | "setAssignee" | "setFilter";
    targetField: string | string[];
    callback: Function;
  }> = [];

  private catalogs = new Map<string | number, any[]>();
  private roles: any[] = [];

  // Импликация глобального объекта form
  onChange(fieldNames: string[], executeOnLoad = false) {
    const self = this;
    return {
      setValue(fieldName: string, calc: Function) {
        self.handlers.push({ fieldNames, executeOnLoad, actionType: "setValue", targetField: fieldName, callback: calc });
      },
      setValueAsync(fieldName: string, calcAsync: Function) {
        self.handlers.push({ fieldNames, executeOnLoad, actionType: "setValue", targetField: fieldName, callback: calcAsync });
      },
      setValues(fieldNamesTarget: string[], calc: Function) {
        self.handlers.push({ fieldNames, executeOnLoad, actionType: "setValues", targetField: fieldNamesTarget, callback: calc });
      },
      setValuesAsync(fieldNamesTarget: string[], calcAsync: Function) {
        self.handlers.push({ fieldNames, executeOnLoad, actionType: "setValues", targetField: fieldNamesTarget, callback: calcAsync });
      },
      setAssignee(calc: Function) {
        self.handlers.push({ fieldNames, executeOnLoad, actionType: "setAssignee", targetField: "$assignee", callback: calc });
      },
      validate(fieldName: string, validateFn: Function) {
        self.handlers.push({ fieldNames, executeOnLoad, actionType: "validate", targetField: fieldName, callback: validateFn });
      },
      setVisibility(fieldNamesTarget: string[], calc: Function) {
        self.handlers.push({ fieldNames, executeOnLoad, actionType: "setVisibility", targetField: fieldNamesTarget, callback: calc });
      }
    };
  }

  // Заглушки методов загрузки данных
  mockCatalog(idOrName: string | number, items: any[]) {
    this.catalogs.set(idOrName, items);
  }

  async getCatalog(idOrName: string | number) {
    return this.catalogs.get(idOrName) || [];
  }

  async fetchRoles() {
    return this.roles;
  }

  getDaysCount(start: string | Date, end: string | Date): number {
    const d1 = new Date(start);
    const d2 = new Date(end);
    const diffTime = Math.abs(d2.getTime() - d1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  /** Запуск симуляции клиентского изменения полей */
  async simulateChange(changedFieldValues: Record<string, any>, isLoad = false) {
    const results: Array<{ target: any; action: string; value: any }> = [];

    for (const h of this.handlers) {
      if (isLoad && !h.executeOnLoad) continue;

      const changes = h.fieldNames.map(code => changedFieldValues[code]);
      const state: MockFormState = {
        changes,
        commenter: { id: 100, first_name: "Тестовый", last_name: "Пользователь" },
        currentStep: 1,
        taskId: 9999
      };

      const res = await h.callback(state);
      results.push({ target: h.targetField, action: h.actionType, value: res });
    }

    return results;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 2. МОДЕЛИРОВАНИЕ СЕРВЕРНЫХ СКРИПТОВ (Server Script Bots)
// ─────────────────────────────────────────────────────────────────────────

export interface MockTaskBuilderOptions {
  id?: number;
  form_id?: number;
  author_id?: number;
  fields?: any[];
  comments?: any[];
}

export function createMockTask(options: MockTaskBuilderOptions = {}) {
  return {
    id: options.id || 12345,
    form_id: options.form_id || 100,
    author: { id: options.author_id || 500, first_name: "Иван", last_name: "Петров" },
    fields: options.fields || [],
    comments: options.comments || []
  };
}

export function createMockRequest(task: any, botUserId = 777, text = ""): BotHookRequest {
  return {
    event: "comment",
    task_id: task.id,
    task,
    access_token: "mock_access_token_12345",
    user_id: botUserId,
    api_url: "https://api.pyrus.com/v4/",
    files_url: "https://files.pyrus.com/",
    bot_settings: "{}",
    text
  } as unknown as BotHookRequest;
}


export interface SimulateServerBotOptions {
  /** Заготовленные ответы Pyrus. Всё, что не объявлено, попадёт в network.unmatched. */
  routes?: MockRoute[];
}

/**
 * Симулятор вызова серверного бота.
 * Сеть подменяется на время вызова и возвращается на место даже при исключении:
 * тест не должен зависеть от доступности Pyrus и жечь рейт-лимит аккаунта.
 */
export async function simulateServerBot(
  botHandler: (req: BotHookRequest) => Promise<BotHookResponse | null>,
  request: BotHookRequest,
  options: SimulateServerBotOptions = {}
): Promise<{ response: BotHookResponse | null; executionTimeMs: number; network: MockNetwork }> {
  const network = installMockNetwork(options.routes);
  const startTime = Date.now();
  try {
    const response = await botHandler(request);
    return { response, executionTimeMs: Date.now() - startTime, network };
  } finally {
    network.restore();
  }
}
