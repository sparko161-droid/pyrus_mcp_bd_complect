---
title: "Скрипт: integration_map.ts"
audience: "internal"
pyrus_id: "Mc2g4xZXF9w"
pyrus_parent: "HzQz5U8wZjh"
synced_at: "2026-08-10T12:01:06.000Z"
synced_hash: "sha256:d46c73b88560f285404325bbcdae3666"
---

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { readDoc, writeDoc, Doc } from './lib/frontmatter';
import { parseArgs } from './lib/env';

/**
 * Карта связей клиента: какая форма из каких полей читает, какой скрипт что
 * трогает, какие справочники задействованы.
 *
 * Карта **выводится из фактов**, а не ведётся руками:
 *  - из исходников — коды полей в распознаваемых конструкциях (`getByCode`,
 *    `idOf`, `named_fields["..."]`, словарь `FIELD_CODES`);
 *  - из заголовков документов — `form_id` и `catalog_ids`, объявленные явно;
 *  - из таблицы «Спецификация полей» — объявленный состав полей.
 *
 * Почему не связывание по упоминаниям имён, как в Обсидиане: главный вопрос
 * карты — «я меняю поле `cake_filling`, что сломается». Совпадение названий на
 * него не отвечает. «Заказы тортов» — это одновременно форма, папка, раздел
 * Базы знаний и заголовок статьи; связав их по имени, получаем густой граф с
 * нулевой информативностью. Код же ссылается на поле однозначно.
 *
 * Ручная карта протухла бы ровно так же, как протухли Фундаментальные правила,
 * пока их не начала проверять машина. Поэтому здесь есть режим `--check`:
 * он входит в `npm run check` и падает, если карта отстала от кода.
 *
 *   npm run map
 *   npm run map -- --check
 */

const CWD = process.cwd();
const args = parseArgs();
const MAP_FILE = '01_Карта_связей (v1.0).md';

interface ScriptInfo {
    file: string;
    fields: string[];
}

interface FormInfo {
    folder: string;
    name: string;
    formId?: string;
    catalogIds: string[];
    /** Коды из таблицы «Спецификация полей». */
    declaredFields: string[];
    scripts: ScriptInfo[];
}

/**
 * Коды полей извлекаются только из однозначных конструкций — не из любой строки.
 * Регистр значим: коды Pyrus бывают и `guest_name`, и `SenderName`, и `Task_type`.
 * Шаблон, принимавший только строчные, молча терял треть полей, и карта
 * показывала меньше связей, чем есть на самом деле.
 */
