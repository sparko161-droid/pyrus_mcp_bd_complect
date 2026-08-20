# Отчёт о прямом тестировании функционала Pyrus MCP


## 1. Справочники (Catalogs)

### Метод: `create_catalog`
**[УСПЕХ]** Данные получены. Пруф (фрагмент): {'catalog_id': 307148, 'name': 'Авто-справочник 16:58:47', 'source_type': 'default', 'version': 1312136686, 'deleted': False, 'last_sync_date': '2026-08-20T12:58:47Z', 'supervisors': [1238106], 'catal...

### Метод: `get_catalog`
**[УСПЕХ]** Данные получены. Пруф (фрагмент): {'catalog_id': 307148, 'name': 'Авто-справочник 16:58:47', 'source_type': 'default', 'version': 1312136686, 'deleted': False, 'last_sync_date': '2026-08-20T12:58:47Z', 'supervisors': [1238106], 'catal...

### Метод: `sync_catalog`
**[УСПЕХ]** Данные получены. Пруф (фрагмент): {'apply': True, 'added': [{'item_id': 181467169, 'values': ['Тест1', '001']}], 'catalog_headers': [{'name': 'Название', 'type': 'text'}, {'name': 'Код', 'type': 'text'}]}...

## 2. Пользователи (Members)
> Примечание: API Pyrus не позволяет создавать формы, но позволяет создавать пользователей и задачи.

### Метод: `create_member`
**[УСПЕХ]** Данные получены. Пруф (фрагмент): {'id': 1322366, 'first_name': 'Тест', 'last_name': 'МСП', 'email': 'test_mcp_1787230729@standartmaster.ru', 'type': 'user', 'banned': False, 'rights': 0, 'cant_export_restricted_form_registry': True}...

## 3. Роли (Roles)

### Метод: `create_role`
**[УСПЕХ]** Данные получены. Пруф (фрагмент): {'id': 1322367, 'name': 'Новая Роль 16:58:50'}...