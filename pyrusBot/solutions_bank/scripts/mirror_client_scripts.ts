import * as fs from 'fs';
import * as path from 'path';
import { readDoc, writeDoc, contentHash, Doc } from './lib/frontmatter';
import { parseArgs } from './lib/env';

/**
 * Зеркалит исходный код клиентских ботов и скриптов в статьи рядом с ними.
 *
 * `kb_sync.ts` синхронизирует только `.md` — `.ts`-файл в `Forms/NN_Форма/scripts/`
 * был для него невидим и в Базу знаний никогда не попадал. Инженер видел код в
 * репозитории, клиент в Базе знаний — нет, хотя по правилу проекта Forms открыт
 * клиенту вместе с ТЗ: это его оплаченная разработка, и полная картина по клиенту
 * обязана включать код.
 *
 * Каждый `<script>.ts` получает соседа `<script>.ts.md` с тем же кодом в блоке
 * ```typescript``` — его и синхронизирует kb_sync.ts как обычную статью раздела
 * «Формы и скрипты». Аудитория (`tech`) наследуется от самого раздела: по правилу
 * проекта исходники ботов открыты клиенту так же, как ТЗ.
 *
 * Идемпотентно: `synced_hash` не снимается, если тело не изменилось — иначе
 * каждый прогон гнал бы в Базу знаний код, который не менялся ни строкой.
 *
 *   npm run mirror:scripts          обновить зеркала
 *   npm run mirror:scripts:check    входит в npm run check: падает, если отстало
 */

const CWD = process.cwd();
const args = parseArgs();

function findScriptDirs(): string[] {
    const out: Set<string> = new Set();
    const clientsDir = path.join(CWD, 'clients');

    if (fs.existsSync(clientsDir)) {
        for (const client of fs.readdirSync(clientsDir, { withFileTypes: true })) {
            if (!client.isDirectory()) continue;
            const clientPath = path.join(clientsDir, client.name);

            // 1. clients/*/Bots
            const botsDir = path.join(clientPath, 'Bots');
            if (fs.existsSync(botsDir)) out.add(botsDir);

            // 2. clients/*/scripts
            const clientScriptsDir = path.join(clientPath, 'scripts');
            if (fs.existsSync(clientScriptsDir)) out.add(clientScriptsDir);

            // 3. clients/*/Forms/*/scripts
            const formsDir = path.join(clientPath, 'Forms');
            if (fs.existsSync(formsDir)) {
                for (const form of fs.readdirSync(formsDir, { withFileTypes: true })) {
                    if (!form.isDirectory()) continue;
                    const scriptsDir = path.join(formsDir, form.name, 'scripts');
                    if (fs.existsSync(scriptsDir)) out.add(scriptsDir);
                }
            }
        }
    }

    // 4. solutions_bank/bots, form_scripts, functions
    const bankDir = path.join(CWD, 'solutions_bank');
    if (fs.existsSync(bankDir)) {
        for (const sub of ['bots', 'form_scripts', 'functions']) {
            const p = path.join(bankDir, sub);
            if (fs.existsSync(p)) out.add(p);
        }
    }

    return Array.from(out);
}

function mirrorPath(scriptPath: string): string {
    return `${scriptPath}.md`;
}

function audienceForScript(scriptPath: string): 'tech' | 'internal' {
    const relPath = path.relative(CWD, scriptPath).replace(/\\/g, '/');
    return relPath.startsWith('clients/') ? 'tech' : 'internal';
}

/** Пишет зеркало, сохраняя pyrus_id при перегенерации — иначе каждый прогон плодил бы дубль статьи. */
function writeMirror(scriptPath: string): { path: string; changed: boolean } {
    const target = mirrorPath(scriptPath);
    const code = fs.readFileSync(scriptPath, 'utf8').replace(/\r\n/g, '\n').trimEnd();
    const body = '```typescript\n' + code + '\n```';
    const title = `Код: ${path.basename(scriptPath)}`;
    const audience = audienceForScript(scriptPath);

    const existing: Doc = fs.existsSync(target) ? readDoc(target) : { meta: {}, body: '', order: [] };
    const existingBodyNorm = existing.body.replace(/\r\n/g, '\n').trim();
    const bodyNorm = body.replace(/\r\n/g, '\n').trim();
    const unchanged = existing.meta.title === title && existing.meta.audience === audience && contentHash(existingBodyNorm) === contentHash(bodyNorm);

    const meta = { ...existing.meta, title, audience };
    if (!unchanged) delete meta.synced_hash;

    if (!args.has('check')) writeDoc(target, { meta, body, order: existing.order });
    return { path: target, changed: !unchanged };
}

/** Зеркала, чей исходный `.ts` исчез, — иначе в Базе знаний остаётся код удалённого бота. */
function removeOrphans(scriptsDir: string): string[] {
    const removed: string[] = [];
    for (const f of fs.readdirSync(scriptsDir)) {
        if (!f.endsWith('.ts.md')) continue;
        const source = path.join(scriptsDir, f.slice(0, -3));
        if (!fs.existsSync(source)) {
            if (!args.has('check')) fs.unlinkSync(path.join(scriptsDir, f));
            removed.push(path.join(scriptsDir, f));
        }
    }
    return removed;
}

/** Обеспечивает ссылки в _index.md папки со скриптами (Правило 2). */
function updateIndex(scriptsDir: string, mirrors: string[]): boolean {
    const indexPath = path.join(scriptsDir, '_index.md');
    if (!fs.existsSync(indexPath)) return false;
    const doc = readDoc(indexPath);
    let updated = false;

    for (const mirror of mirrors) {
        const mirrorName = path.basename(mirror);
        const scriptBase = mirrorName.slice(0, -3); // remove .md
        if (!doc.body.includes(mirrorName)) {
            doc.body = `${doc.body.trimEnd()}\n\n- [Код: ${scriptBase}](<${mirrorName}>)\n`;
            updated = true;
        }
    }

    if (updated && !args.has('check')) {
        writeDoc(indexPath, doc);
    }
    return updated;
}

const stale: string[] = [];
let written = 0;

for (const scriptsDir of findScriptDirs()) {
    const activeMirrors: string[] = [];
    for (const f of fs.readdirSync(scriptsDir)) {
        if (!f.endsWith('.ts')) continue;
        const scriptPath = path.join(scriptsDir, f);
        const { path: target, changed } = writeMirror(scriptPath);
        activeMirrors.push(target);
        if (changed) {
            stale.push(path.relative(CWD, target));
            written++;
        }
    }
    for (const orphan of removeOrphans(scriptsDir)) {
        stale.push(`удалить: ${path.relative(CWD, orphan)}`);
    }
    if (activeMirrors.length > 0) {
        if (updateIndex(scriptsDir, activeMirrors)) {
            stale.push(`оглавление: ${path.relative(CWD, path.join(scriptsDir, '_index.md'))}`);
        }
    }
}

if (args.has('check')) {
    if (stale.length) {
        console.error('Зеркала кода в Базе знаний отстали от исходников:');
        stale.forEach(f => console.error(`  ${f}`));
        console.error('\nВыполните: npm run mirror:scripts');
        process.exit(1);
    }
    console.log('✅ Зеркала кода актуальны.');
} else {
    written ? console.log(`Обновлено зеркал: ${written}.`) : console.log('Все зеркала уже актуальны.');
    stale.forEach(f => console.log(`  ${f}`));
}

