# MCP Server V2 Integration Test Report
## Initialization
[OK] Server initialized successfully.
[OK] Retrieved 61 tools from server.

### Tool: get_profile
[OK] Success. Response snippet: {'person_id': 1238106, 'first_name': 'Стандарт', 'last_name': 'Мастер', 'email': 'admin@standartmaster.ru', 'locale': 'ru-RU', 'timezone_offset': 240, 'organization_id': 231057, 'organization': {'orga...

### Tool: get_contacts
[OK] Success. Response snippet: {'organizations': [{'organization_id': 231057, 'name': 'Демо Кабинет', 'persons': [{'id': 1320776, 'first_name': 'Бот для тестов', 'last_name': '', 'email': 'bot@a21a3281-0a3f-48b9-9928-7a4780303d71',...

### Tool: get_bots
[OK] Success. Response snippet: {'bots': []}...

### Tool: get_roles
[OK] Success. Response snippet: [{'id': 1316000, 'name': 'Бухгалтерия', 'member_ids': [1315237, 1314467, 1314470, 1317760, 1315219, 1317761, 1317762, 1315233, 1315234, 1317766]}, {'id': 1314346, 'name': 'Генеральный директор (СогДок...

### Tool: get_forms
[OK] Success. Response snippet: [{'id': 2375190, 'name': 'Карточка клиента', 'steps': None, 'fields': [{'id': 1, 'type': 'text', 'name': 'Имя гостя', 'info': {'code': 'guest_name', 'is_form_title': True}, 'value': None}, {'id': 2, '...

### Tool: get_catalogs
[OK] Success. Response snippet: [{'catalog_id': 304325, 'name': 'Подтипы заявок Хозяйственные заявки (HD)', 'version': 1305478995}, {'catalog_id': 303574, 'name': 'Точки БФ', 'version': 1303944472}, {'catalog_id': 303716, 'name': 'К...

### Tool: get_lists
[OK] Success. Response snippet: {'lists': [{'id': 2396159, 'name': 'Управленческий список', 'version': 1310506402, 'list_type': 'private', 'color': '#5AC180', 'manager_ids': [1238106], 'children': [{'id': 2396163, 'name': 'Q4', 'ver...

### Tool: get_inbox
[OK] Success. Response snippet: {'tasks': [{'id': 372762850, 'create_date': '2026-08-12T11:40:56Z', 'last_modified_date': '2026-08-12T11:40:56Z', 'author': {'id': 1730, 'first_name': '', 'last_name': 'Pyrus.com', 'type': 'user', 'or...

## Task Lifecycle Tests

### Tool: create_task
[ERR] Parse Error: Expecting value: line 1 column 1 (char 0)

## Role Lifecycle Tests

### Tool: create_role
[OK] Success. Response snippet: {'id': 1322340, 'name': 'QA_AUTO_TEST_ROLE'}...

## List Lifecycle Tests

### Tool: create_list
[ERR] Parse Error: Expecting value: line 1 column 1 (char 0)