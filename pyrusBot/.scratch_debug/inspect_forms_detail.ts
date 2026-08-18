import * as fs from 'fs';
import * as path from 'path';

const flatFields = JSON.parse(fs.readFileSync(path.join(__dirname, 'flat_fields.json'), 'utf8'));
const formsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fetched_forms.json'), 'utf8'));

for (const formIdStr of Object.keys(formsData)) {
    const formId = Number(formIdStr);
    const form = formsData[formId];
    console.log(`\n========================================`);
    console.log(`FORM ID: ${formId} | NAME: "${form.name}"`);
    console.log(`========================================`);
    const fields = flatFields.filter((f: any) => f.formId === formId);
    for (const f of fields) {
        const parentStr = f.parent ? ` [Родитель: ${f.parent}]` : '';
        const codeStr = f.code ? ` [Code: ${f.code}]` : '';
        const optStr = f.options ? ` (Варианты: ${f.options})` : '';
        const catStr = f.catalogId ? ` (Справочник: ${f.catalogId})` : '';
        console.log(`- ID: ${f.id} | ${f.name} | Тип: ${f.type}${codeStr}${parentStr}${catStr}${optStr}`);
    }
}
