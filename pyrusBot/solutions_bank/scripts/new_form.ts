import * as fs from 'fs';
import * as path from 'path';
import { readDoc, writeDoc } from './lib/frontmatter';
import { parseArgs } from './lib/env';

/**
 * Разворачивает канонический комплект документации новой формы.
 *
 * Комплект один и тот же для всех форм: пропущенная статья — это не «мелочь»,
 * а раздел, которого потом не хватает при передаче процесса другому инженеру.
 * Поэтому статьи не пишутся с нуля каждый раз, а разворачиваются из шаблона
 * с заготовленной структурой таблиц и явными TODO.
 *
 * Скаффолдер сам выполняет Фундаментальные правила 1 и 2: дописывает ссылку в
 * оглавление родительской папки и запись в историю изменений клиента. Правило,
 * исполнение которого зависит от памяти инженера, не соблюдается.
 *
 *   npm run new:form -- --client=01_Демо_кабинет --name="Заказы пиццы"
 *   npm run new:form -- --client=01_Демо_кабинет --name="Заказы пиццы" --number=05 --dry-run
 */

const CWD = process.cwd();
const TEMPLATES = path.join(CWD, 'templates', 'form');
const BRANCHES = ['UserDocs', 'TechDocs', 'Forms'] as const;

const args = parseArgs();
const clientArg = args.value('client');
const nameArg = args.value('name');
const numberArg = args.value('number');

function fail(message: string): never {
    console.error(`Ошибка: ${message}`);
    console.error('\nПример: npm run new:form -- --client=01_Демо_кабинет --name="Заказы пиццы"');
    process.exit(1);
}

if (!clientArg) fail('не указан --client (имя папки клиента в clients/)');
if (!nameArg) fail('не указан --name (человеческое название формы, например "Заказы пиццы")');

const clientDir = path.join(CWD, 'clients', clientArg);
if (!fs.existsSync(clientDir)) {
    const available = fs.readdirSync(path.join(CWD, 'clients'), { withFileTypes: true })
        .filter(e => e.isDirectory()).map(e => e.name).join(', ');
    fail(`клиент "${clientArg}" не найден. Есть: ${available}`);
}

/** Название формы человеческое, имя папки — оно же с подчёркиваниями. */
const formName = nameArg.trim();
if (/^[a-zA-Z0-9_\- ]+$/.test(formName)) {
    console.warn('Предупреждение: название формы должно быть на русском языке — таково правило каталогизации.\n');
}
const formSlug = formName.replace(/\s+/g, '_');

/**
 * Номер берётся из уже существующих папок, а не из их количества: удалённая
 * форма не должна заставлять следующую занять чужой номер.
 */
function nextNumber(): string {
    let max = 0;
    for (const branch of BRANCHES) {
        const dir = path.join(clientDir, branch);
        if (!fs.existsSync(dir)) continue;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (!e.isDirectory()) continue;
            const n = parseInt(e.name.match(/^(\d+)[_.]/)?.[1] ?? '', 10);
            if (!isNaN(n)) max = Math.max(max, n);
        }
    }
    return String(max + 1).padStart(2, '0');
}

const number = (numberArg ?? nextNumber()).padStart(2, '0');
const folderName = `${number}_${formSlug}`;

const replacements: Record<string, string> = {
    '{{ФОРМА}}': formName,
    '{{ФОРМА_ФАЙЛ}}': formSlug,
    '{{КЛИЕНТ}}': clientArg.replace(/^\d+_/, '').replace(/_/g, ' '),
    '{{НОМЕР}}': number,
    '{{ДАТА}}': new Date().toLocaleDateString('ru-RU')
};

function substitute(text: string): string {
    let out = text;
    for (const [from, to] of Object.entries(replacements)) out = out.split(from).join(to);
    return out;
}

const created: string[] = [];

function copyTemplateDir(from: string, to: string): void {
    if (fs.existsSync(to)) fail(`папка уже существует: ${path.relative(CWD, to)}. Перезапись запрещена — проверьте номер формы.`);
    if (!args.dryRun) fs.mkdirSync(to, { recursive: true });

    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const src = path.join(from, entry.name);
        const dst = path.join(to, entry.name);
        if (entry.isDirectory()) {
            copyTemplateDir(src, dst);
            continue;
        }
        const body = substitute(fs.readFileSync(src, 'utf8'));
        if (!args.dryRun) fs.writeFileSync(dst, body, 'utf8');
        created.push(path.relative(CWD, dst));
    }
}

