# Comprehensive MCP Integration Test Report

## 1. Reads (GET endpoints)

### Tool: get_profile
[OK] Success. Snippet: {'person_id': 1238106, 'first_name': 'Стандарт', 'last_name': 'Мастер', 'email': 'admin@standartmaster.ru', 'locale': 'ru-RU', 'timezone_offset': 240,...

### Tool: get_contacts
[OK] Success. Snippet: {'organizations': [{'organization_id': 231057, 'name': 'Демо Кабинет', 'persons': [{'id': 1276501, 'first_name': 'Запись времени Апрува', 'last_name':...

### Tool: get_bots
[OK] Success. Snippet: {'bots': []}...

### Tool: get_roles
[OK] Success. Snippet: [{'id': 1322340, 'name': 'QA_AUTO_TEST_ROLE', 'member_ids': None}, {'id': 1316000, 'name': 'Бухгалтерия', 'member_ids': [1315237, 1314467, 1314470, 13...

### Tool: get_forms
[OK] Success. Snippet: [{'id': 2375190, 'name': 'Карточка клиента', 'steps': None, 'fields': [{'id': 1, 'type': 'text', 'name': 'Имя гостя', 'info': {'code': 'guest_name', '...

### Tool: get_catalogs
[OK] Success. Snippet: [{'catalog_id': 304325, 'name': 'Подтипы заявок Хозяйственные заявки (HD)', 'version': 1305478995}, {'catalog_id': 303574, 'name': 'Точки БФ', 'versio...

### Tool: get_lists
[OK] Success. Snippet: {'lists': [{'id': 2396159, 'name': 'Управленческий список', 'version': 1310506402, 'list_type': 'private', 'color': '#5AC180', 'manager_ids': [1238106...

### Tool: get_announcements
[OK] Success. Snippet: []...

### Tool: get_kb_structure
[OK] Success. Snippet: {'items': [{'id': 'EalkJybYwNX', 'type': 'topic', 'title': '00 ОБЩИЕ', 'access_right': 'write', 'is_open_for_organization': True, 'children': [{'id': ...

### Tool: get_inbox
[OK] Success. Snippet: {'tasks': [{'id': 372762850, 'create_date': '2026-08-12T11:40:56Z', 'last_modified_date': '2026-08-12T11:40:56Z', 'author': {'id': 1730, 'first_name':...

### Tool: get_registry
[OK] Success. Snippet: {'tasks': [{'id': 335767042, 'create_date': '2026-02-05T10:06:21Z', 'last_modified_date': '2026-02-05T10:07:58Z', 'last_note_id': 2871230267, 'current...

### Tool: get_calendar_tasks
[OK] Success. Snippet: {'has_more': True, 'tasks': [{'id': 372684053, 'text': 'ЗАДАЧНИК: Поставить задачу Стандарт Мастер12.08.2026 18:00', 'formatted_text': 'ЗАДАЧНИК: Пост...

### Tool: get_form_permissions
[OK] Success. Snippet: {'permissions': {'1238106': 'administrator', '656701': 'administrator'}}...

## 2. Task Lifecycle

### Tool: create_task
[ERR] Parse Error: Extra data: line 1 column 3 (char 2) - content: 1 validation error for Task
approvals.1.0.step
  Field required [type=missing, input_value={'person': {'id': 656701,...oval_choice': 'waiting'}, input_type=dict]
    For further information visit https://errors.pydantic.dev/2.13/v/missing

## 3. Role Lifecycle

### Tool: create_role
[OK] Success. Snippet: {'id': 1322341, 'name': 'TEST_ROLE_99'}...

## 4. Catalogs

### Tool: create_catalog
[OK] Success. Snippet: {'catalog_id': 307140, 'name': 'TEST_CAT', 'source_type': 'default', 'version': 1312129821, 'deleted': False, 'last_sync_date': '2026-08-20T12:10:12Z'...

### Tool: get_catalog
[OK] Success. Snippet: {'catalog_id': 307140, 'name': 'TEST_CAT', 'source_type': 'default', 'version': 1312129821, 'deleted': False, 'last_sync_date': '2026-08-20T12:10:12Z'...

### Tool: sync_catalog
[OK] Success. Snippet: {'apply': True, 'added': [{'item_id': 181464456, 'values': ['A', 'B']}], 'catalog_headers': [{'name': 'Col1', 'type': 'text'}, {'name': 'Col2', 'type'...

### Tool: update_catalog_items
[ERR] Parse Error: Expecting value: line 1 column 1 (char 0) - content: Pyrus API returned 400: {"error":"Р—Р°РіРѕР»РѕРІРєРё СЃРїСЂР°РІРѕС‡РЅРёРєР° РЅРµ РјРѕРіСѓС‚ Р±С‹С‚СЊ РїСѓСЃС‚С‹РјРё.","error_code":"empty_catalog_headers"}