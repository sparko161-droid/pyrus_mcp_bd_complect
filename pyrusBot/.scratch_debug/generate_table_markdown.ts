import * as fs from 'fs';
import * as path from 'path';

const formsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'fetched_forms.json'), 'utf8'));
const flatFields = JSON.parse(fs.readFileSync(path.join(__dirname, 'flat_fields.json'), 'utf8'));

const TYPE_NAMES: Record<string, string> = {
    text: 'Текст', money: 'Деньги', number: 'Число', date: 'Дата', time: 'Время',
    checkmark: 'Галочка', due_date: 'Срок', due_date_time: 'Срок со временем',
    email: 'Email', phone: 'Телефон', flag: 'Флаг', step: 'Этап', status: 'Статус',
    creation_date: 'Дата создания', note: 'Примечание', catalog: 'Справочник',
    file: 'Файл', person: 'Пользователь', author: 'Автор', table: 'Таблица',
    multiple_choice: 'Выбор', title: 'Заголовок', form_link: 'Связь с задачей',
    project: 'Проект', text_area: 'Многострочный текст'
};

function getAnalyticalCondition(f: any): string {
    const type = f.type;
    const name = (f.name || '').toLowerCase();
    const opts = f.options ? ` (${f.options})` : '';

    if (type === 'money' || type === 'number') {
        if (name.includes('часо') || name.includes('время') || name.includes('часы')) {
            return 'Метрика объема работ (Суммирование трудозатрат / часов, фильтр по диапазону)';
        }
        if (name.includes('оценк') || name.includes('балл') || name.includes('рейтинг')) {
            return 'Метрика качества (Расчет среднего балла / фильтр по оценке)';
        }
        if (name.includes('стоимость') || name.includes('сумма') || name.includes('цена') || name.includes('бюджет')) {
            return 'Финансовая метрика (Суммирование стоимости / фильтрация по бюджету)';
        }
        return 'Числовая метрика (Суммирование / Среднее / Мин / Макс / Фильтр по значению)';
    }

    if (type === 'date' || type === 'due_date' || type === 'due_date_time' || type === 'creation_date') {
        if (name.includes('создан')) {
            return 'Фильтр по дате поступления/создания (Период: день/неделя/месяц/квартал)';
        }
        if (name.includes('срок') || name.includes('дедлайн') || type === 'due_date' || type === 'due_date_time') {
            return 'Фильтр по сроку выполнения / Расчет просрочки (SLA / Выполнение в срок)';
        }
        if (name.includes('заверш') || name.includes('сдач') || name.includes('конец') || name.includes('закрыт')) {
            return 'Фильтр по дате закрытия/сдачи (Анализ длительности выполнения)';
        }
        return 'Временной фильтр / Расчет длительности этапа / Фильтрация по периоду';
    }

    if (type === 'multiple_choice' || type === 'status' || type === 'step') {
        if (name.includes('оценк') || name.includes('впечатлен')) {
            return `Метрика удовлетворительности / NPS (Расчет распределения оценок: ${opts})`;
        }
        if (name.includes('статус') || name.includes('состояни') || type === 'status' || type === 'step') {
            return `Фильтр по статусу/этапу задачи (Группировка реестра: ${opts})`;
        }
        if (name.includes('согласован') || name.includes('подтвержд')) {
            return `Фильтр по результату согласования (${opts})`;
        }
        return `Фильтр по категории/выбору (Группировка и сегментация: ${opts})`;
    }

    if (type === 'catalog') {
        return `Фильтр по справочнику (ID справочника: ${f.catalogId || '—'}). Группировка по объекту/клиенту/услуге`;
    }

    if (type === 'person' || type === 'author') {
        return 'Фильтр по ответственному/исполнителю/автору (Подсчет задач на сотрудника / KPI)';
    }

    if (type === 'form_link') {
        return 'Связь с родительской/смежной задачей (Агрегация подзадач / Дерево задач)';
    }

    if (type === 'checkmark' || type === 'flag') {
        return 'Бинарный фильтр (Да/Нет) / Счётчик выполненных условий';
    }

    if (type === 'table') {
        return 'Табличная часть (Агрегация строк: подсчет количества / суммирование колонок)';
    }

    if (type === 'file') {
        return 'Атрибут задачи (Фильтр по наличию вложений/подписи)';
    }

    if (type === 'title') {
        return 'Структурный блок формы (Группировка полей)';
    }

    if (type === 'note') {
        return 'Информационный текст / Инструкция формы';
    }

    if (f.code === 'u_23' || name.includes('заведени') || name.includes('ресторан') || name.includes('клиент')) {
        return 'Фильтр по клиенту/объекту (Сегментация реестра)';
    }

    return 'Текстовый атрибут (Поиск по ключевым словам / Фильтр по наименованию)';
}

let md = `# Карта форм и полей Pyrus (для фильтрации реестра и подсчета метрик)\n\n`;
md += `Выгружено **7 форм**, суммарно **${flatFields.length} полей** (включая вложенные таблицы и варианты выборки).\n\n`;

const formIds = [1522712, 1437076, 1437079, 1440596, 2338092, 1560746, 1526386];

for (const formId of formIds) {
    const form = formsData[formId];
    const fields = flatFields.filter((f: any) => f.formId === formId);

    md += `## Форма ${formId}: ${form.name}\n\n`;
    md += `Всего полей: **${fields.length}**\n\n`;
    md += `| Форма | Код поля | ID поля | Название поля | Тип | Условие подсчета / фильтрации / использования в метриках |\n`;
    md += `| --- | --- | --- | --- | --- | --- |\n`;

    for (const f of fields) {
        const codeDisplay = f.code ? `\`${f.code}\`` : '—';
        const parentPrefix = f.parent ? `*${f.parent}* ➔ ` : '';
        const nameDisplay = `${parentPrefix}${f.name || '—'}`;
        const typeDisplay = TYPE_NAMES[f.type] || f.type;
        const condition = getAnalyticalCondition(f);

        md += `| **${form.name}** (\`${formId}\`) | ${codeDisplay} | ${f.id} | ${nameDisplay} | ${typeDisplay} | ${condition} |\n`;
    }
    md += `\n---\n\n`;
}

fs.writeFileSync(path.join(__dirname, 'form_fields_map.md'), md, 'utf8');

// Also write to Artifacts directory so user can easily view or download
const artifactPath = path.join('C:\\Users\\KirillSM\\.gemini\\antigravity\\brain\\96b8b4eb-39b6-40f3-bb67-706220e800c0', 'forms_fields_map.md');
fs.writeFileSync(artifactPath, md, 'utf8');

console.log(`Generated report saved to form_fields_map.md and artifact forms_fields_map.md`);
