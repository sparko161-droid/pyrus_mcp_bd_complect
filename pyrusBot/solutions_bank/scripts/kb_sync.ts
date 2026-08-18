import * as fs from 'fs';
import * as path from 'path';
import { getClient, kbRootPublic, kbRootInternal, parseArgs, withRetry, sleep } from './lib/env';
import {
    readDoc, writeDoc, contentHash, stripInjectedHeading,
    normalizePyrusBody, Doc, Audience
} from './lib/frontmatter';

/**
 * Синхронизация локальной документации с Базой знаний Pyrus.
 *
 * Идентичность каждой статьи хранится в её собственном YAML-заголовке
 * (`pyrus_id`), поэтому переименование файла и смена версии не создают дубль.
 *
 * Направление определяется сравнением трёх состояний: хэша тела на диске,
 * `synced_hash` (каким тело было в момент последней синхронизации) и
 * `updated_at` статьи в Pyrus.
 *
 *   локально | в Pyrus  | действие
 *   ---------|----------|----------------------------------------------
 *   =        | =        | SKIP
 *   изменено | =        | PUSH
 *   =        | изменено | PULL
 *   изменено | изменено | CONFLICT — рядом кладётся <файл>.remote.md
 *
 *   npx tsx solutions_bank/scripts/kb_sync.ts --dry-run
 *   npx tsx solutions_bank/scripts/kb_sync.ts --client=01_Демо_кабинет
 */

const args = parseArgs();
const pyrus = getClient();

const CLIENT_SUBFOLDERS = ['UserDocs', 'TechDocs', 'Forms'];
/** Номер корневого раздела клиентской документации в Базе знаний. */
const ROOT_PREFIX = '14';

/**
 * Куда попадает каждое дерево в Базе знаний.
 *
 * Разграничение доступа в Pyrus делается правами на раздел: клиенту выдаётся
 * доступ на его узел (`14.01 Демо кабинет`), и соседние узлы он не видит.
 * Поэтому отдельное дерево для ТЗ не нужно — TechDocs описывает процессы
 * самого клиента и им же оплачена.
 *
 * А вот `Банк решений` (наработки по всем клиентам сразу) и `Техническая
 * документация проекта` (правила агентов, скрипты) не принадлежат ни одному
 * клиенту и в клиентском дереве не место: любая ошибка в выдаче прав на
 * родительский раздел открыла бы клиенту наработки по остальным.
 */
const SYNC_ROOTS: Array<{ dir: string; root: () => string; prefix: string; ownTopic: boolean }> = [
    // `clients` — это и есть корневой раздел клиентской документации, своего
    // узла под ним не заводит.
    { dir: 'clients', root: kbRootPublic, prefix: ROOT_PREFIX, ownTopic: false },
    { dir: 'solutions_bank', root: kbRootInternal, prefix: '', ownTopic: true },
    // `project_docs` — контейнер: собственный узел Базы знаний описан вложенной
    // папкой «Техническая документация проекта», а не самой этой папкой.
    { dir: 'project_docs', root: kbRootInternal, prefix: '', ownTopic: false }
];

type Action = 'SKIP' | 'PUSH' | 'PULL' | 'CREATE' | 'CONFLICT' | 'RENAME' | 'MOVE';
const tally: Record<Action, number> = { SKIP: 0, PUSH: 0, PULL: 0, CREATE: 0, CONFLICT: 0, RENAME: 0, MOVE: 0 };
const conflicts: string[] = [];
const errors: string[] = [];
const empty: string[] = [];
/** Узлы, которым нужен перенос, но нет разрешения `--yes`. */
const pendingMoves: string[] = [];

function rel(p: string) { return path.relative(process.cwd(), p); }

function audienceFor(p: string): Audience {
    const s = rel(p).replace(/\\/g, '/');
    if (s.includes('/UserDocs/')) return 'user';
    // Всё остальное внутри клиента открывается клиенту: это описание его
    // собственных процессов и оплаченная им разработка.
    if (s.startsWith('clients/')) return 'tech';
    return 'internal';
}

