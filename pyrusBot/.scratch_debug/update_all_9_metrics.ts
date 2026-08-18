import * as fs from 'fs';
import * as path from 'path';

const metrics = [
    {
        num: 1,
        name: "Закрыто часов всего",
        description: "Сумма закрытых часов отделом за период (текущий месяц / прошлая неделя) по 3 формам.",
        timeframe: "Текущий месяц / Прошлая неделя",
        sources: [
            {
                formId: 1437079,
                formName: "02.02 ПОДЗАДАЧИ ПО ПУСКАМ",
                valueFieldId: 22,
                valueFieldName: "Количество часов для сводки (Затрачено Н\\ч)",
                valueFieldType: "number",
                dateFieldId: 48,
                dateFieldName: "Завершена",
                dateFieldType: "date",
                filterCondition: "Дата 'Завершена' попадает в период (заполнен статус 'Выполнена' / дата)"
            },
            {
                formId: 1522712,
                formName: "02.07 СОГЛАСОВАНИЕ Ч. РАЗВИТИЯ ОВ",
                valueFieldId: 5,
                valueFieldName: "Нормо-часов",
                valueFieldType: "number",
                dateFieldId: 10,
                dateFieldName: "Дата выполнения",
                dateFieldType: "date",
                filterCondition: "Статус (id 1) = 'Согласовано' или 'Учтена' И Дата выполнения попадает в период"
            },
            {
                formId: 1526386,
                formName: "08.01 HELP-DEV",
                valueFieldId: 12,
                valueFieldName: "Трудоемкость (часов) [Или id 22 / id 78 в таблице]",
                valueFieldType: "money / number",
                dateFieldId: 79,
                dateFieldName: "Дата проведения работ (или дата закрытия задачи)",
                dateFieldType: "date / creation_date",
                filterCondition: "Статус (id 64) = 'Выполнена' / 'Закрыта' И дата попадает в период"
            }
        ]
    },
    {
        num: 2,
        name: "Закрыто часов по исполнителям",
        description: "Сумма закрытых часов (как в п.1), но с детализацией и группировкой по каждому сотруднику (исполнителю).",
        timeframe: "Текущий месяц / Прошлая неделя",
        sources: [
            {
                formId: 1437079,
                formName: "02.02 ПОДЗАДАЧИ ПО ПУСКАМ",
                valueFieldId: 22,
                valueFieldName: "Количество часов для сводки",
                valueFieldType: "number",
                dateFieldId: 48,
                dateFieldName: "Завершена",
                dateFieldType: "date",
                filterCondition: "Дата 'Завершена' в периоде",
                groupingFieldId: 44,
                groupingFieldName: "Инженер (person)"
            },
            {
                formId: 1522712,
                formName: "02.07 СОГЛАСОВАНИЕ Ч. РАЗВИТИЯ ОВ",
                valueFieldId: 5,
                valueFieldName: "Нормо-часов",
                valueFieldType: "number",
                dateFieldId: 10,
                dateFieldName: "Дата выполнения",
                dateFieldType: "date",
                filterCondition: "Статус (id 1) IN ('Согласовано', 'Учтена') И дата в периоде",
                groupingFieldId: 2,
                groupingFieldName: "Исполнитель (person)"
            },
            {
                formId: 1526386,
                formName: "08.01 HELP-DEV",
                valueFieldId: 12,
                valueFieldName: "Трудоемкость (часов)",
                valueFieldType: "money",
                dateFieldId: 79,
                dateFieldName: "Дата проведения работ",
                dateFieldType: "date",
                filterCondition: "Статус = 'Выполнена' / 'Закрыта'",
                groupingFieldId: 80,
                groupingFieldName: "Исполнитель задачи (person)"
            }
        ]
    },
    {
        num: 3,
        name: "Новых задач (сумма часов)",
        description: "Сумма планируемых нормо-часов во всех новых задачах/подзадачах, созданных на прошлой неделе.",
        timeframe: "Прошлая неделя",
        sources: [
            {
                formId: 1437076,
                formName: "02.01 ОВ ЗАДАЧА",
                valueFieldId: 67,
                valueFieldName: "Всего нормо-часов",
                valueFieldType: "money",
                dateFieldId: 29,
                dateFieldName: "Дата создания",
                dateFieldType: "creation_date",
                filterCondition: "Дата создания попадает в диапазон прошлой недели"
            },
            {
                formId: 1437079,
                formName: "02.02 ПОДЗАДАЧИ ПО ПУСКАМ",
                valueFieldId: 22,
                valueFieldName: "Количество часов для сводки",
                valueFieldType: "number",
                dateFieldId: 29,
                dateFieldName: "Дата создания",
                dateFieldType: "creation_date",
                filterCondition: "Дата создания попадает в диапазон прошлой недели"
            },
            {
                formId: 1522712,
                formName: "02.07 СОГЛАСОВАНИЕ Ч. РАЗВИТИЯ ОВ",
                valueFieldId: 5,
                valueFieldName: "Нормо-часов",
                valueFieldType: "number",
                dateFieldId: 9,
                dateFieldName: "Дата создания",
                dateFieldType: "creation_date",
                filterCondition: "Дата создания попадает в диапазон прошлой недели"
            },
            {
                formId: 1526386,
                formName: "08.01 HELP-DEV",
                valueFieldId: 12,
                valueFieldName: "Трудоемкость (часов)",
                valueFieldType: "money",
                dateFieldId: 29,
                dateFieldName: "Дата создания",
                dateFieldType: "creation_date",
                filterCondition: "Дата создания попадает в диапазон прошлой недели"
            }
        ]
    },
    {
        num: 4,
        name: "Количество новых задач по типам задач",
        description: "Подсчет количества зарегистрированных новых задач (COUNT) с разбивкой по формам и типам задач за период.",
        timeframe: "Текущий месяц / Прошлая неделя",
        sources: [
            {
                formId: 1437076,
                formName: "02.01 ОВ ЗАДАЧА",
                valueFieldId: 0,
                valueFieldName: "Количество задач (COUNT)",
                valueFieldType: "count",
                dateFieldId: 29,
                dateFieldName: "Дата создания",
                dateFieldType: "creation_date",
                filterCondition: "Дата создания в периоде",
                groupingFieldId: 3,
                groupingFieldName: "Тип задачи (Пуск, Услуга, Перезапуск, Прием на обслуживание, Pyrus-проект)"
            },
            {
                formId: 1437079,
                formName: "02.02 ПОДЗАДАЧИ ПО ПУСКАМ",
                valueFieldId: 0,
                valueFieldName: "Количество задач (COUNT)",
                valueFieldType: "count",
                dateFieldId: 29,
                dateFieldName: "Дата создания",
                dateFieldType: "creation_date",
                filterCondition: "Дата создания в периоде",
                groupingFieldId: 0,
                groupingFieldName: "Фиксированный тип: 'Подзадача по пуску'"
            },
            {
                formId: 1522712,
                formName: "02.07 СОГЛАСОВАНИЕ Ч. РАЗВИТИЯ ОВ",
                valueFieldId: 0,
                valueFieldName: "Количество задач (COUNT)",
                valueFieldType: "count",
                dateFieldId: 9,
                dateFieldName: "Дата создания",
                dateFieldType: "creation_date",
                filterCondition: "Дата создания в периоде",
                groupingFieldId: 11,
                groupingFieldName: "Категория задачи (Консультации, Техподдержка, Анализ/ТЗ, Выезд, Pyrus работы)"
            },
            {
                formId: 1526386,
                formName: "08.01 HELP-DEV",
                valueFieldId: 0,
                valueFieldName: "Количество задач (COUNT)",
                valueFieldType: "count",
                dateFieldId: 29,
                dateFieldName: "Дата создания",
                dateFieldType: "creation_date",
                filterCondition: "Дата создания в периоде",
                groupingFieldId: 0,
                groupingFieldName: "Фиксированный тип: 'Доработка / Разработка'"
            }
        ]
    },
    {
        num: 5,
        name: "Оценок (всего 5-балльных оценок)",
        description: "Количество отлично оцененных работ (5 баллов / 5 ⭐) за текущий месяц / прошлую неделю по всем формам обратной связи.",
        timeframe: "Текущий месяц / Прошлая неделя",
        sources: [
            {
                formId: 1440596,
                formName: "02.04 ОЦЕНКА КАЧЕСТВА ВНЕДРЕНИЯ",
                valueFieldId: 8,
                valueFieldName: "Общая оценка качества внедрения",
                valueFieldType: "multiple_choice",
                dateFieldId: 29,
                dateFieldName: "Дата создания",
                dateFieldType: "creation_date",
                filterCondition: "Значение поля = '5' И дата в периоде"
            },
            {
                formId: 2338092,
                formName: "02.16 СДАЧА РАБОТ привязанная к задаче ОВ",
                valueFieldId: 12,
                valueFieldName: "Оценка качества оказанной услуги",
                valueFieldType: "multiple_choice",
                dateFieldId: 27,
                dateFieldName: "Дата создания",
                dateFieldType: "creation_date",
                filterCondition: "Значение поля = '5 ⭐⭐⭐⭐⭐' И дата в периоде"
            },
            {
                formId: 1560746,
                formName: "02.11 ВЕБ_ФОРМА ПОДТВЕРЖДЕНИЕ ОБУЧЕНИЯ",
                valueFieldId: 15,
                valueFieldName: "Оценка обучения",
                valueFieldType: "multiple_choice",
                dateFieldId: 29,
                dateFieldName: "Дата создания",
                dateFieldType: "creation_date",
                filterCondition: "Значение поля = '5' И дата в периоде"
            }
        ]
    },
    {
        num: 6,
        name: "Средняя оценка",
        description: "Среднее арифметическое (AVG) всех полученных числовых оценок (от 1 до 5) за период.",
        timeframe: "Текущий месяц / Прошлая неделя",
        sources: [
            {
                formId: 1440596,
                formName: "02.04 ОЦЕНКА КАЧЕСТВА ВНЕДРЕНИЯ",
                valueFieldId: 8,
                valueFieldName: "Общая оценка качества внедрения",
                valueFieldType: "multiple_choice",
                dateFieldId: 29,
                dateFieldName: "Дата создания",
                dateFieldType: "creation_date",
                filterCondition: "Поле заполнено (1..5) И дата в периоде. Приведение к числу."
            },
            {
                formId: 2338092,
                formName: "02.16 СДАЧА РАБОТ привязанная к задаче ОВ",
                valueFieldId: 12,
                valueFieldName: "Оценка качества оказанной услуги",
                valueFieldType: "multiple_choice",
                dateFieldId: 27,
                dateFieldName: "Дата создания",
                dateFieldType: "creation_date",
                filterCondition: "Поле заполнено (1⭐..5⭐) И дата в периоде. Приведение к числу 1..5."
            },
            {
                formId: 1560746,
                formName: "02.11 ВЕБ_ФОРМА ПОДТВЕРЖДЕНИЕ ОБУЧЕНИЯ",
                valueFieldId: 15,
                valueFieldName: "Оценка обучения",
                valueFieldType: "multiple_choice",
                dateFieldId: 29,
                dateFieldName: "Дата создания",
                dateFieldType: "creation_date",
                filterCondition: "Поле заполнено (1..5) И дата в периоде. Приведение к числу."
            }
        ]
    },
    {
        num: 7,
        name: "Часов в работе",
        description: "Сумма нормо-часов по всем активным (незавершенным) задачам формы 02.01 ОВ ЗАДАЧА в статусе 'Новая' и 'В работе'.",
        timeframe: "Текущий статус (Срез на текущий момент)",
        sources: [
            {
                formId: 1437076,
                formName: "02.01 ОВ ЗАДАЧА",
                valueFieldId: 67,
                valueFieldName: "Всего нормо-часов (или Осталось нормо-часов id 68 / незакрыто id 53)",
                valueFieldType: "money",
                dateFieldId: 0,
                dateFieldName: "Текущий статус задачи",
                dateFieldType: "status",
                filterCondition: "Статус задачи (Status id 26) IN ('Новая', 'В работе')"
            }
        ]
    },
    {
        num: 8,
        name: "Запущено объектов",
        description: "Количество заведений/объектов (COUNT задач формы 02.01), у которых фактическая дата пуска попадает в фильтр за период.",
        timeframe: "Текущий месяц / Прошлая неделя",
        sources: [
            {
                formId: 1437076,
                formName: "02.01 ОВ ЗАДАЧА",
                valueFieldId: 1,
                valueFieldName: "Название заведения (или id 100 'Ресторан') / COUNT задач",
                valueFieldType: "form_link / text",
                dateFieldId: 34,
                dateFieldName: "Фактическая дата пуска",
                dateFieldType: "date",
                filterCondition: "Фактическая дата пуска (id 34) IS NOT NULL И попадает в период (месяц / прошлая неделя)"
            }
        ]
    },
    {
        num: 9,
        name: "Информация по тем кто в отпуске",
        description: "Список сотрудников Отдела внедрения, у которых начался отпуск или наступит в ближайшую неделю (за 7 дней до начала).",
        timeframe: "Текущий момент (за 7 дней до отпуска + во время отпуска)",
        sources: [
            {
                formId: 2348174,
                formName: "00.07 ГРАФИК ОТПУСКОВ",
                valueFieldId: 1,
                valueFieldName: "Отпускник (Сотрудник)",
                valueFieldType: "person",
                dateFieldId: 2,
                dateFieldName: "Отпускной период (или id 12 Начало отпуска)",
                dateFieldType: "due_date_time / date",
                filterCondition: "Отдел (id 4, catalog 229614) = 'Отдел внедрения' И (Текущая дата >= (ДатаНачала - 7 дней) AND Текущая дата <= ДатаОкончания)",
                groupingFieldId: 1,
                groupingFieldName: "Отпускник (person)"
            }
        ]
    }
];

