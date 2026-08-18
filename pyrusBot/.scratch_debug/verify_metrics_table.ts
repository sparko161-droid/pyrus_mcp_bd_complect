import * as fs from 'fs';
import * as path from 'path';

const formsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fetched_forms.json'), 'utf8'));
const flatFields = JSON.parse(fs.readFileSync(path.join(__dirname, 'flat_fields.json'), 'utf8'));

interface MetricMapping {
    num: number;
    name: string;
    description: string;
    timeframe: string;
    sources: {
        formId: number;
        formName: string;
        valueFieldId: number;
        valueFieldName: string;
        valueFieldType: string;
        dateFieldId: number;
        dateFieldName: string;
        dateFieldType: string;
        filterCondition: string;
        groupingFieldId?: number;
        groupingFieldName?: string;
    }[];
}

const metrics: MetricMapping[] = [
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
                filterCondition: "Дата 'Завершена' попадает в период (заполнен статус 'Выполнена' / заполнение даты)"
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
                filterCondition: "Поле заполнено (значения 1, 2, 3, 4, 5) И дата в периоде. Приведение значения к числу."
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
                filterCondition: "Поле заполнено (1, 2, 3, 4, 5) И дата в периоде. Приведение к числу."
            }
        ]
    }
];

fs.writeFileSync(path.join(__dirname, 'metrics_definition.json'), JSON.stringify(metrics, null, 2), 'utf8');
console.log("Saved metrics_definition.json successfully!");
