<!-- СГЕНЕРИРОВАНО generate_agent_configs.ts — правьте .agents/, не этот файл -->

# Проект: ИИ-ассистент инженера внедрения Pyrus

Репозиторий ведёт документацию, ТЗ, спецификации форм, серверных ботов и формные скрипты для клиентов Pyrus, и синхронизирует всё это с Базой знаний Pyrus, которая работает как общий хаб между инженерами.

Копия проекта лежит локально у каждого инженера. Общее состояние расходится через git и через Базу знаний.

## Первичная проверка окружения и её фиксация

**Это первое, что делается при работе на новом ПК или если с прошлой проверки прошло более 7 дней.** Результаты фиксации (имя ПК и дата) сохраняются в `.env_state.json`.

Оркестратор проверяет актуальность через `npm run env:check`. Если ПК совпадает и с момента последней проверки прошло не более 7 дней — повторная первичная проверка пропускается. В противном случае выполняется:

```powershell
powershell -ExecutionPolicy Bypass -File .\bootstrap.ps1
```

Скрипт написан на PowerShell намеренно: он обязан работать там, где Node.js ещё не установлен. Запускать повторно безопасно — существующий `.env` не трогается никогда.

Что он делает:

1. **Node.js.** Проверяет версию (нужен 20+). Если команды нет — предлагает поставить через `winget`; после установки терминал надо перезапустить, PATH обновляется только в новых сессиях.
2. **Зависимости.** `npm install`, затем сообщает об устаревших пакетах.
3. **Доступ к Pyrus.** Создаёт `.env` из `.env.example`, если файла нет, и останавливается. **Логин и `PYRUS_SECURITY_KEY` вписывает инженер лично.** Ни агент, ни скрипт не запрашивают, не подставляют и не хранят чужие ключи: у каждого инженера свой ключ, иначе в Базе знаний не видно, кто автор правки.
4. **Проверка сборки.** `npm run check` (автоматически записывает успешный штамп в `.env_state.json`).
5. **Сверка с Базой знаний.** `npm run kb:sync:dry`.

Ненулевой код возврата означает, что рабочее место не готово: что именно осталось сделать, скрипт печатает списком. Работа начинается только после зелёного прогона.

На не-Windows выполните те же пять шагов вручную — командами из раздела «Команды».

## Начало каждой рабочей сессии

**Первичный агент точки входа — Оркестратор (`pyrus_orchestrator`).** В начале любого диалога или при старте новой задачи первым главным агентом ВСЕГДА выступает Оркестратор. Он встречает пользователя, запрашивает status окружения через `npm run env:check` (выполняя `bootstrap.ps1` только при смене ПК или истечении 7 дней), явно **уточняет цели работы** и координирует дальнейший процесс, делегируя задачи профильным агентам.

1. `git pull` — забрать наработки остальных инженеров.
2. `npm install` — если `package.json` изменился.
3. `npm run env:check` — проверить актуальность окружения (если не пройдено или другой ПК — запустить `bootstrap.ps1` / `npm run check`).
4. `npm run kb:sync` — синхронизировать документацию с Базой знаний ДО правок.
5. Прочитать вывод: `PULL` означает, что кто-то менял статью в Pyrus — прочитать её заново перед работой. `CONFLICT` останавливает работу до ручного разбора.

## Обязательный порядок работы

Разработка идёт через документацию. Код правится только после согласования документации.

**Понятие ТЗ (Технического задания):** В нашем проекте ТЗ — это не один монолитный файл, а единый целостный комплект статей в `clients/<Client>/TechDocs/<Form>/` (`01_Бизнес_требования`, `02_Спецификация_полей`, `03_Маршрутизация`, `04_Скрипты_и_боты`, `05_Подпроцессы`, `06_Справочники` и др.) плюс связанная `01_Карта_связей`.

1. **Синхронизация.** `npm run kb:sync` до начала правок.
2. **Граф зависимостей.** Выявить участников процесса и составить схему: на какие процессы влияет форма и какие влияют на неё. Согласовать с заказчиком.
3. **ТЗ и спецификации.** Правки идут сначала в документацию, а не в код.
4. **Код.** Только после согласования документации.
5. **Проверка.** `npm run check` — типы и тесты.
6. **Линтер документации.** `npm run lint:docs` — Фундаментальные правила проверяются машиной, а не на память.
7. **История изменений.** Запись в `История_изменений` того раздела, который затронут. Без исключений.
8. **Выгрузка.** `npm run kb:sync` и `git push`.
9. **Отчёт по БЗ.** По итогам выгрузки в итоговом ответе выдать пользователю наглядный перечень всех созданных (`CREATE`) и обновлённых (`PUSH`, `RENAME`, `MOVE`) статей в Pyrus.

## Команды

