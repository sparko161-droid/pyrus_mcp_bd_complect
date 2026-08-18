/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  TEST RUNNER (Запуск локальных тестов скриптов Pyrus)
 * ═══════════════════════════════════════════════════════════════════════════
 *  Использует src/lib/testing/pyrus_simulator.ts для проверки сценариев ботов.
 *
 *  Сеть подменена: ни один тест не ходит в реальный api.pyrus.com.
 *  Провал теста возвращает ненулевой код — иначе `npm run check` пропустил бы
 *  сломанный бот, «зелено» отчитавшись об ошибке в консоль.
 */

import { MockFormContext, createMockTask, createMockRequest, simulateServerBot, MockRoute } from "./src/lib/testing/pyrus_simulator";
import { createChecker } from "./src/lib/testing/assert";
import { runBankTests } from "./src/lib/tests/bank_tests";
import orderBotHandler from "./clients/01_Демо_кабинет/Forms/01_Заказы_тортов/scripts/order_bot (v1.0)";

const t = createChecker();
const check = t.check;

// ─────────────────────────────────────────────────────────────────────────
//  ТЕСТ: серверный бот
// ─────────────────────────────────────────────────────────────────────────

/** Схема формы, которую отдаёт подменённый Pyrus: техполе вложено в заголовок. */
const CAKE_FORM_SCHEMA = {
  id: 888,
  name: "Заказы тортов",
  fields: [
    {
      id: 32,
      code: "guest_header",
      type: "title",
      name: "Данные о госте",
      info: {
        fields: [
          { id: 26, code: "technical_bot_state", type: "text", name: "Состояние бота" },
          { id: 1, code: "guest_name", type: "text", name: "Имя гостя" }
        ]
      }
    }
  ]
};

const CAKE_BOT_ROUTES: MockRoute[] = [
  { method: "GET", url: "/forms/888", body: CAKE_FORM_SCHEMA },
  { method: "POST", url: "/tasks/99001/comments", body: {} }
];

async function testOrderBot() {
  console.log("=== ТЕСТ: order_bot.ts (Бот заказа тортов) ===");

  // Создаём тестовую задачу с техническим полем состояния внутри заголовка
  const mockTask = createMockTask({
    id: 99001,
    form_id: 888,
    author_id: 101,
    fields: [
      {
        id: 32,
        code: "guest_header",
        type: "title",
        name: "Данные о госте",
        value: {
          fields: [
            { id: 26, code: "technical_bot_state", type: "text", value: "" },
            { id: 1, code: "guest_name", type: "text", value: "" }
          ]
        }
      }
    ],
    comments: [
      { id: 1001, author: { id: 101 }, text: "Привет! Хочу заказать торт" }
    ]
  });

  const request = createMockRequest(mockTask, 777, "Привет! Хочу заказать торт");
  const { response, executionTimeMs, network } = await simulateServerBot(orderBotHandler, request, {
    routes: CAKE_BOT_ROUTES
  });

  console.log(`⏱ Время выполнения: ${executionTimeMs} ms, вызовов наружу: ${network.calls.length}`);
  console.log("📥 Ответ бота:", JSON.stringify(response, null, 2));

  check("бот вернул ответ гостю", Boolean(response?.text), response);
  check(
    "первым делом спрашивает, как обращаться",
    Boolean(response?.text?.includes("как к Вам")),
    response?.text
  );
  check(
    "состояние записано в техполе 26",
    Boolean(response?.field_updates?.some((u: any) => u.id === 26)),
    response?.field_updates
  );
  check("схема формы прочитана из API", network.callsTo("/forms/888").length === 1);
  check(
    "все обращения к Pyrus объявлены в тесте",
    network.unmatched.length === 0,
    network.unmatched
  );
  check(
    "тест не ходил в реальную сеть (уложился в 1 с)",
    executionTimeMs < 1000,
    `${executionTimeMs} ms`
  );
}

