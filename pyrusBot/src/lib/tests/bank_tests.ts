/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ТЕСТЫ БАНКА ФУНКЦИЙ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Проверяется то, что уже ломалось на живых формах: вложенные поля, которых
 *  не видит перебор верхнего уровня; отрицания, которые парсер принимал за
 *  согласие; сравнение, которое считало разные вложения одинаковыми.
 */

import * as fs from "fs";
import * as path from "path";
import { Checker } from "../testing/assert";
import { installMockNetwork } from "../testing/pyrus_simulator";
import { FormModel } from "../models/FormModel";
import { TaskModel } from "../models/TaskModel";
import { isEmptyValue, valueDisplay } from "../utils/values";
import { isFieldVisible } from "../utils/visibility";
import { findBestMatch, pickOption, parseCheckmark, parsePhone, parseNumber, parseTime } from "../utils/parsers";
import { same_value, copy_by_value } from "../utils/comparisons";
import { get_values_for_catalog } from "../utils/catalogs";
import { ExtendedClient } from "../api/ExtendedClient";

/** Форма с полем, спрятанным внутри заголовка, и полем, зависящим от выбора. */
const FORM_FIELDS = [
  {
    id: 32, code: "guest_header", type: "title", name: "Данные о госте",
    info: {
      fields: [
        { id: 26, code: "technical_bot_state", type: "text", name: "Состояние" },
        { id: 1, code: "guest_name", type: "text", name: "Имя" }
      ]
    }
  },
  {
    id: 40, code: "delivery_type", type: "multiple_choice", name: "Доставка",
    info: { options: [{ choice_id: 1, choice_value: "Самовывоз" }, { choice_id: 2, choice_value: "Доставка" }] }
  },
  {
    id: 41, code: "delivery_address", type: "text", name: "Адрес доставки",
    visibility_condition: { field_id: 40, condition_type: 5, value: "Доставка" }
  }
];

function catalogClient(items: any[], calls: { count: number }) {
  return {
    catalogs: {
      async get(_request: { id: number }) {
        calls.count++;
        return { items };
      }
    }
  };
}

/**
 * Серверные скрипты Pyrus не принимают сторонние npm-пакеты: в среде исполнения
 * доступны только `pyrus-api` и стандартная библиотека Node.js. Блок банка,
 * притащивший зависимость, не переживёт вставку в редактор Pyrus — и выяснится
 * это уже на боевой форме, а не здесь.
 */
function checkNoForeignDependencies(t: Checker): void {
  const libRoot = path.join(process.cwd(), "src", "lib");
  const allowed = new Set(["pyrus-api", "fs", "path", "crypto", "url", "util"]);
  const offenders: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith(".ts")) continue;

      const source = fs.readFileSync(full, "utf8");
      for (const m of source.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)) {
        const spec = m[1];
        if (spec.startsWith(".") || allowed.has(spec)) continue;
        offenders.push(`${path.relative(process.cwd(), full)} → ${spec}`);
      }
    }
  };

  walk(libRoot);
  t.check("банк функций не тянет сторонних зависимостей", offenders.length === 0, offenders);
}