/** Фундаментальное правило 2: новая папка обязана появиться в оглавлении родителя. */
const BRANCH_TITLES: Record<string, { title: string; audience: string; intro: string }> = {
    UserDocs: {
        title: 'Пользовательская документация',
        audience: 'user',
        intro: 'Инструкции и сценарии для сотрудников: как подать заявку, как её обработать и что делать, когда что-то пошло не так.'
    },
    TechDocs: {
        title: 'Техническая документация',
        audience: 'tech',
        intro: 'ТЗ, спецификации полей, маршрутизация, справочники, роли и порядок действий при сбое.'
    },
    Forms: {
        title: 'Формы и скрипты',
        audience: 'tech',
        intro: 'Спецификации форм и исходный код ботов и скриптов.'
    }
};

function addToParentIndex(branchDir: string): void {
    const indexPath = path.join(branchDir, '_index.md');

    // У нового кабинета оглавлений веток ещё нет. Раньше скаффолдер просто
    // просил добавить ссылку вручную — и первая же форма нового клиента
    // оставляла три раздела без оглавления, то есть нарушала Правило 2.
    if (!fs.existsSync(indexPath)) {
        const branch = BRANCH_TITLES[path.basename(branchDir)];
        if (!branch) {
            console.log(`  ! нет оглавления ${path.relative(CWD, indexPath)} — добавьте ссылку вручную`);
            return;
        }
        const created = `---\ntitle: "${branch.title}"\naudience: "${branch.audience}"\n---\n\n${branch.intro}\n`;
        if (!args.dryRun) fs.writeFileSync(indexPath, created, 'utf8');
        console.log(`  оглавление ${args.dryRun ? 'будет заведено' : 'заведено'}: ${path.relative(CWD, indexPath)}`);
    }

    const doc = readDoc(indexPath);
    const link = `[${formName}](<${folderName}/_index.md>)`;
    if (doc.body.includes(folderName)) return;

    const numbers = [...doc.body.matchAll(/^(\d+)\.\s/gm)].map(m => parseInt(m[1], 10));
    const next = numbers.length ? Math.max(...numbers) + 1 : 1;
    doc.body = `${doc.body.replace(/\s*$/, '')}\n${next}. ${link}\n`;

    if (!args.dryRun) writeDoc(indexPath, doc);
    console.log(`  оглавление ${args.dryRun ? 'будет обновлено' : 'обновлено'}: ${path.relative(CWD, indexPath)}`);
}

/** Фундаментальное правило 1: изменение состава документации попадает в историю. */
function addToClientChangelog(): void {
    const file = fs.readdirSync(clientDir).find(f => /История_изменений/i.test(f) && f.endsWith('.md'));
    if (!file) {
        console.log('  ! у клиента нет файла История_изменений — добавьте запись вручную');
        return;
    }
    const filePath = path.join(clientDir, file);
    const doc = readDoc(filePath);
    const entry = `- v1.0 (${replacements['{{ДАТА}}']}): Заведена форма «${formName}» (${folderName}): развёрнут канонический комплект статей в UserDocs, TechDocs и Forms.`;
    doc.body = `${entry}\n${doc.body.replace(/^\n+/, '')}`;

    if (!args.dryRun) writeDoc(filePath, doc);
    console.log(`  история изменений ${args.dryRun ? 'будет обновлена' : 'обновлена'}: ${path.relative(CWD, filePath)}`);
}

console.log(`Клиент: ${clientArg}`);
console.log(`Форма:  ${formName}  →  ${folderName}${args.dryRun ? '   [DRY-RUN, ничего не пишем]' : ''}\n`);

for (const branch of BRANCHES) {
    const templateDir = path.join(TEMPLATES, branch);
    if (!fs.existsSync(templateDir)) fail(`нет шаблона ${path.relative(CWD, templateDir)}`);

    const branchDir = path.join(clientDir, branch);
    if (!fs.existsSync(branchDir) && !args.dryRun) fs.mkdirSync(branchDir, { recursive: true });

    copyTemplateDir(templateDir, path.join(branchDir, folderName));
    addToParentIndex(branchDir);
}

addToClientChangelog();

console.log(`\n${args.dryRun ? 'Будет создано' : 'Создано'} файлов: ${created.length}`);
created.forEach(f => console.log(`  ${f}`));

console.log(`
Дальше по порядку:
  1. Заполнить «01 Бизнес требования» и согласовать граф зависимостей с заказчиком.
  2. Только после согласования — «02 Спецификация полей» и остальные статьи.
  3. Код пишется после согласования документации.
  4. npm run lint:docs, затем npm run kb:sync.`);
