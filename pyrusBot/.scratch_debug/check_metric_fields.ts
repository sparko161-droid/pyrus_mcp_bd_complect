import * as fs from 'fs';
import * as path from 'path';

const formsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fetched_forms.json'), 'utf8'));
const flatFields = JSON.parse(fs.readFileSync(path.join(__dirname, 'flat_fields.json'), 'utf8'));

// Search fields related to metrics
console.log("=== SEARCHING FOR METRIC FIELDS ===");

const searchKeywords = ['часов', 'норма', 'нормо', 'оценка', 'тип', 'создани', 'заверш', 'исполнитель', 'статус', 'срок'];

for (const formIdStr of Object.keys(formsData)) {
    const formId = Number(formIdStr);
    const form = formsData[formId];
    console.log(`\n--- FORM ${formId}: ${form.name} ---`);
    const fields = flatFields.filter((f: any) => f.formId === formId);
    for (const f of fields) {
        const text = `${f.name} ${f.code} ${f.options || ''}`.toLowerCase();
        if (searchKeywords.some(kw => text.includes(kw))) {
            console.log(`  ID: ${f.id} | Name: "${f.name}" | Type: ${f.type} | Code: "${f.code}" | Parent: "${f.parent}" ${f.options ? `| Options: ${f.options}` : ''}`);
        }
    }
}
