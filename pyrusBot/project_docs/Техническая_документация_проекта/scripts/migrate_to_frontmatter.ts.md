---
title: "Скрипт: migrate_to_frontmatter.ts"
audience: "internal"
pyrus_id: "SOvwErE3p1F"
pyrus_parent: "HzQz5U8wZjh"
synced_at: "2026-08-10T05:16:36.000Z"
synced_hash: "sha256:2bdc6f4757110ce5a59131f4c97cff33"
---

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { getClient, parseArgs, withRetry, sleep } from './lib/env';
import { readDoc, writeDoc, contentHash, stripInjectedHeading, normalizePyrusBody, Doc, Audience } from './lib/frontmatter';

/**
 * Разовая миграция: идентичность статей переезжает из kb_sync_state.json
 * во frontmatter самих документов.
 *
 * Пока идентичность хранилась снаружи и ключом служил путь С ВЕРСИЕЙ в имени,
 * любое повышение версии по Правилу 1.3 давало новый ключ — и синхронизатор
 * создавал дубль статьи вместо обновления. После миграции ID живёт в файле и
 * переживает и переименование, и смену версии.
 *
 *   npx tsx solutions_bank/scripts/migrate_to_frontmatter.ts --dry-run
 *   npx tsx solutions_bank/scripts/migrate_to_frontmatter.ts
 */

const STATE = path.join(process.cwd(), 'solutions_bank', 'scripts', 'kb_sync_state.json');
const args = parseArgs();
const pyrus = getClient();

/** Аудитория выводится из расположения: она определяет, в какое дерево БЗ поедет документ. */
function audienceFor(relPath: string): Audience {
    const p = relPath.replace(/\\/g, '/');
    if (p.includes('/UserDocs/')) return 'user';
    if (p.includes('/TechDocs/') || p.includes('/Forms/')) return 'tech';
    return 'internal';
}

function indexPathFor(dirRel: string): string {
    return path.join(process.cwd(), dirRel, '_index.md');
}

(async () => {
    if (!fs.existsSync(STATE)) {
        console.error('kb_sync_state.json не найден — миграция уже выполнена?');
        process.exit(1);
    }
    const state: Record<string, string> = JSON.parse(fs.readFileSync(STATE, 'utf8'));
    const entries = Object.entries(state);
    console.log(`Записей в state: ${entries.length}${args.dryRun ? '   [DRY-RUN, ничего не пишем]' : ''}\n`);

    let files = 0, topics = 0, created = 0, missing = 0;

    for (const [key, pyrusId] of entries) {
        const rel = key.replace(/\\/g, path.sep);
        const abs = path.join(process.cwd(), rel);
        const isFile = rel.endsWith('.md');

        // Раздел (папка) хранит свой ID в _index.md — этот файл и есть тело раздела в Pyrus.
        const target = isFile ? abs : indexPathFor(rel);
        const targetRel = path.relative(process.cwd(), target);

        if (isFile && !fs.existsSync(abs)) {
            console.log(`  [ПРОПУСК] файла нет на диске: ${rel}  (статья ${pyrusId} осиротела)`);
            missing++;
            continue;
        }
        if (!isFile && !fs.existsSync(path.dirname(target))) {
            console.log(`  [ПРОПУСК] папки нет на диске: ${rel}  (раздел ${pyrusId} осиротел)`);
            missing++;
            continue;
        }

        // Тянем актуальные title/updated_at из Pyrus, чтобы synced_* были правдой,
        // а не выдумкой: иначе первая же синхронизация решит, что всё изменилось.
        let remote: any = null;
        try {
            remote = await withRetry(pyrusId, () => pyrus.knowledgeBase.get(pyrusId));
            await sleep(120); // сеть до Pyrus не держит плотную очередь запросов
        } catch (e: any) {
            console.log(`  [ПРОПУСК] ${pyrusId} недоступен в Pyrus: ${e?.message || e}`);
            missing++;
            continue;
        }

        let doc: Doc;
        if (fs.existsSync(target)) {
            doc = readDoc(target);
        } else {
            // У раздела не было _index.md — создаём из тела раздела в Pyrus.
            // Заодно закрывается Правило 2: у каждой папки появляется оглавление.
            const body = stripInjectedHeading(normalizePyrusBody(remote.body || ''), remote.title || '');
            doc = { meta: { title: remote.title || path.basename(rel) }, body, order: [] };
            created++;
        }

        doc.meta.pyrus_id = pyrusId;
        if (remote.parent_topic_id) doc.meta.pyrus_parent = remote.parent_topic_id;
        doc.meta.audience = audienceFor(rel);
        doc.meta.synced_at = new Date(remote.updated_at).toISOString();
        doc.meta.synced_hash = contentHash(doc.body);
        if (!doc.meta.title) doc.meta.title = remote.title;

        console.log(`  ${isFile ? 'статья ' : 'раздел '} ${pyrusId}  ${targetRel}`);
        if (!args.dryRun) writeDoc(target, doc);

        if (isFile) files++; else topics++;
    }

    console.log(`\nСтатей: ${files}   Разделов: ${topics}   Создано _index.md: ${created}   Пропущено: ${missing}`);

    if (args.dryRun) return;

    // Файл состояния убираем ТОЛЬКО если перенесены все записи без единого пропуска.
    // Иначе часть идентичности осталась бы лишь в state, а он бы исчез — и следующая
    // синхронизация создала бы дубли статей в Базе знаний.
    if (missing > 0) {
        console.error(`\nМиграция неполная: ${missing} записей не перенесено (обычно из-за сети).`);
        console.error('kb_sync_state.json СОХРАНЁН. Повторите запуск — уже перенесённые документы обработаются повторно без вреда.');
        process.exit(1);
    }

    const backup = STATE + '.migrated';
    fs.renameSync(STATE, backup);
    console.log(`\nВсе ${entries.length} записей перенесены. kb_sync_state.json переименован в ${path.basename(backup)}.`);
    console.log('Идентичность теперь живёт во frontmatter документов. Общий мутируемый файл состояния больше не нужен.');
})().catch(e => {
    console.error('Ошибка миграции:', e?.message || e);
    process.exit(1);
});

```
