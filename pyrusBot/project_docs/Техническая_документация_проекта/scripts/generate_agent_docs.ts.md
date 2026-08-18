---
title: "Скрипт: generate_agent_docs.ts"
audience: "internal"
pyrus_id: "EYTWpfUlsxI"
synced_at: "2026-08-10T08:42:03.000Z"
synced_hash: "sha256:99611b081ffe32c6001a0b7e7fcf16d3"
---

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { readDoc, serializeDoc, contentHash } from './lib/frontmatter';

/**
 * Сохраняет идентичность статьи при перегенерации.
 *
 * Файлы этого раздела генерируются целиком, но `pyrus_id` и остальные поля
 * синхронизации привязывают документ к статье в Базе знаний. Записать файл
 * «с нуля» значит стереть эту связь — и следующая синхронизация создаст дубль
 * вместо обновления.
 *
 * `synced_hash` снимается только тогда, когда тело действительно изменилось.
 * Снимать его со всех файлов подряд значит гнать в Базу знаний полтора десятка
 * статей после каждой генерации и лишать раздел определения конфликтов:
 * без хэша синхронизатор не отличит локальную правку от чужой правки в Pyrus.
 */
function writePreservingIdentity(targetPath: string, title: string, body: string) {
    const existing = fs.existsSync(targetPath) ? readDoc(targetPath) : { meta: {}, body: '', order: [] };
    // Раздел целиком внутренний: правила агентов и скрипты автоматизации не
    // относятся ни к одному клиенту. Без метки новый файл уехал бы в клиентское
    // дерево — на этом поле держится маршрутизация синхронизатора.
    const meta: Record<string, string | undefined> = { audience: 'internal', ...existing.meta, title };

    const unchanged = existing.meta.title === title && contentHash(existing.body) === contentHash(body);
    if (!unchanged) delete meta.synced_hash;

    fs.writeFileSync(targetPath, serializeDoc({ meta, body, order: existing.order }), 'utf-8');
}

const PROJECT_DOCS_DIR = path.join(process.cwd(), 'project_docs', 'Техническая_документация_проекта');

const SOURCES = {
    roles: path.join(process.cwd(), '.agents', 'agents'),
    rules: path.join(process.cwd(), '.agents', 'rules'),
    skills: path.join(process.cwd(), '.agents', 'skills'),
    scripts: path.join(process.cwd(), 'solutions_bank', 'scripts')
};

function ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function writeMarkdownFile(targetPath: string, title: string, content: string, extension: string) {
    // Markdown-исходники (правила, навыки) встраиваются как есть: обёртка в блок
    // кода делала их нечитаемым дампом, а вложенные ``` внутри ломали разметку —
    // Pyrus отвечал на такие статьи 500. Код по-прежнему идёт в блоке.
    const body = extension === 'markdown'
        ? stripLeadingH1(stripOwnFrontmatter(content))
        : `\`\`\`${extension}\n${content}\n\`\`\``;
    writePreservingIdentity(targetPath, title, body);
}

/**
 * Заголовок статьи Pyrus подставляет из `title` сам, поэтому H1 в начале тела
 * даёт два одинаковых заголовка подряд — Фундаментальное правило 4.
 */