/** Забытый маршрут обязан быть виден тесту, а не проглочен как «недоступный Pyrus». */
async function testNetworkIsolation() {
  console.log("\n=== ТЕСТ: изоляция сети в симуляторе ===");

  const task = createMockTask({ id: 99002, form_id: 777 });
  const request = createMockRequest(task, 777, "привет");
  const { network } = await simulateServerBot(orderBotHandler, request, { routes: [] });

  check("незаявленные вызовы попали в unmatched", network.unmatched.length > 0);
  check(
    "все вызовы ушли на api.pyrus.com, но наружу не вышли",
    network.calls.every(c => c.url.startsWith("https://")),
    network.calls.map(c => `${c.method} ${c.url}`)
  );
  check("глобальный fetch возвращён на место", globalThis.fetch.name !== "");
}

// ─────────────────────────────────────────────────────────────────────────
//  ТЕСТ: клиентский скрипт формы
// ─────────────────────────────────────────────────────────────────────────

async function testFormScriptMock() {
  console.log("\n=== ТЕСТ: Формный скрипт (Клиентский авторасчёт) ===");

  const form = new MockFormContext();

  // Объявляем подписку формы
  form.onChange(["Цена", "Количество"], true).setValue("Сумма", (state: any) => {
    const [price, qty] = state.changes;
    if (!price || !price.value || !qty || !qty.value) return 0;
    return price.value * qty.value;
  });

  // Симулируем ввод пользователя в форме (Цена: 500, Количество: 3)
  const results = await form.simulateChange({
    "Цена": { value: 500 },
    "Количество": { value: 3 }
  });

  console.log("📊 Результат расчёта формы:", results);
  check("авторасчёт вернул 1500", results[0]?.value === 1500, results);
}

import { handleTaskChatBot } from "./clients/01_Демо_кабинет/Forms/03_Чаты_задачника/scripts/task_chat_bot (v1.0)";

const CHAT_FORM_SCHEMA = {
  id: 2455918,
  name: "Чаты-задачника",
  fields: [
    { id: 4, code: "day_to_dl", type: "number", name: "Дней до срока" },
    { id: 5, code: "dl_time", type: "time", name: "Время на которое создается" },
    { id: 7, code: "person_id", type: "text", name: "На кого создается задача" },
    { id: 8, code: "tg_name", type: "text", name: "tg_name" },
    { id: 6, code: "technical_bot_state", type: "text", name: "Системное поле для отладки" }
  ]
};

const CHAT_BOT_ROUTES: MockRoute[] = [
  { method: "POST", url: "/auth", body: { access_token: "mock_token" } },
  { method: "GET", url: "/forms/2455918", body: CHAT_FORM_SCHEMA },
  { method: "POST", url: "/tasks", body: { task: { id: 777123 } } },
  { method: "GET", url: "/members", body: { members: [{ id: 1306595, first_name: "Иван", last_name: "Иванов", email: "ivanov@example.com", messenger: { nickname: "@ivanov" } }] } },
  { method: "GET", url: "/contacts", body: { contacts: [{ id: 1306595, first_name: "Иван", last_name: "Иванов", email: "ivanov@example.com", skype: "ivanov" }] } }
];