/** Человеческое название раздела из имени папки. */
function topicTitle(folder: string): string {
    const named: Record<string, string> = {
        UserDocs: 'Пользовательская документация',
        TechDocs: 'Техническая документация',
        Forms: 'Формы и скрипты',
        scripts: 'Скрипты',
        bots: 'Боты',
        form_scripts: 'Скрипты форм',
        functions: 'Функции',
        solutions: 'Комплексные решения',
        solutions_bank: 'Банк решений',
        rules: 'Правила агентов',
        skills: 'Навыки (Skills)'
    };
    return named[folder] ?? folder.replace(/_/g, ' ');
}

/**
 * Полный номер узла по схеме 14.01.1.1: корневой номер раздела плюс позиция
 * на каждом уровне. Номер вычисляется, а не ведётся руками — вставка нового
 * клиента не требует перенумерации всего дерева.
 */
function numbered(prefix: string, title: string): string {
    // Без префикса нумерация не применяется вообще: разделы вне клиентов
    // (Банк решений, документация проекта) сохраняют свои названия как есть.
    if (!prefix) return title;
    return `${prefix} ${title.replace(/^[\d.]+[_\s]+/, '')}`;
}

/**
 * Версия живёт в имени файла и в оглавлении раздела, а не в заголовке статьи.
 * «(v1.0)» в каждом названии — шум для читателя Базы знаний: список статей
 * превращается в столбик одинаковых суффиксов, а версия всё равно меняется
 * чаще, чем название.
 */
function stripVersion(title: string): string {
    return title.replace(/\s*\(v[\d.]+\)\s*$/, '').trim();
}

/**
 * Название статьи в Базе знаний.
 *
 * Истории изменений во всех разделах назывались одинаково («01 История
 * изменений»), и в результатах поиска Pyrus их было не различить. Там, где
 * номера раздела нет (внутренние ветки), к названию добавляется сам раздел.
 * Номер `01` сохраняется: по нему статья остаётся первой в списке.
 */
function articleTitle(dir: string, fileName: string, metaTitle: string | undefined, prefix: string, seq: number): string {
    let base = stripVersion(metaTitle || fileName.replace(/\.md$/, ''));

    if (!prefix && /истори[яи]\s+изменений/i.test(base)) {
        // Вычисленное название сохраняется обратно в файл, поэтому добавление
        // обязано быть идемпотентным: иначе каждый прогон дописывал бы ещё один
        // суффикс — «01 История изменений — Скрипты — Скрипты».
        const suffix = ` — ${topicTitle(path.basename(dir))}`;
        while (base.endsWith(suffix)) base = base.slice(0, -suffix.length);
        base += suffix;
    }

    return numbered(prefix ? `${prefix}.${segmentOf(fileName, seq, false)}` : '', base);
}

/**
 * Сегмент номера берётся из имени папки или файла (`01_Заказы_тортов` → `01`),
 * а не из порядка обхода: иначе вставка нового клиента сдвинула бы номера всех
 * последующих и переименовала полдерева в Базе знаний.
 */
function segmentOf(name: string, fallback: number, pad: boolean): string {
    const m = name.match(/^(\d+)[_.]/);
    const raw = m ? m[1] : String(fallback);
    // Клиент нумеруется с ведущим нулём (14.01), уровни ниже — без него (14.01.1.2).
    return pad ? raw.padStart(2, '0') : String(parseInt(raw, 10));
}

/** Возвращает истину, если название пришлось менять. */
async function ensureTitle(id: string, want: string, current: string): Promise<boolean> {
    if (current === want) return false;
    console.log(`  [RENAME]   "${current}" → "${want}"`);
    tally.RENAME++;
    if (!args.dryRun) await withRetry(id, () => pyrus.knowledgeBase.update(id, { title: want } as any));
    return !args.dryRun;
}

/**
 * Перенос узла в другой раздел.
 *
 * База знаний общая корпоративная, и перенос раздела виден всей организации,
 * поэтому без явного `--yes` перенос только показывается. Отмена возможна
 * (перенести обратно), но восстанавливать чужие права после случайного
 * переезда придётся руками.
 */
