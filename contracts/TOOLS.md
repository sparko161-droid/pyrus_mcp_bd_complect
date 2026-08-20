# Инструменты MCP-сервера `pyrus`

Адрес: `https://pyrus-mcp-production.up.railway.app/mcp`  
Версия протокола: `2025-06-18`  
Снято: 2026-08-18T11:33:29+0400  
**Всего инструментов: 58**

## Сводка

| Группа | Инструментов |
|---|--:|
| Задачи | 14 |
| Люди и роли | 10 |
| База знаний | 7 |
| Файлы | 5 |
| Списки | 5 |
| Объявления | 4 |
| Справочники | 4 |
| Формы | 3 |
| Прочее | 2 |
| Реестры | 1 |
| Входящие | 1 |
| Календарь | 1 |
| Боты | 1 |

## Задачи

### `assign_task`

Reassign a task to another person. person is a dict with id or email.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

`⚠ не ложится на документированный метод API`

Параметры:

- `person` *object* **обяз.**
- `task_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

### `close_task`

Close a task by adding a 'finished' action comment.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /tasks/{id}/comments`

Параметры:

- `task_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `text` *string/null*

### `comment_task`

Add a comment to a task.
    action: "finished" or "reopened".
    approval_choice: "approved", "rejected", "revoked", or "acknowledged".
    channel sends the comment out through an external channel. Either a bare type
    string or the full object {"type": ..., "to": {...}, "from": {...}}.
    Supported types: email, telegram, max_messenger, vk, viber, private_channel,
    whats_app, web_widget, mobile_app, avito_job, avito_messenger.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /tasks/{id}/comments`

Параметры:

- `task_id` *integer* **обяз.**
- `access_token` *string/null*
- `action` *string/null*
- `added_list_ids` *array/null*
- `api_url` *string/null*
- `approval_choice` *string/null*
- `approval_steps` *array/null*
- `approvals_added` *array/null*
- `approvals_removed` *array/null*
- `approvals_rerequested` *array/null*
- `attachments` *array/null*
- `cancel_due` *boolean/null*
- `cancel_schedule` *boolean/null*
- `channel` *string/object/null*
- `due` *string/null*
- `due_date` *string/null*
- `duration` *integer/null*
- `edit_comment_id` *integer/null*
- `field_updates` *array/null*
- `participants_added` *array/null*
- `participants_removed` *array/null*
- `reassign_to` *object/null*
- `removed_list_ids` *array/null*
- `scheduled_date` *string/null*
- `scheduled_datetime_utc` *string/null*
- `skip_auto_reopen` *boolean/null*
- `skip_notification` *boolean/null*
- `skip_satisfaction` *boolean/null*
- `spent_minutes` *integer/null*
- `subject` *string/null*
- `subscribers_added` *array/null*
- `subscribers_removed` *array/null*
- `subscribers_rerequested` *array/null*
- `text` *string/null*

### `create_task`

Create a new task.
    Pass either text (simple task) or form_id (form task).
    responsible/participants/subscribers are dicts with keys: id, email, first_name, last_name.
    fields are dicts with keys: id, name, type, value, code.
    approvals is a list of lists of person dicts.
    attachments is a list of uploaded file GUIDs.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /tasks`

Параметры:

- `access_token` *string/null*
- `api_url` *string/null*
- `approvals` *array/null*
- `attachments` *array/null*
- `due` *string/null*
- `due_date` *string/null*
- `duration` *integer/null*
- `fields` *array/null*
- `fill_defaults` *boolean/null*
- `form_id` *integer/null*
- `list_ids` *array/null*
- `parent_task_id` *integer/null*
- `participants` *array/null*
- `responsible` *object/null*
- `scheduled_date` *string/null*
- `scheduled_datetime_utc` *string/null*
- `subject` *string/null*
- `subscribers` *array/null*
- `text` *string/null*

### `delete_task`

Delete a task permanently. This cannot be undone — to merely finish a
    task, use close_task instead.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `DELETE /tasks/{id}`

Параметры:

- `task_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

### `get_calendar_tasks`