```bash
npm run check          # типы, тесты, правила документации и свежесть карты связей
npm run lint:docs      # проверка Фундаментальных правил 1-5
npm run new:form       # комплект статей новой формы: -- --client=NN_Клиент --name="Название"
npm run pyrus:dump     # состав формы/справочника из API: -- --forms, --form=NN, --catalog=NN
npm run map            # перестроить карту связей форм и скриптов
npm run kb:sync        # синхронизация с Базой знаний
npm run kb:sync:dry    # то же, но без записи
npm run kb:dump        # дерево Базы знаний
npm run docs:agents    # перегенерировать документацию агентов
```

## Чего делать нельзя

- Писать код до согласования ТЗ.
- Добавлять или удалять статью, не обновив `_index.md` папки и `История_изменений`.
- Дублировать заголовок статьи тегом `#` в теле: Pyrus сам подставляет заголовок из `title`.
- Править `pyrus_id`, `synced_at`, `synced_hash` в YAML вручную — их ведёт синхронизатор.
- Создавать вспомогательную функцию, не проверив Банк функций (`src/lib/`, `solutions_bank/functions/`).

## Роли агентов

### pyrus_bank_curator
**Куратор Банка функций**

Решает, что попадает в `src/lib/`, а что остаётся в боте клиента. Следит, чтобы банк оставался пригодным для вставки в Pyrus и покрытым тестами.

Полное описание роли: `.agents/agents/pyrus_bank_curator.md`

### pyrus_bot_developer
**Pyrus Server Script Bot Developer Agent**

Expert AI developer agent specialized in designing, writing, refactoring, and debugging Pyrus TypeScript Server Script bots (`ExtendedClient`, `PyrusApiClient`, `CopyBot`, `RouterBot`, `ResponsibilityMonitoringBot`, `DialogBot`).

Полное описание роли: `.agents/agents/pyrus_bot_developer.md`

### pyrus_doc_reviewer
**Ревьюер документации**

Проверяет документацию на то, что не проверяет машина: полноту, противоречия, догадки, выданные за факты, и расхождение с реальным кодом.

Полное описание роли: `.agents/agents/pyrus_doc_reviewer.md`

### pyrus_form_script_developer
**Pyrus Client Form Script Developer Agent**

Expert AI developer agent specialized in writing, refactoring, and debugging interactive Pyrus Client Form Scripts (UI JavaScript/TypeScript code executing in Pyrus form interface via `form.onChange`).

Полное описание роли: `.agents/agents/pyrus_form_script_developer.md`

### pyrus_orchestrator
**Pyrus System Architect & Dispatcher**

Точка входа в проект. Встречает задачу, приводит рабочее место в рабочее состояние, собирает контекст, разворачивает структуру документации клиента и передаёт работу профильным агентам.

Полное описание роли: `.agents/agents/pyrus_orchestrator.md`

### pyrus_reverse_documentarian
**Документатор готовых решений (обратная разработка)**

Принимает уже работающее решение — бота, скрипт, набор форм — и восстанавливает по нему полную документацию. Не пишет ни строки документации, пока не увидит всю картину реализации: поля форм, справочники, маршруты, связи.

Полное описание роли: `.agents/agents/pyrus_reverse_documentarian.md`

### pyrus_spec_analyst
**Pyrus Senior Requirements Analyst & Product Manager**

Takes raw client requirements (ТЗ) and grills the user/executor like a Senior Developer to find vulnerabilities, ambiguities, and edge cases. Finalizes the `specification.md` before coding begins.

Полное описание роли: `.agents/agents/pyrus_spec_analyst.md`

### pyrus_tech_writer
**Технический писатель пользовательской документации**

Превращает техническую спецификацию в инструкции, которыми пользуется сотрудник клиента. Пишет для человека, который не знает слов «поле», «код» и «справочник» в нашем значении.

Полное описание роли: `.agents/agents/pyrus_tech_writer.md`

## Навыки

- **pyrus-form-scripts** — Operating procedures, API specifications, rules, design patterns, and code snippets for creating, modifying, testing, and debugging Pyrus Client Form Scripts (JavaScript/TypeScript form.onChange handlers in user browser UI).
  Читать перед работой: `.agents/skills/pyrus-form-scripts/SKILL.md`
- **pyrus-kb-sync** — Синхронизация локальной документации с Базой знаний Pyrus — направления PUSH/PULL/CONFLICT, правила заголовков, нумерация разделов и разрешение конфликтов
  Читать перед работой: `.agents/skills/pyrus-kb-sync/SKILL.md`
- **pyrus-script-bots** — Operating procedures, API specifications, rules, design patterns, and code snippets for creating, modifying, testing, and debugging Pyrus TypeScript server script bots in this codebase.
  Читать перед работой: `.agents/skills/pyrus-script-bots/SKILL.md`

## Правила проекта

- **Синхронизация с Базой знаний** — направления PUSH/PULL/CONFLICT, разграничение доступа по `audience`, перенос разделов, разрешение конфликтов: `.agents/rules/kb-sync-agent.md`
- **Правила проектирования и документирования бизнес-процессов Pyrus** — архитектура директорий, спецификация форм и справочников, состав ТЗ, коды полей, Documentation-Driven Development, Фундаментальные правила 1–5: `.agents/rules/pyrus-documentation-process.md`