async function ensureParent(id: string, label: string, want: string, current: string | undefined): Promise<boolean> {
    if (!current || current === want) return false;

    if (!args.yes || args.dryRun) {
        console.log(`  [MOVE?]    ${label}: ${current} → ${want} (нужен --yes)`);
        pendingMoves.push(`${label}: ${current} → ${want}`);
        return false;
    }

    console.log(`  [MOVE]     ${label}: ${current} → ${want}`);
    tally.MOVE++;
    await withRetry(id, () => pyrus.knowledgeBase.update(id, {
        parent_topic_id_changed: true, parent_topic_id: want
    } as any));
    await sleep(120);
    return true;
}

/** Ссылки вида `](файл.md)` заменяются на реальные адреса статей Pyrus. */
function injectLinks(body: string, map: Map<string, string>): string {
    let out = body;
    for (const [file, id] of map) {
        const esc = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const url = `](https://pyrus.com/t#kb/article/${id})`;
        // Ссылки на файлы с "(v1.0)" пишутся в угловых скобках; поддерживаем оба вида.
        out = out.replace(new RegExp(`\\]\\(<${esc}>\\)`, 'g'), url);
        out = out.replace(new RegExp(`\\]\\(${esc}\\)`, 'g'), url);
    }
    return out;
}

/**
 * Синхронизация одного документа. Возвращает pyrus_id (новый или прежний).
 */
async function syncDoc(file: string, parentId: string, wantTitle: string, links: Map<string, string>): Promise<string | null> {
    const doc: Doc = readDoc(file);
    const body = injectLinks(doc.body, links);
    const localHash = contentHash(body);
    doc.meta.audience = audienceFor(file);

    // Новая статья — в Pyrus её ещё нет.
    if (!doc.meta.pyrus_id) {
        console.log(`  [CREATE]   ${rel(file)}`);
        tally.CREATE++;
        if (args.dryRun) return null;
        const created: any = await withRetry(rel(file), () => pyrus.knowledgeBase.create({
            type: 'article', title: wantTitle, body, parent_topic_id: parentId
        } as any));
        await sleep(120);
        doc.meta.pyrus_id = created.id;
        doc.meta.pyrus_parent = parentId;
        doc.meta.title = wantTitle;
        doc.meta.synced_at = new Date(created.updated_at ?? Date.now()).toISOString();
        doc.meta.synced_hash = localHash;
        writeDoc(file, doc);
        return created.id;
    }

    const id = doc.meta.pyrus_id;
    let remote: any;
    try {
        remote = await withRetry(id, () => pyrus.knowledgeBase.get(id));
        await sleep(120);
    } catch (e: any) {
        console.log(`  [ОШИБКА]   ${rel(file)}: статья ${id} недоступна (${e?.message})`);
        return id;
    }

    const remoteAt = new Date(remote.updated_at).toISOString();

    // Родитель сверяется с фактическим положением в Pyrus, а не с записанным
    // в файле: так расхождение чинится само, даже если статью двигали руками.
    if (await ensureParent(id, rel(file), parentId, remote.parent_topic_id)) {
        doc.meta.pyrus_parent = parentId;
        writeDoc(file, doc);
    }

    // Базы сравнения нет (статья заведена до перехода на frontmatter либо файл
    // перегенерирован): доказать изменение на той стороне нечем, поэтому
    // локальная версия принимается за истину и уходит в PUSH. Конфликт здесь
    // был бы ложным и блокировал бы весь прогон.
    const hasBaseline = Boolean(doc.meta.synced_hash && doc.meta.synced_at);
    const localChanged = !hasBaseline || localHash !== doc.meta.synced_hash;

    // `updated_at` меняется и от переименования, и от правки прав — то есть от
    // операций, которые тела статьи не трогают. Судить о правке на той стороне
    // по одной дате значит объявлять конфликт после собственного RENAME.
    // Поэтому дата — только повод присмотреться, а решает хэш тела.
    const remoteBody = stripInjectedHeading(normalizePyrusBody(remote.body || ''), remote.title || '');
    const remoteChanged = hasBaseline
        && remoteAt !== doc.meta.synced_at
        && contentHash(remoteBody) !== doc.meta.synced_hash;

    if (!localChanged && !remoteChanged) {
        tally.SKIP++;
        // Переименование меняет updated_at статьи. Без обновления synced_at
        // следующий прогон принял бы собственный RENAME за чужую правку в Pyrus
        // и утащил бы файл в PULL, а при локальных правках — в ложный CONFLICT.
        if (await ensureTitle(id, wantTitle, remote.title)) {
            const after: any = await withRetry(id, () => pyrus.knowledgeBase.get(id));
            await sleep(120);
            doc.meta.title = wantTitle;
            doc.meta.synced_at = new Date(after.updated_at).toISOString();
            writeDoc(file, doc);
        }
        return id;
    }

    if (localChanged && remoteChanged) {
        // Молча слить нельзя: чужая правка в Pyrus и наша локальная одинаково
        // ценны. Кладём удалённую версию рядом и останавливаем этот файл.
        const side = file.replace(/\.md$/, '.remote.md');
        console.log(`  [CONFLICT] ${rel(file)}`);
        console.log(`             удалённая версия сохранена: ${rel(side)}`);
        tally.CONFLICT++;
        conflicts.push(rel(file));
        if (!args.dryRun) fs.writeFileSync(side, remoteBody, 'utf8');
        return id;
    }

    if (remoteChanged) {
        console.log(`  [PULL]     ${rel(file)}  (изменено в Pyrus)`);
        tally.PULL++;
        if (!args.dryRun) {
            doc.body = remoteBody;
            doc.meta.title = remote.title;
            doc.meta.synced_at = remoteAt;
            doc.meta.synced_hash = contentHash(doc.body);
            writeDoc(file, doc);
        }
        return id;
    }

    console.log(`  [PUSH]     ${rel(file)}`);
    tally.PUSH++;
    if (!args.dryRun) {
        await withRetry(id, () => pyrus.knowledgeBase.update(id, {
            title: wantTitle, body, parent_topic_id: parentId
        } as any));
        await sleep(120);
        const after: any = await withRetry(id, () => pyrus.knowledgeBase.get(id));
        doc.meta.title = wantTitle;
        doc.meta.synced_at = new Date(after.updated_at).toISOString();
        doc.meta.synced_hash = localHash;
        writeDoc(file, doc);
    }
    return id;
}

