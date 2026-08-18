import * as fs from 'fs';
import * as path from 'path';

const formsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fetched_forms.json'), 'utf8'));

function printForm(id: number) {
    const form = formsData[id];
    console.log(`\n========================================`);
    console.log(`FORM ID: ${id} | NAME: "${form.name}"`);
    console.log(`========================================`);
    function dumpFields(fields: any[], indent = '') {
        for (const f of fields || []) {
            const info = f.info || {};
            const codeStr = f.code || info.code ? ` [code: ${f.code || info.code}]` : '';
            const catStr = info.catalog_id ? ` [catalog: ${info.catalog_id}]` : '';
            const optsStr = info.options ? ` [options: ${info.options.map((o: any) => o.choice_value).join(', ')}]` : '';
            console.log(`${indent}- ID: ${f.id} | Name: "${f.name}" | Type: ${f.type}${codeStr}${catStr}${optsStr}`);
            if (f.fields) dumpFields(f.fields, indent + '  ');
            if (info.fields) dumpFields(info.fields, indent + '  ');
            if (info.columns) dumpFields(info.columns, indent + '  (Колонка) ');
        }
    }
    dumpFields(form.fields);
}

printForm(2348174);
printForm(1437076);
