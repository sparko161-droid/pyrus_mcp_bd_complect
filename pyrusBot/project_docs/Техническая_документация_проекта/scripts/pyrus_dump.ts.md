---
title: "Скрипт: pyrus_dump.ts"
audience: "internal"
pyrus_id: "H3xilViKazp"
pyrus_parent: "HzQz5U8wZjh"
synced_at: "2026-08-10T13:46:23.000Z"
synced_hash: "sha256:2884e2046150b08b024185b521e90797"
---

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { getClient, getClientApi, configuredClients, parseArgs, withRetry, sleep } from './lib/env';

/**
 * Выгрузка фактического состава формы или справочника из Pyrus.
 *
 * Зачем: документация состава формы пишется по данным API, а не по тому, какие
 * поля случайно попались в коде бота. Разбирая бота, видно только те поля, к
 * которым он обращается, — а в форме их обычно втрое больше. Спецификация,
 * собранная «по коду», выглядит полной и таковой не является: следующий инженер
 * не узнает о существовании остальных полей, пока не откроет форму руками.
 *
 * Поэтому правило: увидел `form_id` — выгрузи состав формы, прежде чем писать
 * спецификацию. У заказчика спрашивается только то, чего в API нет: смысл поля,
 * владелец справочника, состав ролей, часовой пояс.
 *
 * У каждого клиента свой аккаунт Pyrus и свои доступы: одним ключом чужие формы
 * не видны. Поэтому по формам клиента работаем от его имени — `--client=NN`.
 * Без `--client` берётся наш аккаунт.
 *
 *   npm run pyrus:dump -- --forms                        наши формы
 *   npm run pyrus:dump -- --client=02 --all              ВСЁ: формы + справочники
 *   npm run pyrus:dump -- --client=02 --forms            список форм клиента
 *   npm run pyrus:dump -- --client=02 --form=2441923     состав формы клиента
 *   npm run pyrus:dump -- --catalog=123                  состав справочника
 *   npm run pyrus:dump -- --form=1463678 --json          только сырой JSON
 */

const args = parseArgs();
const clientKey = args.value('client');
const pyrus = clientKey ? getClientApi(clientKey) : getClient();
const OUT_DIR = path.join(process.cwd(), '.pyrus_dumps');

/** Человеческое название типа поля Pyrus. */
const TYPE_NAMES: Record<string, string> = {
    text: 'Текст', money: 'Деньги', number: 'Число', date: 'Дата', time: 'Время',
    checkmark: 'Галочка', due_date: 'Срок', due_date_time: 'Срок со временем',
    email: 'Email', phone: 'Телефон', flag: 'Флаг', step: 'Этап', status: 'Статус',
    creation_date: 'Дата создания', note: 'Примечание', catalog: 'Справочник',
    file: 'Файл', person: 'Пользователь', author: 'Автор', table: 'Таблица',
    multiple_choice: 'Выбор', title: 'Заголовок', form_link: 'Связь с задачей',
    project: 'Проект', text_area: 'Многострочный текст'
};

interface FlatField {
    id: number;
    code: string;
    name: string;
    type: string;
    parent: string;
    required: boolean;
    catalogId?: number;
    options?: string;
    visibility: string;
}

/** Рекурсивный обход: поля прячутся в заголовках, группах, колонках таблиц и вариантах выбора. */
function flatten(fields: any[], parent: string, out: FlatField[] = []): FlatField[] {
    for (const f of fields || []) {
        if (!f || f.id === undefined) continue;
        const info = f.info || {};

        out.push({
            id: Number(f.id),
            code: f.code || info.code || '',
            name: f.name || '',
            type: String(f.type || ''),
            parent,
            required: Boolean(info.is_required ?? f.is_required),
            catalogId: info.catalog_id ?? f.catalog_id,
            options: (info.options || [])
                .filter((o: any) => o && !o.deleted)
                .map((o: any) => `${o.choice_value} (${o.choice_id})`)
                .join('; ') || undefined,
            visibility: f.visibility_condition || info.visibility_condition ? 'есть' : ''
        });

        const here = f.name || String(f.id);
        for (const kids of [f.fields, info.fields, info.columns]) {
            if (Array.isArray(kids) && kids.length) flatten(kids, here, out);
        }
        for (const opt of info.options || []) {
            if (Array.isArray(opt?.fields) && opt.fields.length) flatten(opt.fields, `${here} → ${opt.choice_value}`, out);
        }
    }
    return out;
}

function save(name: string, content: string): string {
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, name);
    fs.writeFileSync(file, content, 'utf8');
    return path.relative(process.cwd(), file);
}

async function dumpForms(): Promise<void> {
    const response: any = await withRetry('forms', () => (pyrus as any).forms.getAll());
    const forms = response?.forms ?? [];
    console.log(`Доступно форм: ${forms.length}\n`);
    console.log('| form_id | Название | Полей |');
    console.log('| --- | --- | --- |');
    for (const f of forms) {
        console.log(`| ${f.id} | ${f.name} | ${(f.fields || []).length} |`);
    }
    console.log(`\nСохранено: ${save('forms.json', JSON.stringify(forms, null, 2))}`);
}