Get calendar tasks for a time interval.
    start_date_utc and end_date_utc should be ISO 8601 strings.
    filter_mask bits: 0b1000 reminded, 0b0100 DueForCurrentStep, 0b0010 DueDate, 0b0001 Due.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

`⚠ не ложится на документированный метод API`

Параметры:

- `end_date_utc` *string* **обяз.**
- `start_date_utc` *string* **обяз.**
- `access_token` *string/null*
- `all_accessed_tasks` *boolean* (по умолч. `false`)
- `api_url` *string/null*
- `filter_mask` *integer* (по умолч. `7`)
- `include_meetings` *boolean* (по умолч. `false`)
- `item_count` *integer* (по умолч. `50`)

### `get_overdue_tasks`

Get overdue tasks from a form register.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /forms/{id}/register`

Параметры:

- `form_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `item_count` *integer* (по умолч. `200`)

### `get_task`

Get a task by id, with all its comments by default.

    A busy task runs to well over a hundred kilobytes, most of it comment
    history. When you only need part of it, name the top-level keys you want in
    `include` — e.g. ["fields"] or ["fields", "comments"]. The task id and
    subject always come back, so the result stays identifiable.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /tasks/{id}`

Параметры:

- `task_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `include` *array/null*

### `get_task_list`

Get tasks from a specific list.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /lists/{id}/tasks`

Параметры:

- `list_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `include_archived` *boolean/null*
- `item_count` *integer* (по умолч. `200`)

### `get_tasks`

Get several tasks at once, saving a round trip per task.

    Pyrus has no batch endpoint, so this still costs one Pyrus request per id
    against the 5000-per-10-minutes cap — ask for tens or hundreds, not
    thousands. A task that fails is listed under 'errors' instead of sinking
    the whole batch, and the reply stops early if the rate limit runs out.

    Full task bodies are large: a few hundred will exceed the response limit.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /tasks/{id}`

Параметры:

- `task_ids` *array<integer>* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

### `get_tasks_due_soon`

Get tasks with upcoming due dates within N days from a form register.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /forms/{id}/register`

Параметры:

- `form_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `days` *integer* (по умолч. `7`)
- `item_count` *integer* (по умолч. `200`)

### `reopen_task`

Reopen a previously closed task.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /tasks/{id}/comments`

Параметры:

- `task_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `text` *string/null*

### `search_tasks`

Search tasks in a form register by date range.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /forms/{id}/register`

Параметры:

- `form_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `created_after` *string/null*
- `created_before` *string/null*
- `item_count` *integer* (по умолч. `200`)

### `update_task_fields`

Update form fields of an existing task. fields is a list of dicts with id/name/type/value/code.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /tasks/{id}/comments`

Параметры:

- `fields` *array<object>* **обяз.**
- `task_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

## Люди и роли

### `create_member`

Create an organization member.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /members`

Параметры:

- `email` *string* **обяз.**
- `first_name` *string* **обяз.**
- `last_name` *string* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `birthday` *string/null*
- `department_id` *integer/null*
- `department_name` *string/null*
- `fired` *boolean/null*
- `location` *string/null*
- `mobile_phone` *string/null*
- `personnel_number` *string/null*
- `phone` *string/null*
- `position` *string/null*

### `create_role`

Create a role. members is a list of person ids.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /roles`

Параметры:

- `name` *string* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `members` *array/null*

### `delete_role`

Delete a role. task_receiver_id is the new receiver for role tasks.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `DELETE /roles/{id}`

Параметры:

- `role_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `task_receiver_id` *integer/null*

### `get_contacts`

Get contacts grouped by organization.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /contacts`

Параметры:

- `access_token` *string/null*
- `api_url` *string/null*
- `include_inactive` *boolean* (по умолч. `false`)

### `get_member`

Get a single member by id.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /members/{id}`

Параметры:

- `member_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

### `get_members`

Get all organization members.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /members`

Параметры:

- `access_token` *string/null*
- `api_url` *string/null*

### `get_role`

Get a single role by id.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /roles/{id}`

Параметры:

- `role_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

### `get_roles`

