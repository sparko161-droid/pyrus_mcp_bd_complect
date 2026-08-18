import * as fs from 'fs';
import * as path from 'path';

const formsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fetched_forms.json'), 'utf8'));

interface FlatField {
    formId: number;
    formName: string;
    id: number;
    code: string;
    name: string;
    type: string;
    parent: string;
    required: boolean;
    catalogId?: number;
    options?: string;
    visibility?: string;
    note?: string;
}

const TYPE_NAMES: Record<string, string> = {
    text: 'Текст', money: 'Деньги', number: 'Число', date: 'Дата', time: 'Время',
    checkmark: 'Галочка', due_date: 'Срок', due_date_time: 'Срок со временем',
    email: 'Email', phone: 'Телефон', flag: 'Флаг', step: 'Этап', status: 'Статус',
    creation_date: 'Дата создания', note: 'Примечание', catalog: 'Справочник',
    file: 'Файл', person: 'Пользователь', author: 'Автор', table: 'Таблица',
    multiple_choice: 'Выбор', title: 'Заголовок', form_link: 'Связь с задачей',
    project: 'Проект', text_area: 'Многострочный текст'
};

function flattenFields(fields: any[], formId: number, formName: string, parent: string = '', out: FlatField[] = []): FlatField[] {
    for (const f of fields || []) {
        if (!f || f.id === undefined) continue;
        const info = f.info || {};

        let opts: string | undefined;
        if (info.options && Array.isArray(info.options)) {
            opts = info.options.filter((o: any) => o && !o.deleted).map((o: any) => o.choice_value).join(', ');
        }

        const code = f.code || info.code || '';
        const visibility = f.visibility_condition || info.visibility_condition ? JSON.stringify(f.visibility_condition || info.visibility_condition) : '';

        out.push({
            formId,
            formName,
            id: Number(f.id),
            code: code,
            name: f.name || '',
            type: String(f.type || ''),
            parent: parent,
            required: Boolean(info.is_required ?? f.is_required),
            catalogId: info.catalog_id ?? f.catalog_id,
            options: opts,
            visibility: visibility
        });

        const currentParent = parent ? `${parent} -> ${f.name || f.id}` : (f.name || String(f.id));

        if (Array.isArray(f.fields) && f.fields.length) {
            flattenFields(f.fields, formId, formName, currentParent, out);
        }
        if (Array.isArray(info.fields) && info.fields.length) {
            flattenFields(info.fields, formId, formName, currentParent, out);
        }
        if (Array.isArray(info.columns) && info.columns.length) {
            flattenFields(info.columns, formId, formName, `${currentParent} (Колонка)`, out);
        }
        if (Array.isArray(info.options)) {
            for (const opt of info.options) {
                if (Array.isArray(opt?.fields) && opt.fields.length) {
                    flattenFields(opt.fields, formId, formName, `${currentParent} [Вариант: ${opt.choice_value}]`, out);
                }
            }
        }
    }
    return out;
}

const allFlat: FlatField[] = [];

for (const formIdStr of Object.keys(formsData)) {
    const formId = Number(formIdStr);
    const form = formsData[formId];
    flattenFields(form.fields || [], formId, form.name, '', allFlat);
}

fs.writeFileSync(path.join(__dirname, 'flat_fields.json'), JSON.stringify(allFlat, null, 2), 'utf8');

console.log(`Total flattened fields across all forms: ${allFlat.length}`);
