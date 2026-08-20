# Pyrus MCP — спецификация текущего функционала

Источник: инструменты `mcp__pyrus__*`, подключённые к проекту через `.mcp.json`
(удалённый сервер `https://pyrus-mcp-production.up.railway.app/mcp`, транспорт `http`).
Обёртка над **Pyrus REST API v4**. Полные JSON-схемы параметров — в
[pyrus_mcp_tools_spec.json](pyrus_mcp_tools_spec.json).

## Архитектурные наблюдения (важно для своей реализации)

- **Мультиарендность "из коробки".** Почти каждый инструмент принимает опциональные
  `access_token` и `api_url`, чтобы бот мог действовать от имени другого Pyrus-окружения
  (например, обрабатывая вебхук от клиента), не переоткрывая соединение. Без них
  используются креды подключения (`X-Pyrus-Login` / `X-Pyrus-Security-Key` → обмен на
  токен, судя по заголовкам в `.mcp.json`).
- **Загрузка файлов — не через сервер.** `get_upload_target` отдаёт URL+токен, дальше
  клиент сам делает `POST multipart/form-data` напрямую в Pyrus и получает `guid`,
  который уже передаётся в `create_task`/`comment_task`/`attach_new_file_version`.
  Это сознательное решение — не гонять байты файла через MCP-сервер.
- **Ограничение размера ответа — забота инструмента, а не просто урезание.**
  `get_task` поддерживает `include` (например `["fields"]`), чтобы не тащить полную
  историю комментариев. `get_registry` явно **отказывает** с указанием, как сузить
  запрос (`field_ids`, `item_count`, диапазон дат), вместо молчаливой обрезки.
- **Известные грабли Pyrus API, зашитые в описания инструментов (стоит сохранить):**
  - `get_registry` по умолчанию отдаёт только **открытые** задачи — закрытые не видны,
    и нет явного индикатора. Нужен `include_archived=true` для полной картины/аудита.
  - `field_filters` в `get_registry` принимает **только числовые id полей** (не имя/код);
    опечатка в ключе Pyrus молча проигнорирует и вернёт всё как будто без фильтра —
    сервис-обёртка отсеивает нечисловые ключи заранее, чтобы не давать этому случиться.
  - `steps` в `get_registry` — это `current_step` (шаг workflow), а не поле формы.
  - Пагинации по offset/cursor у Pyrus для реестра нет — обход больших реестров идёт
    окнами по датам (`created_after`/`created_before`).
  - `attach_new_file_version`: `root_id` — id **первой** версии файла (не меняется);
    `guid` должен быть от свежей загрузки — Pyrus не даёт переиспользовать guid.
  - Поле типа `file` нельзя заполнить при создании задачи — только отдельным вызовом
    `attach_files_to_field`, и оно **аддитивное** (очистить через API нельзя).
  - `update_knowledge_base_entity` требует передавать `title` при любом изменении,
    иначе Pyrus отклоняет запрос.
  - `get_tasks` (батч) — у Pyrus нет batch-эндпоинта, поэтому это N последовательных
    запросов против лимита 5000/10 мин; упавшие id попадают в `errors`, не валят весь батч.
  - `delete_task` необратимо удаляет — для обычного завершения нужен `close_task`.

## Инструменты по категориям (61 шт.)

### Задачи (17)
`create_task`, `get_task`, `get_tasks` (батч), `get_task_list`, `search_tasks`,
`update_task_fields`, `close_task`, `reopen_task`, `delete_task`, `assign_task`,
`add_approvers`, `add_subscribers`, `comment_task`, `attach_files_to_field`,
`attach_new_file_version`, `get_overdue_tasks`, `get_tasks_due_soon`, `get_calendar_tasks`,
`get_registry`

### Формы (3)
`get_form`, `get_forms`, `get_form_permissions`

### Объявления (3)
`create_announcement`, `get_announcement`, `get_announcements`, `comment_announcement`

### База знаний (7)
`create_knowledge_base_entity`, `get_knowledge_base_entity`,
`update_knowledge_base_entity`, `delete_knowledge_base_entity`,
`get_knowledge_base_structure`, `get_knowledge_base_permissions`,
`update_knowledge_base_permissions`

### Списки задач (5)
`create_list`, `get_list`, `get_lists`, `update_list`, `delete_list`

### Справочники/каталоги (4)
`create_catalog`, `get_catalog`, `sync_catalog` (полная замена),
`update_catalog_items` (diff: upsert/delete)

### Участники и роли (9)
`create_member`, `get_member`, `get_members`, `update_member`,
`create_role`, `get_role`, `get_roles`, `update_role`, `delete_role`

### Прочее (10)
`get_contacts`, `get_file_download_url`, `get_upload_target`, `get_profile`,
`get_bots`, `get_inbox`, `get_meetings`, `get_calendar_tasks` *(дублирует счёт выше)*

## Что можно доработать в своей реализации

Идеи, вытекающие из пробелов текущего набора (уточните с пользователем, что реально нужно):

1. **Вебхуки Pyrus** — текущий набор весь pull-based; нет инструмента для регистрации/
   обработки входящих вебхуков (bot API v4 их поддерживает).
2. **Пагинация реестра** — сейчас обход больших реестров вручную окнами по датам;
   можно спрятать это в один инструмент с автоматическим постраничным обходом и лимитом
   суммарного размера.
3. **Курсорный список комментариев** — `get_task` либо всё, либо по `include`; нет
   постраничного чтения истории у очень больших задач.
4. **Массовые операции** — нет batch-версий для `update_task_fields`/`close_task`
   по списку id (только `get_tasks` батчевый на чтение).
5. **Кэш метаданных форм** — повторные `get_form(flatten=true)` для поиска id полей
   можно закэшировать на сервере, чтобы не гонять эти вызовы вручную каждый раз.
6. **Явный `is_closed`/статус в `get_registry`** — обёртка могла бы сама
   вычислять и возвращать флаг закрытости на основе `include_archived`,
   а не заставлять агента об этом помнить.

## Файлы

- [pyrus_mcp_tools_spec.json](pyrus_mcp_tools_spec.json) — машиночитаемая спецификация
  (имя, описание, параметры) для генерации кода нового сервера.
