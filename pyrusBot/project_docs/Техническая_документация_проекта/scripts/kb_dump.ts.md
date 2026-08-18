---
title: "Скрипт: kb_dump.ts"
audience: "internal"
pyrus_id: "DxtwK0NUMvI"
pyrus_parent: "HzQz5U8wZjh"
synced_at: "2026-08-10T05:16:32.000Z"
synced_hash: "sha256:9b58b196908f465e82f075ff708d63d9"
---

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { getClient, parseArgs } from './lib/env';

/**
 * Read-only выгрузка дерева Базы знаний.
 * Ничего не создаёт и не удаляет — безопасно запускать в любой момент.
 *
 *   npx tsx solutions_bank/scripts/kb_dump.ts              дерево в консоль
 *   npx tsx solutions_bank/scripts/kb_dump.ts --json=out.json  плюс полный JSON в файл
 *   npx tsx solutions_bank/scripts/kb_dump.ts --root=<id>  только указанное поддерево
 */

interface Node { id: string; type: 'topic' | 'article'; title: string; children?: Node[]; }

const args = parseArgs();
const pyrus = getClient();

function walk(nodes: Node[], depth: number, onlyUnder?: string, inside = false): number {
    let count = 0;
    for (const n of nodes || []) {
        const here = inside || !onlyUnder || n.id === onlyUnder;
        if (here) {
            const mark = n.type === 'topic' ? '[T]' : '   ·';
            console.log(`${'  '.repeat(depth)}${mark} ${n.title}  (${n.id})`);
            count++;
        }
        count += walk(n.children || [], here ? depth + 1 : depth, onlyUnder, here);
    }
    return count;
}

(async () => {
    const structure: any = await pyrus.knowledgeBase.getStructure();
    const roots: Node[] = Array.isArray(structure) ? structure : (structure.items || structure.children || [structure]);

    const total = walk(roots, 0, args.value('root'));
    console.log(`\nВыведено узлов: ${total}`);

    const jsonPath = args.value('json');
    if (jsonPath) {
        fs.writeFileSync(path.resolve(process.cwd(), jsonPath), JSON.stringify(structure, null, 2), 'utf8');
        console.log(`Полный JSON сохранён: ${jsonPath}`);
    }
})().catch(e => {
    console.error('Ошибка обращения к Pyrus:', e?.message || e);
    process.exit(1);
});

```
