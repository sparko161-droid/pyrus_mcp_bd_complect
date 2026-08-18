---
title: "02 Формные скрипты Pyrus"
audience: "internal"
pyrus_id: "R8rrG6bt3fr"
pyrus_parent: "LmxwE0ksgui"
synced_at: "2026-08-10T11:24:22.000Z"
synced_hash: "sha256:e8409be1876fb6165b9a29707cf29b0b"
---

> **Назначение**: Практическое руководство, архитектурный справочник и спецификация для проектирования, написания и отладки клиентских (формных) скриптов Pyrus. Основано на официальной справке Pyrus (https://pyrus.com/ru/help/scripts/architecture) и материалах проекта.

---

## 1. Сравнение Серверных скриптов (Server Script Bots) и Скриптов Формы (Client Form Scripts)

Важнейшее правило — не путать два типа скриптов в Pyrus:

| Характеристика | Клиентский скрипт формы (Form Script) | Серверный бот (Server Script Bot) |
| --- | --- | --- |
| **Где исполняется** | В браузере пользователя / Мобильном приложении Pyrus | На серверах Pyrus |
| **Когда запускается** | В реальном времени **при вводе данных пользователем** (on-the-fly) | При отправке комментария, изменении задачи или webhook |
| **Главная цель** | Авторасчёт сумм, скрытие полей, валидация ИНН, фильтрация справочников | Сложная интеграция, фоновые задачи, перенос между формами |
| **Точка входа** | Вызовы `form.onChange(...)` на верхнем уровне | `export default async function(request: BotHookRequest)` |
| **Прямые HTTP-запросы (`fetch`, `xhr`)** | **СТРОГО ЗАПРЕЩЕНЫ** | Разрешены к внешним сервисам и Pyrus API |
| **Лимит времени** | **5 секунд** | **60 секунд** |
| **Права доступа** | Права **текущего пользователя**, открывшего форму | Права **самого бота** |

---

## 2. Архитектура и Глобальный объект `form`

Клиентский скрипт представляет собой JavaScript/TypeScript-код, объявляющий подписки на изменения полей формы через методы объекта `form`.

### Главное правило объявления подписок
Цепочки `form.onChange(...)` должны быть объявлены **на верхнем уровне скрипта** (не внутри функций).

```javascript
// Минимальный рабочий шаблон
form.onChange(['Цена', 'Количество'], true)
  .setValue('Сумма', state => {
    const [price, qty] = state.changes;
    if (!price || !price.value || !qty || !qty.value) return 0;
    return price.value * qty.value;
  });
```

---

## 3. Каркас подписки `form.onChange(fieldNames, executeOnLoad)`

- `fieldNames` (`string[]`): Массив кодов или названий полей, за изменениями которых следим.
- `executeOnLoad` (`boolean`, по умолчанию `false`): **Рекомендуется передавать `true`**. В этом случае скрипт выполнится не только при редактировании поля, но и сразу при открытии формы пользователем.

### Метод-чейнинг после `onChange`:

| Метод | Назначение | Синхронный / Асинхронный |
| --- | --- | --- |
| `setValue(field, calcFn)` | Заполнить вычисляемое поле | `setValue` / `setValueAsync` |
| `setValues(fields, calcFn)` | Заполнить сразу несколько полей массивом | `setValues` / `setValuesAsync` |
| `setAssignee(calcFn)` | Назначить системного ответственного (по `person_id`) | `setAssignee` / `setAssigneeAsync` |
| `validate(field, valFn)` | Проверить поле перед сохранением/согласованием | `validate` / `validateAsync` |
| `setFilter(field, filterFn)` | Отфильтровать варианты справочника | `setFilter` / `setFilterAsync` |
| `setVisibility(fields, visibilityFn)` | Показать/скрыть поля (`true`/`false`) | Синхронный |
| `setStatus(calcFn)` | Выбрать вариант в системном поле Статус | Синхронный |

---

## 4. Объект состояния формы `FormState`

Каждая функция расчёта принимает объекту `state`:

```typescript
interface FormState {
  changes: FieldValue[];       // Значения полей, указанных в onChange, в том же порядке
  prev?: FieldValue[];          // Текущие значения вычисляемых полей
  commenter: Person;            // Пользователь, редактирующий форму
  assignee: Person | undefined; // Текущий ответственный по задаче
  currentStep: number;          // Номер этапа (0 — создание новой задачи)
  taskId?: number;              // ID задачи (undefined при создании)
}
```

---

## 5. Работа со специальными типами полей и таблицами

### 1. Таблицы (Вычисления в строке и сумма колонки)

#### А. Расчет в строке таблицы
При указании колонок таблицы в `onChange`, `state.changes` содержит значения для **конкретной редактируемой строки**:
```javascript
form.onChange(['Количество', 'Цена'])
  .setValue('Сумма_Строки', state => {
    const [qty, price] = state.changes;
    if (!qty?.value || !price?.value) return 0;
    return qty.value * price.value;
  });
```

#### Б. Суммирование колонки таблицы во внешнее поле
Для агрегации таблицы во внешнее поле используйте свойство `.sum` объекта колонки:
```javascript
form.onChange(['Сумма_Строки', 'Скидка'])
  .setValue('Итого_К_Оплате', state => {
    const [rowSum, discount] = state.changes;
    if (!rowSum) return 0;
    const total = rowSum.sum * (1 - (discount?.value || 0) / 100);
    return total;
  });
```

### 2. Загрузка данных (Справочники, Роли, Реестр)

Поскольку прямые `fetch` запрещены, используйте методы объекта `form`:

- **Справочники**:
  ```javascript
  // Оптимизация: кэшируем Promise вне onChange
  const catalogPromise = form.getCatalog('Справочник Контрагентов');

  form.onChange(['ИНН'], true)
    .setValueAsync('НазваниеКонтрагента', async state => {
      const [inn] = state.changes;
      if (!inn?.value) return null;
      const items = await catalogPromise;
      const found = items.find(item => item.columns['ИНН'] === inn.value);
      return found ? found.columns['Наименование'] : null;
    });
  ```
- **Роли**: `await form.fetchRoles(personId)` (возвращает список ролей и их участников).
- **Реестры других форм**: `await form.fetchRegister(formId, filter)` или `await form.fetchSelfRegister()`.

### 3. Рабочие дни и Часовые пояса
- **Расчет рабочих дней**:
  ```javascript
  form.onChange(['Даты отпуска'], true)
    .setValue('Количество дней', state => {
      const [due] = state.changes;
      if (!due?.start_date || !due?.end_date) return null;
      return form.getDaysCount(due.start_date, due.end_date, {
        exclude: 'nonWorkingHoliday',
        calendar: 'ru'
      });
    });
  ```
- **Часовой пояс**: `form.getDateWithTimezoneOffset(dateString)`.

---

## 6. Валидация полей (`validate` / `validateAsync`)

Скрипт может блокировать сохранение, отправку или согласование формы при ошибке ввода:

```javascript
form.onChange(['ИНН'], true)
  .validate('ИНН', state => {
    const [inn] = state.changes;
    if (!inn?.value) return undefined;
    
    // Проверка длины ИНН (10 или 12 цифр)
    if (!/^\d{10}$|^\d{12}$/.test(String(inn.value))) {
      return {
        errorMessage: "ИНН должен состоять из 10 или 12 цифр",
        canSave: false,
        canApprove: false
      };
    }
    return undefined; // Ошибок нет
  });
```

---

## 7. Главные ограничения и ошибки разработчика

1. **Запрещены прямые HTTP-запросы**: Никаких `fetch()`, `XMLHttpRequest` или `axios`.
2. **Таймаут 5 секунд**: Код не должен выполнять тяжелые циклы.
3. **Запрещены циклические зависимости**: Поле A не может зависеть от B, если B зависит от A.
4. **Ручное редактирование**: Поля, для которых вызван `setValue`, **блокируются для ручного ввода** пользователем в интерфейсе Pyrus!
5. **Мобильное приложение**: `setVisibility` и `setStatus` пока имеют ограниченную поддержку в мобильном клиенте.