/**
 * Собственный узел корневой папки (`Банк решений`, `Техническая документация проекта`).
 *
 * Без него дети папки уезжали прямо под корень Базы знаний, а тело `_index.md`
 * перезаписывало описание самого корневого раздела — из-за этого раздел 14
 * потерял своё описание и получил чужое оглавление.
 */
async function resolveOwnTopic(dir: string, folder: string, parentId: string): Promise<string | null> {
    const indexPath = path.join(dir, '_index.md');
    const doc: Doc = fs.existsSync(indexPath) ? readDoc(indexPath) : { meta: {}, body: '', order: [] };
    const want = topicTitle(folder);

    if (doc.meta.pyrus_id) {
        try {
            const remote: any = await withRetry(doc.meta.pyrus_id, () => pyrus.knowledgeBase.get(doc.meta.pyrus_id!));
            await sleep(120);
            await ensureTitle(doc.meta.pyrus_id, want, remote.title);
            if (await ensureParent(doc.meta.pyrus_id, `раздел ${want}`, parentId, remote.parent_topic_id)) {
                doc.meta.pyrus_parent = parentId;
                if (fs.existsSync(indexPath)) writeDoc(indexPath, doc);
            }
            return doc.meta.pyrus_id;
        } catch (e: any) {
            console.log(`  [ОШИБКА]   раздел ${want}: ${doc.meta.pyrus_id} недоступен (${e?.message})`);
            errors.push(`раздел ${want} — ${doc.meta.pyrus_id} недоступен`);
            return null;
        }
    }

    console.log(`  [CREATE]   раздел ${want}`);
    tally.CREATE++;
    if (args.dryRun) return null;
    const created: any = await withRetry(want, () => pyrus.knowledgeBase.create({
        type: 'topic', title: want, parent_topic_id: parentId
    } as any));
    await sleep(120);
    doc.meta.pyrus_id = created.id;
    doc.meta.pyrus_parent = parentId;
    doc.meta.title = want;
    doc.meta.audience = 'internal';
    writeDoc(indexPath, doc);
    return created.id;
}