async function testTaskChatBot() {
  console.log("\n=== ТЕСТ: task_chat_bot.ts (Бот Чаты-задачника) ===");

  // 1. Старт настройки: ввод дня
  let task = createMockTask({
    id: 50001,
    form_id: 2455918,
    author_id: 200,
    fields: [
      { id: 4, code: "day_to_dl", value: null },
      { id: 5, code: "dl_time", value: null },
      { id: 7, code: "person_id", value: null },
      { id: 8, code: "tg_name", value: null },
      { id: 6, code: "technical_bot_state", value: "" }
    ],
    comments: [{ id: 3001, author: { id: 200 }, text: "1" }]
  });

  let req = createMockRequest(task, 2455918, "1");
  let res = await simulateServerBot((r) => handleTaskChatBot(r), req, { routes: CHAT_BOT_ROUTES });

  check("ввод 1 сохраняет day_to_dl = 1", Boolean(res.response?.field_updates?.some((u: any) => u.id === 4 && u.value === 1)), res.response?.field_updates);
  check("бот запрашивает время (Шаг 2)", Boolean(res.response?.text?.includes("Шаг 2/3")), res.response?.text);

  // 2. Ввод времени
  task = createMockTask({
    id: 50001,
    form_id: 2455918,
    author_id: 200,
    fields: [
      { id: 4, code: "day_to_dl", value: 1 },
      { id: 5, code: "dl_time", value: null },
      { id: 7, code: "person_id", value: null },
      { id: 8, code: "tg_name", value: null },
      { id: 6, code: "technical_bot_state", value: JSON.stringify({ step: "dl_time", configured: false }) }
    ],
    comments: [{ id: 3002, author: { id: 200 }, text: "18:00" }]
  });

  req = createMockRequest(task, 2455918, "18:00");
  res = await simulateServerBot((r) => handleTaskChatBot(r), req, { routes: CHAT_BOT_ROUTES });

  check("ввод 18:00 сохраняет dl_time = 18:00", Boolean(res.response?.field_updates?.some((u: any) => u.id === 5 && u.value === "18:00")), res.response?.field_updates);
  check("бот запрашивает ответственного (Шаг 3)", Boolean(res.response?.text?.includes("Шаг 3/3")), res.response?.text);

  // 3. Ввод ответственного по tg_name / email / ID
  task = createMockTask({
    id: 50001,
    form_id: 2455918,
    author_id: 200,
    fields: [
      { id: 4, code: "day_to_dl", value: 1 },
      { id: 5, code: "dl_time", value: "18:00" },
      { id: 7, code: "person_id", value: null },
      { id: 8, code: "tg_name", value: null },
      { id: 6, code: "technical_bot_state", value: JSON.stringify({ step: "person_id", configured: false }) }
    ],
    comments: [{ id: 3003, author: { id: 200 }, text: "ivanov@example.com" }]
  });

  req = createMockRequest(task, 2455918, "ivanov@example.com");
  res = await simulateServerBot((r) => handleTaskChatBot(r), req, { routes: CHAT_BOT_ROUTES });

  check("ввод email находит person_id и завершает настройку", Boolean(res.response?.text?.includes("успешно завершена")), res.response?.text);

  // 4. Основной режим: создание задачи в Задачнике по комментарию
  task = createMockTask({
    id: 50001,
    form_id: 2455918,
    author_id: 200,
    fields: [
      { id: 4, code: "day_to_dl", value: 1 },
      { id: 5, code: "dl_time", value: "18:00" },
      { id: 7, code: "person_id", value: "1306595" },
      { id: 8, code: "tg_name", value: "@ivanov" },
      { id: 6, code: "technical_bot_state", value: JSON.stringify({ step: "configured", configured: true }) }
    ],
    comments: [{ id: 3004, author: { id: 200 }, text: "Подготовить квартальный отчёт" }]
  });

  req = createMockRequest(task, 2455918, "Подготовить квартальный отчёт");
  res = await simulateServerBot((r) => handleTaskChatBot(r), req, { routes: CHAT_BOT_ROUTES });

  check("бот создал задачу в Задачнике и вернул ссылку https://pyrus.com/t#id777123", Boolean(res.response?.text?.includes("https://pyrus.com/t#id777123")), res.response?.text);
  check("вызов API POST /tasks с параметрами темы и срока", res.network.callsTo("/tasks").length === 1);

  // 5. Переконфигурация по команде /reconfig
  req = createMockRequest(task, 2455918, "/reconfig");
  res = await simulateServerBot((r) => handleTaskChatBot(r), req, { routes: CHAT_BOT_ROUTES });

  check("команда /reconfig сбрасывает настройку и предлагает Шаг 1", Boolean(res.response?.text?.includes("Шаг 1/3")), res.response?.text);
  check("команда /reconfig сбрасывает значения полей настройки", Boolean(res.response?.field_updates?.some((u: any) => u.id === 4 && u.value === null)), res.response?.field_updates);

  // 6. Ответ на Шаг 1 после /reconfig (ввод "0") не должен создавать задачу
  task = createMockTask({
    id: 50001,
    form_id: 2455918,
    author_id: 200,
    fields: [
      { id: 4, code: "day_to_dl", value: null },
      { id: 5, code: "dl_time", value: null },
      { id: 7, code: "person_id", value: null },
      { id: 8, code: "tg_name", value: null },
      { id: 6, code: "technical_bot_state", value: JSON.stringify({ step: "day_to_dl", configured: false }) }
    ],
    comments: [{ id: 3005, author: { id: 200 }, text: "0" }]
  });

  req = createMockRequest(task, 2455918, "0");
  res = await simulateServerBot((r) => handleTaskChatBot(r), req, { routes: CHAT_BOT_ROUTES });

  check("следующий ответ '0' после /reconfig сохраняет day_to_dl=0 и переходит к Шагу 2", Boolean(res.response?.text?.includes("Шаг 2/3")), res.response?.text);
  check("при ответе '0' задача не создаётся", res.network.callsTo("/tasks").length === 1);
}