export async function runBankTests(t: Checker): Promise<void> {
  console.log("\n=== ТЕСТ: банк функций — пригодность к вставке в Pyrus ===");
  checkNoForeignDependencies(t);

  console.log("\n=== ТЕСТ: банк функций — FormModel ===");

  const form = new FormModel(FORM_FIELDS);
  t.check("поле внутри заголовка найдено по коду", form.idOf("technical_bot_state") === 26);
  t.check("поле верхнего уровня найдено по коду", form.idOf("delivery_type") === 40);
  t.check("у вложенного поля проставлен родитель", form.byId.get(26)?.parentId === 32);
  t.check("варианты выбора разобраны из info.options", form.byId.get(40)?.options?.length === 2);

  const optionsClient = catalogClient([], { count: 0 });
  t.equal("варианты галочки", await form.optionsFor(optionsClient, form.byId.get(1)!), []);

  console.log("\n=== ТЕСТ: банк функций — TaskModel ===");

  const task = new TaskModel([
    {
      id: 32, type: "title",
      value: { fields: [{ id: 26, type: "text", value: "состояние" }, { id: 1, type: "text", value: "Иван" }] }
    },
    { id: 40, type: "multiple_choice", value: { choice_ids: [2], choice_names: ["Доставка"] } }
  ]);

  t.check("значение вложенного поля читается", task.getByCode(form, "technical_bot_state") === "состояние");
  t.check("значение поля верхнего уровня читается", task.getByCode(form, "guest_name") === "Иван");
  t.check("несуществующий код даёт undefined", task.getByCode(form, "нет_такого") === undefined);

  console.log("\n=== ТЕСТ: банк функций — видимость ===");

  const delivery = form.byId.get(41)!;
  t.check("адрес виден при выбранной доставке", isFieldVisible(delivery, form, task));

  const pickup = new TaskModel([{ id: 40, type: "multiple_choice", value: { choice_ids: [1], choice_names: ["Самовывоз"] } }]);
  t.check("адрес скрыт при самовывозе", !isFieldVisible(delivery, form, pickup));

  const nested = form.byId.get(26)!;
  t.check("поле внутри видимого заголовка видно", isFieldVisible(nested, form, task));

  t.check("снятая галочка считается пустой", isEmptyValue("unchecked", "checkmark"));
  t.check("отмеченная галочка считается заполненной", !isEmptyValue("checked", "checkmark"));
  t.check("пустой выбор считается пустым", isEmptyValue({ choice_ids: [] }, "multiple_choice"));
  t.equal("название варианта берётся из схемы", valueDisplay({ choice_ids: [2] }, form.byId.get(40)!.options), "Доставка");

  console.log("\n=== ТЕСТ: банк функций — парсеры ===");

  t.equal("точное совпадение варианта", findBestMatch("Шоколадный", ["Ванильный", "Шоколадный"]), "Шоколадный");
  t.equal("вхождение подстроки", findBestMatch("шоколадный торт", ["Ванильный", "Шоколадный"]), "Шоколадный");
  t.equal("ё приравнивается к е", findBestMatch("мед", ["Медовый", "Ванильный"]), "Медовый");
  t.equal("неоднозначность → переспрос", findBestMatch("ный", ["Ванильный", "Шоколадный"]), undefined);
  t.equal("выбор по номеру пункта", pickOption("2", ["Ванильный", "Шоколадный"]), "Шоколадный");
  t.equal("номер вне списка не выбирается", pickOption("9", ["Ванильный", "Шоколадный"]), undefined);

  t.equal("«да» распознано", parseCheckmark("Да, конечно"), "checked");
  t.equal("«не надо» не путается с «надо»", parseCheckmark("не надо"), "unchecked");
  t.equal("«не хочу» распознано как отказ", parseCheckmark("не хочу"), "unchecked");
  t.equal("непонятный ответ → переспрос", parseCheckmark("возможно"), undefined);

  t.equal("телефон с восьмёркой", parsePhone("8 (912) 345-67-89"), "79123456789");
  t.equal("телефон из десяти цифр", parsePhone("9123456789"), "79123456789");
  t.equal("короткий номер отвергнут", parsePhone("12345"), undefined);

  t.equal("число с запятой", parseNumber("вес 1,5 кг"), 1.5);
  t.equal("число ниже минимума отвергнуто", parseNumber("1", { min: 2 }), undefined);
  t.equal("число выше максимума отвергнуто", parseNumber("100", { max: 50 }), undefined);

  t.equal("время переводится в UTC", parseTime("14:30", 4), "10:30");
  t.equal("время без минут", parseTime("в 14", 4), "10:00");
  t.equal("переход через полночь", parseTime("02:00", 4), "22:00");
  t.equal("отрицательное смещение", parseTime("10:00", -3), "13:00");
  t.equal("несуществующий час отвергнут", parseTime("25:00", 4), undefined);

  console.log("\n=== ТЕСТ: банк функций — сравнение значений ===");

  t.equal("одинаковый текст", same_value({ type: "text", value: "а" }, { type: "text", value: "а" }), true);
  t.equal("разный текст", same_value({ type: "text", value: "а" }, { type: "text", value: "б" }), false);
  t.check("разные типы дают причину", typeof same_value({ type: "text", value: "а" }, { type: "number", value: 1 }) === "string");
  t.equal("оба пустые", same_value({ type: "text", value: null }, { type: "text", value: null }), true);
  t.equal(
    "снятая галочка равна отсутствию значения",
    same_value({ type: "checkmark", value: null }, { type: "checkmark", value: "unchecked" }),
    true
  );

  // Оригинальная реализация Pyrus проваливалась из case 'file' в case 'table'
  // и считала одинаковыми любые два набора файлов равной длины.
  t.equal(
    "разные вложения не считаются одинаковыми",
    same_value({ type: "file", value: [{ id: 1 }] }, { type: "file", value: [{ id: 2 }] }),
    false
  );
  t.equal(
    "одинаковые вложения совпадают",
    same_value({ type: "file", value: [{ id: 1 }] }, { type: "file", value: [{ id: 1 }] }),
    true
  );
  t.equal(
    "незагруженный файл не совпадает",
    same_value({ type: "file", value: [{ id: 1 }] }, { type: "file", value: [{ id: null }] }),
    false
  );

  // Оригинал писал 'unchecked' прямо в переданное поле.
  const untouched: any = { type: "checkmark", value: null };
  same_value(untouched, { type: "checkmark", value: "checked" });
  t.check("сравнение не меняет переданное поле", untouched.value === null);

  const source = { a: 1, nested: { list: [1, 2] }, when: new Date("2026-08-10T00:00:00Z") };
  const copy = copy_by_value(source);
  copy.nested.list.push(3);
  t.check("копия не связана с оригиналом по ссылке", source.nested.list.length === 2);
  t.check("дата скопирована как дата", copy.when instanceof Date && copy.when.getTime() === source.when.getTime());

  console.log("\n=== ТЕСТ: банк функций — справочники ===");

  const items = [
    { item_id: 10, values: ["Москва", "МСК"] },
    { item_id: 11, values: ["Москва-Сити", "МСК"] },
    { item_id: 12, values: ["Казань", "КЗН"] }
  ];

  const calls = { count: 0 };
  const client = catalogClient(items, calls);

  const exact = await get_values_for_catalog(client, "Москва", 5);
  t.equal("точное совпадение не хватает соседние строки", exact?.item_ids, [10]);

  const ambiguous = await get_values_for_catalog(client, "Москва", 5, { contains: true });
  t.equal("подстрока без мультивыбора отвергается", ambiguous, null);

  const multi = await get_values_for_catalog(client, "Москва", 5, { contains: true, multiple: true });
  t.equal("подстрока с мультивыбором даёт обе строки", multi?.item_ids, [10, 11]);

  const missing = await get_values_for_catalog(client, "Тверь", 5);
  t.equal("ненайденное значение даёт null", missing, null);

  const byColumn = await get_values_for_catalog(client, "КЗН", 5, { columnIndex: 1 });
  t.equal("поиск по второй колонке", byColumn?.item_ids, [12]);

  console.log("\n=== ТЕСТ: банк функций — ExtendedClient ===");

  const network = installMockNetwork([
    { method: "GET", url: "/forms/888", body: { id: 888, fields: FORM_FIELDS } },
    { method: "GET", url: "/catalogs/5", body: { items } },
    { method: "POST", url: "/tasks/1/comments", body: {} }
  ]);
  try {
    const bot = new ExtendedClient("mock_token", 777);

    await bot.getForm(888);
    await bot.getForm(888);
    t.check("форма запрашивается один раз за запуск", network.callsTo("/forms/888").length === 1);

    await bot.getCatalogItems(5);
    await bot.getCatalogItems(5);
    t.check("каталог запрашивается один раз за запуск", network.callsTo("/catalogs/5").length === 1);

    const model = await bot.getFormModel(888);
    t.check("модель формы построена из ответа API", model.idOf("technical_bot_state") === 26);
    t.check("модель формы взята из кэша", network.callsTo("/forms/888").length === 1);

    bot.addError(1, "не найдена строка справочника");
    bot.addError(1, "не найдена строка справочника");
    await bot.flushErrors();
    t.check("повторная ошибка не отправляется дважды", network.callsTo("/tasks/1/comments").length === 1);
    t.check("после отправки список ошибок пуст", !bot.hasErrors());

    const missingForm = await bot.getForm(999);
    t.check("недоступная форма возвращает null, а не исключение", missingForm === null);
  } finally {
    network.restore();
  }
}
