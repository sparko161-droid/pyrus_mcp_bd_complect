import * as fs from 'fs';
import * as path from 'path';

const formsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fetched_forms.json'), 'utf8'));
const flatFields = JSON.parse(fs.readFileSync(path.join(__dirname, 'flat_fields.json'), 'utf8'));

console.log("=== ALL FORMS SUMMARY ===");
for (const id of [1522712, 1437076, 1437079, 1440596, 2338092, 1560746, 1526386]) {
    const form = formsData[id];
    console.log(`\nForm ID ${id}: "${form.name}"`);
    const fields = flatFields.filter((f: any) => f.formId === id);
    for (const f of fields) {
        console.log(`  ID ${f.id} | Code: "${f.code}" | Name: "${f.name}" | Type: ${f.type} | Parent: "${f.parent}" ${f.options ? `| Options: ${f.options}` : ''}`);
    }
}