/**
 * Обход дерева. `_index.md` описывает САМ раздел (его тело), остальные .md —
 * вложенные статьи. Номер накапливается по пути: 14 → 14.01 → 14.01.1.
 */
async function syncTree(dir: string, topicId: string, prefix: string, articleSeq = { n: 0 }): Promise<void> {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const links = new Map<string, string>();

    // 1. Статьи
    for (const e of entries) {
        if (e.isDirectory() || !e.name.endsWith('.md') || e.name === '_index.md') continue;
        if (e.name.endsWith('.remote.md')) continue;
        const file = path.join(dir, e.name);
        const doc = readDoc(file);
        articleSeq.n++;
        const want = articleTitle(dir, e.name, doc.meta.title, prefix, articleSeq.n);
        try {
            const id = await syncDoc(file, topicId, want, links);
            if (id) links.set(e.name, id);
        } catch (err: any) {
            // Сбой на одной статье не должен обрывать прогон и оставлять
            // дерево наполовину синхронизированным.
            console.log(`  [ОШИБКА]   ${rel(file)}: ${err?.message || err}`);
            errors.push(`${rel(file)} — ${err?.message || err}`);
        }
    }

    // 2. Оглавление раздела: его тело — это тело самого раздела в Pyrus
    const indexPath = path.join(dir, '_index.md');
    if (fs.existsSync(indexPath)) {
        const idx = readDoc(indexPath);
        const body = injectLinks(idx.body, links);
        const localHash = contentHash(body);
        // Пустое тело Pyrus отклоняет (400). Только что созданный раздел ещё не
        // имеет оглавления — это нормально, его напишет инженер или скаффолдер.
        if (!body.trim()) {
            console.log(`  [ПУСТО]    ${rel(indexPath)} — оглавление не заполнено, раздел пропущен`);
            empty.push(rel(indexPath));
        } else if (idx.meta.pyrus_id && localHash !== idx.meta.synced_hash) {
            console.log(`  [PUSH]     ${rel(indexPath)}  (тело раздела)`);
            tally.PUSH++;
            if (!args.dryRun) {
                await withRetry(topicId, () => pyrus.knowledgeBase.update(topicId, { body } as any));
                await sleep(120);
                idx.meta.synced_hash = localHash;
                idx.meta.synced_at = new Date().toISOString();
                writeDoc(indexPath, idx);
            }
        } else {
            tally.SKIP++;
        }
    }

    // 3. Подразделы
    let sub = 0;
    for (const e of entries) {
        if (!e.isDirectory()) continue;
        const child = path.join(dir, e.name);
        const childIndex = path.join(child, '_index.md');
        sub++;
        // Уровень аудитории (UserDocs/TechDocs/Forms) служебный: он не получает
        // номера, но передаёт номер клиента дальше — поэтому форма сохраняет один
        // и тот же номер в пользовательской и технической ветках.
        const isAudience = CLIENT_SUBFOLDERS.includes(e.name);
        const isClient = prefix === ROOT_PREFIX;
        const childPrefix = !prefix ? ''
            : isAudience ? prefix
            : `${prefix}.${segmentOf(e.name, sub, isClient)}`;
        const want = isAudience ? topicTitle(e.name) : numbered(childPrefix, topicTitle(e.name));

        let childDoc: Doc = fs.existsSync(childIndex)
            ? readDoc(childIndex)
            : { meta: { title: want }, body: '', order: [] };

        let childId = childDoc.meta.pyrus_id;
        if (!childId) {
            console.log(`  [CREATE]   раздел ${want}`);
            tally.CREATE++;
            if (args.dryRun) continue;
            const created: any = await withRetry(want, () => pyrus.knowledgeBase.create({
                type: 'topic', title: want, parent_topic_id: topicId
            } as any));
            await sleep(120);
            childId = created.id;
            childDoc.meta.pyrus_id = childId;
            childDoc.meta.pyrus_parent = topicId;
            childDoc.meta.title = want;
            childDoc.meta.audience = audienceFor(child);
            writeDoc(childIndex, childDoc);
        } else {
            try {
                const remote: any = await withRetry(childId, () => pyrus.knowledgeBase.get(childId!));
                await sleep(120);
                await ensureTitle(childId, want, remote.title);
                if (await ensureParent(childId, `раздел ${want}`, topicId, remote.parent_topic_id)) {
                    childDoc.meta.pyrus_parent = topicId;
                    if (fs.existsSync(childIndex)) writeDoc(childIndex, childDoc);
                }
            } catch (e: any) {
                // Раздел недоступен (удалён или нет прав). Синхронизировать его
                // содержимое некуда: дети уехали бы под несуществующего родителя.
                console.log(`  [ОШИБКА]   раздел ${want}: ${childId} недоступен (${e?.message}) — подраздел пропущен`);
                errors.push(`раздел ${want} — ${childId} недоступен, содержимое не синхронизировано`);
                continue;
            }
        }

        await syncTree(child, childId!, childPrefix, { n: 0 });
    }
}