let md = `# Спецификация полей и условий для расчета метрик Pyrus (9 метрик)\n\n`;
md += `Документ содержит полную карту обращения к полям форм Pyrus для расчета **9 ключевых метрик** с временными срезами **За текущий месяц**, **За прошлую неделю** и на **Текущий момент**.\n\n`;

for (const m of metrics) {
    md += `## Метрика ${m.num}. ${m.name}\n\n`;
    md += `**Описание:** ${m.description}\n\n`;
    md += `**Период расчета:** \`${m.timeframe}\`\n\n`;
    
    md += `| № | Форма (ID) | Поле значения / значения | ID поля | Тип поля | Поле даты / статуса | ID даты | Поле группировки / Исполнитель | Условие фильтрации и функция агрегации |\n`;
    md += `| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;

    let i = 1;
    for (const s of m.sources) {
        const groupStr = s.groupingFieldName ? `${s.groupingFieldName} (ID: ${s.groupingFieldId || '—'})` : '—';
        md += `| ${i++} | **${s.formName}** (\`${s.formId}\`) | ${s.valueFieldName} | \`${s.valueFieldId || '—'}\` | ${s.valueFieldType} | ${s.dateFieldName} | \`${s.dateFieldId || '—'}\` | ${groupStr} | ${s.filterCondition} |\n`;
    }
    md += `\n---\n\n`;
}

const artifactPath = path.join('C:\\Users\\KirillSM\\.gemini\\antigravity\\brain\\96b8b4eb-39b6-40f3-bb67-706220e800c0', 'metrics_mapping_table.md');
fs.writeFileSync(artifactPath, md, 'utf8');
console.log("Updated metrics_mapping_table.md successfully with all 9 metrics!");