import bookingBotHandler from "./clients/01_Демо_кабинет/Forms/04_Бронирование_столиков/scripts/booking_bot (v1.0)";

const BOOKING_FORM_SCHEMA = {
  id: 2445773,
  name: "Бронирование столиков",
  fields: [
    { id: 1, code: "guest_name", type: "text", name: "Имя гостя" },
    { id: 2, code: "guest_phone", type: "phone", name: "Телефон" },
    { id: 3, code: "guest_email", type: "email", name: "Эл. почта" },
    {
      id: 6,
      name: "Тип и детали заявки",
      type: "title",
      info: {
        fields: [
          { id: 7, code: "request_type", type: "catalog", catalog_id: 303729, name: "Тип заявки" },
          {
            id: 8,
            code: "event_name",
            type: "catalog",
            catalog_id: 303727,
            name: "Мероприятие",
            visibility_condition: { field_id: 7, condition_type: 5, value: "179704574" }
          },
          {
            id: 19,
            code: "event_name_other",
            type: "text",
            name: "Уточните название мероприятия",
            visibility_condition: { field_id: 8, condition_type: 5, value: "180781406" }
          },
          { id: 4, code: "guests_count", type: "number", name: "Количество персон" },
          { id: 16, code: "hall_zone", type: "catalog", catalog_id: 303731, name: "Желаемый зал/зона" },
          { id: 10, code: "special_requests", type: "text", name: "Особые пожелания" },
          { id: 9, code: "booking_date", type: "due_date_time", name: "Дата и время визита" }
        ]
      }
    },
    { id: 15, code: "Status", type: "multiple_choice", name: "Статус", info: { options: [{ choice_id: 1, choice_value: "Новая" }] } },
    { id: 20, code: "technical_bot_state", type: "text", name: "Системное поле отладки" }
  ]
};

const BOOKING_BOT_ROUTES: MockRoute[] = [
  { method: "GET", url: "/forms/2445773", body: BOOKING_FORM_SCHEMA },
  { method: "POST", url: "/tasks/99301/comments", body: {} },
  { method: "GET", url: "/catalogs/303729", body: { items: [{ item_id: 179704574, values: ["Мероприятие (Событие)"] }, { item_id: 179704577, values: ["Обычный визит"] }] } },
  { method: "GET", url: "/catalogs/303727", body: { items: [{ item_id: 179704521, values: ["День Рождения"] }, { item_id: 180781406, values: ["Другое"] }] } },
  { method: "GET", url: "/catalogs/303731", body: { items: [{ item_id: 179704662, values: ["Основной зал"] }] } }
];

