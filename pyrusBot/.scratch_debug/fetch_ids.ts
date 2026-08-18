import { getClient } from '../solutions_bank/scripts/lib/env';
import * as fs from 'fs';

const ids: Record<string,string> = {
  'HxqFp6nU6HT': '14.01.2.1 Бизнес-требования',
  'Pz08EhIgG1h': '14.01.2.2 Спецификация полей',
  'SJTwkjuQ4Dw': '14.01.2.3 Маршрутизация',
  'PBMidjqmInH': '14.01.2.4 Скрипты и боты',
  'HBrFmU7qcyd': '14.01.2.5 Подпроцессы и связи',
  'JbeUl8Qr1fc': '14.01.2.6 Справочники',
  'EOe26XDNj1w': '14.01.2.7 Роли и права',
  'Ku01XwgJZN4': '14.01.2.8 Печатные формы',
  'OXZ4F0dsbGj': '14.01.2.9 Банк ответов',
  'S8FbuAvo9Zh': '14.01.2.10 Тест кейсы',
  'UJbV1US0q1a': '14.01.2.11 Runbook',
  'K6vE0H8Fjq2': '14.01.2.99 История изменений',
  'EsZuSe0iu6P': '14.01.2.1.1 Код: feedback_bot.ts',
};

async function main() {
  const client = getClient() as any;
  let out = '';
  for (const [id, label] of Object.entries(ids)) {
    let node: any;
    for (let i=0;i<3;i++){
      try { node = await client.knowledgeBase.get(id); break; }
      catch(e){ await new Promise(r=>setTimeout(r,800)); }
    }
    out += `\n\n=== [${id}] ${label} ===\n` + (node ? node.body : 'FAILED TO FETCH');
  }
  fs.writeFileSync('.scratch_debug/dump_14012.md', out, 'utf8');
  console.log('done, length', out.length);
}
main().catch(e => { console.error('FAIL', e?.message); process.exit(1); });