Get all roles.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /roles`

Параметры:

- `access_token` *string/null*
- `api_url` *string/null*

### `update_member`

Update an organization member.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `PUT /members/{id}`

Параметры:

- `member_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `birthday` *string/null*
- `department_id` *integer/null*
- `department_name` *string/null*
- `email` *string/null*
- `fired` *boolean/null*
- `first_name` *string/null*
- `last_name` *string/null*
- `location` *string/null*
- `mobile_phone` *string/null*
- `personnel_number` *string/null*
- `phone` *string/null*
- `position` *string/null*

### `update_role`

Update a role.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `PUT /roles/{id}`

Параметры:

- `role_id` *integer* **обяз.**
- `access_token` *string/null*
- `added_members` *array/null*
- `api_url` *string/null*
- `banned` *boolean/null*
- `name` *string/null*
- `removed_members` *array/null*

## База знаний

### `create_knowledge_base_entity`

Create a knowledge base entity.
    type: "article" or "topic". Body is required for articles.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /knowledgebase`

Параметры:

- `title` *string* **обяз.**
- `type` *string* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `body` *string/null*
- `parent_topic_id` *string/null*

### `delete_knowledge_base_entity`

Delete a knowledge base entity.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `DELETE /knowledgebase/{id}`

Параметры:

- `entity_id` *string* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `delete_with_children` *boolean* (по умолч. `false`)

### `get_knowledge_base_entity`

Get a knowledge base entity (article or topic).

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /knowledgebase/{id}`

Параметры:

- `entity_id` *string* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

### `get_knowledge_base_permissions`

Get knowledge base entity permissions.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /knowledgebase/{id}/permissions`

Параметры:

- `entity_id` *string* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

### `get_knowledge_base_structure`

Get knowledge base structure (tree of topics and articles).

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /knowledgebase/structure`

Параметры:

- `access_token` *string/null*
- `api_url` *string/null*
- `depth` *integer/null*
- `parent_topic_id` *string/null*

### `update_knowledge_base_entity`

Update a knowledge base entity.

    Pass title along with any change — Pyrus rejects an update without it.

    Moving an entity: give parent_topic_id and the move happens. Pyrus needs a
    separate parent_topic_id_changed flag for that, which is set for you;
    passing it explicitly is only useful to override the behaviour.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `PUT /knowledgebase/{id}`

Параметры:

- `entity_id` *string* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `body` *string/null*
- `parent_topic_id` *string/null*
- `parent_topic_id_changed` *boolean/null*
- `title` *string/null*

### `update_knowledge_base_permissions`

Update knowledge base entity permissions.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `PUT /knowledgebase/{id}/permissions`

Параметры:

- `entity_id` *string* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `editors` *array/null*
- `inherit` *boolean/null*
- `readers` *array/null*

## Файлы

### `attach_files_to_field`

Put already-uploaded files into a form field of type 'file'.

    file_ids are the attachments' NUMERIC ids (what Pyrus returns once a file is
    attached to the task), not the upload guids.

    Two constraints of Pyrus, worth knowing before you plan a sequence:
      - a file field cannot be filled while creating the task; it takes a
        separate step, which is what this tool does;
      - the field is additive — this appends, and there is no way to clear it
        through the API.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /tasks/{id}/comments`

Параметры:

- `field_id` *integer* **обяз.**
- `file_ids` *array<?>* **обяз.**
- `task_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

### `attach_new_file_version`

Attach a freshly uploaded file as a new version of an existing one.

    root_id is the id of the FIRST version of the file and stays the same for
    every later version — using the id of version 2 to add version 3 breaks the
    chain. The guid must come from a fresh upload: Pyrus rejects a guid that has
    already been attached ('An ID can only be used once').

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /tasks/{id}/comments`

Параметры:

- `guid` *string* **обяз.**
- `root_id` *integer* **обяз.**
- `task_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `text` *string/null*

### `get_file_download_url`

Get a download URL for a file, without transferring its contents.

    Fetch the returned URL yourself with header 'Authorization: Bearer
    <access_token>'. The file's bytes are deliberately not returned here: a
    single attachment would otherwise flood the conversation.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /files/download/{id}`

Параметры:

- `file_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

