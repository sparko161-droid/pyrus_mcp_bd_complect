/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  ВЫЧИСЛЕНИЕ УСЛОВИЙ ВИДИМОСТИ (visibility_condition)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *  Зависимости при вставке в Pyrus: `utils/values.ts`, `models/FormModel.ts`,
 *  `models/TaskModel.ts`.
 *
 *  Pyrus НЕ вычисляет условия видимости на сервере для незавершённых задач —
 *  он отдаёт дерево правил `visibility_condition` как есть. Бот, задающий
 *  вопросы по очереди, обязан исполнять это дерево сам, иначе спросит адрес
 *  доставки у гостя, выбравшего самовывоз.
 *
 *  Типы условий Pyrus:
 *    11 — И (по children)      10 — ИЛИ (по children)
 *    1, 3 — заполнено (для галочки: отмечено)
 *    2, 4 — пусто (для галочки: снята)
 *    5 — равно               6 — не равно
 */

import { FormModel, FieldSchema } from "../models/FormModel";
import { TaskModel } from "../models/TaskModel";
import { isEmptyValue, valueChoiceId, valueDisplay } from "./values";

export type Logger = (msg: string) => void;

export function evaluateCondition(
  condition: any,
  form: FormModel,
  values: TaskModel,
  log: Logger = () => {}
): boolean {
  if (!condition) return true;

  const { field_id, condition_type, value, children } = condition;
  const kids: any[] = Array.isArray(children) ? children : [];

  if (condition_type === 11) return kids.every(c => evaluateCondition(c, form, values, log));
  if (condition_type === 10) return kids.some(c => evaluateCondition(c, form, values, log));

  if (!field_id) {
    // Узел-группировка без явного типа: трактуем как И по детям.
    return kids.length ? kids.every(c => evaluateCondition(c, form, values, log)) : true;
  }

  const schema = form.byId.get(Number(field_id));
  const raw = values.get(Number(field_id));
  const type = schema?.type || "text";
  const filled = !isEmptyValue(raw, type);

  const target = String(value ?? "").trim().toLowerCase();
  const asText = valueDisplay(raw, schema?.options).trim().toLowerCase();
  const asId = valueChoiceId(raw) || (type === "checkmark" ? (raw === "checked" ? "1" : "0") : "");

  let result: boolean;
  switch (condition_type) {
    case 1:
    case 3:
      result = filled;
      break;
    case 2:
    case 4:
      result = !filled;
      break;
    case 5:
      result = (asId !== "" && asId === target) || (asText !== "" && asText === target);
      break;
    case 6:
      result = !((asId !== "" && asId === target) || (asText !== "" && asText === target));
      break;
    default:
      // Неизвестное условие: показываем поле, чтобы диалог не встал молча.
      log(`Неизвестный condition_type=${condition_type} для поля ${field_id} — считаю видимым`);
      result = true;
  }

  log(`  условие: поле ${field_id} (${schema?.code || schema?.name || "?"}) значение='${asText || asId || "-"}' op=${condition_type} target='${target}' → ${result}`);
  return result;
}

/**
 * Поле видно, если выполнено его собственное условие И видны все контейнеры над ним.
 * Каскад повторяет поведение интерфейса Pyrus: поле внутри скрытой группы скрыто,
 * даже когда его собственное условие выполняется.
 */
export function isFieldVisible(
  schema: FieldSchema,
  form: FormModel,
  values: TaskModel,
  log: Logger = () => {}
): boolean {
  let current: FieldSchema | undefined = schema;
  const guard = new Set<number>(); // страховка от циклической ссылки parentId
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    if (current.visibility && !evaluateCondition(current.visibility, form, values, log)) return false;
    current = current.parentId === undefined ? undefined : form.byId.get(current.parentId);
  }
  return true;
}
