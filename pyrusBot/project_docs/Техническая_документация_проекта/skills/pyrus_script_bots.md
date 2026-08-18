---
title: "Навык: pyrus-script-bots"
audience: "internal"
pyrus_id: "FXXkmYMtWqp"
pyrus_parent: "D5C0HGLOXYA"
synced_at: "2026-08-10T13:46:27.000Z"
synced_hash: "sha256:76ee80625103cbf7a67fb4178f70b9c9"
---

This skill provides step-by-step guidance, code structures, API reference, safety constraints, and checklists for building and maintaining Pyrus Server Script bots in TypeScript.

## When to Use This Skill
Use this skill whenever you need to:
1. Create a new Pyrus server script bot or adapt an existing template.
2. Modify or debug existing Pyrus bots (`CopyBot`, `RouterBot`, `ResponsibilityMonitoringBot`, `DialogBot`).
3. Add custom business logic, field updates, table row management, file attachments, catalog lookups, or multi-choice updates.
4. Integrate Pyrus tasks with external REST APIs or internal workflows.
5. Review bot configuration, permissions, error logs, or performance limits.

---

## 1. Core Execution Model & Technical Constraints

- **Prerequisite Gate**: NEVER start writing bot code until ТЗ, Catalogs, JSON Form Upload, and Form Verification via `pyrus:dump` are 100% completed.
- **Language & Engine**: TypeScript executed in Node.js on Pyrus servers.
- **SDK**: Pre-installed `pyrus-api` (`BotHookRequest`, `BotHookResponse`, `PyrusApiClient`).
- **Entry Point**: `export default async function(request: BotHookRequest): Promise<BotHookResponse>`
- **Stateless Environment**: No file system persistence, no global state between webhooks. State MUST be stored in task fields (e.g. JSON in technical text fields).
- **Execution Limits**:
  - Time limit: 60 seconds (Paid), 1 second (Free).
  - Memory: 256 MB RAM.
  - Rate limit: 10 executions / 10 seconds per bot.
  - External npm packages: **NOT ALLOWED**. Only Node stdlib and `pyrus-api`.
- **Async Execution Rule**: **CRITICAL**. Execution stops IMMEDIATELY when the handler returns a value or resolves a Promise. All unawaited promises (`doSomethingAsync()` without `await`) will be killed. Always `await` all async calls.
- **Single file**: A deployed bot is ONE file pasted into the Pyrus editor. It MUST NOT import from `src/lib/` — the function bank is a source you copy blocks OUT of, not a package you link against. An `import { FormModel } from "../../src/lib/..."` typechecks locally and then fails on deploy. Duplication between a deployed bot and the bank is expected and correct; the anti-duplication rule applies to the bank itself.
- **Code Articles in KB**: Always run `npm run mirror:scripts` after writing/updating bot code so that `<script>.ts.md` code articles are generated and synced to Pyrus KB under "Forms and scripts".

---

## 2. Bot Blueprint Selection Matrix


Before writing new code, identify the right architectural base:

1. **New Custom Business Logic / Calculations / External API**:
   - Use `reference/pyrus_vendor/Серверные_скрипты/Шаблонный бот/ServerScript 7 (3).ts`.
   - Wrap task with `const bot = new ExtendedClient(request.access_token, request.user_id)` and `const task = await bot.fix_task(request.task)`.
   - Implement business logic in `function_to_do(bot, task, settings)`.

2. **Copying / Syncing Data Between Tasks or Tables**:
   - Use `reference/pyrus_vendor/Серверные_скрипты/Бот копирования/CopyBot v5.0.ts`.
   - Define declarative `CopyRule` rules (field relations, table conditions, aggregation functions).

3. **Approval Routing / Re-approvals / Revision Returns**:
   - Use `reference/pyrus_vendor/Серверные_скрипты/Маршрутизатор/Маршрутизатор.txt`.

4. **Assignee / Responsible User Synchronization**:
   - Use `reference/pyrus_vendor/Серверные_скрипты/Мониторинг ответственных/`.

5. **Customer Interactive Dialog Bot**:
   - Use `reference/legacy_bots/dialog_bot.ts` pattern with state JSON in `technical_bot_state` field and `channel` forwarding.

---

## 3. Mandatory Coding Conventions

### Know the form before you write against it
Before writing or modifying a bot for a form you have not documented yet, dump its real composition:

```bash
npm run pyrus:dump -- --form=<form_id>
```

Reading codes out of an existing bot shows you only the fields that bot happens to use. The dump gives every field with its code, id, type, nesting, choice options with `choice_id`, and `catalog_id` — which is what stops you inventing a code that does not exist or missing a visibility condition that will hide your field.

