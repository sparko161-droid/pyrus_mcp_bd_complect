---
title: "Скрипт: doc_lint.ts"
audience: "internal"
pyrus_id: "Kfzi3UWMdVz"
pyrus_parent: "HzQz5U8wZjh"
synced_at: "2026-08-10T13:46:17.000Z"
synced_hash: "sha256:23bfcc6a4266485b0c65333acd311cc9"
---

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { readDoc, versionFromFilename } from './lib/frontmatter';
import { parseArgs } from './lib/env';

/**
 * Механическая проверка Фундаментальных правил документации.
 *
 * Аудит показал, что ни одно из правил 1-5 не соблюдалось полностью, хотя все
 * они были записаны. Правило, которое не проверяет машина, не соблюдается —
 * поэтому проверка живёт в `npm run check` и в pre-commit, а не в памяти
 * инженера.
 *
 *   npx tsx solutions_bank/scripts/doc_lint.ts
 *   npx tsx solutions_bank/scripts/doc_lint.ts --warn-only
 */

const CWD = process.cwd();
const ROOTS = ['clients', 'solutions_bank', 'project_docs'];
const args = parseArgs();

interface Finding { rule: string; file: string; message: string; }
const findings: Finding[] = [];
const add = (rule: string, file: string, message: string) =>
    findings.push({ rule, file: path.relative(CWD, file), message });

function walkDirs(dir: string, visit: (d: string) => void) {
    visit(dir);
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walkDirs(path.join(dir, e.name), visit);
    }
}

function docsIn(dir: string): string[] {
    return fs.readdirSync(dir)
        .filter(f => f.endsWith('.md') && !f.endsWith('.remote.md') && f !== '_index.md');
}

function checkDirectory(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const articles = docsIn(dir);
    const hasSubdirs = entries.some(e => e.isDirectory());

    // Корневые контейнеры (clients/, project_docs/) сами разделами не являются.
    if (ROOTS.includes(path.relative(CWD, dir))) return;

    // Папка без документов и без подпапок вообще не нужна.
    if (articles.length === 0 && !hasSubdirs && !fs.existsSync(path.join(dir, '_index.md'))) {
        add('структура', dir, 'пустая папка: ни статей, ни подразделов, ни оглавления');
        return;
    }
    if (articles.length === 0 && !hasSubdirs) return;

    // ПРАВИЛО 2: оглавление обязано быть и обязано покрывать все статьи папки.
    const indexPath = path.join(dir, '_index.md');
    if (!fs.existsSync(indexPath)) {
        add('Правило 2', dir, 'нет _index.md (оглавления раздела)');
    } else {
        const idx = readDoc(indexPath);
        if (!idx.body.trim()) {
            add('Правило 2', indexPath, 'оглавление пустое');
        } else if (articles.length > 0) {
            // Имена файлов содержат "(v1.0)", поэтому ссылки пишутся в угловых
            // скобках — иначе круглая скобка внутри обрывает разбор ссылки.
            const links = [
                ...[...idx.body.matchAll(/\]\(<([^>]+)>\)/g)].map(m => m[1]),
                ...[...idx.body.matchAll(/\]\(([^<>()\s]+)\)/g)].map(m => m[1])
            ];
            for (const a of articles) {
                const linked = links.some(l => l === a || decodeURIComponent(l) === a);
                if (!linked) add('Правило 2', indexPath, `статья не указана в оглавлении: ${a}`);
            }
            for (const l of links) {
                if (!l.endsWith('.md')) continue;
                if (!fs.existsSync(path.join(dir, decodeURIComponent(l)))) {
                    add('Правило 2', indexPath, `битая ссылка на несуществующий файл: ${l}`);
                }
            }
        }
    }

    // ПРАВИЛО 1 и 3: в папке со статьями обязана быть история изменений (авто-зеркала кода .ts.md проверяются в истории изменений клиента/формы).
    const userArticles = articles.filter(a => !a.endsWith('.ts.md'));
    if (userArticles.length > 0 && !articles.some(a => /История_изменений/i.test(a))) {
        add('Правило 1', dir, 'нет файла История_изменений');
    }
}


