import * as fs from 'fs';
import * as path from 'path';

/**
 * Один источник правды — `.agents/` — раскладывается в конфигурации всех сред,
 * в которых работает команда.
 *
 * Причина: `.agents/` не читает никто. Claude Code ищет `CLAUDE.md`,
 * Antigravity и Kilocode — `AGENTS.md`, Kilocode дополнительно
 * `.kilocode/rules/`. Пока этих файлов нет, правила попадают в модель только
 * если инженер вручную вставит их в чат. Для слабых и бесплатных моделей это
 * означает, что правила не соблюдаются вообще: искать их в нестандартной папке
 * такая модель не пойдёт.
 *
 *   npx tsx solutions_bank/scripts/generate_agent_configs.ts
 */

const CWD = process.cwd();
const AGENTS = path.join(CWD, '.agents');
const GENERATED = '<!-- СГЕНЕРИРОВАНО generate_agent_configs.ts — правьте .agents/, не этот файл -->';

function read(p: string): string {
    return fs.readFileSync(p, 'utf-8').replace(/\r\n/g, '\n').trim();
}

function stripFrontmatter(text: string): string {
    if (!text.startsWith('---\n')) return text;
    const end = text.indexOf('\n---', 4);
    return end === -1 ? text : text.slice(end + 4).replace(/^\n+/, '');
}

function listFiles(dir: string, ext = '.md'): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith(ext)).sort();
}

/** Краткая карточка роли: имя, назначение, когда звать. */
function roleSummaries(): string {
    const dir = path.join(AGENTS, 'agents');
    return listFiles(dir).map(f => {
        const text = read(path.join(dir, f));
        const name = text.match(/\*\*Role Name\*\*:\s*`([^`]+)`/)?.[1] ?? f.replace('.md', '');
        const display = text.match(/\*\*Display Name\*\*:\s*(.+)/)?.[1]?.trim() ?? '';
        const desc = text.match(/\*\*Description\*\*:\s*(.+)/)?.[1]?.trim() ?? '';
        return `### ${name}\n**${display}**\n\n${desc}\n\nПолное описание роли: \`.agents/agents/${f}\``;
    }).join('\n\n');
}

function rulesBody(): string {
    const dir = path.join(AGENTS, 'rules');
    return listFiles(dir).map(f => stripFrontmatter(read(path.join(dir, f)))).join('\n\n---\n\n');
}

function skillIndex(): string {
    const dir = path.join(AGENTS, 'skills');
    if (!fs.existsSync(dir)) return '';
    return fs.readdirSync(dir)
        .filter(d => fs.existsSync(path.join(dir, d, 'SKILL.md')))
        .sort()
        .map(d => {
            const text = read(path.join(dir, d, 'SKILL.md'));
            const desc = text.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? '';
            return `- **${d}** — ${desc}\n  Читать перед работой: \`.agents/skills/${d}/SKILL.md\``;
        }).join('\n');
}

const BOOTSTRAP = `## Первичная проверка окружения и её фиксация

**Это первое, что делается при работе на новом ПК или если с прошлой проверки прошло более 7 дней.** Результаты фиксации (имя ПК и дата) сохраняются в \`.env_state.json\`.

Оркестратор проверяет актуальность через \`npm run env:check\`. Если ПК совпадает и с момента последней проверки прошло не более 7 дней — повторная первичная проверка пропускается. В противном случае выполняется:

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File .\\bootstrap.ps1
\`\`\`

Скрипт написан на PowerShell намеренно: он обязан работать там, где Node.js ещё не установлен. Запускать повторно безопасно — существующий \`.env\` не трогается никогда.

Что он делает:

1. **Node.js.** Проверяет версию (нужен 20+). Если команды нет — предлагает поставить через \`winget\`; после установки терминал надо перезапустить, PATH обновляется только в новых сессиях.
2. **Зависимости.** \`npm install\`, затем сообщает об устаревших пакетах.
3. **Доступ к Pyrus.** Создаёт \`.env\` из \`.env.example\`, если файла нет, и останавливается. **Логин и \`PYRUS_SECURITY_KEY\` вписывает инженер лично.** Ни агент, ни скрипт не запрашивают, не подставляют и не хранят чужие ключи: у каждого инженера свой ключ, иначе в Базе знаний не видно, кто автор правки.
4. **Проверка сборки.** \`npm run check\` (автоматически записывает успешный штамп в \`.env_state.json\`).
5. **Сверка с Базой знаний.** \`npm run kb:sync:dry\`.

Ненулевой код возврата означает, что рабочее место не готово: что именно осталось сделать, скрипт печатает списком. Работа начинается только после зелёного прогона.

На не-Windows выполните те же пять шагов вручную — командами из раздела «Команды».

## Начало каждой рабочей сессии

**Первичный агент точки входа — Оркестратор (\`pyrus_orchestrator\`).** В начале любого диалога или при старте новой задачи первым главным агентом ВСЕГДА выступает Оркестратор. Он встречает пользователя, запрашивает status окружения через \`npm run env:check\` (выполняя \`bootstrap.ps1\` только при смене ПК или истечении 7 дней), явно **уточняет цели работы** и координирует дальнейший процесс, делегируя задачи профильным агентам.

1. \`git pull\` — забрать наработки остальных инженеров.
2. \`npm install\` — если \`package.json\` изменился.
3. \`npm run env:check\` — проверить актуальность окружения (если не пройдено или другой ПК — запустить \`bootstrap.ps1\` / \`npm run check\`).
4. \`npm run kb:sync\` — синхронизировать документацию с Базой знаний ДО правок.
5. Прочитать вывод: \`PULL\` означает, что кто-то менял статью в Pyrus — прочитать её заново перед работой. \`CONFLICT\` останавливает работу до ручного разбора.`;

