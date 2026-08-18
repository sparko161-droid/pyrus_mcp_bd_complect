import * as fs from 'fs';
import * as path from 'path';

const metrics = JSON.parse(fs.readFileSync(path.join(__dirname, 'metrics_definition.json'), 'utf8'));

let md = `# Спецификация полей и условий для расчета метрик Pyrus\n\n`;
md += `Документ содержит полную карту обращения к полям форм Pyrus для расчета 6 ключевых метрик с временными срезами **За текущий месяц** и **За прошлую неделю**.\n\n`;

for (const m of metrics) {
    md += `## Метрика ${m.num}. ${m.name}\n\n`;
    md += `**Описание:** ${m.description}\n\n`;
    md += `**Период расчета:** \`${m.timeframe}\`\n\n`;
    
    md += `| № | Форма (ID) | Поле значении / значения | ID поля | Тип поля | Поле даты (для фильтра по периоду) | ID даты | Поле группировки / Исполнитель | Условие фильтрации и функция агрегации |\n`;
    md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;

    let i = 1;
    for (const s of m.sources) {
        const groupStr = s.groupingFieldName ? `${s.groupingFieldName} (ID: ${s.groupingFieldId || '—'})` : '—';
        md += `| ${i++} | **${s.formName}** (\`${s.formId}\`) | ${s.valueFieldName} | \`${s.valueFieldId || '—'}\` | ${s.valueFieldType} | ${s.dateFieldName} | \`${s.dateFieldId}\` | ${groupStr} | ${s.filterCondition} |\n`;
    }
    md += `\n---\n\n`;
}

const artifactPath = path.join('C:\\Users\\KirillSM\\.gemini\\antigravity\\brain\\96b8b4eb-39b6-40f3-bb67-706220e800c0', 'metrics_mapping_table.md');
fs.writeFileSync(artifactPath, md, 'utf8');
console.log("Saved metrics_mapping_table.md to artifacts directory!");
