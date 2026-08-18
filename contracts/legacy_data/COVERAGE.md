# Сверка с Pyrus API v4

Инструментов на сервере: **58**  
Методов API закрыто: **42 из 58** (72%)  
Инструментов без соответствия документированному методу: **5**

## Покрытие по методам

| Метод | Назначение | Инструменты |
|---|---|---|
| `POST /auth` | Получение access_token | — |
| `GET /tasks/{id}` | Получить задачу со всеми комментариями | `get_task`, `get_tasks` |
| `POST /tasks` | Создать задачу | `create_task` |
| `POST /tasks/{id}/comments` | Комментарий — единственный способ изменить задачу | `comment_task`, `close_task`, `reopen_task`, `update_task_fields`, `attach_files_to_field`, `attach_new_file_version` |
| `DELETE /tasks/{id}` | Удалить задачу | `delete_task` |
| `GET /forms` | Список всех форм | `get_forms` |
| `GET /forms/{id}` | Описание формы | `get_form` |
| `GET /forms/{id}/register` | Реестр задач по форме | `get_registry`, `search_tasks`, `get_overdue_tasks`, `get_tasks_due_soon` |
| `GET /forms/{id}/permissions` | Права доступа к форме | `get_form_permissions` |
| `POST /forms/{id}/permissions` | Изменить права доступа | — |
| `GET /catalogs` | Список всех справочников | — |
| `GET /catalogs/{id}` | Справочник со всеми элементами | `get_catalog` |
| `PUT /catalogs` | Создать справочник | `create_catalog` |
| `POST /catalogs/{id}` | Полная синхронизация | `sync_catalog` |
| `POST /catalogs/{id}/diff` | Инкрементальное изменение | `update_catalog_items` |
| `GET /lists` | Все списки | `get_lists` |
| `GET /lists/{id}` | Конкретный список | `get_list` |
| `GET /lists/{id}/tasks` | Задачи из списка | `get_task_list` |
| `POST /lists/{id}` | Изменить список | `create_list`, `update_list`, `delete_list` |
| `GET /inbox` | Входящие | `get_inbox` |
| `POST /files/upload` | Загрузить файл | `get_upload_target` |
| `GET /files/download/{id}` | Скачать файл | `get_file_download_url` |
| `GET /members` | Все участники | `get_members` |
| `GET /members/{id}` | Сотрудник по ID | `get_member` |
| `POST /members` | Добавить пользователя | `create_member` |
| `PUT /members/{id}` | Изменить пользователя | `update_member` |
| `DELETE /members/{id}` | Заблокировать пользователя | — |
| `GET /roles` | Все роли | `get_roles` |
| `GET /roles/{id}` | Роль по ID | `get_role` |
| `POST /roles` | Создать роль | `create_role` |
| `PUT /roles/{id}` | Изменить роль | `update_role` |
| `DELETE /roles/{id}` | Удалить роль | `delete_role` |
| `GET /profile` | Профиль текущего пользователя | `get_profile` |
| `GET /contacts` | Контакты по организациям | `get_contacts` |
| `GET /announcements` | Список объявлений | `get_announcements` |
| `GET /announcements/{id}` | Объявление по ID | `get_announcement` |
| `POST /announcements` | Создать объявление | `create_announcement` |
| `POST /announcements/{id}/comments` | Комментарий к объявлению | `comment_announcement` |
| `GET /calendar` | Задачи и встречи за период | `get_meetings` |
| `GET /knowledgebase/{id}` | Статья или раздел | `get_knowledge_base_entity` |
| `PUT /knowledgebase/{id}` | Изменить статью | `update_knowledge_base_entity` |
| `POST /knowledgebase` | Создать статью | `create_knowledge_base_entity` |
| `GET /knowledgebase/structure` | Иерархия базы знаний | `get_knowledge_base_structure` |
| `GET /knowledgebase/{id}/permissions` | Права на статью | `get_knowledge_base_permissions` |
| `PUT /knowledgebase/{id}/permissions` | Изменить права | `update_knowledge_base_permissions` |
| `DELETE /knowledgebase/{id}` | Удалить статью | `delete_knowledge_base_entity` |
| `PUT /awards/{id}/threshold` | Пороги награды | — |
| `GET /awards/{id}/threshold` | Текущие пороги | — |
| `GET /members/{m}/awards/{a}/counter` | Счётчик награды | — |
| `POST /members/{m}/awards/{a}/counter/increment` | Инкремент счётчика | — |
| `PUT /members/{m}/awards/{a}/counter` | Установить счётчик | — |
| `GET /eventhistory` | CSV событий | — |
| `GET /fileaccesshistory` | CSV действий с файлами | — |
| `GET /taskaccesshistory` | CSV посещений задач | — |
| `GET /taskexporthistory` | CSV экспорта задач | — |
| `GET /registrydownloadhistory` | CSV скачивания реестров | — |
| `POST /integrations/call` | Регистрация звонка | — |
| `POST /integrations/attachcallrecord` | Прикрепить запись звонка | — |

## Не покрыто

- **Авторизация** (1): `POST /auth`
- **Формы** (1): `POST /forms/{id}/permissions`
- **Справочники** (1): `GET /catalogs`
- **Участники** (1): `DELETE /members/{id}`
- **Награды** (5): `PUT /awards/{id}/threshold`, `GET /awards/{id}/threshold`, `GET /members/{m}/awards/{a}/counter`, `POST /members/{m}/awards/{a}/counter/increment`, `PUT /members/{m}/awards/{a}/counter`
- **Журнал событий** (5): `GET /eventhistory`, `GET /fileaccesshistory`, `GET /taskaccesshistory`, `GET /taskexporthistory`, `GET /registrydownloadhistory`
- **Телефония** (2): `POST /integrations/call`, `POST /integrations/attachcallrecord`

## Инструменты без соответствия методу API

Это самое интересное в выгрузке. Каждый такой инструмент — либо составная
операция поверх нескольких вызовов, либо недокументированный эндпоинт Pyrus,
либо собственная логика сервера. Разбирайтесь с ними поимённо.

| Инструмент | Описание | Параметры |
|---|---|---|
| `add_approvers` | Add approval steps to a task. approvers is a list of lists of person dicts.  Optional per-call auth, for bots serving several Pyrus environments:   access_token | `approvers`, `task_id`, `access_token`, `api_url` |
| `add_subscribers` | Add subscribers to a task. subscribers is a list of person dicts with id or email.  Optional per-call auth, for bots serving several Pyrus environments:   acces | `subscribers`, `task_id`, `access_token`, `api_url` |
| `assign_task` | Reassign a task to another person. person is a dict with id or email.  Optional per-call auth, for bots serving several Pyrus environments:   access_token — act | `person`, `task_id`, `access_token`, `api_url` |
| `get_bots` | Get all bots available to the account.  Optional per-call auth, for bots serving several Pyrus environments:   access_token — act as this token instead of the c | `access_token`, `api_url` |
| `get_calendar_tasks` | Get calendar tasks for a time interval.     start_date_utc and end_date_utc should be ISO 8601 strings.     filter_mask bits: 0b1000 reminded, 0b0100 DueForCurr | `end_date_utc`, `start_date_utc`, `access_token`, `all_accessed_tasks`, `api_url`, `filter_mask`, `include_meetings`, `item_count` |

---

Сопоставление имён с методами задано таблицей `MAP` в `make_report.py`.
Если инструмент попал в «без соответствия» ошибочно — допишите правило туда.