async function dumpForm(formId: number): Promise<void> {
    const form: any = await withRetry(`form ${formId}`, () => pyrus.forms.get({ id: formId }));
    const flat = flatten(form.fields || [], '');

    console.log(`Форма ${formId}: «${form.name}»`);
    console.log(`Полей всего (с вложенными): ${flat.length}\n`);

    if (!args.has('json')) {
        console.log('| Название поля | Код | id | Тип | Внутри | Обяз. | Справочник | Варианты | Видимость |');
        console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
        for (const f of flat) {
            console.log(`| ${f.name} | ${f.code ? '`' + f.code + '`' : '—'} | ${f.id} | ${TYPE_NAMES[f.type] || f.type} | ${f.parent || '—'} | ${f.required ? 'да' : 'нет'} | ${f.catalogId ?? '—'} | ${f.options ?? '—'} | ${f.visibility || '—'} |`);
        }

        const catalogs = [...new Set(flat.map(f => f.catalogId).filter(Boolean))];
        if (catalogs.length) {
            console.log(`\nСправочники формы: ${catalogs.join(', ')}`);
            console.log(`Выгрузить состав: npm run pyrus:dump -- --catalog=${catalogs[0]}`);
        }
    }

    console.log(`\nСохранено: ${save(`form_${formId}.json`, JSON.stringify(form, null, 2))}`);
}

/** Заголовки справочника приходят объектами `{ name, type }`, а не строками. */
function headerNames(catalog: any): string[] {
    return (catalog?.catalog_headers ?? []).map((h: any) => typeof h === 'string' ? h : h?.name ?? '—');
}

async function dumpCatalog(catalogId: number): Promise<void> {
    const catalog: any = await withRetry(`catalog ${catalogId}`, () => pyrus.catalogs.get({ id: catalogId }));
    const headers = headerNames(catalog);
    const types: string[] = (catalog.catalog_headers ?? []).map((h: any) => h?.type ?? '');
    const items: any[] = catalog.items ?? [];

    console.log(`Справочник ${catalogId}: «${catalog.name ?? '—'}»`);
    console.log(`Колонок: ${headers.length}, строк: ${items.length}\n`);

    console.log('| № | Колонка | Тип | Пример значения |');
    console.log('| --- | --- | --- | --- |');
    headers.forEach((h, i) => {
        const sample = items.find(it => it?.values?.[i])?.values?.[i] ?? '—';
        console.log(`| ${i} | ${h} | ${types[i] || '—'} | ${sample} |`);
    });

    console.log('\nПервые строки:');
    for (const item of items.slice(0, 10)) {
        console.log(`  ${item.item_id}: ${(item.values || []).join(' | ')}`);
    }
    if (items.length > 10) console.log(`  … ещё ${items.length - 10}`);

    console.log(`\nСохранено: ${save(`catalog_${catalogId}.json`, JSON.stringify(catalog, null, 2))}`);
}

/**
 * Полная картина по аккаунту: все формы, затем все справочники, на которые эти
 * формы ссылаются. Делается один раз при начале работы с новым клиентом.
 *
 * Смысл в связке: состав формы говорит, какое поле из какого справочника
 * читает, а состав справочника — что в нём вообще есть. По отдельности ни то,
 * ни другое не отвечает на вопрос «что сломается, если тронуть эту строку».
 */
async function dumpEverything(): Promise<void> {
    const response: any = await withRetry('forms', () => (pyrus as any).forms.getAll());
    const forms = response?.forms ?? [];
    save('forms.json', JSON.stringify(forms, null, 2));
    console.log(`Форм в аккаунте: ${forms.length}\n`);

    const catalogIds = new Set<number>();

    for (const summary of forms) {
        const form: any = await withRetry(`form ${summary.id}`, () => pyrus.forms.get({ id: summary.id }));
        const flat = flatten(form.fields || [], '');
        save(`form_${summary.id}.json`, JSON.stringify(form, null, 2));
        flat.forEach(f => { if (f.catalogId) catalogIds.add(Number(f.catalogId)); });
        console.log(`  форма ${summary.id} «${form.name}» — полей ${flat.length}`);
        await sleep(150);
    }

    console.log(`\nСправочников, на которые ссылаются формы: ${catalogIds.size}\n`);

    for (const id of catalogIds) {
        try {
            const catalog: any = await withRetry(`catalog ${id}`, () => pyrus.catalogs.get({ id }));
            save(`catalog_${id}.json`, JSON.stringify(catalog, null, 2));
            const headers = headerNames(catalog);
            console.log(`  справочник ${id} «${catalog.name ?? '—'}» — строк ${(catalog.items ?? []).length}, колонки: ${headers.join(', ')}`);
        } catch (e: any) {
            console.log(`  справочник ${id} — недоступен (${e?.message || e})`);
        }
        await sleep(150);
    }

    console.log(`\nВсё сохранено в ${path.relative(process.cwd(), OUT_DIR)}. Дальше — спецификация полей по этим данным, а не по коду.`);
}

(async () => {
    const form = args.value('form');
    const catalog = args.value('catalog');

    console.log(clientKey
        ? `Аккаунт: клиент ${clientKey}\n`
        : 'Аккаунт: наш (для форм клиента укажите --client=NN)\n');

    try {
        if (args.has('all')) await dumpEverything();
        else if (args.has('forms')) await dumpForms();
        else if (form) await dumpForm(Number(form));
        else if (catalog) await dumpCatalog(Number(catalog));
        else {
            console.log('Укажите, что выгружать:\n');
            console.log('  npm run pyrus:dump -- --forms            список доступных форм');
            console.log('  npm run pyrus:dump -- --form=2441923     состав формы');
            console.log('  npm run pyrus:dump -- --catalog=123      состав справочника');
            console.log('\nДля форм клиента добавьте --client=NN (номер кабинета).');
            const known = configuredClients();
            console.log(known.length
                ? `Доступы прописаны для клиентов: ${known.join(', ')}`
                : 'Доступы клиентов в .env пока не прописаны.');
            process.exit(1);
        }
    } catch (e: any) {
        console.error(`\nОшибка обращения к Pyrus: ${e?.message || e}`);
        console.error('Если форма принадлежит клиенту, укажите его аккаунт: --client=NN.');
        console.error('Доступы клиента (логин, ключ, person_id) запрашиваются у него и хранятся в .env.');
        process.exit(1);
    }
})();

```