async function testBookingBot() {
  console.log("\n=== ТЕСТ: booking_bot.ts (Бот бронирования столиков) ===");

  let task = createMockTask({
    id: 99301,
    form_id: 2445773,
    author_id: 300,
    fields: [
      { id: 1, code: "guest_name", value: "" },
      { id: 2, code: "guest_phone", value: "" },
      { id: 3, code: "guest_email", value: "" },
      {
        id: 6,
        type: "title",
        value: {
          fields: [
            { id: 7, code: "request_type", value: null },
            { id: 8, code: "event_name", value: null },
            { id: 19, code: "event_name_other", value: "" },
            { id: 4, code: "guests_count", value: null },
            { id: 16, code: "hall_zone", value: null },
            { id: 10, code: "special_requests", value: "" },
            { id: 9, code: "booking_date", value: null }
          ]
        }
      },
      { id: 20, code: "technical_bot_state", value: "" }
    ],
    comments: [{ id: 4001, author: { id: 300 }, text: "Здравствуйте, хочу заказать столик" }]
  });

  let req = createMockRequest(task, 2445773, "Здравствуйте, хочу заказать столик");
  let res = await simulateServerBot((r) => bookingBotHandler(r), req, { routes: BOOKING_BOT_ROUTES });

  check("бот спрашивает, как к Вам обращаться", Boolean(res.response?.text?.includes("как к Вам можно обращаться")), res.response?.text);

  task.comments.push({ id: 4002, author: { id: 300 }, text: "Алексей" });
  task.fields[4] = { id: 20, code: "technical_bot_state", value: JSON.stringify({ step_field_code: "guest_name", error_count: 0, completed_steps: [], ask_counts: { guest_name: 1 }, finished: false, last_event_key: "4001" }) };
  req = createMockRequest(task, 2445773, "Алексей");
  res = await simulateServerBot((r) => bookingBotHandler(r), req, { routes: BOOKING_BOT_ROUTES });
  check("ввод 'Алексей' сохраняет guest_name", Boolean(res.response?.field_updates?.some((u: any) => u.id === 1 && u.value === "Алексей")), res.response?.field_updates);
  check("бот запрашивает телефон", Boolean(res.response?.text?.includes("номер телефона")), res.response?.text);

  task.comments.push({ id: 4003, author: { id: 300 }, text: "позовите оператора" });
  req = createMockRequest(task, 2445773, "позовите оператора");
  res = await simulateServerBot((r) => bookingBotHandler(r), req, { routes: BOOKING_BOT_ROUTES });

  check("триггер оператора возвращает ответ с обещанием подключить коллегу", Boolean(res.response?.text?.includes("оператор подключится")), res.response?.text);
}

import unifiedBotHandler, { detectFormScenario } from "./solutions_bank/bots/unified_bot (v1.0)";