const WORKFLOW = `## Обязательный порядок работы

Разработка идёт через документацию. Код правится только после согласования документации.

**Понятие ТЗ (Технического задания):** В нашем проекте ТЗ — это не один монолитный файл, а единый целостный комплект статей в \`clients/<Client>/TechDocs/<Form>/\` (\`01_Бизнес_требования\`, \`02_Спецификация_полей\`, \`03_Маршрутизация\`, \`04_Скрипты_и_боты\`, \`05_Подпроцессы\`, \`06_Справочники\` и др.) плюс связанная \`01_Карта_связей\`.

1. **Синхронизация.** \`npm run kb:sync\` до начала правок.
2. **Граф зависимостей.** Выявить участников процесса и составить схему: на какие процессы влияет форма и какие влияют на неё. Согласовать с заказчиком.
3. **ТЗ и спецификации.** Правки идут сначала в документацию, а не в код.
4. **Код.** Только после согласования документации.
5. **Проверка.** \`npm run check\` — типы и тесты.
6. **Линтер документации.** \`npm run lint:docs\` — Фундаментальные правила проверяются машиной, а не на память.
7. **История изменений.** Запись в \`История_изменений\` того раздела, который затронут. Без исключений.
8. **Выгрузка.** \`npm run kb:sync\` и \`git push\`.
9. **Отчёт по БЗ.** По итогам выгрузки в итоговом ответе выдать пользователю наглядный перечень всех созданных (\`CREATE\`) и обновлённых (\`PUSH\`, \`RENAME\`, \`MOVE\`) статей в Pyrus.

## Команды

\`\`\`bash
npm run check          # типы, тесты, правила документации и свежесть карты связей
npm run lint:docs      # проверка Фундаментальных правил 1-5
npm run new:form       # комплект статей новой формы: -- --client=NN_Клиент --name="Название"
npm run pyrus:dump     # состав формы/справочника из API: -- --forms, --form=NN, --catalog=NN
npm run map            # перестроить карту связей форм и скриптов
npm run kb:sync        # синхронизация с Базой знаний
npm run kb:sync:dry    # то же, но без записи
npm run kb:dump        # дерево Базы знаний
npm run docs:agents    # перегенерировать документацию агентов
\`\`\`

## Чего делать нельзя

- Писать код до согласования ТЗ.
- Добавлять или удалять статью, не обновив \`_index.md\` папки и \`История_изменений\`.
- Дублировать заголовок статьи тегом \`#\` в теле: Pyrus сам подставляет заголовок из \`title\`.
- Править \`pyrus_id\`, \`synced_at\`, \`synced_hash\` в YAML вручную — их ведёт синхронизатор.
- Создавать вспомогательную функцию, не проверив Банк функций (\`src/lib/\`, \`solutions_bank/functions/\`).`;

function buildDocument(): string {
    return [
        GENERATED,
        '',
        '# Проект: ИИ-ассистент инженера внедрения Pyrus',
        '',
        'Репозиторий ведёт документацию, ТЗ, спецификации форм, серверных ботов и формные скрипты для клиентов Pyrus, и синхронизирует всё это с Базой знаний Pyrus, которая работает как общий хаб между инженерами.',
        '',
        'Копия проекта лежит локально у каждого инженера. Общее состояние расходится через git и через Базу знаний.',
        '',
        BOOTSTRAP,
        '',
        WORKFLOW,
        '',
        '## Роли агентов',
        '',
        roleSummaries(),
        '',
        '## Навыки',
        '',
        skillIndex(),
        '',
        '## Правила проекта',
        '',
        rulesBody(),
        ''
    ].join('\n');
}

const doc = buildDocument();

const targets = [
    path.join(CWD, 'CLAUDE.md'),
    path.join(CWD, 'AGENTS.md'),
    path.join(CWD, '.kilocode', 'rules', 'project.md')
];

for (const target of targets) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, doc, 'utf-8');
    console.log(`  записано: ${path.relative(CWD, target)}`);
}

console.log(`\n✅ Конфигурация агентов разложена по средам (${doc.length} символов).`);
console.log('   Claude Code → CLAUDE.md   Antigravity/Kilocode → AGENTS.md   Kilocode → .kilocode/rules/');
