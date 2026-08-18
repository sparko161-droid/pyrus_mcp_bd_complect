---
title: "Код: order_bot (v1.0).ts"
audience: "tech"
---

```typescript
import {
  BotHookRequest,
  BotHookResponse,
  PyrusApiClient,
  FormResponse
} from "pyrus-api";

// ═══════════════════════════════════════════════════════════════════════════
//  БОТ СБОРА ЗАКАЗОВ КОНДИТЕРСКОЙ «БЕЛЫЙ ФАРТУК» (Форма 2453887)
// ═══════════════════════════════════════════════════════════════════════════

const FORM_ID_ORDERS = 2453887;
const FORM_ID_CONTROL = 2456232;

const CATALOG_ID_MENU = 305780;
const CATALOG_ID_FILLING = 306384;
const CATALOG_ID_POINTS = 305781;

const FIELD_CODES = {
  STATE: "technical_bot_state",
  CLIENT_NAME: "client_name",
  CLIENT_PHONE: "client_phone",
  PRODUCT_TYPE: "product_type",
  POSITIONS_TABLE: "positions",
  ORDER_ITEMS: "order_items",
  QUANTITY: "quantity",
  CUSTOM_ORDER_DESCRIPTION: "custom_order_description",
  CAKE_FILLING: "cake_filling",
  CAKE_WEIGHT: "cake_weight",
  DESIGN: "design",
  DESIGN_IMAGE: "design_image",
  PICKUP_DATE: "pickup_date",
  PICKUP_TIME: "pickup_time",
  DELIVERY_TYPE: "delivery_type",
  PICKUP_POINT: "pickup_point",
} as const;

const DEBUG_ENABLED = true;
const MAX_ERRORS = 3;
const MAX_ASKS_PER_FIELD = 4;
const TIMEZONE_OFFSET_HOURS = 4; // UTC+4

const OPERATOR_TRIGGERS = [
  "оператор", "позовите", "человек", "менеджер", "поговорить с человеком",
];

const SKIP_ANSWERS = [
  "нет", "не надо", "не нужно", "пропустить", "пропуск", "далее", "дальше",
  "skip", "-", "без разницы", "не знаю", "неважно", "не важно",
];

type StepType =
  | "text" | "phone" | "number" | "choice" | "catalog"
  | "file" | "time" | "date";

interface StepDefinition {
  code: string;
  question: string;
  hint?: string;
  type?: StepType;
  optional?: boolean;
}

export interface BotState {
  step_field_code: string | null;
  error_count: number;
  completed_steps: string[];
  ask_counts: Record<string, number>;
  finished: boolean;
  last_event_key?: string;
  selected_catalog_item_id?: number;
}

interface FormFieldInfo {
  id: number;
  code: string;
  name: string;
  type: string;
  parentCode?: string;
  catalogId?: number;
  options?: Array<{ choice_id: number; choice_value: string }>;
}

class FormModel {
  private fieldsByCode = new Map<string, FormFieldInfo>();
  private fieldsById = new Map<number, FormFieldInfo>();

  constructor(rawFields: any[]) {
    this.traverse(rawFields);
  }

  private traverse(fields: any[], parentCode?: string) {
    for (const f of fields || []) {
      if (!f || f.id === undefined) continue;
      const info: FormFieldInfo = {
        id: Number(f.id),
        code: f.code || f.info?.code || "",
        name: f.name || "",
        type: String(f.type || ""),
        parentCode,
        catalogId: f.info?.catalog_id ?? f.catalog_id,
        options: f.info?.options?.map((o: any) => ({
          choice_id: Number(o.choice_id),
          choice_value: String(o.choice_value)
        }))
      };
      if (info.code) {
        this.fieldsByCode.set(info.code, info);
      }
      this.fieldsById.set(info.id, info);

      for (const kids of [f.fields, f.info?.fields, f.info?.columns]) {
        if (Array.isArray(kids) && kids.length) {
          this.traverse(kids, info.code || String(info.id));
        }
      }
    }
  }

  getField(code: string): FormFieldInfo | undefined {
    return this.fieldsByCode.get(code);
  }
}

class TaskModel {
  private valuesByCode = new Map<string, any>();
  private valuesById = new Map<number, any>();

  constructor(taskFields: any[]) {
    this.traverse(taskFields);
  }

  private traverse(fields: any[]) {
    for (const f of fields || []) {
      if (!f || f.id === undefined) continue;
      const id = Number(f.id);
      const code = f.code || f.info?.code || "";
      const val = f.value;

      if (code) this.valuesByCode.set(code, val);
      this.valuesById.set(id, val);

      if (val && typeof val === "object") {
        if (Array.isArray(val.fields)) this.traverse(val.fields);
        if (Array.isArray(val.rows)) {
          for (const r of val.rows) {
            if (Array.isArray(r.cells)) this.traverse(r.cells);
          }
        }
      }
    }
  }

  getValue(code: string): any {
    return this.valuesByCode.get(code);
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  ВЫЧИСЛЕНИЕ РАБОЧИХ ДНЕЙ (+4 РАБОЧИХ ДНЯ, ИСКЛЮЧАЯ СБ И ВС)
// ─────────────────────────────────────────────────────────────────────────

export function getMinPickupDate(now: Date = new Date()): Date {
  const result = new Date(now.getTime());
  let addedWorkingDays = 0;

  while (addedWorkingDays < 4) {
    result.setDate(result.getDate() + 1);
    const dayOfWeek = result.getDay(); // 0 = Sun, 6 = Sat
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      addedWorkingDays++;
    }
  }
  result.setHours(0, 0, 0, 0);
  return result;
}

export function parseRussianDate(input: string): Date | null {
  const m = input.trim().match(/^(\d{1,2})[./\\](\d{1,2})[./\\](\d{2,4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;

  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return null;
  if (d.getDate() !== day || d.getMonth() !== month) return null;
  return d;
}

export function formatRussianDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

export function parsePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return "7" + digits.slice(1);
  }
  if (digits.length === 10) {
    return "7" + digits;
  }
  return null;
}

export function parseTime(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────────────────
//  ОСНОВНОЙ КЛАСС БОТА
// ─────────────────────────────────────────────────────────────────────────

export class WhiteApronOrderBot {
  constructor(private client: PyrusApiClient) {}

  async handleHook(request: BotHookRequest): Promise<BotHookResponse> {
    const task = request.task;
    if (!task) return {};

    const comments = task.comments || [];
    const lastComment = comments[comments.length - 1];

    // Игнорируем собственные ответы бота и системные события без текста
    if (lastComment?.author?.type === "bot") return {};
    const userInput = lastComment?.text?.trim() || "";

    // 1. Схема формы
    let formModel: FormModel;
    try {
      const formResp = await this.client.forms.get({ id: FORM_ID_ORDERS });
      formModel = new FormModel(formResp.fields || []);
    } catch {
      formModel = new FormModel(task.fields || []);
    }

    // 2. Модель задачи
    const taskModel = new TaskModel(task.fields || []);

    // 3. Считывание состояния
    const stateRaw = taskModel.getValue(FIELD_CODES.STATE);
    let state: BotState = {
      step_field_code: null,
      error_count: 0,
      completed_steps: [],
      ask_counts: {},
      finished: false,
    };

    if (stateRaw) {
      try {
        state = typeof stateRaw === "string" ? JSON.parse(stateRaw) : stateRaw;
      } catch {
        // Ошибка формата — инициализируем заново
      }
    }

    if (state.finished) return {};

    // Вызов оператора по триггеру
    if (OPERATOR_TRIGGERS.some(t => userInput.toLowerCase().includes(t))) {
      return {
        text: "Понял Вас! Подключаю менеджера к диалогу. Пожалуйста, ожидайте.",
      };
    }

    // Проверка управляющей формы 2456232 (Блокировка заказных тортов)
    let isCustomOrderDisabled = false;
    try {
      const controlRegister: any = await (this.client as any).forms.getRegister({
        id: FORM_ID_CONTROL,
        include_closed: false
      });

      const activeTasks = controlRegister?.tasks || [];
      const now = new Date();

      for (const t of activeTasks) {
        const periodVal = t.fields?.find((f: any) => f.id === 1 || f.code === "period")?.value;
        if (periodVal) {
          const dueDate = new Date(periodVal);
          if (!isNaN(dueDate.getTime()) && dueDate >= now) {
            isCustomOrderDisabled = true;
            break;
          }
        } else {
          // Активная задача без даты тоже блокирует
          isCustomOrderDisabled = true;
          break;
        }
      }
    } catch {
      // При ошибке API считаем, что блокировки нет
    }

    // 4. Логика первого запуска или обработки текущего шага
    const fieldUpdates: Array<{ id: number; value: any }> = [];

    // Если шага ещё нет — начинаем с Имени (Step 1)
    if (!state.step_field_code) {
      state.step_field_code = FIELD_CODES.CLIENT_NAME;
      state.ask_counts[FIELD_CODES.CLIENT_NAME] = 1;

      return this.buildResponse(
        "Здравствуйте! Вас приветствует кондитерская «Белый Фартук». Укажите, пожалуйста, Ваше имя.",
        state,
        fieldUpdates,
        formModel
      );
    }

    // Обработка текущего шага
    const currentCode = state.step_field_code;
    let stepSuccess = false;

    if (currentCode === FIELD_CODES.CLIENT_NAME) {
      if (userInput) {
        const field = formModel.getField(FIELD_CODES.CLIENT_NAME);
        if (field) fieldUpdates.push({ id: field.id, value: userInput });
        stepSuccess = true;
      }
    } else if (currentCode === FIELD_CODES.CLIENT_PHONE) {
      const phone = parsePhone(userInput);
      if (phone) {
        const field = formModel.getField(FIELD_CODES.CLIENT_PHONE);
        if (field) fieldUpdates.push({ id: field.id, value: phone });
        stepSuccess = true;
      } else {
        state.error_count++;
        if (state.error_count >= MAX_ERRORS) {
          return { text: "Передаю диалог менеджеру для помощи в оформлении." };
        }
        return this.buildResponse(
          "Неверный формат номера. Укажите, пожалуйста, номер телефона для связи в формате 7XXXXXXXXXX.",
          state,
          fieldUpdates,
          formModel
        );
      }
    } else if (currentCode === FIELD_CODES.PRODUCT_TYPE) {
      if (userInput.includes("1") || userInput.toLowerCase().includes("заказ")) {
        if (isCustomOrderDisabled) {
          return this.buildResponse(
            "Добрый день, к сожалению, сейчас мы временно не принимаем заказы с индивидуальным дизайном. Пожалуйста, выберите готовые позиции из каталога или зайдите позже.\n\nЧто Вы хотели бы заказать? (Ответьте цифрой):\n1. Торт на заказ с индивидуальным дизайном\n2. Готовые позиции из каталога",
            state,
            fieldUpdates,
            formModel
          );
        }
        const field = formModel.getField(FIELD_CODES.PRODUCT_TYPE);
        if (field) fieldUpdates.push({ id: field.id, value: { choice_id: 1 } });
        stepSuccess = true;
      } else if (userInput.includes("2") || userInput.toLowerCase().includes("каталог") || userInput.toLowerCase().includes("готов")) {
        const field = formModel.getField(FIELD_CODES.PRODUCT_TYPE);
        if (field) fieldUpdates.push({ id: field.id, value: { choice_id: 2 } });
        stepSuccess = true;
      } else {
        state.error_count++;
        return this.buildResponse(
          "Пожалуйста, ответьте цифрой 1 или 2:\n1. Торт на заказ с индивидуальным дизайном\n2. Готовые позиции из каталога",
          state,
          fieldUpdates,
          formModel
        );
      }
    } else if (currentCode === FIELD_CODES.CUSTOM_ORDER_DESCRIPTION) {
      if (userInput.includes("1") || userInput.toLowerCase().includes("бенто")) {
        const field = formModel.getField(FIELD_CODES.CUSTOM_ORDER_DESCRIPTION);
        if (field) fieldUpdates.push({ id: field.id, value: { choice_id: 1 } });
        stepSuccess = true;
      } else if (userInput.includes("2") || userInput.toLowerCase().includes("2 кг") || userInput.toLowerCase().includes("2кг")) {
        const field = formModel.getField(FIELD_CODES.CUSTOM_ORDER_DESCRIPTION);
        if (field) fieldUpdates.push({ id: field.id, value: { choice_id: 2 } });
        stepSuccess = true;
      } else {
        return this.buildResponse(
          "Какой вариант торта Вас интересует? (Можно ответить цифрой):\n1. Бенто торт с индивидуальным дизайном\n2. Торт от 2 кг с индивидуальным дизайном",
          state,
          fieldUpdates,
          formModel
        );
      }
    } else if (currentCode === FIELD_CODES.CAKE_FILLING) {
      const field = formModel.getField(FIELD_CODES.CAKE_FILLING);
      if (field) {
        // Попытка зафиксировать выбор начинки
        fieldUpdates.push({ id: field.id, value: { choice_id: 1, item_name: userInput } });
        stepSuccess = true;
      }
    } else if (currentCode === FIELD_CODES.CAKE_WEIGHT) {
      const weightNum = parseFloat(userInput.replace(",", "."));
      if (!isNaN(weightNum) && weightNum >= 2) {
        const field = formModel.getField(FIELD_CODES.CAKE_WEIGHT);
        if (field) fieldUpdates.push({ id: field.id, value: `${weightNum} кг` });
        stepSuccess = true;
      } else {
        return this.buildResponse(
          "Вес должен быть не менее 2 кг. Попробуйте снова.",
          state,
          fieldUpdates,
          formModel
        );
      }
    } else if (currentCode === FIELD_CODES.DESIGN) {
      const fieldDesc = formModel.getField(FIELD_CODES.DESIGN);
      if (fieldDesc && userInput) {
        fieldUpdates.push({ id: fieldDesc.id, value: userInput });
      }
      stepSuccess = true;
    } else if (currentCode === FIELD_CODES.ORDER_ITEMS) {
      const fieldMenu = formModel.getField(FIELD_CODES.ORDER_ITEMS);
      if (fieldMenu) {
        state.selected_catalog_item_id = 180756828; // Символический ID выбранного элемента
        stepSuccess = true;
      }
    } else if (currentCode === FIELD_CODES.QUANTITY) {
      const qty = parseInt(userInput, 10);
      if (!isNaN(qty) && qty > 0) {
        const tableField = formModel.getField(FIELD_CODES.POSITIONS_TABLE);
        const itemField = formModel.getField(FIELD_CODES.ORDER_ITEMS);
        const qtyField = formModel.getField(FIELD_CODES.QUANTITY);

        if (tableField && itemField && qtyField) {
          fieldUpdates.push({
            id: tableField.id,
            value: {
              rows: [
                {
                  cells: [
                    { id: itemField.id, value: { item_id: state.selected_catalog_item_id || 180756828 } },
                    { id: qtyField.id, value: qty }
                  ]
                }
              ]
            }
          });
        }
        stepSuccess = true;
      } else {
        return this.buildResponse(
          "Укажите количество выбранной позиции числом (например, 1 или 2).",
          state,
          fieldUpdates,
          formModel
        );
      }
    } else if (currentCode === FIELD_CODES.PICKUP_DATE) {
      const parsedDate = parseRussianDate(userInput);
      const minDate = getMinPickupDate();

      if (parsedDate && parsedDate >= minDate) {
        const field = formModel.getField(FIELD_CODES.PICKUP_DATE);
        if (field) fieldUpdates.push({ id: field.id, value: formatRussianDate(parsedDate) });
        stepSuccess = true;
      } else {
        return this.buildResponse(
          `К сожалению, мы не можем изготовить заказ к этой дате. Выберите дату не ранее, чем через 4 рабочих дня (начиная с ${formatRussianDate(minDate)}).`,
          state,
          fieldUpdates,
          formModel
        );
      }
    } else if (currentCode === FIELD_CODES.PICKUP_TIME) {
      const timeStr = parseTime(userInput);
      if (timeStr) {
        const field = formModel.getField(FIELD_CODES.PICKUP_TIME);
        if (field) fieldUpdates.push({ id: field.id, value: timeStr });
        stepSuccess = true;
      } else {
        return this.buildResponse(
          "Укажите время получения заказа в формате ЧЧ:ММ (например, 14:30).",
          state,
          fieldUpdates,
          formModel
        );
      }
    } else if (currentCode === FIELD_CODES.DELIVERY_TYPE) {
      if (userInput.includes("1") || userInput.toLowerCase().includes("самовывоз")) {
        const field = formModel.getField(FIELD_CODES.DELIVERY_TYPE);
        if (field) fieldUpdates.push({ id: field.id, value: { choice_id: 1 } });
        stepSuccess = true;
      } else if (userInput.includes("2") || userInput.toLowerCase().includes("доставка")) {
        const field = formModel.getField(FIELD_CODES.DELIVERY_TYPE);
        if (field) fieldUpdates.push({ id: field.id, value: { choice_id: 2 } });
        state.finished = true;
        state.step_field_code = null;

        return this.buildResponse(
          "Доставка осуществляется только через наш сайт. Пожалуйста, оформите доставку на сайте: https://белыйфартук.рф/?ysclid=mspy6odhv7512300021. Ваш заказ будет передан на производство. Мы свяжемся с Вами для подтверждения.",
          state,
          fieldUpdates,
          formModel
        );
      } else {
        return this.buildResponse(
          "Как Вы хотите получить заказ? (Ответьте цифрой):\n1. Самовывоз\n2. Доставка (осуществляется только через наш сайт)",
          state,
          fieldUpdates,
          formModel
        );
      }
    } else if (currentCode === FIELD_CODES.PICKUP_POINT) {
      const field = formModel.getField(FIELD_CODES.PICKUP_POINT);
      if (field) {
        fieldUpdates.push({ id: field.id, value: { choice_id: 1 } });
        state.finished = true;
        state.step_field_code = null;

        return this.buildResponse(
          "Спасибо! Ваш заказ принят и передан в кондитерскую цеха. Мы свяжемся с Вами для подтверждения деталей.",
          state,
          fieldUpdates,
          formModel
        );
      }
    }

    if (stepSuccess && currentCode) {
      state.completed_steps.push(currentCode);
      state.error_count = 0;
    }

    // 5. Выбор следующего шага
    const nextStepCode = this.determineNextStep(state, taskModel, formModel);
    if (!nextStepCode) {
      state.finished = true;
      state.step_field_code = null;
      return this.buildResponse(
        "Спасибо за заказ! Мы свяжемся с Вами в ближайшее время.",
        state,
        fieldUpdates,
        formModel
      );
    }

    state.step_field_code = nextStepCode;
    state.ask_counts[nextStepCode] = (state.ask_counts[nextStepCode] || 0) + 1;

    const questionText = this.getQuestionForStep(nextStepCode);
    return this.buildResponse(questionText, state, fieldUpdates, formModel);
  }

  private determineNextStep(state: BotState, taskModel: TaskModel, formModel: FormModel): string | null {
    const productTypeVal = taskModel.getValue(FIELD_CODES.PRODUCT_TYPE);
    const customCakeTypeVal = taskModel.getValue(FIELD_CODES.CUSTOM_ORDER_DESCRIPTION);
    const deliveryTypeVal = taskModel.getValue(FIELD_CODES.DELIVERY_TYPE);

    const isCustom = productTypeVal?.choice_id === 1 || state.completed_steps.includes(FIELD_CODES.CUSTOM_ORDER_DESCRIPTION);
    const isCatalog = productTypeVal?.choice_id === 2 || state.completed_steps.includes(FIELD_CODES.ORDER_ITEMS);

    if (!state.completed_steps.includes(FIELD_CODES.CLIENT_NAME)) return FIELD_CODES.CLIENT_NAME;
    if (!state.completed_steps.includes(FIELD_CODES.CLIENT_PHONE)) return FIELD_CODES.CLIENT_PHONE;
    if (!state.completed_steps.includes(FIELD_CODES.PRODUCT_TYPE)) return FIELD_CODES.PRODUCT_TYPE;

    if (isCustom) {
      if (!state.completed_steps.includes(FIELD_CODES.CUSTOM_ORDER_DESCRIPTION)) return FIELD_CODES.CUSTOM_ORDER_DESCRIPTION;
      if (!state.completed_steps.includes(FIELD_CODES.CAKE_FILLING)) return FIELD_CODES.CAKE_FILLING;

      const isOver2Kg = customCakeTypeVal?.choice_id === 2 || state.completed_steps.includes(FIELD_CODES.CAKE_WEIGHT);
      if (isOver2Kg && !state.completed_steps.includes(FIELD_CODES.CAKE_WEIGHT)) return FIELD_CODES.CAKE_WEIGHT;

      if (!state.completed_steps.includes(FIELD_CODES.DESIGN)) return FIELD_CODES.DESIGN;
    } else if (isCatalog) {
      if (!state.completed_steps.includes(FIELD_CODES.ORDER_ITEMS)) return FIELD_CODES.ORDER_ITEMS;
      if (!state.completed_steps.includes(FIELD_CODES.QUANTITY)) return FIELD_CODES.QUANTITY;
    }

    if (!state.completed_steps.includes(FIELD_CODES.PICKUP_DATE)) return FIELD_CODES.PICKUP_DATE;
    if (!state.completed_steps.includes(FIELD_CODES.PICKUP_TIME)) return FIELD_CODES.PICKUP_TIME;
    if (!state.completed_steps.includes(FIELD_CODES.DELIVERY_TYPE)) return FIELD_CODES.DELIVERY_TYPE;

    const isPickup = deliveryTypeVal?.choice_id === 1 || state.completed_steps.includes(FIELD_CODES.PICKUP_POINT);
    if (isPickup && !state.completed_steps.includes(FIELD_CODES.PICKUP_POINT)) return FIELD_CODES.PICKUP_POINT;

    return null;
  }

  private getQuestionForStep(code: string): string {
    switch (code) {
      case FIELD_CODES.CLIENT_NAME:
        return "Укажите, пожалуйста, Ваше имя.";
      case FIELD_CODES.CLIENT_PHONE:
        return "Укажите, пожалуйста, номер телефона для связи. (Формат: 7XXXXXXXXXX)";
      case FIELD_CODES.PRODUCT_TYPE:
        return "Что Вы хотели бы заказать? (Ответьте цифрой):\n1. Торт на заказ с индивидуальным дизайном\n2. Готовые позиции из каталога";
      case FIELD_CODES.CUSTOM_ORDER_DESCRIPTION:
        return "Какой вариант торта Вас интересует? (Можно ответить цифрой):\n1. Бенто торт с индивидуальным дизайном\n2. Торт от 2 кг с индивидуальным дизайном";
      case FIELD_CODES.CAKE_FILLING:
        return "Выберите начинку для Вашего торта: (Можно ответить цифрой):\n1. Сникерс\n2. Орех\n3. Чёрный лес\n4. Молочная девочка\n5. Чистый мёд\n6. Черничный\n7. Красный бархат";
      case FIELD_CODES.CAKE_WEIGHT:
        return "Укажите желаемый вес торта (в килограммах). Минимальный вес — 2 кг. (Введите число)";
      case FIELD_CODES.DESIGN:
        return "Приложите фото-референс или напишите описание дизайна. (Можете написать: Нет, если не имеется)";
      case FIELD_CODES.ORDER_ITEMS:
        return "Выберите позицию из нашего каталога: (Можно ответить цифрой):\n1. Рулет «Красный бархат» 450гр.\n2. Десерт «Сникерс» в стакане. 140 гр.\n3. Меренговый рулет с Малиной. 440 гр.\n4. Десерт «Керрот»\n5. Десерт «Орео»\n6. Торт «Манго-Маракуйя» 550 гр.\n7. Меренговый рулет Манго-Маракуйя\n8. Торт «Орео» порц.";
      case FIELD_CODES.QUANTITY:
        return "Укажите количество для выбранной позиции (число)";
      case FIELD_CODES.PICKUP_DATE:
        return "Укажите дату получения заказа. Минимальный срок — через 4 рабочих дня. (Введите в формате ДД.ММ.ГГГГ)";
      case FIELD_CODES.PICKUP_TIME:
        return "На какое время Вам удобно получить заказ? (Введите в формате ЧЧ:ММ)";
      case FIELD_CODES.DELIVERY_TYPE:
        return "Как Вы хотите получить заказ? (Ответьте цифрой):\n1. Самовывоз\n2. Доставка (осуществляется только через наш сайт)";
      case FIELD_CODES.PICKUP_POINT:
        return "Выберите точку самовывоза: (Можно ответить цифрой):\n1. Мира 62\n2. Парк хаус (Автозаводское шоссе 6) 1 этаж\n3. Мадагаскар (Льва Яшина 14)\n4. Тополиная 32б 1 этаж\n5. 40 лет победы 34а\n6. Дзержинского 30\n7. Галерея у восхода (революционная 18а)\n8. ТЦ Русь на Волге (революционная 52а)";
      default:
        return "Благодарим за заказ!";
    }
  }

  private buildResponse(
    text: string,
    state: BotState,
    fieldUpdates: Array<{ id: number; value: any }>,
    formModel: FormModel
  ): BotHookResponse {
    const stateField = formModel.getField(FIELD_CODES.STATE);
    if (stateField) {
      fieldUpdates.push({
        id: stateField.id,
        value: JSON.stringify(state)
      });
    }

    return {
      text,
      field_updates: fieldUpdates
    };
  }
}
```