function stripLeadingH1(content: string): string {
    const lines = content.split('\n');
    const first = lines.findIndex(l => l.trim() !== '');
    if (first === -1 || !/^#\s/.test(lines[first].trim())) return content;
    return lines.slice(first + 1).join('\n').replace(/^\n+/, '');
}

/** У SKILL.md есть собственный YAML-заголовок — в теле статьи он лишний. */
function stripOwnFrontmatter(content: string): string {
    const text = content.replace(/\r\n/g, '\n');
    if (!text.startsWith('---\n')) return text;
    const end = text.indexOf('\n---', 4);
    return end === -1 ? text : text.slice(end + 4).replace(/^\n+/, '');
}

function generateIndex(dirPath: string, title: string, description: string) {
    const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.md') && f !== '_index.md');
    
    // Sort files to put История изменений first if present
    files.sort((a, b) => {
        if (a.includes('История_изменений')) return -1;
        if (b.includes('История_изменений')) return 1;
        return a.localeCompare(b);
    });

    let body = `${description}\n\n`;
    files.forEach((file, i) => {
        const fileTitle = file.replace('.md', '').replace(/^\d+_/, '').replace(/_/g, ' ');
        // Угловые скобки обязательны: имена содержат "(v1.0)", и круглая
        // скобка внутри ссылки обрывает её разбор.
        body += `${i + 1}. [${fileTitle}](<${file}>)\n`;
    });

    writePreservingIdentity(path.join(dirPath, '_index.md'), title, body);
}

function initChangelog(dirPath: string) {
    const changelogPath = path.join(dirPath, '01_История_изменений (v1.0).md');
    if (!fs.existsSync(changelogPath)) {
        const content = `---
title: "01 История изменений (v1.0)"
audience: "internal"
---

- v1.0: Инициализация раздела
`;
        fs.writeFileSync(changelogPath, content, 'utf-8');
    }
}

// 1. Setup structure
ensureDir(PROJECT_DOCS_DIR);
['roles', 'rules', 'skills', 'scripts'].forEach(sub => {
    ensureDir(path.join(PROJECT_DOCS_DIR, sub));
    initChangelog(path.join(PROJECT_DOCS_DIR, sub));
});
initChangelog(PROJECT_DOCS_DIR);

// 2. Process Roles
// Роли агентов — такая же часть конфигурации, как правила и навыки:
// Фундаментальное правило 5 требует, чтобы они были видны в Базе знаний.
if (fs.existsSync(SOURCES.roles)) {
    const targetDir = path.join(PROJECT_DOCS_DIR, 'roles');
    const files = fs.readdirSync(SOURCES.roles).filter(f => f.endsWith('.md'));
    const expected = new Set(files.map(f => f.replace(/-/g, '_')));

    files.forEach(file => {
        const content = fs.readFileSync(path.join(SOURCES.roles, file), 'utf-8');
        writeMarkdownFile(
            path.join(targetDir, file.replace(/-/g, '_')),
            `Роль: ${file.replace(/\.md$/, '')}`,
            content,
            'markdown'
        );
    });

    // Удалённая роль не должна оставаться в Базе знаний как действующая.
    fs.readdirSync(targetDir)
        .filter(f => f.endsWith('.md') && f !== '_index.md' && !f.includes('История_изменений') && !expected.has(f))
        .forEach(stale => {
            fs.unlinkSync(path.join(targetDir, stale));
            console.log(`🗑  Удалено зеркало исчезнувшей роли: ${stale}`);
        });

    generateIndex(targetDir, 'Роли агентов', 'Кто из агентов за что отвечает и кому передаёт работу.');
}

// 3. Process Rules
if (fs.existsSync(SOURCES.rules)) {
    const files = fs.readdirSync(SOURCES.rules).filter(f => f.endsWith('.md'));
    files.forEach(file => {
        const content = fs.readFileSync(path.join(SOURCES.rules, file), 'utf-8');
        const targetName = file.replace(/-/g, '_'); // Replace dashes with underscores for consistency
        // Расширение в названии статьи — мусор: читатель Базы знаний видит
        // «Правило: pyrus-documentation-process.md» вместо названия правила.
        writeMarkdownFile(
            path.join(PROJECT_DOCS_DIR, 'rules', targetName),
            `Правило: ${file.replace(/\.md$/, '')}`,
            content,
            'markdown'
        );
    });
    generateIndex(path.join(PROJECT_DOCS_DIR, 'rules'), 'Правила агентов', 'Здесь хранятся глобальные инструкции и системные промпты ИИ.');
}

// 3. Process Skills
if (fs.existsSync(SOURCES.skills)) {
    const dirs = fs.readdirSync(SOURCES.skills).filter(f => fs.statSync(path.join(SOURCES.skills, f)).isDirectory());
    dirs.forEach(dir => {
        const skillPath = path.join(SOURCES.skills, dir, 'SKILL.md');
        if (fs.existsSync(skillPath)) {
            const content = fs.readFileSync(skillPath, 'utf-8');
            const targetName = `${dir.replace(/-/g, '_')}.md`;
            writeMarkdownFile(
                path.join(PROJECT_DOCS_DIR, 'skills', targetName),
                `Навык: ${dir}`,
                content,
                'markdown'
            );
        }
    });
    generateIndex(path.join(PROJECT_DOCS_DIR, 'skills'), 'Навыки агентов (Skills)', 'Здесь хранятся специфичные скиллы агентов (инструкции к действиям).');
}

// 4. Process Scripts (включая подпапки вроде lib/)
function collectScripts(dir: string, prefix = ''): { name: string; fullPath: string }[] {
    const found: { name: string; fullPath: string }[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            found.push(...collectScripts(fullPath, `${prefix}${entry.name}_`));
        } else if (/\.(ts|js|json)$/.test(entry.name)) {
            found.push({ name: `${prefix}${entry.name}`, fullPath });
        }
    }
    return found;
}

if (fs.existsSync(SOURCES.scripts)) {
    const targetDir = path.join(PROJECT_DOCS_DIR, 'scripts');
    const scripts = collectScripts(SOURCES.scripts);

    // bootstrap.ps1 живёт в корне и остаётся там: на чистом ПК его должно быть
    // видно сразу, а не искать в глубине репозитория. Но это такой же скрипт
    // автоматизации, и в Базе знаний он обязан быть — Фундаментальное правило 5.
    const bootstrap = path.join(process.cwd(), 'bootstrap.ps1');
    if (fs.existsSync(bootstrap)) scripts.push({ name: 'bootstrap.ps1', fullPath: bootstrap });

    const expected = new Set(scripts.map(s => `${s.name}.md`));

    scripts.forEach(({ name, fullPath }) => {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const extension = name.endsWith('.json') ? 'json'
            : name.endsWith('.ps1') ? 'powershell'
            : 'typescript';
        writeMarkdownFile(
            path.join(targetDir, `${name}.md`),
            `Скрипт: ${name}`,
            content,
            extension
        );
    });

    // Убираем зеркала скриптов, которых больше нет: иначе в Базе знаний
    // остаются статьи с кодом, удалённым из репозитория.
    fs.readdirSync(targetDir)
        .filter(f => f.endsWith('.md') && f !== '_index.md' && !f.includes('История_изменений') && !expected.has(f))
        .forEach(stale => {
            fs.unlinkSync(path.join(targetDir, stale));
            console.log(`🗑  Удалено зеркало исчезнувшего скрипта: ${stale}`);
        });

    generateIndex(targetDir, 'Скрипты автоматизации', 'Здесь хранятся исполняемые скрипты (например, синхронизация базы знаний).');
}

// 5. Generate Root Index
generateIndex(PROJECT_DOCS_DIR, 'Техническая документация проекта', 'Конфигурация, правила, навыки ИИ-агентов и скрипты автоматизации репозитория.');

console.log('✅ Документация агентов успешно сгенерирована в project_docs!');

```