async function testUnifiedBot() {
  console.log("\n=== ТЕСТ: unified_bot.ts (Единый скриптовый бот) ===");

  // 1. Определение формы Обращения клиентов по form_id (2445746)
  const feedbackTask = createMockTask({
    id: 99501,
    form_id: 2445746,
    fields: [
      { id: 1, code: "client_name", value: "" },
      { id: 10, code: "technical_bot_state", value: "" }
    ],
    comments: [{ id: 5001, author: { id: 100 }, text: "Здравствуйте" }]
  });
  let req = createMockRequest(feedbackTask, 2445746, "Здравствуйте");
  check("определение сценария 'feedback' по form_id 2445746", detectFormScenario(req) === "feedback");
  let res = await simulateServerBot((r) => unifiedBotHandler(r), req, { routes: [] });
  check("единый бот отработал сценарий Обращения клиентов", Boolean(res.response?.text?.includes("как к Вам")), res.response?.text);

  // 2. Определение формы Чаты-задачника по form_id (2455918)
  const chatTask = createMockTask({
    id: 99502,
    form_id: 2455918,
    fields: [
      { id: 4, code: "day_to_dl", value: null },
      { id: 6, code: "technical_bot_state", value: "" }
    ],
    comments: [{ id: 5002, author: { id: 200 }, text: "1" }]
  });
  req = createMockRequest(chatTask, 2455918, "1");
  check("определение сценария 'task_chat' по form_id 2455918", detectFormScenario(req) === "task_chat");
  res = await simulateServerBot((r) => unifiedBotHandler(r), req, { routes: CHAT_BOT_ROUTES });
  check("единый бот отработал сценарий Чаты-задачника", Boolean(res.response?.text?.includes("Шаг 2/3")), res.response?.text);

  // 3. Определение формы Бронирование столиков по form_id (2445773)
  const bookingTask = createMockTask({
    id: 99503,
    form_id: 2445773,
    fields: [
      { id: 1, code: "guest_name", value: "" },
      { id: 20, code: "technical_bot_state", value: "" }
    ],
    comments: [{ id: 5003, author: { id: 300 }, text: "Хочу заказать стол" }]
  });
  req = createMockRequest(bookingTask, 2445773, "Хочу заказать стол");
  check("определение сценария 'booking' по form_id 2445773", detectFormScenario(req) === "booking");
  res = await simulateServerBot((r) => unifiedBotHandler(r), req, { routes: BOOKING_BOT_ROUTES });
  check("единый бот отработал сценарий Бронирование столиков", Boolean(res.response?.text?.includes("как к Вам можно обращаться")), res.response?.text);

  // 4. Резервное определение по кодам полей при неизвестном form_id (999999)
  const fallbackChatTask = createMockTask({
    id: 99504,
    form_id: 999999,
    fields: [{ id: 4, code: "day_to_dl", value: null }]
  });
  check("фолбэк-определение 'task_chat' по полю day_to_dl", detectFormScenario(createMockRequest(fallbackChatTask, 999999, "")) === "task_chat");

  const fallbackBookingTask = createMockTask({
    id: 99505,
    form_id: 999999,
    fields: [{ id: 9, code: "booking_date", value: null }, { id: 16, code: "hall_zone", value: null }]
  });
  check("фолбэк-определение 'booking' по полю booking_date", detectFormScenario(createMockRequest(fallbackBookingTask, 999999, "")) === "booking");

  const fallbackFeedbackTask = createMockTask({
    id: 99506,
    form_id: 999999,
    fields: [{ id: 1, code: "client_name", value: null }, { id: 2, code: "problem_type", value: null }]
  });
  check("фолбэк-определение 'feedback' по полю client_name", detectFormScenario(createMockRequest(fallbackFeedbackTask, 999999, "")) === "feedback");

  // 5. Проверка исправления Бага #1: ввод 'нет' на шаге почты в бронировании не зацикливает бота
  const bookingEmailTask = createMockTask({
    id: 99508,
    form_id: 2445773,
    fields: [
      { id: 1, code: "guest_name", value: "Алексей" },
      { id: 2, code: "guest_phone", value: "79277756076" },
      { id: 3, code: "guest_email", value: "" },
      { id: 20, code: "technical_bot_state", value: JSON.stringify({ step_field_code: "guest_email", completed_steps: ["guest_name", "guest_phone"], error_count: 0 }) }
    ],
    comments: [{ id: 5008, author: { id: 300 }, text: "нет" }]
  });
  req = createMockRequest(bookingEmailTask, 2445773, "нет");
  res = await simulateServerBot((r) => unifiedBotHandler(r), req, { routes: BOOKING_BOT_ROUTES });
  check("ввод 'нет' на почте пропускает шаг и запрашивает тип заявки", Boolean(res.response?.text?.includes("тип заявки")), res.response?.text);

  // 6. Проверка работы поиска по роутам членов организации (существующий ID vs выдуманный ID)
  const chatPersonIdTask = createMockTask({
    id: 99509,
    form_id: 2455918,
    fields: [
      { id: 4, code: "day_to_dl", value: 1 },
      { id: 5, code: "dl_time", value: "18:00" },
      { id: 7, code: "person_id", value: null },
      { id: 6, code: "technical_bot_state", value: JSON.stringify({ step: "person_id", configured: false }) }
    ],
    comments: [{ id: 5009, author: { id: 200 }, text: "1306595" }]
  });
  req = createMockRequest(chatPersonIdTask, 2455918, "1306595");
  res = await simulateServerBot((r) => unifiedBotHandler(r), req, { routes: CHAT_BOT_ROUTES });
  check("ввод существующего ID '1306595' из списка членов успешно завершает настройку", Boolean(res.response?.text?.includes("успешно завершена")), res.response?.text);

  const fakePersonTask = createMockTask({
    id: 99510,
    form_id: 2455918,
    fields: [
      { id: 4, code: "day_to_dl", value: 1 },
      { id: 5, code: "dl_time", value: "18:00" },
      { id: 7, code: "person_id", value: null },
      { id: 6, code: "technical_bot_state", value: JSON.stringify({ step: "person_id", configured: false }) }
    ],
    comments: [{ id: 5010, author: { id: 200 }, text: "99999999" }]
  });
  req = createMockRequest(fakePersonTask, 2455918, "99999999");
  res = await simulateServerBot((r) => unifiedBotHandler(r), req, { routes: CHAT_BOT_ROUTES });
  check("ввод выдуманного ID '99999999' отклоняется ботом (не найден)", Boolean(res.response?.text?.includes("не найден")), res.response?.text);

  // 7. Неизвестная форма
  const unknownTask = createMockTask({
    id: 99507,
    form_id: 999999,
    fields: [{ id: 1, code: "some_unknown_field", value: null }]
  });
  req = createMockRequest(unknownTask, 999999, "привет");
  check("неизвестная форма даёт 'unknown'", detectFormScenario(req) === "unknown");
  res = await simulateServerBot((r) => unifiedBotHandler(r), req, { routes: [] });
  check("единый бот возвращает null для неизвестной формы", res.response === null);
}