(async () => {
    const publicRoot = kbRootPublic();
    const internalRoot = kbRootInternal();
    console.log(`Клиентский корень: ${publicRoot}`);
    console.log(`Внутренний корень: ${internalRoot}${publicRoot === internalRoot ? '   ⚠ совпадает с клиентским: разделение доступа не выполнено' : ''}`);
    if (args.dryRun) console.log('[DRY-RUN, ничего не пишем]');
    console.log('');

    for (const { dir: name, root, prefix, ownTopic } of SYNC_ROOTS) {
        const dir = path.join(process.cwd(), name);
        if (!fs.existsSync(dir)) continue;
        console.log(`── ${name} ──`);
        const topicId = ownTopic ? await resolveOwnTopic(dir, name, root()) : root();
        if (!topicId) continue;

        // Корневой раздел тоже кем-то описывается. Без этого его название и
        // описание не ведёт никто: опечатка «КЛЕНТЫ» держалась в Базе знаний,
        // потому что править её было нечем.
        if (!ownTopic) {
            const rootIndex = path.join(dir, '_index.md');
            if (fs.existsSync(rootIndex)) {
                const idx = readDoc(rootIndex);
                if (idx.meta.title) {
                    try {
                        const remote: any = await withRetry(topicId, () => pyrus.knowledgeBase.get(topicId));
                        await sleep(120);
                        await ensureTitle(topicId, idx.meta.title, remote.title);
                    } catch (e: any) {
                        console.log(`  [ОШИБКА]   корень ${topicId} недоступен (${e?.message})`);
                    }
                }
            }
        }

        await syncTree(dir, topicId, prefix);
    }

    console.log('\n───────────────');
    console.log(Object.entries(tally).map(([k, v]) => `${k}: ${v}`).join('   '));

    if (empty.length) {
        console.log(`\nРазделы без оглавления (${empty.length}) — Фундаментальное правило 2:`);
        empty.forEach(e => console.log(`  ${e}`));
    }

    if (pendingMoves.length) {
        console.log(`\nТребуют переноса (${pendingMoves.length}) — запустите с флагом --yes:`);
        pendingMoves.forEach(m => console.log(`  ${m}`));
    }

    if (errors.length) {
        console.error(`\nОШИБКИ (${errors.length}):`);
        errors.forEach(e => console.error(`  ${e}`));
    }

    if (conflicts.length) {
        console.error(`\nКОНФЛИКТЫ (${conflicts.length}) — файлы изменены и локально, и в Pyrus:`);
        conflicts.forEach(c => console.error(`  ${c}`));
        console.error('\nСравните с соседним .remote.md, слейте вручную, удалите .remote.md и запустите снова.');
        process.exit(3);
    }

    if (errors.length) process.exit(1);
})().catch(e => {
    console.error('Синхронизация прервана:', e?.message || e);
    process.exit(1);
});