### Field Access via Codes
NEVER hardcode numeric field IDs in business logic. Always use field codes:
```ts
const customerField = task.named_fields["customer_code"];
const val = customerField?.value;
```

### Type Checking & Null Values
- **Text / Email / Phone**: Empty is `null` or `""`.
- **Number / Money**: `0` is a valid filled value! NEVER check `if (!field.value)`. Check `field.value === null || field.value === undefined`.
- **Checkmark**: Values are `"checked"` or `"unchecked"`.
- **Multiple Choice**: Get valid choice IDs via `await bot.get_multiple_choice_dict(code, task)`. Set `{ choice_id: id }`.
- **Catalog**: Search using `await get_values_for_catalog(bot, ["SearchTerm"], fieldInfo)`.
- **Form Link**: Always populate `{ task_id: id, task_ids: [id], subject: `Task #${id}` }`.
- **Date**: Use `isSameDate` or `normalizeDate` to compare. Never use `===`.
- **Table**: Table updates must send the entire table field. Compare rows by `row_id`, not array index. Add rows via `await bot.add_row_to_table(rows, tableId, formId, taskId)`.

### Code Reuse & Anti-Duplication Rule (CRITICAL)
NEVER create duplicate helper functions or re-invent utility functions. Always audit the codebase and reuse pre-existing classes and utilities: `FormModel`, `TaskModel`, `ExtendedClient`, `same_value`, `copy_by_value`, `get_values_for_catalog`, `get_multiple_choice_dict`, `normalizeDate`, `isSameDate`.

### Loop & Self-Response Protection (Advanced Safeguards)
- **Self-Comment Filter**: Ignore comments authored by `request.user_id` or outbound channel messages.
- **Webhook Deduplication (`last_event_key`)**: Track `state.last_event_key = comment.id`. If webhook re-triggers for the same comment ID, return `null` immediately.
- **Max Asks Fuse (`MAX_ASKS_PER_FIELD`)**: Cap questions per field (`ask_counts[code] <= 4`). If exceeded, hand off to operator (`state.finished = true`, `approval_choice: "approved"`).
- **Max Errors Fuse (`MAX_ERRORS`)**: Cap consecutive unrecognized inputs (`error_count <= 3`). Hand off to operator upon limit.

### Recursive Tree Parsing (Mandatory for Server Scripts)
Server scripts MUST load full form structure and recursively parse nested fields (`FormModel` + `TaskModel` pattern from `order_bot.ts`) to handle fields inside `title` sections, `group` containers, `options`, and `columns`/`cells` without missing nested state fields.

---

## 4. Debugging & Simulation Testing

- **Local Simulator**: Test bot logic locally using `src/lib/testing/pyrus_simulator.ts` and `test_runner.ts`:
  ```bash
  npm run test
  ```
- **No real network in tests**: `simulateServerBot` replaces global `fetch` for the duration of the call. Declare the Pyrus responses the bot needs via the `routes` option; anything left undeclared lands in `network.unmatched` and MUST be asserted empty. A test that reaches `api.pyrus.com` is a broken test — it depends on Pyrus availability and burns the account rate limit.
- **Execution Logs**: Use `console.log(...)` for tracing execution. Logs are captured by Pyrus and displayed in the Bot Profile Event Log.
- **Debug Comments**: For internal debug comments inside a task, use `[BOT-DEBUG]` prefix and ensure `skip_notification: true` and no external `channel` is set.

---

## 5. Pre-Launch Verification Checklist

1. [ ] Existing codebase utilities (`FormModel`, `TaskModel`, `ExtendedClient`, `same_value`) are reused instead of duplicating code.
2. [ ] Field codes match Pyrus form schema exactly.
3. [ ] Form & Task data parsed recursively (`FormModel` / `TaskModel` / `ExtendedClient`) including nested headers and table cells.
4. [ ] Bot has permissions for source and target forms and catalogs ("Управляющий интеграциями" / "Управляющий").
5. [ ] `same_value()` check is performed before returning `field_updates` to avoid redundant comments.
6. [ ] Safeguards active: `last_event_key` deduplication, `ask_counts` limit, `error_count` operator handoff.
7. [ ] `0` and `false` values are correctly handled for number and checkmark fields.
8. [ ] Multiple choice options filter out deleted options.
9. [ ] Table rows use `row_id` for tracking.
10. [ ] Every async operation is explicitly `await`ed.
11. [ ] Bot ignores its own comments (`author.id === request.user_id`).
12. [ ] Run targeted TypeScript type check: `npx tsc --noEmit --skipLibCheck <filename.ts>`.
13. [ ] Run local simulation test via `npm run test` before deployment, with `network.unmatched` asserted empty.
