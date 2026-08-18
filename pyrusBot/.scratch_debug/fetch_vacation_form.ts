import { PyrusApiClient } from 'pyrus-api';
import * as fs from 'fs';
import * as path from 'path';

const login = 'smaster.kirill@gmail.com';
const securityKey = 'QzqGGptxfTBIpGW6e2c5Shd8gLR9AVQIk~eQX-qlwP3eRfiF6VSvMc4axNBLBwvMMFsXBe~nKGMCn28lKiHB-7LXSUvocDVb';

async function main() {
    const pyrus = new PyrusApiClient({ login, security_key: securityKey });
    
    console.log('Fetching vacation form 2348174...');
    try {
        const formRes: any = await pyrus.forms.get({ id: 2348174 });
        console.log(`Fetched form 2348174 successfully: "${formRes.name}" (${(formRes.fields || []).length} top-level fields)`);
        
        const existingData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fetched_forms.json'), 'utf8'));
        existingData[2348174] = formRes;
        fs.writeFileSync(path.join(__dirname, 'fetched_forms.json'), JSON.stringify(existingData, null, 2), 'utf8');
        console.log('Updated fetched_forms.json with form 2348174!');
    } catch (e: any) {
        console.error('Failed to fetch form 2348174:', e?.message || e);
    }
}

main();
