import { getClient } from '../solutions_bank/scripts/lib/env';

async function main() {
  const client = getClient() as any;
  for (const id of ['KG7JCQ3KJui', 'AW1OjgKC7xn', 'IqKx9fi6OIH']) {
    const node: any = await client.knowledgeBase.get(id);
    console.log(id, '->', JSON.stringify({title: node.title, parent_topic_id: node.parent_topic_id, updated_at: node.updated_at, created_at: node.created_at, is_public: node.is_public}));
  }
}
main().catch(e => { console.error('FAIL', e?.message); process.exit(1); });