### `get_profile`

Get current user profile.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /profile`

Параметры:

- `access_token` *string/null*
- `api_url` *string/null*
- `include_inactive` *boolean* (по умолч. `false`)

### `get_upload_target`

Get the URL and token for uploading a file to Pyrus yourself.

    Upload the file directly to Pyrus with an HTTP POST — do not send its bytes
    through this server. Send multipart/form-data with the file in the 'file'
    field and header 'Authorization: Bearer <access_token>'. Pyrus responds with
    a guid; pass it to create_task/comment_task to attach the file, or to
    attach_new_file_version to add a version of an existing one.

    The target belongs to whichever environment this call is authenticated
    against, so when working in a customer's environment pass that same
    access_token/api_url here: a file uploaded elsewhere cannot be attached to
    their task.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /files/upload`

Параметры:

- `access_token` *string/null*
- `api_url` *string/null*
- `name` *string/null*

## Списки

### `create_list`

Create a task list. color is a hex string such as '#F44336'.
    Omit parent_id to create a top-level list.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /lists/{id}`

Параметры:

- `name` *string* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `color` *string/null*
- `parent_id` *integer/null*

### `delete_list`

Delete a task list. Tasks in it are not deleted, only their membership.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /lists/{id}`

Параметры:

- `list_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

### `get_list`

Get a single task list by id.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /lists/{id}`

Параметры:

- `list_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

### `get_lists`

Get all available task lists.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /lists`

Параметры:

- `access_token` *string/null*
- `api_url` *string/null*

### `update_list`

Update a task list. Pass at least one of name, parent_id, color.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /lists/{id}`

Параметры:

- `list_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `color` *string/null*
- `name` *string/null*
- `parent_id` *integer/null*

## Объявления

### `comment_announcement`

Add a comment to an announcement.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /announcements/{id}/comments`

Параметры:

- `announcement_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `attachments` *array/null*
- `text` *string/null*

### `create_announcement`

Create an announcement.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /announcements`

Параметры:

- `text` *string* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `attachments` *array/null*

### `get_announcement`

Get a single announcement by id.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /announcements/{id}`

Параметры:

- `announcement_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

### `get_announcements`

Get announcements.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /announcements`

Параметры:

- `access_token` *string/null*
- `api_url` *string/null*
- `item_count` *integer* (по умолч. `100`)

## Справочники

### `create_catalog`

Create a catalog. items is a list of rows, each row is a list of strings.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `PUT /catalogs`

Параметры:

- `catalog_headers` *array<string>* **обяз.**
- `name` *string* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `items` *array/null*

### `get_catalog`

Get a catalog by id.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /catalogs/{id}`

Параметры:

- `catalog_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

### `sync_catalog`

Sync a catalog (full replace). All unspecified items will be deleted.
    items is a list of dicts with catalog field values.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /catalogs/{id}`

Параметры:

- `catalog_headers` *array<string>* **обяз.**
- `catalog_id` *integer* **обяз.**
- `items` *array<object>* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `apply` *boolean* (по умолч. `false`)

### `update_catalog_items`

Update catalog items (diff). upsert is a list of items to add/update.
    delete is a list of item keys to remove.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `POST /catalogs/{id}/diff`

Параметры:

- `catalog_id` *integer* **обяз.**
- `upsert` *array<object>* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `delete` *array/null*

## Формы

### `get_form`

Get a single form template by id.

    Fields can be nested inside title groups, so the top level is not the whole
    form. Pass flatten=true to get every field in one list, each with a 'depth'
    telling you how deep it was — useful when you need a field id and do not
    care about the grouping.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /forms/{id}`

Параметры:

- `form_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `flatten` *boolean* (по умолч. `false`)

### `get_form_permissions`

Get permissions for a form.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /forms/{id}/permissions`

Параметры:

- `form_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

### `get_forms`

Get all available form templates.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /forms`

Параметры:

- `access_token` *string/null*
- `api_url` *string/null*

## Прочее

### `add_approvers`

Add approval steps to a task. approvers is a list of lists of person dicts.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

