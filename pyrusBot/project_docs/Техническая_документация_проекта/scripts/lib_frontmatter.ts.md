---
title: "Скрипт: lib_frontmatter.ts"
audience: "internal"
pyrus_id: "JvlvFeDancl"
pyrus_parent: "HzQz5U8wZjh"
synced_at: "2026-08-10T05:16:35.000Z"
synced_hash: "sha256:dd7df624bda979c2345e676736d4bdc5"
---

```typescript
import * as crypto from 'crypto';
import * as fs from 'fs';

/**
 * Чтение и запись YAML-заголовка документации.
 *
 * Идентичность статьи (её ID в Базе знаний) хранится ЗДЕСЬ, а не во внешнем
 * файле состояния. Благодаря этому переименование файла и смена версии не
 * создают дубль в Базе знаний, а склонированный репозиторий сразу знает,
 * какая статья какому файлу соответствует.
 *
 * Разбирается намеренно плоский YAML (`ключ: значение`) — вложенные структуры
 * в заголовках документации не используются, а тянуть зависимость ради этого
 * не нужно.
 */

export type Audience = 'user' | 'tech' | 'internal';

export interface DocMeta {
    title?: string;
    version?: string;
    audience?: Audience;
    /** ID статьи или раздела в Базе знаний Pyrus. Пусто — ещё не выгружено. */
    pyrus_id?: string;
    /** ID родительского раздела: страховка при расхождении дерева. */
    pyrus_parent?: string;
    /** updated_at статьи на момент последней успешной синхронизации. */
    synced_at?: string;
    /** Хэш тела на момент последней синхронизации. Основа для определения PUSH/PULL. */
    synced_hash?: string;
    [key: string]: string | undefined;
}

export interface Doc {
    meta: DocMeta;
    body: string;
    /** Исходный порядок ключей — чтобы не перетасовывать заголовок при записи. */
    order: string[];
}

const FENCE = '---';

export function parseDoc(raw: string): Doc {
    const text = raw.replace(/\r\n/g, '\n');
    const lines = text.split('\n');

    if (lines[0]?.trim() !== FENCE) {
        return { meta: {}, body: text, order: [] };
    }

    const meta: DocMeta = {};
    const order: string[] = [];
    let i = 1;
    for (; i < lines.length; i++) {
        if (lines[i].trim() === FENCE) { i++; break; }
        const m = lines[i].match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
        if (!m) continue;
        const key = m[1];
        let value = m[2].trim().replace(/^["']|["']$/g, '');
        meta[key] = value;
        order.push(key);
    }

    return { meta, body: lines.slice(i).join('\n').replace(/^\n+/, ''), order };
}

export function readDoc(filePath: string): Doc {
    return parseDoc(fs.readFileSync(filePath, 'utf8'));
}

/** Ключи, которые всегда идут первыми — чтобы заголовки выглядели одинаково. */
const PREFERRED = ['title', 'version', 'audience', 'pyrus_id', 'pyrus_parent', 'synced_at', 'synced_hash'];

export function serializeDoc(doc: Doc): string {
    const keys = [
        ...PREFERRED.filter(k => doc.meta[k] !== undefined),
        ...doc.order.filter(k => !PREFERRED.includes(k) && doc.meta[k] !== undefined),
        ...Object.keys(doc.meta).filter(k => !PREFERRED.includes(k) && !doc.order.includes(k) && doc.meta[k] !== undefined)
    ];
    const seen = new Set<string>();
    const yaml = keys
        .filter(k => (seen.has(k) ? false : (seen.add(k), true)))
        .map(k => `${k}: "${String(doc.meta[k]).replace(/"/g, '\\"')}"`)
        .join('\n');

    return `${FENCE}\n${yaml}\n${FENCE}\n\n${doc.body.replace(/^\n+/, '').replace(/\s*$/, '')}\n`;
}

export function writeDoc(filePath: string, doc: Doc): void {
    fs.writeFileSync(filePath, serializeDoc(doc), 'utf8');
}

/**
 * Хэш тела статьи. Сравнивается с synced_hash, чтобы понять,
 * менялся ли документ локально после последней синхронизации.
 */
export function contentHash(body: string): string {
    const normalized = body.replace(/\r\n/g, '\n').replace(/\s+$/gm, '').trim();
    return 'sha256:' + crypto.createHash('sha256').update(normalized, 'utf8').digest('hex').slice(0, 32);
}

/**
 * Pyrus сам подставляет `# <title>` в начало тела статьи при отдаче через API.
 * При загрузке (PULL) этот заголовок обязан быть срезан, иначе он накапливается
 * в локальном файле с каждой синхронизацией и нарушает Фундаментальное правило 4.
 */
export function stripInjectedHeading(body: string, title: string): string {
    const lines = body.replace(/\r\n/g, '\n').split('\n');
    const first = lines.findIndex(l => l.trim() !== '');
    if (first === -1) return body;

    const heading = lines[first].trim().match(/^#\s+(.*)$/);
    if (!heading) return body;

    const norm = (s: string) => s.replace(/\s*\(v[\d.]+\)\s*$/, '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (norm(heading[1]) !== norm(title)) return body;

    return lines.slice(first + 1).join('\n').replace(/^\n+/, '');
}

/**
 * Pyrus возвращает мягкие переносы строк как `\` в конце строки.
 * Возвращаем их в обычный markdown, иначе локальный файл после PULL
 * обрастает escape-символами.
 */
export function normalizePyrusBody(body: string): string {
    return body.replace(/\r\n/g, '\n').replace(/\\$/gm, '').replace(/\n{3,}/g, '\n\n');
}

/** Версия из имени файла: `Спецификация (v1.2).md` → `1.2`. */
export function versionFromFilename(name: string): string | undefined {
    return name.match(/\(v([\d.]+)\)/)?.[1];
}

/** Название без версии и расширения — для сопоставления со статьёй в Pyrus. */
export function titleFromFilename(name: string): string {
    return name.replace(/\.md$/, '').replace(/\s*\(v[\d.]+\)\s*$/, '').replace(/^\d+[_.]/, '').replace(/_/g, ' ').trim();
}

```
