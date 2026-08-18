import { PyrusApiClient } from 'pyrus-api';
import * as fs from 'fs';
import * as path from 'path';

const login = 'smaster.kirill@gmail.com';
const securityKey = 'QzqGGptxfTBIpGW6e2c5Shd8gLR9AVQIk~eQX-qlwP3eRfiF6VSvMc4axNBLBwvMMFsXBe~nKGMCn28lKiHB-7LXSUvocDVb';

const formIds = [1522712, 1437076, 1437079, 1440596, 2338092, 1560746, 1526386];

async function main() {
    const pyrus = new PyrusApiClient({
        login: login,
        security_key: securityKey
    });

    console.log('Authenticating and fetching forms...');
    
    const results: Record<number, any> = {};

    for (const id of formIds) {
        try {
            console.log(`Fetching form ${id}...`);
            const formRes: any = await pyrus.forms.get({ id });
            results[id] = formRes;
            console.log(`Form ${id} fetched successfully: "${formRes.name}" (${(formRes.fields || []).length} top-level fields)`);
        } catch (err: any) {
            console.error(`Failed to fetch form ${id}:`, err?.message || err);
        }
    }

    const outPath = path.join(__dirname, 'fetched_forms.json');
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`Saved fetched forms to ${outPath}`);
}

main();