`⚠ не ложится на документированный метод API`

Параметры:

- `approvers` *array<array>* **обяз.**
- `task_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

### `add_subscribers`

Add subscribers to a task. subscribers is a list of person dicts with id or email.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

`⚠ не ложится на документированный метод API`

Параметры:

- `subscribers` *array<object>* **обяз.**
- `task_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*

## Реестры

### `get_registry`

Get tasks register for a form template.
    Dates should be ISO 8601 strings, e.g. "2024-01-01T00:00:00Z".

    READ THIS BEFORE TRUSTING A COUNT. By default the register returns only
    OPEN tasks; closed ones are left out entirely and nothing says so. On one
    measured form that meant 681 tasks instead of 3046 — 78% missing. Pass
    include_archived=true whenever you are counting, auditing or analysing
    history. This also gives you closed-vs-open for free: the default listing
    is the open set, include_archived=true is everything, and the difference
    is the closed set. There is no is_closed field in the register, and
    guessing from current_step is unreliable — a step-20 task was open while
    closed ones sat at steps 2, 3 and 5.

    field_filters narrows by form field value, keyed by the field's NUMERIC id:
    {"6": 958621} sends fld6=958621. Field names and codes are rejected —
    Pyrus filters on the id alone. Look ids up with get_form(flatten=true),
    since fields can sit inside groups. A filter Pyrus does not recognise is
    ignored without error, so a mistyped key would quietly return every task
    as though nothing were filtered; non-numeric keys are refused here instead.

    steps filters by current_step, which is the workflow step number and not a
    form field. A form's own "stage"-like field is a separate thing.

    Registers get very large — a year of one form measured 16 MB, far past any
    context window. Plan the query before making it:
      - field_ids narrows each task to the fields you name (biggest saving by far);
      - item_count caps how many tasks come back;
      - created_after/created_before shorten the period.
    An oversized result is refused with guidance rather than truncated silently.

    To walk a large register in full, page by date rather than by offset —
    Pyrus offers no offset or cursor here. Take a window with created_after and
    created_before, note the newest create_date you received, and use it as the
    next created_after. Month-wide windows plus field_ids keep each page small.

    Pyrus does not report whether a task is closed in the register: each entry
    carries create_date, current_step, fields, id, last_modified_date and
    last_note_id, but no close_date or is_closed. Filtering to only-open tasks
    therefore needs get_task per task — which the rate limit makes impractical
    beyond a few hundred. closed_after/closed_before filter by closing date,
    not by status.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /forms/{id}/register`

Параметры:

- `form_id` *integer* **обяз.**
- `access_token` *string/null*
- `api_url` *string/null*
- `closed_after` *string/null*
- `closed_before` *string/null*
- `created_after` *string/null*
- `created_before` *string/null*
- `field_filters` *object/null*
- `field_ids` *array/null*
- `include_archived` *boolean/null*
- `item_count` *integer/null*
- `modified_after` *string/null*
- `modified_before` *string/null*
- `steps` *array/null*
- `task_ids` *array/null*

## Входящие

### `get_inbox`

Get inbox tasks.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /inbox`

Параметры:

- `access_token` *string/null*
- `api_url` *string/null*
- `group_tasks_count` *integer* (по умолч. `50`)
- `tasks_count` *integer* (по умолч. `50`)

## Календарь

### `get_meetings`

Get calendar meetings. Pyrus returns these inside the inbox payload.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

→ `GET /calendar`

Параметры:

- `access_token` *string/null*
- `api_url` *string/null*
- `group_tasks_count` *integer* (по умолч. `50`)
- `tasks_count` *integer* (по умолч. `50`)

## Боты

### `get_bots`

Get all bots available to the account.

Optional per-call auth, for bots serving several Pyrus environments:
  access_token — act as this token instead of the connection's credentials
  api_url      — the customer's Pyrus environment, e.g. 'https://api.pyrus.com/v4' (taken from the webhook payload)
Omit both to use the credentials the connection was opened with.

`⚠ не ложится на документированный метод API`

Параметры:

- `access_token` *string/null*
- `api_url` *string/null*
