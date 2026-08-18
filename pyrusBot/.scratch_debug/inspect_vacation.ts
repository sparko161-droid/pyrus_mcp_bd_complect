import * as fs from 'fs';
import * as path from 'path';

const formsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fetched_forms.json'), 'utf8'));
const form = formsData[2348174];
console.log(`FORM 2348174: "${form.name}"`);
console.log(JSON.stringify(form.fields, null, 2));