const CODE_PATTERNS: RegExp[] = [
    /getByCode\s*\([^,]+,\s*["'`]([A-Za-z0-9_]+)["'`]\s*\)/g,
    /\bidOf\s*\(\s*["'`]([A-Za-z0-9_]+)["'`]\s*\)/g,
    /byCode\s*\.\s*get\s*\(\s*["'`]([A-Za-z0-9_]+)["'`]\s*\)/g,
    /named_fields\s*\[\s*["'`]([A-Za-z0-9_]+)["'`]\s*\]/g,
    /named_cells\s*\[\s*["'`]([A-Za-z0-9_]+)["'`]\s*\]/g
];

/** Словарь вида `const FIELD_CODES = { STATE: "technical_bot_state", ... }`. */
function fieldCodesFromDictionary(source: string): string[] {
    const found: string[] = [];
    const dict = source.match(/FIELD_CODES\s*(?::[^=]+)?=\s*\{([\s\S]*?)\}\s*(?:as const)?\s*;/);
    if (!dict) return found;
    for (const m of dict[1].matchAll(/["'`]([A-Za-z0-9_]+)["'`]/g)) found.push(m[1]);
    return found;
}

function fieldsInScript(source: string): string[] {
    const found = new Set<string>(fieldCodesFromDictionary(source));
    for (const pattern of CODE_PATTERNS) {
        for (const m of source.matchAll(pattern)) found.add(m[1]);
    }
    return [...found].sort();
}

/**
 * Коды из таблицы спецификации.
 *
 * Читается именно колонка «Технический код», а не вся строка: в заголовке этой
 * колонки сам код-пример записан в обратных кавычках, и разбор «по всей строке»
 * добавлял в состав полей несуществующее поле `code`.
 */
function declaredFields(specPath: string): string[] {
    if (!fs.existsSync(specPath)) return [];
    const found = new Set<string>();
    const cells = (line: string) => line.split('|').slice(1, -1).map(c => c.trim());

    const lines = readDoc(specPath).body.split('\n');
    let codeColumn = -1;

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('|')) { codeColumn = -1; continue; }

        // Строка-разделитель под заголовком таблицы — её пропускаем.
        if (/^\|[\s:|-]+\|$/.test(trimmed)) continue;

        const parts = cells(trimmed);
        if (codeColumn === -1) {
            codeColumn = parts.findIndex(c => /код/i.test(c));
            continue; // это строка заголовка, данных в ней нет
        }

        const cell = parts[codeColumn];
        if (!cell) continue;
        for (const m of cell.matchAll(/`([A-Za-z0-9_]+)`/g)) found.add(m[1]);
    }
    return [...found].sort();
}

function humanName(folder: string): string {
    return folder.replace(/^\d+_/, '').replace(/_/g, ' ');
}

function collectForms(clientDir: string): FormInfo[] {
    const formsDir = path.join(clientDir, 'Forms');
    const techDir = path.join(clientDir, 'TechDocs');
    if (!fs.existsSync(formsDir)) return [];

    const forms: FormInfo[] = [];
    for (const entry of fs.readdirSync(formsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;

        const formDir = path.join(formsDir, entry.name);
        const indexPath = path.join(formDir, '_index.md');
        const meta = fs.existsSync(indexPath) ? readDoc(indexPath).meta : {};

        const scripts: ScriptInfo[] = [];
        const scriptsDir = path.join(formDir, 'scripts');
        if (fs.existsSync(scriptsDir)) {
            for (const f of fs.readdirSync(scriptsDir)) {
                if (!/\.(ts|js)$/.test(f)) continue;
                const source = fs.readFileSync(path.join(scriptsDir, f), 'utf8');
                scripts.push({ file: f, fields: fieldsInScript(source) });
            }
        }

        // Спецификация полей лежит в технической ветке под тем же номером формы.
        const specDir = path.join(techDir, entry.name);
        const specFile = fs.existsSync(specDir)
            ? fs.readdirSync(specDir).find(f => /Спецификация_полей/i.test(f))
            : undefined;

        forms.push({
            folder: entry.name,
            name: humanName(entry.name),
            formId: meta.form_id || undefined,
            catalogIds: (meta.catalog_ids || '').split(',').map(s => s.trim()).filter(Boolean),
            declaredFields: specFile ? declaredFields(path.join(specDir, specFile)) : [],
            scripts
        });
    }
    return forms;
}

function renderMap(clientFolder: string, forms: FormInfo[]): string {
    const client = humanName(clientFolder);
    const lines: string[] = [];

    lines.push('Карта строится автоматически из исходников и заголовков документов — `npm run map`. Править её руками бессмысленно: следующая генерация перезапишет файл, а `npm run check` не даст закоммитить расхождение.');
    lines.push('');
    lines.push('Карта отвечает на вопрос «меняю поле — что сломается»: ниже видно, какой скрипт какое поле трогает.');
    lines.push('');

    if (!forms.length) {
        lines.push(`У клиента «${client}» пока нет форм со скриптами.`);
        return lines.join('\n');
    }

    lines.push('## Схема');
    lines.push('');
    lines.push('```mermaid');
    lines.push('flowchart LR');
    // Идентификаторы узлов — порядковые: имена форм русские, и «очистка» их до
    // латиницы превращала все узлы в одинаковый ряд подчёркиваний.
    forms.forEach((f, fi) => {
        const formNode = `f${fi + 1}`;
        lines.push(`    ${formNode}["${f.name}${f.formId ? `<br/>form_id ${f.formId}` : ''}"]`);
        f.scripts.forEach((s, si) => {
            const scriptNode = `f${fi + 1}s${si + 1}`;
            lines.push(`    ${scriptNode}(["${s.file}"])`);
            lines.push(`    ${scriptNode} -->|"полей: ${s.fields.length}"| ${formNode}`);
        });
        f.catalogIds.forEach((c, ci) => {
            lines.push(`    f${fi + 1}c${ci + 1}[("Справочник ${c}")] --> ${formNode}`);
        });
    });
    lines.push('```');
    lines.push('');

    lines.push('## Формы');
    lines.push('');
    lines.push('| Форма | `form_id` | Справочники | Полей в спецификации | Скриптов |');
    lines.push('| --- | --- | --- | --- | --- |');
    for (const f of forms) {
        lines.push(`| ${f.name} | ${f.formId || '—'} | ${f.catalogIds.join(', ') || '—'} | ${f.declaredFields.length || '—'} | ${f.scripts.length} |`);
    }
    lines.push('');

    for (const f of forms) {
        if (!f.scripts.length) continue;
        lines.push(`## ${f.name}: какие поля трогают скрипты`);
        lines.push('');
        lines.push('| Поле (`code`) | Скрипты | Объявлено в спецификации |');
        lines.push('| --- | --- | --- |');

        const all = new Set<string>([...f.declaredFields]);
        f.scripts.forEach(s => s.fields.forEach(c => all.add(c)));

        for (const code of [...all].sort()) {
            const users = f.scripts.filter(s => s.fields.includes(code)).map(s => s.file);
            const declared = f.declaredFields.includes(code);
            lines.push(`| \`${code}\` | ${users.join(', ') || '—'} | ${declared ? 'да' : '**нет**'} |`);
        }
        lines.push('');

        const undeclared = [...all].filter(c => !f.declaredFields.includes(c) && f.scripts.some(s => s.fields.includes(c)));
        if (undeclared.length) {
            lines.push(`Поля, которые скрипт использует, но которых нет в спецификации: ${undeclared.map(c => `\`${c}\``).join(', ')}. Либо спецификация отстала, либо в коде опечатка — расхождение разбирается, а не игнорируется.`);
            lines.push('');
        }
    }

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Ссылка на карту в оглавлении клиента — Фундаментальное правило 2. */
function ensureLinked(clientDir: string): void {
    const indexPath = path.join(clientDir, '_index.md');
    if (!fs.existsSync(indexPath)) return;
    const doc = readDoc(indexPath);
    if (doc.body.includes(MAP_FILE)) return;

    const numbers = [...doc.body.matchAll(/^(\d+)\.\s/gm)].map(m => parseInt(m[1], 10));
    const next = numbers.length ? Math.max(...numbers) + 1 : 1;
    doc.body = `${doc.body.replace(/\s*$/, '')}\n${next}. [Карта связей (v1.0)](<${MAP_FILE}>)\n`;
    writeDoc(indexPath, doc);
}

const clientsDir = path.join(CWD, 'clients');
const stale: string[] = [];
let written = 0;

for (const entry of fs.readdirSync(clientsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const clientDir = path.join(clientsDir, entry.name);
    if (!fs.existsSync(path.join(clientDir, 'Forms'))) continue;

    const forms = collectForms(clientDir);
    const body = renderMap(entry.name, forms);
    const filePath = path.join(clientDir, MAP_FILE);

    const existing: Doc = fs.existsSync(filePath)
        ? readDoc(filePath)
        : { meta: { title: '01 Карта связей (v1.0)', audience: 'tech' }, body: '', order: [] };

    if (existing.body.trim() === body.trim()) {
        if (!args.has('check')) console.log(`  без изменений: ${path.relative(CWD, filePath)}`);
        continue;
    }

    if (args.has('check')) {
        stale.push(path.relative(CWD, filePath));
        continue;
    }

    existing.meta.title = existing.meta.title || '01 Карта связей (v1.0)';
    existing.meta.audience = 'tech';
    existing.body = body;
    writeDoc(filePath, existing);
    ensureLinked(clientDir);
    written++;
    console.log(`  обновлено: ${path.relative(CWD, filePath)}`);
}

if (args.has('check')) {
    if (stale.length) {
        console.error('Карта связей отстала от кода:');
        stale.forEach(f => console.error(`  ${f}`));
        console.error('\nВыполните: npm run map');
        process.exit(1);
    }
    console.log('✅ Карта связей актуальна.');
} else {
    console.log(`\nГотово. Обновлено файлов: ${written}.`);
}

```