async function testWhiteApronOrderBot() {
  console.log("\n=== ТЕСТ: WhiteApronOrderBot (Бот кондитерской «Белый Фартук») ===");
  const { WhiteApronOrderBot, getMinPickupDate, parseRussianDate } = await import("./clients/03_Белый_Фартук/Forms/01_Заказ_продукции/scripts/order_bot (v1.0)");

  const WHITE_APRON_FORM_SCHEMA = {
    id: 2453887,
    name: "Предзаказы 2",
    fields: [
      { id: 1, code: "client_name", type: "text", name: "Имя клиента" },
      { id: 2, code: "client_phone", type: "phone", name: "Телефон" },
      { id: 3, code: "product_type", type: "multiple_choice", name: "Тип продукции" },
      { id: 8, code: "pickup_date", type: "date", name: "Дата получения" },
      { id: 9, code: "pickup_time", type: "time", name: "Время получения" },
      { id: 10, code: "delivery_type", type: "multiple_choice", name: "Способ получения" },
      { id: 11, code: "pickup_point", type: "catalog", name: "Выбор точки" },
      { id: 26, code: "technical_bot_state", type: "text", name: "Состояние бота" }
    ]
  };

  const WHITE_APRON_ROUTES: MockRoute[] = [
    { method: "GET", url: "/forms/2453887", body: WHITE_APRON_FORM_SCHEMA },
    { method: "GET", url: "/forms/2456232/register?include_closed=false", body: { tasks: [] } },
    { method: "POST", url: "/tasks/99601/comments", body: {} }
  ];

  // 1. Первый запуск бота
  const mockTask = createMockTask({
    id: 99601,
    form_id: 2453887,
    author_id: 101,
    fields: [
      { id: 1, code: "client_name", value: "" },
      { id: 2, code: "client_phone", value: "" },
      { id: 3, code: "product_type", value: null },
      { id: 26, code: "technical_bot_state", value: "" }
    ],
    comments: [
      { id: 1001, author: { id: 101 }, text: "Здравствуйте!" }
    ]
  });

  const request = createMockRequest(mockTask, 2453887, "Здравствуйте!");
  const handler = async (req: any, client?: any) => {
    const bot = new WhiteApronOrderBot(client);
    return await bot.handleHook(req);
  };

  const { response, network } = await simulateServerBot(handler, request, {
    routes: WHITE_APRON_ROUTES
  });

  check("Белый Фартук: бот приветствует и запрашивает имя", Boolean(response?.text?.includes("Ваше имя")), response?.text);
  check("Белый Фартук: состояние сохраняется в техполе", Boolean(response?.field_updates?.some((u: any) => u.id === 26)));

  // 2. Проверка расчёта 4 рабочих дней
  const minDate = getMinPickupDate(new Date(2026, 7, 12)); // 12 августа 2026 (Среда) -> +4 раб дня = 18 августа (Вторник)
  check("расчёт 4 рабочих дней с 12.08 (среда) дает 18.08 (вторник)", minDate.getDate() === 18 && minDate.getMonth() === 7);
}

async function runAllTests() {
  let fatal = false;
  try {
    await testOrderBot();
    await testTaskChatBot();
    await testBookingBot();
    await testUnifiedBot();
    await testWhiteApronOrderBot();
    await testNetworkIsolation();
    await testFormScriptMock();
    await runBankTests(t);
  } catch (err) {
    fatal = true;
    console.error("❌ Фатальная ошибка во время локального теста:", err);
  }

  console.log(`\nИтог: пройдено ${t.passed}, провалено ${t.failed}.`);
  if (t.failed > 0 || fatal) process.exitCode = 1;
}

runAllTests();