function checkDocument(file: string) {
    const doc = readDoc(file);
    const name = path.basename(file);
    const isIndex = name === '_index.md';

    if (!doc.meta.title) {
        add('заголовок', file, 'нет title в YAML-заголовке');
    }

    // ПРАВИЛО 4: Pyrus сам подставляет заголовок из title, поэтому H1 в теле
    // даёт два одинаковых заголовка подряд и накапливается при PULL.
    const firstLine = doc.body.split('\n').map(s => s.trim()).find(Boolean) ?? '';
    if (/^#\s/.test(firstLine)) {
        add('Правило 4', file, `H1 в теле запрещён (Pyrus добавляет заголовок сам): "${firstLine}"`);
    }
    const titleNoV = (doc.meta.title ?? '').replace(/\s*\(v[\d.]+\)\s*$/, '').trim().toLowerCase();
    if (/^#{1,3}\s/.test(firstLine)) {
        const h = firstLine.replace(/^#{1,3}\s*/, '').replace(/\s*\(v[\d.]+\)\s*$/, '').trim().toLowerCase();
        if (h && h === titleNoV) {
            add('Правило 4', file, `заголовок дублирует title: "${firstLine}"`);
        }
    }

    // ПРАВИЛО 1.3: версия согласована между именем файла и YAML.
    if (!isIndex) {
        const fromName = versionFromFilename(name);
        const fromTitle = (doc.meta.title ?? '').match(/\(v([\d.]+)\)/)?.[1];
        const declared = doc.meta.version;
        if (fromName && fromTitle && fromName !== fromTitle) {
            add('Правило 1.3', file, `версия в имени (v${fromName}) не совпадает с title (v${fromTitle})`);
        }
        if (fromName && declared && fromName !== declared) {
            add('Правило 1.3', file, `версия в имени (v${fromName}) не совпадает с полем version (${declared})`);
        }
    }

    // Аудитория: internal-документы не должны лежать в клиентских ветках,
    // потому что клиенту выдаётся доступ на его раздел целиком.
    const rel = path.relative(CWD, file).replace(/\\/g, '/');
    if (doc.meta.audience === 'internal' && rel.startsWith('clients/')) {
        add('аудитория', file, 'документ помечен internal, но лежит в клиентской ветке — клиент получит к нему доступ');
    }
    if (rel.startsWith('solutions_bank/') || rel.startsWith('project_docs/')) {
        if (doc.meta.audience && doc.meta.audience !== 'internal') {
            add('аудитория', file, `вне клиентов допустим только audience: internal, указано "${doc.meta.audience}"`);
        }
        // Без метки документ уедет туда же, куда и клиентская документация:
        // разграничение доступа держится на этом поле.
        if (!doc.meta.audience) {
            add('аудитория', file, 'нет поля audience — документ вне клиентов обязан быть помечен internal');
        }
    }
    if (rel.startsWith('clients/') && !doc.meta.audience) {
        add('аудитория', file, 'нет поля audience (user для UserDocs, tech для остального в клиенте)');
    }

    // Остатки неразрешённых конфликтов синхронизации.
    if (fs.existsSync(file.replace(/\.md$/, '.remote.md'))) {
        add('конфликт', file, 'рядом лежит неразрешённый .remote.md — слейте версии и удалите его');
    }
}

for (const root of ROOTS) {
    const dir = path.join(CWD, root);
    if (!fs.existsSync(dir)) continue;
    walkDirs(dir, d => {
        checkDirectory(d);
        for (const f of fs.readdirSync(d)) {
            if (f.endsWith('.md') && !f.endsWith('.remote.md')) checkDocument(path.join(d, f));
        }
    });
}

// Коллизии номеров среди соседних папок.
for (const root of ROOTS) {
    const dir = path.join(CWD, root);
    if (!fs.existsSync(dir)) continue;
    walkDirs(dir, d => {
        const seen = new Map<string, string>();
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (!e.isDirectory()) continue;
            const num = e.name.match(/^(\d+)[_.]/)?.[1];
            if (!num) continue;
            const prev = seen.get(num);
            if (prev) add('нумерация', path.join(d, e.name), `номер ${num} уже занят папкой "${prev}"`);
            else seen.set(num, e.name);
        }
    });
}

const byRule = findings.reduce<Record<string, Finding[]>>((acc, f) => {
    (acc[f.rule] ??= []).push(f);
    return acc;
}, {});

if (findings.length === 0) {
    console.log('✅ Документация соответствует Фундаментальным правилам.');
    process.exit(0);
}

console.log(`Нарушений: ${findings.length}\n`);
for (const [rule, items] of Object.entries(byRule)) {
    console.log(`── ${rule} (${items.length}) ──`);
    for (const f of items) console.log(`  ${f.file}\n      ${f.message}`);
    console.log('');
}

if (args.has('warn-only')) {
    console.log('Режим --warn-only: код возврата 0.');
    process.exit(0);
}
process.exit(1);

```
