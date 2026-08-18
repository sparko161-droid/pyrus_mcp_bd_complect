import {BotHookRequest, BotHookResponse, TaskWithComments, UpdateCatalogRequest, SyncCatalogResponse, FormResponse, FormField, PyrusApiClient, TableRow, MultipleChoice, FormFilter, AttachedFile, NewFile, ProjectArray, TaskRequest, FormFieldCatalog, FormFieldInfo, OperatorId, Catalog, FormLink, CatalogResponse, TaskComment, FormRegisterRequest, TaskCommentRequest, ProfileResponse, Person} from "pyrus-api";       
//v 4.3  
let error_log: Record<number, string[]> = {}; //переменная для хранения ошибок в процессе переносов. Ключем является задача, из которой происходил перенос, в ней будет направлено сообщение об ошибке 
let applied_rules: string[] = []; //массив применённых правил для исключения зацикливания 
let rules: CopyRule[] = []; //переменная для хранения правил, чтобы не передавать их в каждую функцию 
  
export default async function(request: BotHookRequest): Promise<BotHookResponse> {     
  const start_time = new Date();     
  const bot = new ExtendedClient(request.access_token, request.user_id);    
  let full_task = await bot.get_task(request.task.id) as ExtendedTask;//делаем запрос для получения задачи, чтобы получить все комментарии   
  if (!full_task?.form_id) return full_task && !full_task.close_date ? {text: "Бот не может отработать в этой задаче", approval_choice: "rejected"} : null; //если это простая задача или мы не имеем доступа к форме, прекращаем работу   
  let result: TaskCommentRequest = {}; 
  try{  
    const settings = JSON.parse(request.bot_settings);   
    rules = settings.rules; 
    //rules.forEach((r, i) => console.log(i, r.comment)); //разблокируйте, чтобы посмотреть список правил в настройках 
    await copy_from_task(bot, full_task); //основная функция ничего не возвращает, все обновления задач происходят внутри  
    console.log("error_log", error_log);  
    for (let error_task_id of Object.keys(error_log)){ //отправляем ошибки в соответствующие задачи 
      const error_task = await bot.get_task(Number(error_task_id)) as ExtendedTask; 
      if (error_task.close_date) continue; 
      const task_error_log = Array.from(new Set(error_log[error_task_id])).join("\n"); //ошибки могут повторяться 
      let task_comments = error_task.comments; 
      let error_comment = task_error_log; 
      let count = 0; 
      for (let i = task_comments.length -1; i >=0;i--){ //при сохранении ошибок бот отправляет новую только спустя 5 текстовых комментариев, чтобы не спамить пользователей 
          if (!task_comments[i].text) continue; 
          if (count > 5) break; 
          if (task_comments[i].text == task_error_log){ 
              if (task_comments[i].text == task_error_log) error_comment = null; 
              break; 
            } 
          count += 1; 
        } 
      if (error_comment) { 
        let error_send_attempt = await bot.comment_task(error_task.id, {text: error_comment}); 
        if (typeof error_send_attempt == 'string') console.log(`Ошибка отправки лога ошибок в задачу ${error_task.id}`, error_send_attempt); 
        } 
      } 
    }  
  catch (error){  
      console.log(error);  
      result = full_task?.close_date ? null : {text: "В процессе выполнения возникла непредвиденная ошибка. Обратитесь к администратору", approval_choice: "rejected"};  
    }  
  console.log("working", get_time_seconds(start_time, new Date()));    
  if (result && Object.keys(result).length > 0)   
    {  
      try{  
      await bot.tasks.addComment(request.task_id, result);  
        }  
        catch (error){  
            console.log(error);  
            console.log(result, result == {});  
            return {text: "При обновлении задачи возникла ошибка"};  
          }   
    }    
}   
  
//функция для обновления лога ошибок, точка входа для запуска процессов копирования в задаче 
function add_error(task_id: number, error: string){  
    if (!error_log[task_id]) error_log[task_id] = [error]; 
    else error_log[task_id].push(error); 
  } 
  
//Функция для проверки правил переноса для задачи 
async function copy_from_task(bot: ExtendedClient, task: ExtendedTask){  
    let rule_index = -1; 
    let approvers = prepare_approval_list(task); 
    let bot_on_step = false; 
    let bot_in_subscribers = false; 
    let wait_for_others = false; 
    let approvals_on_step = approvers[task.current_step]; 
    //собираем информацию о необходимости согласовывать этап и возвращать себя в наблюдатели после утверждения 
    if (approvals_on_step){ 
        for (let key of Object.keys(approvals_on_step)){ 
            let [user_type,user_id] = key.split("_"); 
            let choice = approvals_on_step[key]; 
            if (user_type == 'user' && choice == 'waiting') wait_for_others = true; 
            //if (user_type == 'role' && choice == 'waiting') wait_for_others = true; //раскомментруйсте, если нужно ждать ещё роли 
            else if (Number(user_id) == bot.id && choice == 'waiting') bot_on_step = true; 
          } 
      } 
    for (let subscriber of task.subscribers ?? []){ 
        if (subscriber.person.id == bot.id && (subscriber.approval_choice == 'waiting' || !subscriber.approval_choice)) bot_in_subscribers = true; 
      } 
    //если в последнем комментарии менялись какие-то поля с кодами нужно исследовать, не менялись ли поля с указателями полей. Если менялись, то нужно удалить из задач, которые больше не связаны с задачей вызова 
    if (task.comments[task.comments.length -1].field_updates?.length > 0){ 
        await clear_other_tasks(bot, task); 
      } 
    let updated_task_ids = []; 
    for (let rule of rules){  
        rule_index += 1; 
        //проверка на необходимость применять правило к задаче 
        if (rule.permitted_forms?.length > 0 && !rule.permitted_forms.includes(task.form_id)) continue; 
        if (!rule.target) continue; 
        let check_results = await check_task_conditions(bot, task, rule, rule_index); 
        if (typeof check_results == 'string'){ 
            add_error(task.id, check_results); 
            continue; 
          } 
        if (!check_results) continue; 
        let approal_choice = null; 
        let source_updates = []; 
        let subscribers_rereq = []; 
        try{ 
          task = await prepare_task(bot, task, rule, rule_index); //если есть кастомные обработки перед переносом 
          } 
        catch(error){ 
            console.log("Ошибка при предподготовке", error); 
          } 
        if (typeof task == 'string') continue; //на случай, если неуачно обновили задачу при предобработке 
        //получаем задачи-цели для копирования 
        const [target_code, target_header] = split_setting_code(rule.target); 
        if (target_header && isNaN(Number(target_header))){ 
            add_error(task.id, `Индекс для поля с целевой задачей должен быть числовым`); 
            continue; 
          } 
        let target_field = task.named_fields[target_code]; 
        let aim_tasks = []; 
        if (!target_field){ 
            //add_error(task.id, `На шаблоне формы нет поля с кодом ${target_code}`); 
            continue; 
          } 
        let need_to_approve = rule.need_to_approve ?? false; 
        if ((need_to_approve && bot_in_subscribers) || (bot_on_step && !wait_for_others)){ //ставим утверждение, если подключались в наблюдатели единоразово или если на этапе нет несогласовавших пользователей 
            approal_choice = 'approved'; 
            if (!need_to_approve && bot_in_subscribers) subscribers_rereq = [{id: bot.id}]; 
          }  
        let target_table_code = await get_parent_table_code(bot, target_field, task.form_id); //определяем является ли поле-источник колонкой таблицы 
        if (target_table_code?.includes(" ")){ //результат функции может содержать пробел только если возвращается ошибка, например, отсутствие кода у таблицы-родителя 
            add_error(task.id, target_table_code); 
            continue; 
          } 
    
        //если поле с целью находится вне таблицы 
        if (!target_table_code){ 
            let aim_task_ids = get_task_ids(target_field, Number(target_header)); 
            if (aim_task_ids === null) continue; //такое значение может быть только если с полем какие-то проблемы. Поэтому в таком случае мы прекращаем работу 
            if (aim_task_ids.length == 0){ //если из поля не удалось получить номера задач, проверяем нужно ли в соответствии с правилом создать задачу. Если нет, то продолжаем проверять правила 
                if (rule.form_rules){ 
                    let created_task = await create_absent_task(bot, task, rule, rule_index); 
                    if (!created_task) continue;//если создание не удалось, ошибка уже в логе 
                    task.named_fields[target_code].value = await set_task_id(bot, task.named_fields[target_code], created_task, task.form_id, target_header); //если была создана задача, заносим значение в поле и обновляем задачу-вызова 
                    source_updates.push(target_code); 
                    aim_task_ids.push(created_task.id); 
                  } 
                else continue; 
              } 
            for (let aim_task_id of aim_task_ids){ //для каждой задачи запускаем перенос отдельно 
                let copy_result = await apply_rule_for_pair(bot, task, aim_task_id, rule, rule_index);//копируем данные между задачами 
                if (copy_result) updated_task_ids.push(copy_result); //функция копирования возвращает список изменённых задач. Если в них изменились поля, то для них тоже надо запустить перенос 
              } 
          } 
        else{ 
          for (let row of task.named_fields[target_table_code].value as ExtendedTableRow[]){ 
              if (row.delete) continue; //если во время кастомной подготовки какие-то ряды были удалены, то они игнорируются 
              let row_check = await check_row_conditions(bot, task, row, rule, rule_index); //учитываем только подходящие нам ряды 
              if (typeof row_check == 'string') { 
                add_error(task.id, row_check); 
                continue; 
              } 
              if (!row_check) continue; 
              let aim_task_ids = get_task_ids(row.named_cells[target_code], Number(target_header)); 
              if (aim_task_ids === null) continue;//такое значение может быть только если с полем какие-то проблемы. Поэтому в таком случае мы прекращаем работу для этой строки 
              if (aim_task_ids.length == 0){ 
                  if (rule.form_rules){ 
                      let created_task = await create_absent_task(bot, task, rule, rule_index, row); 
                      if (!created_task) continue;//если создание не удалось, ошибка уже в логе 
                      row.named_cells[target_code].value = await set_task_id(bot, row.named_cells[target_code], created_task, task.form_id, target_header); //обновляем ячейки таблицы. Позже изменения будут отправлены в задачу 
                      source_updates.push(target_code); 
                      aim_task_ids.push(created_task.id); 
                    } 
                  else continue; 
                } 
              for (let aim_task_id of aim_task_ids){ //для каждой задачи запускаем перенос отдельно 
                  let copy_result = await apply_rule_for_pair(bot, task, aim_task_id, rule, rule_index, row); 
                  if (copy_result) updated_task_ids.push(copy_result); //функция копирования возвращает список изменённых задач. Если в них изменились поля, то для них тоже надо запустить перенос 
                } 
              } 
          } 
        let field_updates = []; 
        source_updates = Array.from(new Set(source_updates)); // некоторые поля, например таблицы, могли меняться несколько раз. Поэтому оставляем только уникальные коды 
        if (source_updates.length > 0){ 
            for (let code of source_updates){ 
            let updated_code = code; 
            let field = task.named_fields[code];  
            let parent_table_code = await get_parent_table_code(bot, field,task.form_id); 
            if (parent_table_code && !parent_table_code.includes(" ") && !source_updates.includes(parent_table_code)){ //если в качестве обновлённого поля передана колонка таблицы, важно убедиться, что в список обновляемых полей таблица добавится только один раз 
              field = task.named_fields[parent_table_code]; 
              updated_code = parent_table_code; 
              } 
            else if (parent_table_code) continue; 
            field_updates.push(field); 
          } 
        } ;
        if (field_updates.length > 0 || approal_choice){ //отправляем комментарий в задачу вызова только если есть что менять 
          let updated_task = await bot.comment_task(task.id, {field_updates: field_updates, approval_choice: approal_choice}); 
          if (typeof updated_task != 'string') task = updated_task; 
          if (approal_choice && subscribers_rereq.length > 0){ //если нужно утвердить этап, но остаться в наблюдателях, то перезапрашиваем согласование в наблюдателях 
              updated_task = await bot.comment_task(task.id, {subscribers_rerequested: subscribers_rereq, skip_notification: true}); 
              if (typeof updated_task != 'string') task = updated_task; 
            }   
          } 
      } 
    updated_task_ids = Array.from(new Set(updated_task_ids)).filter(x=>x!=task.id); //оставляем только уникальные номера задач 
    for (let updated_task_id of updated_task_ids){ 
        let updated_task = await bot.get_task(updated_task_id); 
        if (typeof updated_task == 'string') continue; 
        await copy_from_task(bot, updated_task); //запускаем процесс копирования в обновлённых задачах 
      }  
  }   
  
  
/** 
 * Применяет правило копирования/синхронизации полей между двумя задачами. 
 * Может обновить поля в задаче-назначении. Переоткрывает задачу в процессе при необходимости. 
 * 
 * @param {ExtendedClient} bot Экземпляр клиента Pyrus API. 
 * @param {ExtendedTask} initial_task Задача, из которой был вызов правила. 
 * @param {number} aim_task_id ID задачи-приёмника (куда переносим данные). 
 * @param {CopyRule} rule Правило копирования. 
 * @param {number} rule_index Индекс правила (для уникальной метки применения). 
 * @param {ExtendedTableRow} [source_row] (опц.) строка таблицы-источника. 
 * @returns {Promise<number|null>} ID обновлённой задачи или null, если апдейтов не было/ошибка. 
 */ 
async function apply_rule_for_pair( 
  bot: ExtendedClient, 
  initial_task: ExtendedTask, 
  aim_task_id: number, 
  rule: CopyRule, 
  rule_index: number, 
  source_row?: ExtendedTableRow 
): Promise<number | null> { 
  
  // Уникальный ключ применения правила для пары задач, используется далее при проверке на зацикливание 
  const string_rule = `${initial_task.id}-${aim_task_id}-${rule_index}`; 
  // Режим реверса: если true — мы загружаем из целевой задачи в задачу вызова 
  const reverse = rule.reverse ?? false; 
  const skip_notification = rule.skip_notification; //если надо отправить сообщение бесшумно 
  let action: 'reopened' | null = null; //если задача закрыта, но нам для обновления данных нужно её переоткрывать 
  // Защита от зацикливания 
  if (applied_rules.includes(string_rule)) return null; 
  applied_rules.push(string_rule); 
  
  // Загружаем целевую задачу 
  const aim_task_req = await bot.get_task(aim_task_id); 
  if (typeof aim_task_req === 'string' || !aim_task_req?.form_id) { 
    console.log(`Нет доступа к задаче ${aim_task_id}`); 
    // add_error(initial_task.id, `Нет доступа к задаче ${aim_task_id}`); //разблокировать, если нужно писать сообщения в задачу об отсутствии доступа 
    return null; 
  } 
  
  // Вычисляем источник и цель с учётом reverse 
  const aim_task = !reverse ? (aim_task_req as ExtendedTask) : initial_task; 
  const source_task = !reverse ? initial_task : (aim_task_req as ExtendedTask); 
  
  // Если цель закрыта и правило не разрешает переоткрытие или перенос в закрытую — выходим 
  if (aim_task.close_date && !rule.reopen_task && !rule.to_closed_task) return null; 
  else if (aim_task.close_date && rule.reopen_task) action = 'reopened'; 
  
  // Снимок текущих полей целевой задачи для последующего сравнения 
  const old_fields = copy_by_value(aim_task.named_fields) as Record<string, FormField>; 
  // Копируем значения полей по правилу 
  let updated_fields = await copy_fields(bot, source_task, aim_task, rule, rule_index, source_row); 
  updated_fields.push(...await aggregate_tables(bot, aim_task, rule, rule_index)); 
  if (rule.sorting_rules){ 
      for (let table_code in rule.sorting_rules){ 
          if (!aim_task.named_fields[table_code]) continue; 
          if (sort_table(aim_task.named_fields[table_code].value as ExtendedTableRow[], aim_task.named_fields[table_code].id, rule.sorting_rules[table_code], aim_task)) updated_fields.push(table_code); 
        } 
    } 
  try{ 
    // Если есть кастомная обработка данных после переноса 
    const post_updated_codes = await post_copy_updates(bot, source_task, aim_task, rule, rule_index); 
  
    updated_fields.push(...post_updated_codes); 
    } 
  catch (error){ 
      console.log(source_task?.id, aim_task?.id, error); 
      add_error(source_task.id, `В процессе постобработки данных возникла ошибка`); 
    } 
  updated_fields = Array.from(new Set(updated_fields)); 
  const field_updates: FormField[] = []; 
  for (let code of updated_fields) { 
    let updated_code = code; 
    let field = aim_task.named_fields[code]; 
    
    // Если поле внутри таблицы — обновляем родительскую таблицу 
    const parent_table_code = await get_parent_table_code(bot, field, aim_task.form_id); 
    if (parent_table_code && !parent_table_code.includes(" ") && !updated_fields.includes(parent_table_code)) { 
      field = aim_task.named_fields[parent_table_code]; 
      updated_code = parent_table_code; 
    } else if (parent_table_code) { 
      continue; // таблица уже попадает в обновления 
    } 
    // Пропускаем, если значение не изменилось
    //console.log(updated_code, old_fields[updated_code]?.value, field.value, same_value(old_fields[updated_code], field)) 
    if (old_fields[updated_code] && same_value(old_fields[updated_code], field)) continue; 
    field_updates.push(field); 
  } 
  //console.log(rule.comment, aim_task_id, field_updates);
  // Если есть что отправлять — комментируем задачу с обновлениями 
  if (field_updates.length > 0) { 
    const updated_task = await bot.comment_task(aim_task.id, { 
      field_updates, 
      skip_notification, 
      action}); 
  
    if (typeof updated_task === 'string') { 
      add_error(source_task.id, `Ошибка переноса в задачу ${aim_task.id}: ${updated_task}`); 
    } else { 
      return updated_task.id; 
    } 
  } 
  return null; 
} 
  
/** 
 * Копирует значения полей между задачами в соответствии с правилом или кастомными связями. 
 * 
 * @param {ExtendedClient} bot Экземпляр клиента Pyrus API. 
 * @param {ExtendedTask} source_task Задача-источник, из которой копируются данные. 
 * @param {ExtendedTask} aim_task Задача-приёмник, в которую копируются данные. 
 * @param {CopyRule} rule Правило копирования, определяющее соответствие полей. 
 * @param {number} rule_index Индекс правила (для логирования и уникальности применения). 
 * @param {ExtendedTableRow} [source_row] (Необязательно) конкретная строка таблицы-источника, если переносим из таблицы. 
 * @param {Record<string, string | string[]>} [custom_relations] (Необязательно) если нам нужно использовать не relations из правила, а какие-то свои отношения полей. 
 * 
 * @returns {Promise<string[]>} Список кодов полей, в которые было копирование. Это не гарантирует, что значение было изменено, оно могло остаться тем же 
 */ 
async function copy_fields( 
  bot: ExtendedClient, 
  source_task: ExtendedTask, 
  aim_task: ExtendedTask, 
  rule: CopyRule, 
  rule_index: number, 
  source_row?: ExtendedTableRow, 
  custom_relations?: Record<string, string | string[]> 
): Promise<string[]> { 
  
  let updated_codes: string[] = []; 
  // если нет relations — прерываемся. Возможно, если бот используется только для поиска задач 
  if (!rule.relations && !custom_relations) return updated_codes; 
  let [target_task_code, target_task_code_index] = split_setting_code(rule.target); 
  // Определяем набор связей полей (или из правила, или кастомный) 
  let relations = custom_relations ? custom_relations : rule.relations; 
  
  // Перебор всех кодов полей-источников 
  for (let code of Object.keys(relations)) { 
    // Разделяем код и индекс (для полей с вариативными правилами переноса) 
    let [source_code, source_index] = split_setting_code(code); 
    let source_field = source_task.named_fields[source_code]; 
    // Если в источнике нет такого поля — пропускаем 
    if (!source_task.named_fields[source_code]) { 
      //add_error(source_task.id, `На шаблоне формы нет поля с кодом ${source_code}`); //разблокировать, если нужно написать сообщение в задачу.  
      continue; 
    } 
  
    // Определяем, является ли поле-источник табличным 
    let source_table_parent_code = await get_parent_table_code(bot, source_field, source_task.form_id); 
    if (source_table_parent_code?.includes(" ")) { 
      add_error(source_task.id, source_table_parent_code); 
      continue; 
    } 
  
    // Флаг, что значения берутся из конкретной строки таблицы. В таком случае значение конкретной ячейки может быть перенесено во внетабличное поле 
    let from_row = false; 
    if (source_table_parent_code && source_row?.named_cells[source_code]) { 
      source_field = source_row.named_cells[source_code]; 
      from_row = true; 
    } 
  
    // Целевые коды полей. Всегда приводим их к массиву, хотя в большинстве случаев пользователь передаст один код 
    let target_codes: string[] = []; 
    if (Array.isArray(relations[code])) target_codes = relations[code] as string[]; 
    else target_codes = [relations[code].toString()]; 
  
    // Перебор целевых полей, куда копируем данные 
    for (let t_code of target_codes) { 
      const [target_code, target_index] = split_setting_code(t_code); 
      let target_field = aim_task.named_fields[target_code]; 
  
      // Если в приёмнике нет такого поля — пропускаем 
      if (!target_field) { 
        //add_error(source_task.id, `На шаблоне формы ${aim_task.form_id} нет поля с кодом ${target_code}`); //разблокировать, если нужно написать сообщение в задачу 
        continue; 
      } 
  
      // Определяем родительскую таблицу целевого поля 
      let target_table_parent_code = await get_parent_table_code(bot, target_field, aim_task.form_id); 
  
      // Если код таблицы некорректный — фиксируем ошибку и идём к следующему коду 
      if (target_table_parent_code?.includes(" ")) { 
        add_error(source_task.id, `Невозможно перенести данные: ${target_table_parent_code}`) 
        continue; 
      } 
  
      // Если источник не в таблице или берём значение из конкретной строки 
      if (!source_table_parent_code || (from_row && !target_table_parent_code)) { 
        if (!target_table_parent_code) { 
          // Перенос "поле → поле" (оба нетабличные или из строки в поле) 
          let new_value = await get_new_value( 
            bot, source_field, source_index, target_field, target_index, 
            aim_task, source_task, 
            (from_row && source_row ? source_code : null), 
            (from_row && source_row ? source_row.row_id : undefined) 
          ); 
          if (source_field.type == 'file' && !new_value) continue; 
          target_field.value = new_value; 
          updated_codes.push(target_code); 
        } else { 
          // Перенос "поле → таблица" 
          let target_rows = await get_row(bot, rule, source_task, aim_task.named_fields[target_table_parent_code], aim_task); 
          if (target_rows.length == 0) continue; 
          for (let target_row of target_rows) { 
            let new_value = await get_new_value( 
              bot, source_field, source_index, target_row.named_cells[target_code], target_index, 
              aim_task, source_task 
            ); 
            if (source_field.type == 'file' && !new_value) continue; 
            target_row.named_cells[target_code].value = copy_by_value(new_value); 
          } 
          updated_codes.push(target_table_parent_code); 
        } 
      } 
      // Если источник в таблице 
      else { 
        const source_table = source_task.named_fields[source_table_parent_code]; 
        if (!target_table_parent_code) { 
          // Перенос "колонка таблицы → поле" 
          let cell_values: any[] = []; 
          let changed_file_fields = false; 
          let total_number_value = undefined; 
          for (let row of source_table.value as ExtendedTableRow[]){ 
              if (row.delete) continue; 
              let row_check = await check_row_conditions(bot, source_task, row, rule, rule_index); //учитываем только подходящие нам ряды 
              if (typeof row_check == 'string') { 
                add_error(source_task.id, row_check); 
                continue; 
              } 
              if (!row_check) continue; 
              let cell = row.named_cells[source_code]; 
              let cell_value = await get_new_value(bot, cell, source_index, target_field, target_index,aim_task,source_task, source_code, row.row_id);//преобразуем значения ячейки в текст 
              if (target_field.type != 'file'){ 
                cell_values.push(cell_value); 
                } 
              else if (cell_value){ //поле типа Файл меняется прямо в функции get_new_value, поэтому здесь нам нужно только понять, было ли изменение 
                  changed_file_fields = true; 
                } 
            } 
          //смотрим какой оператор использовать. Перенос всех значений поддерживается только в текстовые и файловые поля.  
          if (target_field.type == 'file' && changed_file_fields) updated_codes.push(target_code); 
          else if (target_field.type != 'file' && aggregate_field(target_field, target_index, cell_values)) updated_codes.push(target_code); 
        } else { 
          // Перенос "таблица → таблица" 
          let row_ids_to_keep = []; 
          // Перебираем строки таблицы-источника 
          for (let source_row of source_table.value as ExtendedTableRow[]) { 
            if (source_row.delete) continue; 
            // Проверка условий для строки 
            let row_check = await check_row_conditions(bot, source_task, source_row, rule, rule_index); 
            if (typeof row_check == 'string') { 
              add_error(source_task.id, row_check); 
              continue; 
            } 
            if (!row_check) continue; 
            if (from_row){ 
                let task_ids_in_source_row = await get_task_ids(source_row.named_cells[target_task_code], Number(target_task_code_index)); 
                if (!task_ids_in_source_row.includes(aim_task.id)) continue; 
              } 
            // Для последующей проверки целевой таблицы на лишние строки записываем все строки, которые там должны оказаться 
            row_ids_to_keep.push(source_row.row_id); 
            // Находим подходящие строки в таблице-приёмнике 
            let target_rows = await get_row(bot, rule, source_task, aim_task.named_fields[target_table_parent_code], aim_task, source_row); 
            if (target_rows.length == 0) continue; 
            // Получаем новое значение 
            let new_value = await get_new_value( 
              bot, source_row.named_cells[source_code], source_index, 
              target_field, target_index, aim_task, source_task, 
              source_code, source_row.row_id 
            ); 
            if (source_row.named_cells[source_code].type == 'file' && !new_value) continue; 
  
            //В случае переноса из таблицы в таблицу у нас всегда одна целевая строка. Если их больше 1, это случайность 
            target_rows[0].named_cells[target_code].value = new_value; 
            updated_codes.push(target_table_parent_code); 
          } 
  
          // Удаление строк, которых нет в источнике или которые не подходят по условиям 
          let [task_link_code, task_link_index, row_id_code] = await get_target_codes( 
            bot, rule, source_task, aim_task.named_fields[target_table_parent_code], aim_task.form_id, true 
          ); 
          for (let row of aim_task.named_fields[target_table_parent_code].value as ExtendedTableRow[]) { 
            let row_task_ids = get_task_ids(row.named_cells[task_link_code], Number(task_link_index)); 
            if (!row_task_ids.includes(source_task.id)) continue; 
            if (row.named_cells[row_id_code]?.value == null) row.delete = true; 
            if (!row_ids_to_keep.includes(row.named_cells[row_id_code].value)) row.delete = true; 
            updated_codes.push(target_table_parent_code); 
          } 
        } 
      } 
    } 
  } 
  //console.log("Изменённые поля", rule_index, aim_task?.id,  updated_codes); //разблокируйте, если надо видеть, какие поля обновились 
  return updated_codes; 
} 
  
/** 
 * Агрегирует массив значений в целевое поле по указанному индексу/операции. 
 * 
 * Поддерживаемые варианты: 
 *  - "" (пусто): если целевое поле текстовое — склеивает значения через \n 
 *  - "first": первое значение 
 *  - "last": последнее значение 
 *  - "min"/"max": минимум/максимум (для number/money — по числам; для date — по времени) 
 *  - "sum": сумма чисел 
 *  - "avg": среднее числовых значений 
 *  - "median": медиана числовых значений 
 * 
 * Для числовых агрегатов: null/undefined отбрасываются, строки приводятся к числу, затем фильтруются не-конечные (Number.isFinite). 
 * Для дат: значения приводятся к Date → getTime(). 
 * 
 * @param {FormField} target_field Поле, в которое записывать результат. 
 * @param {string} target_index Операция/индекс агрегирования ("first" | "last" | "min" | "max" | "sum" | "avg" | "median" | ""). 
 * @param {any[]} cell_values Массив значений-источников. 
 * @returns {boolean} true, если операция поддержана и значение записано; иначе false. 
 */ 
function aggregate_field(target_field: FormField, target_index: string, cell_values: any[]): boolean{ 
  let success = false; 
  
  // Пустой индекс: для текстового поля — склеить значения в многострочную строку 
  if (!target_index || target_index == ''){ 
    if (target_field.type == 'text'){ 
      // null → пустая строка; 0/false сохраняются как "0"/"false" 
      target_field.value = cell_values.length > 0 ? cell_values.map(x=>x !== null ? String(x) : '').join("\n") : null; 
      success = true; 
    } 
  } 
  // Первое значение 
  else if (target_index == 'first'){ 
    target_field.value = cell_values.length > 0 ? cell_values[0] : null; 
    success = true; 
  } 
  // Последнее значение 
  else if (target_index == 'last'){ 
    target_field.value = cell_values.length > 0 ? cell_values[cell_values.length - 1] : null; 
    success = true; 
  } 
  //общее количество 
  else if (target_index == 'count'){ 
      target_field.value = cell_values.filter(x=>(x || x===0) && x!= '').length; 
      success = true; 
    } 
  //Количество уникальных 
  else if (target_index == 'countu'){ 
      target_field.value = cell_values.length ? Array.from(new Set(cell_values.filter(x=>(x || x===0) && x!= ''))).length : 0; 
      success=true; 
    } 
  // Минимум 
  else if (target_index == 'min'){ 
    if (target_field.type == 'number' || target_field.type == 'money'){ 
      const only_numbers: number[] = cell_values.length > 0 ? cell_values.filter(x=>x !== null && x !== undefined).map(x=>Number(x)).filter(Number.isFinite) : []; 
      target_field.value = only_numbers.length > 0 ? Math.min(...only_numbers) : null; 
      success = true; 
    } 
    else if (target_field.type == 'date' || target_field.type == 'due_date' || target_field.type == 'due_date_time'){ 
      const only_dates: number[] = cell_values.length > 0 ? cell_values.filter(x=>x !== null && x !== undefined).map(x=>new Date(x).getTime()) : []; 
      target_field.value = only_dates.length > 0 ? new Date(Math.min(...only_dates)) : null; 
      success = true; 
    } 
    else if (target_field.type == 'form_link'){
        const only_ids: number[] = cell_values.length > 0 ? cell_values.filter(x=>x !== null && x !== undefined).map(x=>Number(x)).filter(Number.isFinite) : []; 
        const new_value = only_ids.length > 0 ? Math.min(...only_ids) : null;
        target_field.value = new_value  ?  {task_id: new_value, task_ids: [new_value], subject: "Minimal task_id"} : null; 
        success = true; 
      }
  } 
  // Максимум 
  else if (target_index == 'max'){ 
    if (target_field.type == 'number' || target_field.type == 'money'){ 
      const only_numbers: number[] = cell_values.length > 0 ? cell_values.filter(x=>x !== null && x !== undefined).map(x=>Number(x)).filter(Number.isFinite) : []; 
      target_field.value = only_numbers.length > 0 ? Math.max(...only_numbers) : null; 
      success = true; 
    } 
    else if (target_field.type == 'date'|| target_field.type == 'due_date' || target_field.type == 'due_date_time'){ 
      const only_dates: number[] = cell_values.length > 0 ? cell_values.filter(x=>x !== null && x !== undefined).map(x=>new Date(x).getTime()) : []; 
      target_field.value = only_dates.length > 0 ? new Date(Math.max(...only_dates)) : null; 
      success = true; 
    } 
    else if (target_field.type == 'form_link'){
        const only_ids: number[] = cell_values.length > 0 ? cell_values.filter(x=>x !== null && x !== undefined).map(x=>Number(x)).filter(Number.isFinite) : []; 
        const new_value = only_ids.length > 0 ? Math.max(...only_ids) : null;
        target_field.value = new_value  ?  {task_id: new_value, task_ids: [new_value], subject: "Max task_id"} : null; 
        success = true; 
      }
  } 
  // Сумма 
  else if (target_index == 'sum' && (target_field.type == 'number' || target_field.type == 'money')){ 
    const only_numbers: number[] = cell_values.length > 0 ? cell_values.filter(x=>x !== null && x !== undefined).map(x=>Number(x)).filter(Number.isFinite) : []; 
    target_field.value = only_numbers.length > 0 ? only_numbers.reduce((a, b) => a + b, 0) : null; 
    success = true; 
  } 
  // Среднее 
  else if (target_index == 'avg' && (target_field.type == 'number' || target_field.type == 'money')){ 
    const only_numbers: number[] = cell_values.length > 0 ? cell_values.filter(x=>x !== null && x !== undefined).map(x=>Number(x)).filter(Number.isFinite) : []; 
    target_field.value = only_numbers.length > 0 ? only_numbers.reduce((a, b) => a + b, 0)/only_numbers.length : null; 
    success = true; 
  } 
  // Медиана 
  else if (target_index == 'median' && (target_field.type == 'number' || target_field.type == 'money')){ 
    const only_numbers: number[] = cell_values.length > 0 ? cell_values.filter(x=>x !== null && x !== undefined).map(x=>Number(x)).filter(Number.isFinite) : []; 
    target_field.value = only_numbers.length > 0 ? ((s => s.length % 2 
          ? s[Math.floor(s.length / 2)] 
          : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) 
        )([...only_numbers].sort((a, b) => a - b)) : null; 
    success = true; 
  } 
  
  return success; 
} 
  
/** 
 * Сортирует строки таблицы `table` по набору колонок `codes` (многоуровневая сортировка), 
 * переставляя **row_id** строк 
 * Для каждого элемента codes можно указать через двоеточие, чтобы сортировка была по возрастанию. Иначе по убыванию 
 * 
 * @param {ExtendedTableRow[]} table  Значение табличного поля (строки таблицы). 
 * @param {number} table_id           ID поля-таблицы, которой принадлежит `table`. 
 * @param {string[]} codes            Список кодов колонок (в приоритетном порядке), по которым сортируем. 
 * @param {ExtendedTask} task         Текущая задача (для доступа к полям и валидациям). 
 * @returns {boolean}                 true — если отсортировано, false — если валидация не пройдена/ошибка. 
 */ 
function sort_table(table: ExtendedTableRow[], table_id: number, codes: string[], task: ExtendedTask): boolean{ 
  // Базовые проверки входных данных 
  if (!table?.length || !codes?.length) return false;  
  
  // Валидация каждого кода колонки 
  for (const code of codes){ 
    let [field_code, code_index] = split_setting_code(code); 
    let task_field = task.named_fields[field_code]; 
  
    if (!task_field) { 
      add_error(task.id, `На шаблоне формы нет поля с кодом ${field_code}`); 
      return false; 
    } 
    else if (task_field.parent_id != table_id){ 
      add_error(task.id, `Поле с кодом ${field_code} находится не в сортируемой таблице`); 
      return false; 
    } 
    else if (!["text", "number", "money", "date",'person'].includes(task_field.type)){ 
      add_error(task.id, `Тип ${task_field.type} не поддерживается в сортировке таблиц`); 
      return false; 
    } 
  } 
  
  // Сохраняем исходный порядок row_id (перестановка будет использовать именно его) 
  const originalIds = table.map(r => r.row_id); 
  // Массив индексов строк [0..N-1] — сортируем его, а не копию строк 
  const idx = table.map((_, i) => i); 
  
  // Нормализация значения ячейки к сравнимому виду 
  function toComparable(cell: FormField): { nil: boolean; kind: "text"|"number"|"date"; v: string|number } { 
    const t = cell.type as string; 
    const val: any = cell.value; 
  
    // Пустое значение → nil 
    if (val === null || val === undefined || val === "") { 
      if (t === "date")   return { nil: true, kind: "date",   v: NaN }; 
      if (t === "number" || t === "money") return { nil: true, kind: "number", v: NaN }; 
      if (t === 'person') return { nil: true, kind: "text", v: "" };
      return { nil: true, kind: "text", v: "" }; 
    } 
  
    if (t === "number" || t === "money") { 
      const n = Number(val); 
      return { nil: !Number.isFinite(n), kind: "number", v: Number.isFinite(n) ? n : NaN }; 
    } 
  
    if (t === "date") { 
      // Здесь предполагаем, что value уже Date (как это обычно приходит в серверном скрипте после fix_task) 
      const ms = val.getTime(); 
      return { nil: !Number.isFinite(ms), kind: "date", v: Number.isFinite(ms) ? ms : NaN }; 
    } 

    if (t === 'person'){
        let person_name = `${val?.last_name ? val.last_name : ''}${val?.first_name ? ' ' + val.first_name : ''}`;
        return { nil: person_name == '', kind: "text", v: person_name.toLowerCase()}; 
      }

    // Всё остальное — как текст, регистр не учитываем 
    return { nil: false, kind: "text", v: String(val).toLowerCase() }; 
  } 
  
  // Компаратор индексов строк — многоуровневый 
  const cmpIdx = (ia: number, ib: number): number => { 
    const a = table[ia], b = table[ib]; 
  
    for (const code of codes) { 
      const [field_code, code_index] = split_setting_code(code); 
  
      // Направление: truthy index → ASC, иначе DESC 
      const ascending = code_index ? true : false; 
  
      const A = toComparable(a.named_cells[field_code]); 
      const B = toComparable(b.named_cells[field_code]); 
  
      // Правило для nil: при ASC — nil раньше, при DESC — nil позже 
      if (A.nil !== B.nil) { 
        const res = A.nil ? -1 : 1;   // пустые идут первыми в ASC 
        return ascending ? res : -res; 
      } 
  
      // Обычное сравнение 
      let res = 0; 
      if (A.kind === "text" || B.kind === "text") { 
        res = String(A.v).localeCompare(String(B.v)); 
      } else { 
        const diff = (A.v as number) - (B.v as number); 
        res = diff < 0 ? -1 : diff > 0 ? 1 : 0; 
      } 
      if (res !== 0) return ascending ? res : -res; 
    } 
  
    // Полная равенство по всем ключам — сохраняем исходный порядок (стабильность) 
    return ia - ib; 
  }; 
  
  // Сортируем массив индексов согласно компаратору 
  idx.sort(cmpIdx); 
  
  // Переставляем row_id: k-й в отсортированном порядке индекс получает k-й исходный row_id 
  for (let k = 0; k < idx.length; k++) { 
    table[idx[k]].row_id = originalIds[k]; 
  } 
  
  return true; 
} 
  
/** 
 * Агрегирует данные из таблицы-источника в таблицу-цель по правилам rule.agregate_tables: 
 * 1) Группирует строки источника по уникальным колонкам (source→aim соответствия). 
 * 2) Для каждой уникальной комбинации агрегирует набор значений (min/max/sum/…) 
 *    и записывает в строку таблицы-цели (создаёт новую строку, если нужной нет). 
 * 3) Строки в целевой таблице, которые не вошли в итоговый набор — помечаются к удалению. 
 * 
 * Валидации: 
 *  - проверяет, что уникальные колонки существуют и принадлежат одной таблице-источнику/цели; 
 *  - сопоставляет типы source/aim полей; 
 *  - пропускает файловые поля для значений. 
 * 
 * @param {ExtendedClient} bot Клиент Pyrus API. 
 * @param {ExtendedTask} task Текущая задача, в контексте которой выполняется агрегация. 
 * @param {CopyRule} rule Правило, содержащее блок aggregate_tables. 
 * @param {number} rule_index Индекс правила (для читаемых сообщений об ошибках). 
 * @returns {Promise<string[]>} Список кодов полей-таблиц, которые были обновлены. 
 */ 
async function aggregate_tables(bot: ExtendedClient, task: ExtendedTask, rule: CopyRule, rule_index: number): Promise<string[]>{ 
  let updated_tables: string[] = []; 
  if (!rule.agregate_tables) return updated_tables; 
  //console.log('aggregation')
  let index = 0; 
  for (let agregate_rule of rule.agregate_tables){ 
    index += 1; 
  
    // Проверка наличия уникальных колонок и карты переносимых значений 
    if (!agregate_rule.unique_columns || Object.keys(agregate_rule.unique_columns).length == 0) { 
      add_error(task.id, `Не указаны уникальные ячейки в правиле агрегации ${index}, указанном в правиле ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""}`); 
      continue; 
    } 
    if (!agregate_rule.values || Object.keys(agregate_rule.values).length == 0) { 
      add_error(task.id, `Не указано соответствие полей для переноса в правиле агрегации ${index}, указанном в правиле ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""}`); 
      continue; 
    } 
  
    // Определяем родительские коды таблиц источника/цели и валидируем согласованность 
    let source_parent_table_code: string | undefined = undefined; 
    let aim_parent_table_code: string | undefined = undefined; 
    let was_error = false; 
  
    for (let [source, aim] of Object.entries(agregate_rule.unique_columns)){ 
      // Проверяем поля-источники/цели и их типы 
      let source_field = task.named_fields[source]; 
      if (!source_field){ 
        add_error(task.id, `На шаблоне задачи ${task.id} нет поля с кодом ${source}, указанном в правиле агрегации ${index}, указанном в правиле ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""}`); 
        was_error = true; 
        break; 
      } 
      let source_table_code = await get_parent_table_code(bot, source_field, task.form_id); 
      if (source_parent_table_code && source_parent_table_code != source_table_code){ 
        add_error(task.id, `В правиле агрегации ${index} указаны уникальные колонки из разных таблиц-источников (правило ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""})`); 
        was_error = true; 
        break; 
      } 
      if (source_table_code.includes(" ")){ 
        add_error(task.id, `${source_table_code} (правило агрегации ${index}, указанное в правиле переноса ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""})`); 
        was_error = true; 
        break; 
      } 
  
      let aim_field = task.named_fields[aim]; 
      if (!aim_field){ 
        add_error(task.id, `На шаблоне задачи ${task.id} нет поля с кодом ${aim}, указанном в правиле агрегации ${index}, указанном в правиле ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""}`); 
        was_error = true; 
        break; 
      } 
      if (source_field.type != aim_field.type){ 
        add_error(task.id, `Уникальные колонки ${source_field.name} и ${aim_field.name}, указанные в правиле агрегации ${index} из правила переноса ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""} имеют разные типы`); 
        was_error = true; 
        break; 
      } 
  
      let aim_table_code = await get_parent_table_code(bot, aim_field, task.form_id); 
      if (aim_parent_table_code && aim_parent_table_code != aim_table_code){ 
        add_error(task.id, `В правиле агрегации ${index} указаны уникальные колонки из разных таблиц-целей (правило ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""})`); 
        was_error = true; 
        break; 
      } 
      if (aim_table_code.includes(" ")){ 
        add_error(task.id, `${aim_table_code} (правило агрегации ${index}, указанное в правиле переноса ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""})`); 
        was_error = true; 
        break; 
      } 
  
      // Фиксируем коды родительских таблиц (один раз) 
      if (source_parent_table_code === undefined) source_parent_table_code = source_table_code; 
      if (aim_parent_table_code === undefined) aim_parent_table_code = aim_table_code; 
    } 
    if (was_error) continue; 
  
    // Таблицы-источник/цель 
    const source_table = task.named_fields[source_parent_table_code]; 
    let aim_table = task.named_fields[aim_parent_table_code]; 
  
    // Загрузим форму для работы с шаблонами полей 
    const form = await bot.get_form(task.form_id); 
  
    // Буферы группировок: список уникальных комбинаций и значения по каждой 
    let unique_values: Record<string, FormField>[] = []; 
    let values: Record<string, any[]>[] = []; 
  
    // Проходим строки таблицы-источника 
    for (let row of source_table.value as ExtendedTableRow[]){ 
      if (row.delete) continue; 
      let row_check = await check_row_conditions(bot, task, row, rule, rule_index); //учитываем только подходящие нам ряды  
      if (typeof row_check == 'string') {  
        add_error(task.id, row_check);  
        continue;  
      }  
      if (!row_check) continue;  
      // Собираем значения для агрегирования по карте values (source_cell_struct → aim_cell_struct) 
      let row_values: Record<string, any> = {}; 
      for (let [source_cell_struct, aim_cell_struct] of Object.entries(agregate_rule.values)){ 
        const [source_cell_code, source_cell_index] = split_setting_code(source_cell_struct); 
        const [aim_cell_code] = split_setting_code(aim_cell_struct); 
        let aim_field: FormField = copy_by_value(form.named_fields[aim_cell_code]); 
  
        // Пропускаем неподдерживаемые/несогласованные поля (файлы и т.п.) 
        if (!row.named_cells[source_cell_code] || !aim_field || aim_field.parent_id != aim_table.id || row.named_cells[source_cell_code].type == 'file' || aim_field.type == 'file') continue; 
  
        // Получаем нормализованное значение для последующей агрегации 
        const cell_value = await get_new_value(bot, row.named_cells[source_cell_code], source_cell_index, aim_field, null, task, task); 
        row_values[source_cell_struct] = cell_value; 
      } 
      if (Object.keys(row_values).length == 0) continue; 
  
      // Формируем ключ уникальной комбинации по указанным unique_columns (сохраняем значения полей) 
      let row_combo: Record<string, FormField> = {}; 
      for (let unique_field_code of Object.keys(agregate_rule.unique_columns)){ 
        row_combo[unique_field_code] = copy_by_value(row.named_cells[unique_field_code]); 
      } 
  
      // Ищем уже известную комбинацию 
      let unique_combo_idx = unique_values.findIndex(x=> !(Object.keys(x).find(y=>!same_value(x[y], row_combo[y])))); 
  
      // Если новая — инициализируем массивы значений; иначе дополняем 
      if (unique_combo_idx < 0) { 
        unique_values.push(row_combo); 
        const init: Record<string, any[]> = {}; 
        for (const k of Object.keys(row_values)) init[k] = [row_values[k]]; 
        values.push(init); 
      } else { 
        Object.keys(row_values).forEach(x=> values[unique_combo_idx][x].push(row_values[x])); 
      } 
    } 
  
    // На стороне цели: создаём/находим строки и пишем агрегаты 
    let row_ids_to_stay: number[] = []; 
    for (let unique_combo_idx in unique_values){ 
      const unique_combo = unique_values[unique_combo_idx]; 
      const new_values = values[unique_combo_idx]; 
  
      // Пытаемся найти строку в целевой таблице по соответствию уникальных колонок (source→aim) 
      let desired_row = (aim_table.value as ExtendedTableRow[]).find(x=> 
        !(Object.keys(agregate_rule.unique_columns).find(y=> !same_value(x.named_cells[agregate_rule.unique_columns[y]], unique_combo[y]))) 
      ); 
  
      // Если строки нет — создаём и переносим значения уникальных колонок в целевые ячейки 
      if (!desired_row){ 
        desired_row = await bot.add_row_to_table(aim_table.value as ExtendedTableRow[], aim_table.id, task.form_id, task.id); 
        for (let [source, aim] of Object.entries(agregate_rule.unique_columns)){ 
          desired_row.named_cells[aim].value = await get_new_value(bot, unique_combo[source], '', desired_row.named_cells[aim], '', task,task) 
        } 
      } 
  
      // Агрегируем и записываем рассчитанные значения в целевые поля 
      for (let [value_constr, new_value] of Object.entries(new_values)){ 
        const [aim_code, aim_index] = split_setting_code(agregate_rule.values[value_constr]); 
        if (aggregate_field(desired_row.named_cells[aim_code], aim_index, new_value)) updated_tables.push(aim_parent_table_code); 
      } 
  
      row_ids_to_stay.push(desired_row.row_id); 
    } 
  
    // Строки, не попавшие в результат — помечаем к удалению 
    (aim_table.value as ExtendedTableRow[]).forEach(x=> { 
      if (!row_ids_to_stay.includes(x.row_id)) { 
        x.delete = true; 
        updated_tables.push(aim_parent_table_code); 
      } 
    }); 
  } 
  
  return updated_tables; 
} 
  
/** 
 * Создаёт новую задачу или находит существующую по заданным правилам. 
 * 
 * @param {ExtendedClient} bot Клиент Pyrus API. 
 * @param {ExtendedTask} task Задача, из которой запускается правило. 
 * @param {CopyRule} rule Правило создания/поиска задачи. 
 * @param {number} rule_index Индекс правила. 
 * @param {ExtendedTableRow} [row] (опц.) Строка таблицы-источника. 
 * 
 * @returns {Promise<ExtendedTask|null>} Найденная или созданная задача, либо null. 
 */ 
async function create_absent_task( 
  bot: ExtendedClient, 
  task: ExtendedTask, 
  rule: CopyRule, 
  rule_index: number, 
  row?: ExtendedTableRow 
): Promise<ExtendedTask | null> { 
  // Получаем шаблон формы 
  const created_form = await bot.get_form(rule.form_rules.id); 
  if (!created_form){ 
     add_error(task.id, `Нет доступа к форме ${rule.form_rules.id}`); 
     return null; 
  } 
  
  // Проверяем лимит на создание задач в рамках одного запуска. Можно отключить в настройке, если уверены, что правило отрабатывает корректно 
  if (created_form.created_by_bot >= 10 && !rule.form_rules.ignore_limit) { 
    console.log("stopped_creation_over_limit"); 
    return null; 
  } 
  
  // Без фильтров поиск не будет запущен 
  if (rule.form_rules.filter_fields) { 
    const filters = []; 
    // для каждого поля запускаем формирование фильтра. Если хотя бы один фильтр не удалось создать, прерываем 
    for (const [key, value] of Object.entries(rule.form_rules.filter_fields)) { 
      const mainField = row?.named_cells[key] ? row.named_cells[key] : task.named_fields?.[key]; 
      const targetField = created_form.named_fields?.[value]; 
      if (!mainField || !targetField) { 
        add_error(task.id, `Поля, необходимые для формирования фильтра отсутствуют в формах`); 
        return null; 
      } 
      if (!mainField.value) { 
        add_error(task.id, `Не могу составить фильтр по пустому полю ${mainField.name}`); 
        return null; 
      } 
      if (mainField.type !== targetField.type) { 
        add_error(task.id, `Не поддерживается фильтрация по разным полям с разными типами: ${mainField.name}(${mainField.type}) vs ${targetField.name}(${targetField.type})`); 
        return null; 
      } 
      const filter = get_filter(mainField, targetField.id); 
      if (!filter) { 
        add_error(task.id, `Не удалось сформировать фильтр`); 
        return null; 
      } 
      filters.push(filter); 
    } 
    //console.log("Фильтры", filters); 
  
    if (filters.length) { 
      const registry_attempt = await bot.get_registry_with_fix( 
        created_form.id, 
        { filters, include_archived: rule.form_rules.include_archived ? "y" : null } 
      ); 
      if (typeof registry_attempt == 'string') { 
        add_error(task.id, `Во время поиска задачи возникла проблема: ${registry_attempt}`); 
        return null; 
      } 
      // прерываемся, если найдены дубликаты и в правиле нет указания брать последнюю созданную 
      if (registry_attempt?.length > 1 && !rule.form_rules.take_last) { 
        add_error(task.id, `Найдно более одной подходящий задачи: ${registry_attempt.map(x => `${x.id}`).join(",")}`); 
        return null; 
      } 
      if (registry_attempt.length >= 1) { 
        // Если найдена только одна задача или мы должны взять последнюю 
        let return_task = await bot.get_task(registry_attempt[0].id) as ExtendedTask; 
        let updated_codes = []; 
        //Заполняем поля ссылками на задачу-источник, чтобы установить связь 
        if (rule.form_rules.task_field_code) { 
          for (const setting_code of rule.form_rules.task_field_code) { 
            const [code, index] = split_setting_code(setting_code); 
            const target_field = copy_by_value((await bot.get_form(return_task.form_id)).named_fields?.[code]); // копия шаблона поля 
            if (!target_field) { 
              add_error(task.id, `В форме ${created_form.name} не удаётся получить поле с кодом ${code}`); 
              continue; 
            } 
            // формируем новое значение поля 
            const value = await set_task_id(bot, target_field, task, created_form.id, index); 
            if (!value) { 
              const row_info = row ? ` для строки ${row.row_id}` : ""; 
              add_error(task.id, `Не удалось сформировать номер в созданной задаче${row_info}`); 
              continue; 
            } 
            target_field.value = value; 
            const parent_table_code = await get_parent_table_code(bot, target_field,created_form.id); 
            if (parent_table_code?.includes(" ")){ 
                const row_info = row ? ` для строки ${row.row_id}` : ""; 
                add_error(task.id, `Проблема при установке ссылки на задачу вызова в созданной задаче${row_info}: ${parent_table_code}`); 
                continue; 
            } 
            // если целевое поле находится в таблице 
            if (parent_table_code) { 
              let found_row = false; 
              if ((return_task.named_fields[parent_table_code].value as ExtendedTableRow[]).length > 0) { 
                for (const return_task_row of return_task.named_fields[parent_table_code].value as ExtendedTableRow[]) { 
                  if (return_task_row.named_cells?.[code]?.value) { 
                    const tasks_in_cell = get_task_ids(return_task_row.named_cells[code], Number(index)); 
                    if (task.id && tasks_in_cell.includes(task.id)) found_row = true; 
                  } 
                } 
              } 
              if (!found_row){ 
                  let new_row = await bot.add_row_to_table( 
                    return_task.named_fields[parent_table_code].value as ExtendedTableRow[], 
                    return_task.named_fields[parent_table_code].id, 
                    created_form.id, 
                    return_task.id 
                  ); 
                  new_row.named_cells[code].value = value; 
                  updated_codes.push(parent_table_code); 
              } 
            } 
            // если целевое поле вне таблицы 
            else { 
              return_task.named_fields[code].value = value; 
              updated_codes.push(code);        
            }  
          } 
        } 
  
        // если есть поля для обновления в целевой задаче 
        if (updated_codes.length> 0){ 
            updated_codes = Array.from(new Set(updated_codes)); 
            let field_updates = updated_codes.map(x=>return_task.named_fields[x]); 
            let updated_task = await bot.comment_task(return_task.id, {field_updates: field_updates, skip_notification: rule.skip_notification}); 
            if (typeof updated_task == 'string') add_error(task.id, updated_task); 
            else return_task = updated_task;   
        } 
        return return_task; 
      } 
    } 
  } 
  
  // прерываемся, если нам надо было только найти существующую задачу, без создания новой 
  if (rule.form_rules.only_existing) { 
    return null; 
  } 
  
  // Готовим поля для создания новой задачи 
  let fields: FormField[] = []; 
  if (rule.form_rules.task_field_code) { 
    for (const set_code of rule.form_rules.task_field_code) { 
      let [code, index] = split_setting_code(set_code); 
      const target_field = created_form.named_fields?.[code]; 
      if (!target_field) { 
        add_error(task.id, `В форме ${created_form.name} не удаётся получить поле с кодом ${code}`); 
        continue; 
      } 
      const value = await set_task_id(bot, target_field, task, created_form.id, index); 
      if (!value) { 
        const row_info = row ? ` для строки ${row.row_id}` : ""; 
        add_error(task.id, `Не удалось сформировать номер для созданной задаче${row_info}`); 
        continue; 
      } 
      target_field.value = value; 
      const parent_table_code = await get_parent_table_code(bot, target_field,created_form.id); 
      if (parent_table_code?.includes(" ")){ 
        const row_info = row ? ` для строки ${row.row_id}` : ""; 
        add_error(task.id, `Проблема при установке ссылки на задачу вызова в созданной задаче${row_info}: ${parent_table_code}`); 
        continue; 
      } 
      if (parent_table_code) { 
        let table_field = copy_by_value(created_form.named_fields[parent_table_code]); 
        let new_row = await bot.add_row_to_table(table_field.value as ExtendedTableRow[], table_field.id, created_form.id, null); 
        new_row.named_cells[code] = target_field; 
        fields.push(table_field); 
      } else { 
        fields.push(target_field); 
      } 
    } 
  } 
  if (rule.form_rules.fields_on_creation) {
      const false_task: ExtendedTask = copy_by_value(created_form);
      false_task.id = 0;
      false_task.approvals = [];
      false_task.form_id = created_form.id;
      false_task.comments = [];
      false_task.named_comments = [];
      let updated_codes = await copy_fields(bot, task, false_task,rule, rule_index, row, rule.form_rules.fields_on_creation);  
      let field_updates = [];  
      for (let code of updated_codes){  
        let updated_code = code;  
        let field = false_task.named_fields[code];   
        let parent_table_code = await get_parent_table_code(bot, field,false_task.form_id);  
        if (parent_table_code && !parent_table_code.includes(" ") && !updated_codes.includes(parent_table_code)){  
          field = false_task.named_fields[parent_table_code];  
          updated_code = parent_table_code;  
        }  
        else if (parent_table_code) continue;  
        fields.push(field);  
    }  
    }
  
  const new_task = await bot.create_task({form_id: created_form.id, fields: fields, parent_task_id: task.id,fill_defaults: true});  
  if (typeof new_task == 'string') { 
    const row_info = row && row.row_id ? ` для строки ${row.row_id}` : ""; 
    add_error(task.id, `Ошибка при создании задачи${row_info} по форме ${created_form.id}:${new_task}`); 
    return null; 
  } 
  /*else if (rule.form_rules.fields_on_creation){ //если при создании нам надо заполнить какие-то поля из задачи-источника заполняем их сейчас.  
    let old_fields = copy_by_value(new_task.named_fields); 
    let updated_codes = await copy_fields(bot, task, new_task,rule, rule_index, row, rule.form_rules.fields_on_creation); 
    let field_updates = []; 
    for (let code of updated_codes){ 
      let updated_code = code; 
      let field = new_task.named_fields[code];  
      let parent_table_code = await get_parent_table_code(bot, field,new_task.form_id); 
      if (parent_table_code && !parent_table_code.includes(" ") && !updated_codes.includes(parent_table_code)){ 
        field = new_task.named_fields[parent_table_code]; 
        updated_code = parent_table_code; 
      } 
      else if (parent_table_code) continue; 
      if (old_fields[updated_code]){ 
        if (same_value(old_fields[updated_code], field)) continue; 
      } 
      field_updates.push(field); 
    } 
    if (field_updates.length > 0){ 
      let updated_task = await bot.comment_task(new_task.id, {field_updates: field_updates, skip_notification: rule.skip_notification}); 
      if (typeof updated_task == 'string'){ 
        add_error(task.id, `Ошибка переноса в созданную задачу ${task.id}: ${updated_task}`); 
      } 
    } 
  }  */
  created_form.created_by_bot += 1; 
  return new_task; 
} 
  
/** 
 * Удаление информации о задаче вызова из задач, более не связанных с ней 
 * 
 * @param {ExtendedClient} bot Клиент Pyrus API. 
 * @param {ExtendedTask} task Задача, в которой нужно очистить лишние ссылки. 
 * 
 * @returns {Promise<null|void>} Ничего не возвращает 
 */ 
async function clear_other_tasks(bot: ExtendedClient, task: ExtendedTask) { 
    let target_codes: Record<string, CopyRule[]> = {}; 
    //если вызов происходит после создания задачи, то удалять пока что неоткуда данные 
    if (task.comments.length == 1) return null; 
    //отбираем коды полей, за изменениями которых нам надо отследить 
    for (let rule of rules) { 
        if (!rule.task_table_codes || (rule.permitted_forms && !rule.permitted_forms.includes(task.form_id))) continue; 
        let [field_code, field_index] = split_setting_code(rule.target); 
        let rule_field = task.named_fields[field_code]; 
        if (!rule_field) continue; 
        let target_table_parent_code = await get_parent_table_code(bot, rule_field, task.form_id); 
        if (target_table_parent_code && !target_table_parent_code.includes(" ")) field_code = target_table_parent_code; 
        if (!target_codes[field_code]) target_codes[field_code] = [rule]; 
        else target_codes[field_code].push(rule); 
    } 
    //если правил не найдено, то пропускаем 
    if (Object.keys(target_codes).length == 0) return null; 
  
    let comments = await bot.fix_task_comments(task); 
    let last_comment = comments[comments.length - 1]; 
    //проверяем последний комментарий на наличие изменений в целевых полях 
    for (let changed_field_code of Object.keys(last_comment.named_fields_changes)) { 
        if (!target_codes[changed_field_code]) continue; 
        for (let rule of target_codes[changed_field_code]) { 
            let new_task_ids = []; 
            let prev_task_ids = []; 
            let [rule_target, rule_index] = split_setting_code(rule.target); 
  
            if (rule_target == changed_field_code) { // только для внетабличных полей   
                new_task_ids = await get_task_ids(task.named_fields[rule_target], Number(rule_index)); 
  
                for (let i = comments.length - 2; i >= 0; i--) { 
                    if (comments[i].named_fields_changes[changed_field_code]) { 
                        prev_task_ids = await get_task_ids(comments[i].named_fields_changes[changed_field_code], Number(rule_index)); 
                        break; 
                    } 
                } 
                if (prev_task_ids.length > 0) { 
                    await delete_extra_rows(bot, prev_task_ids, new_task_ids, task, rule); 
                } 
            } 
        } 
    } 
} 
  
/** 
 * Удаляет строки таблиц в задачах, которые больше не связаны с задачей вызова. 
 * 
 * @param {ExtendedClient} bot Клиент Pyrus API. 
 * @param {number[]} old_task_ids Список ID старых задач. 
 * @param {number[]} new_task_ids Список актуальных ID задач. 
 * @param {ExtendedTask} source_task Исходная задача (владелец ссылки). 
 * @param {CopyRule} rule Правило с кодами таблиц для очистки. 
 * 
 * @returns {Promise<void>} Ничего не возвращает. 
 */ 
async function delete_extra_rows(  
    bot: ExtendedClient,  
    old_task_ids: number[],  
    new_task_ids: number[],  
    source_task: ExtendedTask,  
    rule: CopyRule  
) {  
    for (let old_task_id of old_task_ids) {  
        if (new_task_ids.includes(old_task_id)) continue;  
        let delete_in_task = source_task; 
        let deleted_task_id = old_task_id; 
        if (!rule.reverse){ 
          let old_task = await bot.get_task(old_task_id);  
          if (typeof old_task == 'string') continue; 
          delete_in_task = old_task; 
          deleted_task_id = source_task.id; 
          } 
        let updated_codes = [];  
    
        for (let code of rule.task_table_codes ?? []) {  
            let [field_code, field_index] = split_setting_code(code);  
            let table_code = await get_parent_table_code(bot, delete_in_task.named_fields[field_code], delete_in_task.form_id);  
    
            if (!table_code || !(delete_in_task.named_fields[table_code]?.value as ExtendedTableRow[]).length) continue;  
    
            for (let row of delete_in_task.named_fields[table_code].value as ExtendedTableRow[]) {  
                let row_task_ids = get_task_ids(row.named_cells[field_code], Number(field_index));  
                if (row_task_ids.length == 1 && deleted_task_id == row_task_ids[0]) {  
                    row.delete = true;  
                    updated_codes.push(table_code);  
                }  
            }  
        }  
    
        if (updated_codes.length == 0) continue;  
    
        updated_codes = Array.from(new Set(updated_codes));  
    
        let updated_task = await bot.comment_task(delete_in_task.id, {  
            field_updates: updated_codes.map(x => (delete_in_task as ExtendedTask).named_fields[x])  
        });  
    
        if (typeof updated_task == 'string') {  
            add_error(source_task.id, `Ошибка при удалении строк из таблиц старой задачи ${delete_in_task.id}: ${updated_task}`);  
        }  
    }  
}  
  
/** 
 * Формирует объект фильтра для поиска задач в реестре по значению поля. 
 * 
 * @param {FormField} field Поле формы, из которого берётся значение фильтра. 
 * @param {number} target_id ID целевого поля в форме, по которому будет фильтрация. 
 * 
 * @returns {FormFilter|null} Объект фильтра или null, если поле пустое или тип не поддерживается. 
 */ 
function get_filter(field: FormField, target_id: number): FormFilter | null { 
  switch (field.type) { 
    case "text": 
      return { 
        field_id: target_id, 
        operator_id: OperatorId.Equals, 
        values: [`eq.${field.value}`] 
      }; 
    case "email": 
    case "phone": 
    case "checkmark": 
    case "number": 
    case "money": 
      return { 
        field_id: target_id, 
        operator_id: OperatorId.Equals, 
        values: [String(field.value)] 
      }; 
  
    case "multiple_choice": 
      if (field.value?.choice_ids?.length) { 
        return { 
          field_id: target_id, 
          operator_id: OperatorId.IsIn, 
          values: field.value.choice_ids.map(String) 
        }; 
      } 
      return null; 
  
    case "catalog": 
      if (field.value?.item_ids?.length) { 
        return { 
          field_id: target_id, 
          operator_id: OperatorId.IsIn, 
          values: field.value.item_ids.map(String) 
        }; 
      } 
      return null; 
  
    case "person": 
      if (field.value?.id !== undefined) { 
        return { 
          field_id: target_id, 
          operator_id: OperatorId.Equals, 
          values: [String(field.value.id)] 
        }; 
      } 
      return null; 
  
    case "form_link": 
      if (field.value?.task_id !== undefined) { 
        return { 
          field_id: target_id, 
          operator_id: OperatorId.Equals, 
          values: [String(field.value.task_id)] 
        }; 
      } 
      return null; 
  
    case "date": 
    case 'due_date_time': 
    case 'due_date': 
    case 'creation_date': 
      if (field.value) { 
        let dateStr: string; 
        if (typeof field.value === "string") { 
          dateStr = field.value; 
        } else if (field.value instanceof Date) { 
          dateStr = field.value.toISOString().slice(0, 10); 
        } else { 
          return null; 
        } 
        return { 
          field_id: target_id, 
          operator_id: OperatorId.Equals, 
          values: [dateStr] 
        }; 
      } 
      return null; 
  
    default: 
      return null; 
  } 
} 
  
/** 
 * Проверяет задачу на прохождение по правилам. Возможно добавление кастомных проверок 
 * 
 * @param {ExtendedClient} bot Клиент Pyrus API. 
 * @param {ExtendedTask} task Задача для проверки. 
 * @param {CopyRule} rule Правило с условиями. 
 * @param {number} rule_index Индекс правила (для сообщений об ошибках). 
 * @returns {Promise<boolean|string>} true/false либо текст ошибки. 
 */ 
async function check_task_conditions( 
  bot: ExtendedClient, 
  task: ExtendedTask, 
  rule: CopyRule, 
  rule_index: number 
): Promise<boolean | string> { 
  try{ 
    let user_check = await check_user_conditions(bot, task, rule, rule_index); 
    if (typeof user_check == 'string') 
      return `При проверке пользовательского условия в правиле ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""} возникла ошибка: ${user_check}`; 
    if (!user_check) return false; 
  } 
  catch (error){ 
      console.log(error); 
      return `Не удалось провести пользовательскую проверку в правиле ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""}` 
    } 
  if (!rule.conditions) return true; 
  
  let rule_conditions = rule.conditions; 
  for (let key of Object.keys(rule_conditions)) { 
    let [field_code, index] = split_setting_code(key); 
    let field = task.named_fields[field_code]; 
    if (!field) 
      return `На шаблоне формы нет поля с кодом ${field_code}, указанном в условиях правила ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""}`; 
    const target_parent_field = await get_parent_table_code(bot,field,task.form_id);
    if (target_parent_field) return `В правиле  ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""} указано табличное поле ${field.name}`;
    if (!Array.isArray(rule_conditions[key])) return `Условия на поля в правиле ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""} записаны некорректно. Укажите массив для поля ${key}`; 
    for (let condition of rule_conditions[key]) { 
      let condition_to_check = {value: condition.value, operator: condition.operator}
      if (typeof condition.value == 'string' && condition.value.slice(0, 1) == '!'){
          const [condition_code, condition_index] = split_setting_code(condition.value.replace("!", ""));
          if (!task.named_fields[condition_code]) return `В правиле для поля ${field.name} указан код ${condition_code}, для которого нет поля на шаблоне`;
          const target_parent_field = await get_parent_table_code(bot,task.named_fields[condition_code],task.form_id);
          if (target_parent_field.includes(" ")) return `Ошибка в правиле для поля ${field.name}: ${target_parent_field}`;
          else if (!target_parent_field) condition_to_check.value = get_value_for_condition(task.named_fields[condition_code], condition_index);
          else{
              const condition_table = task.named_fields[target_parent_field].value as ExtendedTableRow[] ?? [];
              let condition_values = [];
              for (const condition_row of condition_table){
                  const row_check = await check_row_conditions(bot, task, condition_row, rule, rule_index, field_code);
                  if (typeof row_check == 'string') return row_check;
                  if (!row_check) continue;
                  condition_values.push(get_value_for_condition(condition_row.named_cells[condition_code], condition_index));
                }
              let cell = task.named_fields[condition_code];
              let false_field: FormField = {id: cell.id, type: cell.type, value: null}
              const aggregated_value = aggregate_field(false_field, condition_index, condition_values);
              if (!aggregated_value) return `При проверке условия для поля ${field.name} в правиле ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""} не удалось получить значение для сравнения из колонки ${cell.name} таблицы ${task.named_fields[target_parent_field].name}`;
              else condition_to_check.value = false_field.value;
            }
        }
      
      let result = check_condition(field, condition_to_check, index); 
      if (typeof result == 'string') 
        return `При проверке условия для поля ${field.name} в правиле ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""} возникла ошибка: ${result}`; 
      if (!result) return false; 
    } 
  } 
  return true; 
} 
  
/** 
 * Проверяет условия для строки таблицы (row) по правилу. 
 * 
 * @param {ExtendedClient} bot Клиент Pyrus API. 
 * @param {ExtendedTask} task Задача, к которой относится строка. 
 * @param {ExtendedTableRow} row Строка таблицы для проверки. 
 * @param {CopyRule} rule Правило с табличными условиями. 
 * @param {number} rule_index Индекс правила (для сообщений). 
 * @returns {Promise<boolean|string>} true/false либо текст ошибки. 
 */ 
async function check_row_conditions( 
  bot: ExtendedClient, 
  task: ExtendedTask, 
  row: ExtendedTableRow, 
  rule: CopyRule, 
  rule_index: number,
  from_code?:string 
): Promise<boolean | string> { 
  try{ 
    let user_row_check = await check_user_row_conditions(bot, task, row, rule, rule_index); 
    if (typeof user_row_check == 'string') 
      return `При проверке пользовательского условия для строк в правиле ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""} возникла ошибка: ${user_row_check}`; 
    if (!user_row_check) return false; 
    } 
  catch (error){ 
      console.log(error); 
      return `Не удалось провести пользовательскую проверку для строк в правиле ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""}` 
    } 
  
  if (!rule.table_conditions) return true; 
  for (let key of Object.keys(rule.table_conditions)) { 
    let [field_code, index] = split_setting_code(key); 
    let field = row.named_cells[field_code]; 
    if (!field) continue; 
  
    for (let condition of rule.table_conditions[key]) { 
      let condition_to_check = {value: condition.value, operator: condition.operator}
      if (typeof condition.value == 'string' && condition.value.slice(0, 1) == '!'){
          const [condition_code, condition_index] = split_setting_code(condition.value.replace("!", ""));
          if (condition_code == from_code) return true;
          if (!task.named_fields[condition_code]) return `В правиле для поля ${field.name} указан код ${condition_code}, для которого нет поля на шаблоне`;
          const target_parent_field = await get_parent_table_code(bot,task.named_fields[condition_code],task.form_id);
          if (target_parent_field.includes(" ")) return `Ошибка в правиле для поля ${field.name}: ${target_parent_field}`;
          else if (!target_parent_field) condition_to_check.value = get_value_for_condition(task.named_fields[condition_code], condition_index);
          else{
              const condition_table = task.named_fields[target_parent_field].value as ExtendedTableRow[] ?? [];
              let condition_values = [];
              for (const condition_row of condition_table){
                  const row_check = await check_row_conditions(bot, task, condition_row, rule, rule_index, field_code);
                  if (typeof row_check == 'string') return row_check;
                  if (!row_check) continue;
                  condition_values.push(get_value_for_condition(condition_row.named_cells[condition_code], condition_index));
                }
              let cell = task.named_fields[condition_code];
              let false_field: FormField = {id: cell.id, type: cell.type, value: null}
              const aggregated_value = aggregate_field(false_field, condition_index, condition_values);
              if (!aggregated_value) return `При проверке условия для поля ${field.name} в правиле ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""} не удалось получить значение для сравнения из колонки ${cell.name} таблицы ${task.named_fields[target_parent_field].name}`;
              else condition_to_check.value = false_field.value;
            }
        }
      let result = check_condition(field, condition_to_check, index); 
      if (typeof result == 'string') 
        return `При проверке условия для поля ${field.name} в правиле ${rule_index+1}${rule.comment ? ` (${rule.comment})` : ""} возникла ошибка: ${result}`; 
      if (!result) return false; 
    } 
  } 
  return true; 
} 
  
/** 
 * Сравнивает значения двух полей формы на идентичность. 
 * 
 * @param {FormField} old_field Поле с исходным значением. 
 * @param {FormField} new_field Поле с новым значением. 
 * @returns {boolean|string} true/false или текст ошибки, если сравнение невозможно. 
 */ 
function same_value(old_field: FormField, new_field: FormField): boolean | string { 
  if (old_field.type != new_field.type) return "Сравнение разных типов не поддерживается"; 
  if (old_field.type != 'checkmark' && old_field.type != 'multiple_choice' && 
      ((old_field.value === null && new_field.value !== null) || (old_field.value !== null && new_field.value === null))) return false; 
  if (old_field.type != 'checkmark' && old_field.type != 'multiple_choice' && 
      (old_field.value === null && new_field.value === null)) return true; 
  switch (new_field.type) { 
    case 'text': 
    case 'number': 
    case 'money': 
    case 'phone': 
    case 'email': 
      return new_field.value === old_field.value; 
  
    case 'multiple_choice': //пустое значение может быть представлено как значением null, так и выбранным пустым значением 
      if (!old_field.value && (!new_field.value || new_field.value.choice_ids.includes(0))) return true; 
      return check_condition(old_field, { value: new_field.value.choice_names, operator: "equal" }, null); 
  
    case 'catalog': 
      return check_condition(old_field, { value: new_field.value.rows.map(x => x[0]), operator: "equal" }, null); 
  
    case 'checkmark': 
      if (!old_field.value) old_field.value = 'unchecked'; 
      if (!new_field.value) new_field.value = 'unchecked'; 
      return check_condition(old_field, { value: new_field.value, operator: "equal" }, null); 
  
    case 'form_link': 
      return check_condition(old_field, { value: new_field.value.task_id.toString(), operator: "equal" }, null); 
  
    case 'date': 
    case 'due_date': 
    case 'due_date_time': 
      return check_condition(old_field, { value: new_field.value.toISOString().slice(0, 10), operator: "equal" }, null) 
        && new_field.value.getHours() == (old_field.value as Date).getHours() && new_field.value.getMinutes() == (old_field.value as Date).getMinutes(); 
  
    case 'time': 
      return new_field.value === old_field.value; 
  
    case 'person': 
      return old_field.value ? (old_field.value as Person).id == new_field.value.id : !new_field.value; 
  
    case 'file': 
      const old_value = old_field.value as AttachedFile[]; 
      if (new_field.value.length != old_value.length) return false; 
      if (new_field.value.find(x => x.id === null)) return false; 
  
    case 'table': 
      if ((old_field.value as ExtendedTableRow[]).length != new_field.value.length) return false; 
      let one_change = false; 
      for (let row of new_field.value as ExtendedTableRow[]) { 
        if (row.delete || row.added_now) return false; 
        let old_row = (old_field.value as ExtendedTableRow[]).find(x => x.row_id == row.row_id); 
        if (!old_row) return false; 
        for (let cell of row.cells ?? []) { 
          let old_cell = old_row.cells.find(x => x.id == cell.id); 
          if (!old_cell) return false; 
          let same_cell = same_value(old_cell, cell); 
          if (!same_cell) one_change = true; 
        } 
      } 
      return !one_change; 
  
    default: 
      console.log("used default", new_field); //если есть такой лог, значит, какой-то кейс не был учтён 
      return false; 
  } 
} 
  

function get_value_for_condition(field: FormField, index: string): string | number | string[] | Date | null{
    if (field.value === null || field.value === undefined) return null;
    const simple_types = ['text', 'checkmark', 'number', 'money', 'date', 'due_date_time', 'due_date', 'creation_date'];
    if (simple_types.includes(field.type)) return field.value as string | number | string[] | Date | null;
    else if (field.type == 'multiple_choice') return field.value.choice_names;
    else if (field.type == 'catalog') {
        let column_index = index && index != '' ? index : 0;
        return column_index < field.value.rows[0].length 
          ? field.value.rows.map(x => x[column_index]) 
          : []; 
      }
    else if (field.type == 'form_link') return String(field.value.task_id);
    else return null;
  }

/** 
 * Проверяет, соответствует ли значение поля заданному условию. 
 * 
 * @param {FormField} field Поле формы для проверки. 
 * @param {{value?: any, operator: "equal"|"not_equal"|"include"|"not_include"|"empty"|"not_empty"|"larger"|"less"}} condition Объект условия. 
 * @param {string|null} index Индекс (для таблиц/справочников), либо null. 
 * @returns {boolean|string} true/false или текст ошибки. 
 */ 
function check_condition( 
  field: FormField, 
  condition: { value?: any, operator: "equal" | "not_equal" | "include" | "not_include" | "empty" | "not_empty" | "larger" | "less" }, 
  index: string | null 
): boolean | string { 
  let field_value = field.value; 
  let aim_value = condition.value; 
  let operator = condition.operator; 
  let result = false; 
  let error: boolean | string = false; 
  
  if (!operator) return "Нет оператора для условия"; 
  let special_empty_types = ['checkmark', "multiple_choice", "number", "text"]; 
  
  if (operator == 'empty' && !special_empty_types.includes(field.type)) { 
    return field_value ? false : true; 
  } 
  if (operator == 'not_empty' && !special_empty_types.includes(field.type)) { 
    return field_value ? true : false; 
  } 
  
  switch (field.type) { 
    case 'text': 
      switch (operator) { 
        case 'equal': if (field.value == aim_value) result = true; break; 
        case 'not_equal': if (field.value != aim_value) result = true; break; 
        case 'include': if (field.value.includes(aim_value)) result = true; break; 
        case 'not_include': if (!field.value.includes(aim_value)) result = true; break; 
        case 'empty': if (!field.value || field.value == '') result = true; break; 
        case 'not_empty': if (field.value && field.value != '') result = true; break; 
        default: error = true; break; 
      } 
      break; 
  
    case 'multiple_choice': 
      let options = field.value?.choice_names ?? []; 
      let aim_options = []; 
      if (Array.isArray(aim_value) && !aim_value.find(x => typeof x != 'string')) { 
        aim_options = aim_value; 
      } else if (typeof aim_value == 'string') aim_options = [aim_value]; 
      aim_options = aim_options.map(x => x.trim()); 
      options = options.map(x => x.trim()); 
  
      switch (operator) { 
        case 'equal': 
          if (options.length != aim_options.length) result = false; 
          else result = options.every(option => aim_options.includes(option)); 
          break; 
        case 'not_equal': 
          if (options.length != aim_options.length) result = true; 
          else result = options.some(option => !aim_options.includes(option)); 
          break; 
        case 'include': 
          result = options.some(option => aim_options.includes(option)); 
          break; 
        case 'not_include': 
          result = !options.some(option => aim_options.includes(option)); 
          break; 
        case 'empty': 
          if (options.length == 0 || options[0] == 'Не выбрано') result = true; 
          break; 
        case 'not_empty': 
          if (options.length > 0 && options[0] != 'Не выбрано') result = true; 
          break; 
        default: error = true; break; 
      } 
      break; 
  
    case 'checkmark': 
      let aim_check = aim_value == 'Да' || aim_value == 'checked' ? 'checked' : 'unchecked'; 
      switch (operator) { 
        case 'equal': if (field.value == aim_check) result = true; break; 
        case 'not_equal': if (field.value != aim_check) result = true; break; 
        case 'empty': if (field.value == 'unchecked' || !field.value) result = true; break; 
        case 'not_empty': if (field.value == 'checked') result = true; break; 
        default: error = true; break; 
      } 
      break; 
  
    case 'catalog': 
      let column = index ? Number(index) : 0; 
      if (field.value && column >= field.value.rows[0].length) { 
        error = 'В справочнике меньше колонок чем указано в правиле'; 
      } else { 
        let column_values = field.value && column < field.value.rows[0].length 
          ? field.value.rows.map(x => x[column]) 
          : []; 
        let aim_options = Array.isArray(aim_value) && !aim_value.find(x => typeof x != 'string') 
          ? aim_value 
          : typeof aim_value == 'string' 
            ? [aim_value] 
            : []; 
        switch (operator) { 
          case 'equal': 
            if (column_values.length != aim_options.length) result = false; 
            else result = column_values.every(option => aim_options.includes(option)); 
            break; 
          case 'not_equal': 
            if (options.length != column_values.length) result = true; 
            else result = column_values.some(option => !aim_options.includes(option)); 
            break; 
          case 'include': 
            result = column_values.some(option => aim_options.includes(option)); 
            break; 
          case 'not_include': 
            result = !column_values.some(option => aim_options.includes(option)); 
            break; 
          default: error = true; break; 
        } 
      } 
      break; 
  
    case 'form_link': 
      let task_id = field.value ? field.value.task_id : null; 
      let aim_task_ids = aim_value ? aim_value.split(",").map(x => Number(x)) : []; 
      switch (operator) { 
        case 'equal': if (aim_task_ids.includes(task_id)) result = true; break; 
        case 'not_equal': if (!aim_task_ids.includes(task_id)) result = true; break; 
        case 'empty': if (!task_id) result = true; break; 
        case 'not_empty': if (task_id) result = true; break; 
        default: error = true; break; 
      } 
      break; 
  
    case 'number': 
    case 'money': 
      let field_number = field.value ? Number(field.value) : 0; 
      let aim_number = aim_value ? Number(aim_value) : 0; 
      if (isNaN(aim_number)) error = 'Не удаётся преобразовать целевое значение в число'; 
      else { 
        switch (operator) { 
          case 'equal': if (field_number == aim_number) result = true; break; 
          case 'not_equal': if (field_number != aim_number) result = true; break; 
          case 'larger': if (field_number > aim_number) result = true; break; 
          case 'less': if (field_number < aim_number) result = true; break; 
          case 'empty': if (!field.value && field_value !== 0) result = true; break; 
          case 'not_empty': if (field_value != null) result = true; break; 
          default: error = true; break; 
        } 
      } 
      break; 
  
    case 'date': 
    case 'due_date_time': 
    case 'due_date': 
    case 'creation_date': 
      if (!index) { 
        let aim_date = aim_value ? (aim_value instanceof Date ? aim_value : parseDate(aim_value)) : null;
        if (aim_value && !aim_date) error = 'Не удаётся преобразовать целевое значение в дату'; 
        else { 
          switch (operator) { 
            case 'equal': if (isSameDate(field.value, aim_date)) result = true; break; 
            case 'not_equal': if (!isSameDate(field.value, aim_date)) result = true; break; 
            case 'larger': if (aim_date && field.value && normalizeDate(field.value) > normalizeDate(aim_date)) result = true; break; 
            case 'less': if (aim_date && field.value && normalizeDate(field.value) < normalizeDate(aim_date)) result = true; break; 
            default: error = true; break; 
          } 
        } 
      } 
    else {
        let aim_number = aim_value ? Number(aim_value) : 0;
        let field_number = null;
        if (isNaN(aim_number)) error = 'Не удаётся преобразовать целевое значение в число'; 
        else if (field.value) { 
          switch (index){
              case 'Y': field_number = field.value.getFullYear(); break;
              case 'Y2': field_number = field.value.getFullYear()%100; break;
              case 'M': field_number = field.value.getMonth(); break;
              case 'D': field_number = field.value.getDate(); break;
              case 'WD': field_number = field.value.getDay() ? field.value.getDay() : 7; break;
              default: error = `Индекс ${index} не поддерживается для поля Дата`; break;
            }
          }
        if (!error){
          switch (operator) { 
            case 'equal': if (field_number && field_number == aim_number) result = true; break; 
            case 'not_equal': if (field_number != aim_number) result = true; break; 
            case 'larger': if (field_number > aim_number) result = true; break; 
            case 'less': if (field_number < aim_number) result = true; break; 
            case 'empty': if (!field.value) result = true; break; 
            case 'not_empty': if (field_value !== null) result = true; break; 
            default: error = true; break; 
          }
        }
      }
        break; 
    default: 
      error = `Тип поля ${field.type} не поддерживается`; 
      break; 
  } 
  
  if (typeof error == 'string') return error; 
  else if (error) return `Для типа ${field.type} не поддерживается оператор ${operator}`; 
  else return result; 
} 
  
/** 
 * Определяет коды полей в целевой таблице для переноса данных. 
 * 
 * Возвращает массив из трёх элементов: 
 * 1. `task_link_code`  — код колонки для ссылки на задачу в целевой таблице (или null, если не найдено) 
 * 2. `task_link_index` — индекс колонки (если есть) для ссылки на задачу (или null) 
 * 3. `row_id_code`     — код колонки для номера ряда (если требуется, иначе null) 
 * 
 * 
 * @param {ExtendedClient} bot                Клиент для работы с API Pyrus. 
 * @param {CopyRule} rule                      Правило копирования, содержащее коды колонок. 
 * @param {ExtendedTask} source_task           Исходная задача (используется для логирования ошибок). 
 * @param {FormField} target_table_field       Поле-таблица в целевой форме. 
 * @param {number} target_form_id              ID целевой формы. 
 * @param {boolean} [need_row=false]           Нужно ли определять код колонки для номера ряда. 
 * @returns {Promise<[string|null, string|null, string|null]>} 
 *   Массив из `task_link_code`, `task_link_index`, `row_id_code`. 
 */ 
async function get_target_codes( 
  bot: ExtendedClient, 
  rule: CopyRule, 
  source_task: ExtendedTask, 
  target_table_field: FormField, 
  target_form_id: number, 
  need_row: boolean = false 
): Promise<[string | null, string | null, string | null]> { 
  // Результаты поиска кодов 
  let task_link_code: string | null = null;   // Код колонки для ссылки на задачу 
  let task_link_index: string | null = null;  // Индекс этой колонки 
  let row_id_code: string | null = null;      // Код колонки для номера ряда (если нужен) 
  
  // Если в правиле нет настроек для переноса в таблицы — сразу пишем ошибку и выходим 
  if (!rule.task_table_codes?.length) { 
    add_error(source_task.id, `Не переданы настройки для переноса в табличные поля ${rule.comment ? ` в правиле ${rule.comment})` : ""}`); 
    return [task_link_code, task_link_index, row_id_code]; 
  } 
  
  // Загружаем схему целевой формы 
  const target_form = await bot.get_form(target_form_id); 
  // Ищем среди task_table_codes тот, что относится к нашей целевой таблице 
  for (const table_code of rule.task_table_codes) { 
    const [code, index] = split_setting_code(table_code);
    // Проверяем, что поле с этим кодом действительно принадлежит нужной таблице 
    if (target_form.named_fields[code]?.parent_id === target_table_field.id) { 
      task_link_code = code;   // Сохраняем код колонки 
      task_link_index = index; // И её индекс 
      break; 
    } 
  } 
  
  // Если код ссылки на задачу так и не нашли — ошибка 
  if (!task_link_code) { 
    add_error(source_task.id, `В таблице ${target_table_field.name} не удалось установить колонку для ссылки на задачу`); 
    return [task_link_code, task_link_index, row_id_code]; 
  } 
  
  // Если требуется определять колонку для номера ряда 
  if (need_row) { 
    // Проверяем, переданы ли настройки для переноса между таблицами 
    if (!rule.codes_for_tables?.length) { 
      add_error(source_task.id, "Не переданы настройки для переноса из таблиц в таблицы"); 
      return [task_link_code, task_link_index, row_id_code]; 
    } 
  
    // Ищем подходящий код для номера ряда 
    for (const code of rule.codes_for_tables) { 
      if (target_form.named_fields[code]?.parent_id === target_table_field.id) { 
        row_id_code = code; 
        break; 
      } 
    } 
  
    // Если колонка для номера ряда не найдена — ошибка 
    if (!row_id_code) { 
      add_error(source_task.id, `В таблице ${target_table_field.name} не удалось установить колонку для номера ряда`); 
      return [task_link_code, task_link_index, row_id_code]; 
    } 
  } 
  
  // Возвращаем найденные коды (часть из них может быть null, если не требовались) 
  return [task_link_code, task_link_index, row_id_code]; 
} 
  
/** 
 * Ищет (или создаёт) строки целевой таблицы, связанные с исходной задачей/строкой. 
 * 
 * @param {ExtendedClient} bot Клиент Pyrus API. 
 * @param {CopyRule} rule Правило копирования (с настройками таблиц). 
 * @param {ExtendedTask} source_task Исходная задача (от которой строится связь). 
 * @param {FormField} target_table_field Табличное поле в целевой задаче. 
 * @param {ExtendedTask} target_task Целевая задача, где ищем/создаём строки. 
 * @param {ExtendedTableRow} [source_row] (опц.) Строка-источник; если передана — ищется конкретный ряд. 
 * @returns {Promise<ExtendedTableRow[]>} Найденные строки; если нет — созданная строка; иначе пустой массив. 
 */ 
async function get_row( 
  bot: ExtendedClient, 
  rule: CopyRule, 
  source_task: ExtendedTask, 
  target_table_field: FormField, 
  target_task: ExtendedTask, 
  source_row?: ExtendedTableRow 
): Promise<ExtendedTableRow[]> { 
  
  // Определяем коды колонок в целевой таблице: 
  // task_link_code / task_link_index — колонка (и её индекс) для ссылки на задачу-источник 
  // row_id_code — колонка с идентификатором ряда (нужна, если ищем конкретную строку по source_row) 
  let [task_link_code, task_link_index, row_id_code] = await get_target_codes( 
    bot, rule, source_task, target_table_field, target_task.form_id, Boolean(source_row) 
  ); 
  
  // Если нет кода ссылки или нужен row_id_code, но его нет — вернуть пусто 
  if (!task_link_code || (source_row && !row_id_code)) return []; 
  
  let desired_rows: ExtendedTableRow[] = []; 
  
  // Проходим существующие строки таблицы и ищем связанные с source_task 
  for (let row of target_table_field.value as ExtendedTableRow[]) { 
    // Получаем список task_id, записанных в колонке-ссылке 
    let row_task_ids = get_task_ids(row.named_cells[task_link_code], Number(task_link_index)); 
    if (!row_task_ids.includes(source_task.id)) continue; 
  
    // Если ищем конкретную строку (по source_row) — сравниваем по колонке row_id_code 
    if (source_row) { 
      if (source_row.row_id != row.named_cells[row_id_code].value) continue; 
      return [row]; // точное совпадение найдено 
    } 
  
    // Иначе копим все строки, привязанные к source_task 
    desired_rows.push(row); 
  } 
  
  // Если подходящих строк нет — создаём новую 
  if (desired_rows.length == 0) { 
    let desired_row = await bot.add_row_to_table( 
      target_table_field.value as ExtendedTableRow[], 
      target_table_field.id, 
      target_task.form_id, 
      target_task.id 
    ); 
  
    // Проставляем ссылку на исходную задачу в колонке task_link_code 
    desired_row.named_cells[task_link_code].value = await set_task_id(bot, desired_row.named_cells[task_link_code], source_task, target_task.id); 
  
    // Если передана строка-источник — проставляем её row_id в колонку row_id_code 
    if (source_row) { 
      desired_row.named_cells[row_id_code].value = source_row.row_id; 
    } 
    desired_rows.push(desired_row); 
  } 
  
  return desired_rows; 
  } 
  
/** 
 * Разделяет строку настроек кода на "код" и "индекс". 
 *  
 * Формат входных данных: 
 * - "fieldCode:index" → ["fieldCode", "index"] 
 * - "fieldCode"       → ["fieldCode", null] 
 * 
 * @param {string} code Код настройки (может содержать индекс через двоеточие). 
 * @returns {[string, string | null]} Кортеж: [основной код, индекс или null]. 
 */ 
function split_setting_code(code: string): [string, string | null] { 
  //в настройках код и индекс должны быть разделены двоеточием  
  if (code.includes(":")) { 
    const [mainCode, index] = code.split(":"); 
    return [mainCode.trim(), index.trim()]; 
  } 
  return [code, null]; 
} 
  
/** 
 * Получает код родительской таблицы для указанного поля формы. 
 *  
 * @param {ExtendedClient} bot Экземпляр клиента для работы с API. 
 * @param {FormField} field Поле формы, для которого ищем родительскую таблицу. 
 * @param {number} form_id ID формы, в которой находится поле. 
 * @returns {Promise<string | null>} Код родительской таблицы или сообщение об ошибке/`null`, если таблица не найдена. 
 */ 
async function get_parent_table_code(bot: ExtendedClient, field: FormField, form_id: number): Promise<string> { 
    // Если у поля нет родителя — возвращаем null, так как это точно нетабличное поле 
    if (!field.parent_id) return null; 
    let parent_id = field.parent_id; 
    let task_form = await bot.get_form(form_id); 
    // Пробуем найти код родительского поля по ID через словарь 
    let parent_code = task_form.id_to_code[parent_id]; 
  
    if (!parent_code) { 
        // Если код не найден — ищем объект поля в общем списке, чтобы удостовериться, что это не таблица 
        let parent_field = task_form.all_fields.find(x => x.id == parent_id); 
        // Если поле-родитель таблица — возвращаем сообщение об отсутствии кода, иначе это точно внетабличное поле 
        return parent_field.type == 'table' ? `У таблицы ${parent_field.name} нет кода` : null; 
    } else { 
        let parent_field = task_form.named_fields[parent_code]; 
        // Возвращаем код, только если это таблица 
        return parent_field.type == 'table' ? parent_code : null; 
    } 
} 
  
/** 
 * Извлекает список ID задач из поля формы. 
 *  
 * @param {FormField} field Поле формы, из которого нужно достать ID задач. 
 * @param {number} [index] Индекс колонки (для типа "catalog"), из которой нужно брать значения. 
 * @returns {number[] | null} Массив уникальных ID задач или null, если тип поля не поддерживается. 
 */ 
function get_task_ids(field: FormField, index?: number): number[] { 
    // Если значение пустое — возвращаем пустой массив 
    if (!field.value) return []; 
    let task_ids = []; 
    if (field.type == 'text' && field.value != '') { 
        // Разделяем текст по строкам, затем по запятой, убираем префикс ссылки и приводим к числу 
        let lines = field.value.split("\n").map(x=>x.trim()); 
        for (let line of lines){ 
          let links = line.split(","); 
          task_ids.push(...links.map(x => Number(x.replace("https://pyrus.com/t#id", "").trim()))); 
          } 
  
    } else if (field.type == 'number') { 
        task_ids = [field.value]; 
  
    } else if (field.type == 'form_link') { 
        // Для ссылки на задачу берём массив task_ids напрямую 
        task_ids = field.value.task_ids; 
  
    } else if (field.type == 'catalog') { 
        // Если колонка не указана — берём первую 
        if (!index) index = 0; 
  
        // Если колонок меньше, чем указано в index — возвращаем null 
        if (field.value.rows[0].length <= index) task_ids = null; 
        else { 
            // Извлекаем значения указанной колонки 
            let column_values = field.value.rows.map(x => x[index]); 
  
            // Собираем все ссылки из ячеек, разделённых запятыми 
            let links = []; 
            for (let column_value of column_values) { 
                let column_links = column_value.split(","); 
                links.push(...column_links); 
            } 
  
            // Преобразуем ссылки в числовые ID 
            task_ids = links.map(x => Number(x.replace("https://pyrus.com/t#id", "").trim())); 
        } 
  
    } else return null; 
  
    // Возвращаем только уникальные значения 
    return Array.from(new Set(task_ids)); 
} 
  
  
/** 
 * Устанавливает значение в поле формы, соответствующее ID задачи. 
 *  
 * @param {ExtendedClient} bot Клиент для работы с API. 
 * @param {FormField} field Поле формы, в которое нужно записать ссылку на задачу или её ID. 
 * @param {ExtendedTask} task Задача, ID которой нужно установить. 
 * @param {number} form_id ID формы, содержащей поле. 
 * @param {string} [header] Заголовок (для Справочника) 
 * @returns {Promise<FormLink | string | Catalog | number | null>} Значение для поля в нужном формате. 
 */ 
async function set_task_id( 
    bot: ExtendedClient, 
    field: FormField, 
    task: ExtendedTask, 
    form_id: number, 
    header?: string 
): Promise<FormLink | string | Catalog | number> { 
  
    if (field.type === "form_link") { 
        // Формируем объект ссылки на задачу 
        return { task_id: task.id, subject: task.subject, task_ids: [task.id] }; 
    } 
  
    if (field.type === "text") { 
        // Возвращаем ссылку в текстовом виде 
        return `https://pyrus.com/t#id${task.id}`; 
    } 
    else if (field.type == 'number') { 
        // Для числового поля — просто ID задачи 
        return task.id; 
    } 
  
    if (field.type === "catalog") { 
        // Для Справочника необходимо получить метаданные поля 
        let field_with_info = field as FormFieldCatalog; 
  
        if (!field.info) { 
            // Если информации о поле нет — загружаем её из формы 
            let form = await bot.get_form(form_id); 
            field_with_info = form.all_fields.find(x => x.id == field.id) as FormFieldCatalog; 
        } 
  
        // Получаем значение для Справочника по ID задачи 
        return get_values_for_catalog(bot, task.id, field_with_info.info, header); 
    } 
  
    // Если тип поля не поддерживается — возвращаем null 
    return null; 
} 
  
/** 
 * Получает элементы Справочника по заданным значениям. 
 *  
 * @param {ExtendedClient} bot Клиент для работы с API Pyrus. 
 * @param {string | number | string[] | number[]} values Значения для поиска в Справочнике (могут быть числовые или текстовые значения). 
 * @param {FormFieldInfo} field_info Информация о поле, содержащем данные о Справочнике (включая ID Справочника). 
 * @param {string} [index] Опциональный индекс колонки для поиска значений в Справочнике. 
 * @returns {Promise<Catalog | null>} Объект Справочника с найденными элементами или null, если элементы не найдены. 
 */ 
async function get_values_for_catalog( 
    bot: ExtendedClient, 
    values: string | number | string[] | number[], 
    field_info: FormFieldInfo, 
    index?: string 
): Promise<Catalog> { 
  
    // Загружаем весь Справочник по его ID 
    let catalog = await bot.get_catalog(field_info.catalog_id); 
    // Приводим входные значения к массиву строк 
    let values_to_find: string[] = []; 
    if (Array.isArray(values)) { 
        values_to_find = values.map(x => String(x)); 
    } else { 
        values_to_find = [String(values)]; 
    } 
  
    // Если Справочник вернулся как строка (ошибка) — выводим в консоль и выходим 
    if (typeof catalog == 'string') { 
        console.log(catalog); 
        return null; 
    } 
  
    // Если Справочник пустой — возвращаем null 
    if (!(catalog?.items.length > 0)) return null; 
  
    // Определяем индекс колонки для поиска (по умолчанию 0) 
    const column_index = index && !isNaN(Number(index)) ? Number(index) : 0; 
  
    // Здесь будут храниться найденные элементы 
    let desired_items = []; 
  
    // Ищем элементы по каждому значению 
    for (let value of values_to_find) { 
        let items_for_value = catalog.items.filter(x => 
            x.values[column_index].includes(value) 
        ); 
        if (items_for_value.length > 0) { 
            desired_items.push(...items_for_value); 
        } 
    } 
  
    // Убираем дубликаты по ID элемента 
    desired_items = Array.from(new Map(desired_items.map(item => [item.id, item])).values()); 
  
    // Если ничего не найдено — возвращаем null 
    if (desired_items.length == 0) return null; 
  
    // Если найден 1 элемент или в поле доступен мультивыбор 
    if (desired_items.length == 1 || (desired_items.length > 1 && field_info.multiple_choice)) { 
        let result: Catalog = { 
            item_id: null, 
            item_ids: [], 
            item_names: [], 
            rows: [], 
            values: [] 
        }; 
  
        for (let item of desired_items) { 
            result.item_id = item.item_id; 
            result.item_ids.push(item.item_id); 
            result.item_names.push(item.values[0]); 
            result.rows.push(item.values); 
            result.values = item.values; 
        } 
  
        return result; 
    } 
  
    // Если найдено несколько элементов, но в поле недоступен мультивыбор 
    return null; 
} 
  
/** 
 * Формирует список согласований задачи в удобном для поиска виде. 
 * 
 * @param {ExtendedTask} task Объект задачи 
 * @returns {Record<number, Record<string, string>>} 
 *    Внешний ключ (number) — номер этапа (начиная с 1), нумерация с 1. 
 *    Внутренний ключ (string) — уникальный идентификатор участника в формате "тип_ID". Чтобы отличить пользователя от бота 
 *    Значение (string) — статус согласования этапа 
 */ 
function prepare_approval_list(task: ExtendedTask): Record<number, Record<string, string>> { 
    // Инициализируем пустой результат 
    let result: Record<number, Record<number, string>> = {}; 
  
    // Если в задаче нет согласований — возвращаем пустой объект 
    if (!task.approvals) return result; 
  
    // Перебираем шаги согласования 
    for (let step_num = 0; step_num < task.approvals.length; step_num++) { 
        // Перебираем участников на текущем шаге 
        for (let person of task.approvals[step_num]) { 
            // Если в результате ещё нет этого шага — создаём пустой объект 
            //Нумерация этапов идёт с 1 
            if (!result[step_num + 1]) { 
                result[step_num + 1] = {}; 
            } 
  
            // Формируем ключ участника: "<тип>_<ID>" 
            // и сохраняем его выбор согласования 
            result[step_num + 1][`${person.person.type}_${person.person.id}`] = person.approval_choice; 
        } 
    } 
    // Возвращаем собранную структуру 
    return result; 
}  
  
/** 
 * Определяет новое значение для целевого поля на основе значения из поля-источника, поддерживая преобразования между типами 
 * 
 * 
 * @param {ExtendedClient} bot Клиент Pyrus Api 
 * @param {FormField} source_field поле или ячейка таблицы, из которой берётся значение 
 * @param {string} source_index Индекс/модификатор для источника (напр., индекс колонки Справочника) 
 * @param {FormField} target_field поле или ячейка таблицы, в которую переносится значение 
 * @param {string} target_index Индекс/модификатор для цели 
 * @param {ExtendedTask} target_task задача цель 
 * @param {ExtendedTask} source_task задача-источник 
 * @param {string} [column_code]       Код колонки таблицы (для файлов в таблицах) 
 * @param {number} [source_row_id]     ID строки-источника (для файлов в таблицах) 
 * @returns {Promise<string|number|Date|MultipleChoice|Catalog|Person|FormLink|(AttachedFile[] & NewFile[])|ProjectArray|ExtendedTableRow[]|null>} Новое значение 
 */ 
async function get_new_value( 
  bot: ExtendedClient,  
  source_field: FormField,  
  source_index: string,  
  target_field: FormField,  
  target_index: string,  
  target_task: ExtendedTask,  
  source_task: ExtendedTask,  
  column_code?: string, 
  source_row_id?: number 
): Promise<string | number | Date | MultipleChoice | Catalog | Person | FormLink | (AttachedFile[] & NewFile[]) | ProjectArray | ExtendedTableRow[]>{ 
  // Если целевое поле имеет тип Выбор, то пустое значение в него заносится специальным способом 
  if ((source_field.value === null || source_field.value === undefined) && target_field.type != 'multiple_choice') return null; 
  
  const field_value = source_field.value; 
  const shiftTime = (t: string, h: number) => `${((+t.slice(0,2)+h+24)%24)}`.padStart(2,"0")+":"+t.slice(3);   
  // Одинаковые типы (кроме спецтипов) — отдаём как есть 
  if (source_field.type === target_field.type && !["catalog", "date", "time", "due_date", "due_date_time", "file", "multiple_choice"].includes(source_field.type)) { 
    return copy_by_value(field_value); 
  } 
  
  // Получаем расширенную информацию о целевом поле и словарь опций для поле типа Выбор 
  let target_form_field: FormField =  (await bot.get_form(target_task.form_id)).all_fields.find(x=>x.id == target_field.id); 
  let target_field_options = await bot.get_multiple_choice_dict(target_form_field.info?.code, null, target_task.form_id); 
  
  // Получаем расширенную информацию об исходном поле 
  let source_form_field: FormField = (await bot.get_form(source_task.form_id)).all_fields.find(x=>x.id == source_field.id); 
  
  // --- TEXT --- 
  if (source_field.type === "text") { 
    //Может быть перенос в поля типа Текст, Справочник, Форма, Число/Деньги, Выбор 
    if (target_field.type === "text") return source_field.value; 
  
    else if (target_field.type === "catalog") 
      return await get_values_for_catalog(bot, String(field_value), target_form_field.info, target_index); 
  
    // Если в строке одна ссылка/число 
    else if (target_field.type === "form_link" && typeof field_value === "string" && !field_value.includes(",")) { 
      const task_id = (field_value.match(/\d+/) || [""])[0]; 
      if (task_id !== "") return {task_ids: [Number(task_id)], task_id: Number(task_id), subject: field_value }; 
    } 
  
    else if (target_field.type === "number" || target_field.type === "money") { 
      const val =String(field_value).replace(",", "."); 
      const num = parseFloat(val); 
      return isNaN(num) ? null : num; 
    } 
  
    else if (target_field.type === "multiple_choice") { 
      const choice_id = target_field_options[String(field_value)]; 
      if (choice_id) return { choice_ids: [choice_id], choice_names: [source_field.value], choice_id: choice_id}; 
      else return {choice_ids: [0], choice_names: ["Не выбрано"], choice_id: 0} 
    } 
  } 
  
  // --- FORMLINK --- 
  else if (source_field.type === "form_link") { 
    //Может быть перенос в поля типа Текст (ссылка или Заголовок), Число, Справочник 
    // В текст — имя задачи, если source_index === "name" 
    if (target_field.type === "text") { 
        if (source_index === "name") return source_field.value.subject; 
        else if (source_index === "int") return String(source_field.value.task_id); 
        else return `https://pyrus.com/t#id${source_field.value.task_id}`; 
    } 
    else if (target_field.type === "number") return source_field.value.task_id; 
    else if (target_field.type === "catalog"){ 
        return await set_task_id(bot, target_field, {id: source_field.value.task_id, subject: source_field.value.subject} as ExtendedTask, Number(target_index)); 
    } 
  } 
  
  // --- CATALOG --- 
  else if (source_field.type === "catalog" && typeof field_value === "object") { 
    //Может быть перенос в поля типа Справочник, Текст, Форма, Выбор, Галочка, Число/Деньги, Дата/Срок, Телефон, Email, Контакт 
    // Без индекса: если Справочники совпадают — возвращаем как есть 
    if (!source_index) { 
      if (target_field.type === "catalog" && source_form_field.info.catalog_id === target_form_field.info.catalog_id) 
        return source_field.value; 
    } else { 
      // С индексом колонки s_index 
      const s_index = typeof source_index === "string" ? parseInt(source_index) : source_index; 
  
      // Справочник → текст (склеиваем значения колонки) 
      if (target_field.type === "text") { 
        return source_field.value.rows.map((x: any) => x[s_index]).join(", "); 
      } 
  
      // Справочник → form_link (одна строка и одно значение-URL/ID без запятой) 
      else if (target_field.type === "form_link" && source_field.value.rows.length === 1 && typeof source_field.value.rows[0][s_index] === "string" && !source_field.value.rows[0][s_index].includes(",")) { 
        const task_id = (source_field.value.rows[0][s_index].match(/\d+/) || [""])[0]; 
        if (task_id !== "") return { task_id: Number(task_id) }; 
      } 
  
      // Справочник → multiple_choice по сопоставлению названий 
      else if (target_field.type === "multiple_choice") { 
        let choice_ids = []; 
        let choice_names = []; 
        let deleted_choice_ids = target_form_field.info.options.filter(x=>x.deleted).map(x=>x.choice_id) 
        for (let catalog_row of source_field.value?.rows ?? []){ 
          const choice_id = target_field_options[catalog_row[s_index]]; 
          if (!choice_id && choice_id !== 0 && !deleted_choice_ids.includes(choice_id)) continue; 
          choice_names.push(catalog_row[s_index]); 
          choice_ids.push(choice_id); 
          } 
        if (choice_ids.length > 0) return target_form_field.info.display_as > 1 ?  { choice_ids: choice_ids, choice_names: choice_names } : {choice_ids: [choice_ids[0]], choice_names: [choice_names[0]]}; 
        else return {choice_ids: [0], choice_names: ["Не выбрано"], choice_id: 0} 
      } 
  
      // Справочник → Галочка (одно значение) 
      else if ( 
        target_field.type === "checkmark" && 
        source_field.value.rows.length === 1 && 
        source_field.value.rows[0][s_index] !== "" 
      ) { 
        const val = String(source_field.value.rows[0][s_index]).toLowerCase(); 
        if (["true", "1", "checked", "да"].includes(val)) return "checked"; 
        if (["false", "0", "unchecked", "нет"].includes(val)) return "unchecked"; 
      } 
  
      // Справочник → Число/Деньги (одно значение) 
      else if ((target_field.type === "number" || target_field.type === "money") &&source_field.value.rows.length === 1) { 
        if (source_field.value.rows[0][s_index] === "") return null; 
        const column_value = String(source_field.value.rows[0][s_index]).replace(",", "."); 
        const num = parseFloat(column_value); 
        return isNaN(num) ? null : num; 
      } 
  
      // Справочник → Дата/Срок 
      else if (["date", "due_date", "due_date_time"].includes(target_field.type) && source_field.value.rows.length === 1) { 
        return parseDate(source_field.value.rows[0][s_index]); 
      } 
  
      // Справочник → Телефон 
      else if (target_field.type == 'phone' && source_field.value.rows.length === 1){ 
        return source_field.value.rows[0][s_index]; 
        } 
  
      // Справочник → email (поддержка ID → список email’ов) 
      else if (target_field.type === "email") { 
        let result = ""; 
        for (const row of source_field.value.rows) { 
          const column_value = row[s_index]; 
          if (!column_value) continue; 
          if (/^\d+(;\d+)*$/.test(column_value)) { //если это колонка маршрутизации 
            for (let id_in_column of column_value.split(";")){ 
              const emails = await get_emails(bot, Number(id_in_column)); 
              result += emails ? emails + "," : ""; 
            } 
          } else if (/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/.test(column_value)) { 
            result += column_value + ","; 
          } 
        } 
        return result ? result.slice(0, -1) : ""; 
      } 
  
      // Справочник → person (значение — id или email) 
      else if (target_field.type === "person" && source_field.value.rows.length === 1) { 
        const cell = source_field.value.rows[0][s_index]; 
        if (cell) { 
          if (/^\d+$/.test(cell)) return await get_user(bot, { id: Number(cell) }); //только если один пользователь в колонке маршрутизации 
          else return await get_user(bot, { email: cell }); 
        } 
      } 
    } 
  } 
  
  // --- MULTIPLE CHOICE --- 
  else if (source_field.type === "multiple_choice") { 
    //Может быть перенос в поля типа Выбор, Текст, Справочник 
    // Выбор → Выбор (по совпадению вариантов выбора) 
    if (target_field.type === "multiple_choice") { 
      if (!source_field.value) return {choice_ids: [0], choice_names: ["Не выбрано"], choice_id: 0} 
      let choice_ids: number[] = []; 
      let choice_names: string[] = []; 
      if (source_field.value.choice_names) { 
        let deleted_choice_ids = target_form_field.info.options.filter(x=>x.deleted).map(x=>x.choice_id) 
        for (let choice_name of source_field.value.choice_names){ 
          const choice_id = target_field_options[choice_name]; 
          if (!choice_id && choice_id !== 0 && !deleted_choice_ids.includes(choice_id)) continue; 
          choice_names.push(choice_name); 
          choice_ids.push(choice_id); 
          } 
      } 
      if (choice_ids.length > 0) return target_form_field.info.display_as > 1 ?  { choice_ids: choice_ids, choice_names: choice_names } : {choice_ids: [choice_ids[0]], choice_names: [choice_names[0]]}; 
      else return {choice_ids: [0], choice_names: ["Не выбрано"], choice_id: 0}; 
    } 
  
    // Выбор → Текст 
    else if (target_field.type === "text" && source_field.value?.choice_names) { 
      return source_field.value.choice_names.join(", "); 
    } 
  
    // Выбор → Справочник 
    else if (target_field.type === "catalog" && target_index) { 
      return await get_values_for_catalog(bot, source_field.value.choice_names, target_form_field.info, target_index); 
    } 
  } 
  
  // --- CHECKMARK --- 
  else if (source_field.type === "checkmark") { 
    //Может быть перенос в поля типа Текст, Число, Выбор 
    // Галочка → текст (поддержка локализации и форматов) 
    if (target_field.type === "text") { 
      if (source_index && typeof source_index === "string") { 
        if (source_index.toLowerCase() === "да") return field_value === "checked" ? "Да" : "Нет"; 
        if (source_index.toLowerCase() === "yes") return field_value === "checked" ? "Yes" : "No"; 
        if (source_index === "1") return field_value === "checked" ? "1" : "0"; 
      } 
      return field_value === "checked" ? "checked" : "unchecked"; 
    } 
    // Галочка → число 
    else if (target_field.type === "number") return field_value === "checked" ? 1 : 0; 
  
    // Галочка → multiple_choice ("Да"/"Нет") 
    else if (target_field.type === "multiple_choice") { 
      if (field_value === "checked") { 
        if (target_field_options["Да"]) return { choice_ids: [target_field_options["Да"]], choice_names: ["Да"] }; 
        if (target_field_options["Yes"]) return { choice_ids: [target_field_options["Yes"]], choice_names: ["Yes"] }; 
        return {choice_ids: [0], choice_names: ["Не выбрано"], choice_id: 0}; 
      } 
      if (field_value === "unchecked") { 
        if (target_field_options["Нет"]) return { choice_ids: [target_field_options["Нет"]], choice_names: ["Нет"] }; 
        if (target_field_options["No"]) return { choice_ids: [target_field_options["No"]], choice_names: ["No"] }; 
        return {choice_ids: [0], choice_names: ["Не выбрано"], choice_id: 0}; 
      } 
    } 
  } 
  
  // --- MONEY & NUMBER --- 
  else if (source_field.type === "money") { 
    if (target_field.type === "number") return source_field.value; 
    else if (target_field.type === "text") return String(field_value); 
  } 
  else if (source_field.type === "number") { 
    if (target_field.type === "money") return source_field.value; 
    else if (target_field.type === "text") return String(field_value); 
    else if (target_field.type == 'person'){ 
        let user = await get_user(bot, {id: source_field.value}); 
        return user ? user : null; 
      } 
    else if (target_field.type == 'time'){ 
        const timezone = source_index && Number(source_index) ? Number(source_index) : 0; 
         return `${((Math.floor(source_field.value/60 - timezone) % 24 + 24) % 24)}`.padStart(2,"0") + ":" + `${source_field.value%60}`.padStart(2,"0"); 
      }  
  } 
  
  // --- DATE & DUE_DATE --- 
  else if (["due_date", "due_date_time", "date", "creation_date"].includes(source_field.type)) { 
    //Может быть перенос в поля типа Даты/Срок, Текст 
    // Даты → даты 
    if (["due_date", "due_date_time", "date"].includes(target_field.type)){ 
        return copy_by_value(field_value); 
      } 
    // Даты → текст (разные форматы вывода) 
    else if (target_field.type === "text") { 
      if (source_index == 'Y') 
          return (source_field.value as Date).getFullYear().toString(); 
      else if (source_index == 'Y2') 
          return (source_field.value as Date).getFullYear().toString().slice(-2); 
      else if (source_index == 'M') 
          return  String((field_value as Date).getMonth() + 1).padStart(2, "0"); 
      else if (source_index == 'RU') 
          return (field_value as Date).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: 'numeric' }); 
      else return  (field_value as Date).toISOString().slice(0, 10); 
    } 
    else if (target_field.type == 'number') {
       if (source_index == 'Y') 
          return (source_field.value as Date).getFullYear(); 
      else if (source_index == 'Y2') 
          return Number((source_field.value as Date).getFullYear().toString().slice(-2)); 
      else if (source_index == 'M') 
          return  (field_value as Date).getMonth() + 1; 
      else return (source_field.value as Date).getTime(); 
      }
    else if (target_field.type == 'time'){
        return (field_value as Date).toTimeString().slice(0, 5)
      }
  } 
  
  // --- TIME --- 
  else if (source_field.type === "time") { 
    //Может быть перенос в поля типа Время, Текст (с учётом тайзоны) и Число (количество минут с учётом таймзоны)  
    if (target_field.type === "time") {  
      if (typeof field_value === "string") return field_value;  
      else if (field_value instanceof Date)  
        return field_value.toTimeString().slice(0, 5);  
    } 
    else if (target_field.type == 'text'){ 
        const timezone = source_index && Number(source_index) ? Number(source_index) : 0; 
        return shiftTime(source_field.value, timezone); 
      } 
    else if (target_field.type == 'number'){ 
        const timezone = source_index && Number(source_index) ? Number(source_index) : 0; 
        const new_time = shiftTime(source_field.value, timezone); 
        return +new_time.slice(0,2)*60 + +new_time.slice(3); 
      } 
    else if (["due_date", "due_date_time", "date", "creation_date"].includes(target_field.type) && target_field.value){
        (target_field.value as Date).setHours(+source_field.value.slice(0,2));
        (target_field.value as Date).setMinutes(+source_field.value.slice(3));
        return target_field.value as Date;
      }
  }  
  
  // --- PHONE --- 
  else if (source_field.type === "phone") { 
    //Может быть перенос в поля типа Текст, Справочник 
    if (target_field.type === "text") return "+" + field_value; 
    else if (target_field.type === "catalog") 
      return await get_values_for_catalog(bot, source_field.value, target_field.info, target_index); 
  } 
  
  // --- EMAIL --- 
  else if (source_field.type === "email") { 
    //Может быть перенос в поля типа Текст, Справочник, Контакт 
    if (target_field.type === "text") return source_field.value; 
    else if (typeof field_value === "string" && field_value.split(",").length === 1 && target_field.type === "person") 
      return await get_user(bot, { email: field_value }); 
    else if (target_field.type === "catalog") 
      return await get_values_for_catalog(bot, source_field.value, target_field.info, target_index); 
  } 
  
  // --- PERSON & AUTHOR --- 
  else if (source_field.type === "person" || source_field.type === "author") { 
    //Может быть перенос в поля типа Контакт, Число, Эл. почта, Справочник, Текст 
    if (target_field.type === "text") 
      return `${source_field.value.first_name} ${source_field.value.last_name}`; 
    else if (target_field.type == 'number'){ 
      return source_field.value.id; 
      } 
    else if (target_field.type === "email") 
      return await get_emails(bot, source_field.value.id); 
    else if (target_field.type === "catalog") 
      return await get_values_for_catalog(bot, source_field.value.id, target_field.info, target_index); 
    else if (target_field.type === "person") return copy_by_value(field_value); 
  } 
  
  // --- STEP --- 
  else if (source_field.type === "step"){ 
    //Может быть перенос в поля типа Число, Текст 
   if (target_field.type === "number") return source_field.value; 
   else if (target_field.type == 'text'){ 
      const step_name = (await bot.get_form(source_task.form_id))?.steps[source_field.value]; 
      if (step_name){ 
          return source_index == 'full' ? `${field_value}: ${step_name}` : step_name; 
        } 
    } 
  } 
  
  // --- FILE --- 
  else if (source_field.type == 'file'){ 
      if (target_field.type == 'file'){ 
          // Перенос файлов (с учётом версий на основе комментариев) 
          let new_value = await prepareFileField(bot, source_task,target_field,source_field,source_row_id, column_code); 
          if (new_value) return new_value; //если вернулся null, то обновлений не было 
        } 
    } 
  
  // Если ни один сценарий не подошёл — возвращаем null 
  return null; 
}   
  
  
/** 
 * Переносит/обновляет вложенные файлы из поля-источника в целевое поле. 
 * Учитывает md5 предыдущих версий, чтобы повышать версию или пропускать дубликаты. 
 * Обновляет target_field сразу, а не просто готовит значение. 
 * 
 * @param {ExtendedClient} bot клиент Pyrus API 
 * @param {ExtendedTask} source_task задача источник. Важно наличие всех комментариев 
 * @param {FormField} target_field поле-цель 
 * @param {FormField} source_field поле источник 
 * @param {number} [source_row_id] если поле-источник является ячейкой таблицы 
 * @param {string} [column_code] код колонки таблицы, если поле-источник это ячейка или вся колонка таблицы 
 * @returns {Promise<AttachedFile[]|null>} возвращается полное новое значение поля если были обновления. Если обновлений не было, всегда вернётся null. 
 */ 
async function prepareFileField( 
        bot: ExtendedClient, 
        source_task: ExtendedTask,  
        target_field: FormField,  
        source_field: FormField,  
        source_row_id?: number,  
        column_code?: string 
    ): Promise<AttachedFile[]> { 
        const filesToAdd: { file: AttachedFile; prev_md5: string[] }[] = []; 
        let source_form = await bot.get_form(source_task.form_id); 
        let source_code = source_form.id_to_code[source_field.id]; 
  
        // Collect files from the source_field based on parameters 
        if (!column_code && typeof source_row_id !== "number") { 
            // Source is a simple file field (not a table) 
            if (!source_field.value) { 
                return null; 
            } 
            for (const fileObj of source_field.value as any[]) { 
                const prevMd5List = await getPreviousMd5(bot,source_task, fileObj.root_id, fileObj.id, source_code); 
                filesToAdd.push({ file: fileObj, prev_md5: prevMd5List }); 
            } 
        } 
        else if (typeof source_row_id === "number") { 
            // Источник — конкретная строка таблицы 
            let source_parent_code =  await get_parent_table_code(bot, source_field, source_task.form_id); 
            for (const fileObj of source_field.value as any[]) { 
                const prevMd5List = await getPreviousMd5(bot,source_task, fileObj.root_id, fileObj.id, source_parent_code, column_code, source_row_id); 
                filesToAdd.push({ file: fileObj, prev_md5: prevMd5List }); 
            } 
        } 
        else { 
            // Источник вся колонка таблицы. В таком случае source_row_id = null | undefined, а column_code строка 
            if (!source_field.value) { 
                return null; 
            } 
            for (const row of source_field.value as ExtendedTableRow[]) { 
                const cell = row.named_cells[column_code]; 
                if (!cell.value) continue; 
                for (const fileObj of cell.value as any[]) { 
                    const prevMd5List = await getPreviousMd5(bot, source_task, fileObj.root_id, fileObj.id, source_code, column_code, row.row_id); 
                    filesToAdd.push({ file: fileObj, prev_md5: prevMd5List }); 
                } 
            } 
        } 
  
        if (filesToAdd.length === 0) { 
            // Поле-источник пустое 
            return null; 
        } 
  
          
        if (!target_field.value) { 
            target_field.value = []; 
        } 
        let wereChanges = false; 
  
        // Проверка каждого файла 
        for (const fileEntry of filesToAdd) { 
            const fileObj = fileEntry.file; 
            const prevMd5List = fileEntry.prev_md5; 
            let newFile: AttachedFile = null; 
            let skipFile = false; 
  
            // Проверяем уже существующие файлы. Ищем совпадения по md5 (тогда не надо добавлять новый файл) и по предыдущим md5 (тогда наш файл является новой версией) 
            for (const existingFile of target_field.value as AttachedFile[]) { 
                if (existingFile.md5 === fileObj.md5) { 
                    // Такой файл уже есть в выборке, обновлять нет необходимости 
                    skipFile = true; 
                    break; 
                } 
                if (prevMd5List.includes(existingFile.md5)) { //новая версия уже приложенного файла 
                  newFile = {...existingFile, id: null, url: fileObj.url, version: existingFile.version + 1, root_id: existingFile.root_id ?? existingFile.id} 
                    } 
            }  
  
            if (skipFile) { 
                continue;  
            } 
            if (!newFile) { //не нашли ни такого файла, ни ранних версий 
                newFile = {...fileObj, id: null, root_id: null, version: 1 }; 
            } 
            // Меняем изначальное поле 
            (target_field.value as AttachedFile[]).push(newFile); 
            wereChanges = true; 
        } // end for fileEntry 
  
        if (wereChanges) { 
            return target_field.value as AttachedFile[]; 
        } 
        return null; //если не было изменений возвращаем Null, даже если изначально в целевом поле были значения 
    } 
  
  
/** 
 * Собирает список md5 предыдущих версий файла по истории комментариев задачи. 
 * Нужен для понимания, является ли текущий файл новой версией уже существующего. 
 * 
 * @param {ExtendedClient} bot клиент Pyrus API 
 * @param {ExtendedTask} task задача источник. Важно наличие всех комментариев 
 * @param {number} root_id id первоначального файла 
 * @param {number} file_id Id искомого файла 
 * @param {string} field_code код поля, из которого ищем файл  (или таблицы-родителя) 
 * @param {string} [column_code] код колонки, если поле-источник табличное 
 * @param {number} [row_id] Номер ряда. Если поле-источник табличное, обязательный параметр 
 * @returns {Promise<string[]>} список md5 предыдущих версий 
 */ 
async function getPreviousMd5( 
        bot: ExtendedClient, 
        task: ExtendedTask,  
        root_id: number,  
        file_id: number,  
        field_code: string,  
        column_code?: string, 
        row_id?: number 
    ): Promise<string[]> { 
        const md5List: string[] = []; 
        if (!root_id) { // нет root_id - не будет предыдущих версий 
            return md5List; 
        } 
        // Prepare extended comments with field change data 
        const comments: ExtendedTaskComment[] = await bot.fix_task_comments(task); 
        for (let i = comments.length - 1; i >= 0; i--) { 
            const comment = comments[i]; 
            if (!comment.named_fields_changes[field_code]) { 
                continue; 
            } 
            const fieldChange = comment.named_fields_changes[field_code]; 
            if (column_code) { 
                // Field is a table: iterate through each row of this field’s value in the comment 
                if (!fieldChange.value) continue; 
                for (const row of fieldChange.value as ExtendedTableRow[]) { 
                    if (row.row_id != row_id) continue; 
                    const cell = row.named_cells[column_code]; 
                    if (!cell?.value) continue; 
                    for (const fileObj of cell.value as AttachedFile[]) { 
                        if ((fileObj.root_id === root_id || fileObj.id === root_id)  
                            && fileObj.id !== file_id) { 
                            md5List.push(fileObj.md5); 
                        } 
                    } 
                } 
            } else { 
                // Regular file field (not in a table) 
                if (!fieldChange.value) continue; 
                for (const fileObj of fieldChange.value as AttachedFile[]) { 
                    if ((fileObj.root_id === root_id || fileObj.id === root_id)  
                        && fileObj.id !== file_id) { 
                        md5List.push(fileObj.md5); 
                    } 
                } 
            } 
        } 
        return md5List; 
    } 
   
  
/** 
 * Возвращает строку email-адресов по ID пользователя/роли. 
 * Если передан ID роли — собирает email всех участников этой роли. 
 * 
 * @param {ExtendedClient} bot клиент Pyrus API 
 * @param {number} id id пользователя или роли 
 * @returns {Promise<string>} почты. Если был передан id роли, вернутся все почты участников роли 
 */ 
async function get_emails(bot: ExtendedClient, id: number): Promise<string> { 
  if (!id) return ""; 
  const profile = await bot.get_profile(); 
  const persons = profile.organization?.persons || []; 
  const roles = profile.organization?.roles || []; 
  
  // Пытаемся найти как person 
  const person = persons.find(p => p.id === id); 
  if (person) { 
    return person.email || ""; 
  } 
  
  // Пытаемся найти как роль 
  const role = roles.find(r => r.id === id); 
  if (!role || !role.member_ids?.length) return ""; 
  
  const memberEmails = persons 
    .filter(p => role.member_ids.includes(p.id)) 
    .map(p => p.email) 
    .filter(Boolean); 
  
  return memberEmails.join(","); 
} 
  
  
/** 
 * Возвращает объект Person по email или id. 
 * Если передан email со списком (через запятую) — возвращает null. 
 * 
 * @param {ExtendedClient} bot 
 * @param {{email?: string, id?: number}} должно быть передано или email пользователя, или его id 
 * @returns {Promise<Person|null>} 
 */ 
async function get_user(bot: ExtendedClient,{ email, id }: { email?: string; id?: number }): Promise<Person | null> { 
  if (!email && id == null) return null; 
  
  if (email) { 
    const profile = await bot.get_profile(); 
    const persons = profile.organization?.persons ?? []; 
    if (email.includes(",")) return null; // если это список email — игнорируем 
    const person = persons.find(p => p.email?.toLowerCase() === email.toLowerCase()); 
    return person ?? null; 
  } 
else if (id != null){ 
    let search_result = await bot.get_info_by_id(id); 
    return search_result[id] ?? null; 
  } 
  
  return null; 
} 
  
  
/** 
 * Глубокое копирование значения (включая Date и вложенные структуры). 
 * Возвращает новое значение, не связанное с исходным по ссылке. 
 * 
 * @param {any} value 
 * @returns {any} 
 */ 
function copy_by_value(value: any): any{ 
    if (value === null)return null; 
    else if (value === undefined) return undefined;  
    else if (typeof value != 'object') return value; 
    else if (value instanceof Date || Object.prototype.toString.call(value) === '[object Date]') return new Date(value.getTime()); 
    else if (Array.isArray(value)){ 
        let result = []; 
        for (let item of value){ 
            result.push(copy_by_value(item)); 
          } 
        return result; 
      } 
    else { 
        const result = Object.create(Object.getPrototypeOf(value)); 
        for (const key of Object.keys(value)) { 
          result[key] = copy_by_value((value as any)[key]); 
        } 
        return result; 
      } 
  } 
  
  
/** 
 * Возвращает разницу во времени между двумя датами в секундах. 
 * 
 * @param {Date|number} date1 
 * @param {Date|number} date2 
 * @returns {number} 
 */ 
function get_time_seconds(date1, date2){    
    return Math.floor((date2 - date1)/1000)    
  }    
  
  
/** 
 * Нормализует дату до полуночи (обнуляет время).  
 * Используется для сравнения двух дат с игнорированием времени 
 * 
 * @param {Date} d 
 * @returns {Date|null} 
 */ 
function normalizeDate(d: Date): Date {  
  if (!d) return null;  
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());  
}  
    
  
/** 
 * Сравнивает две даты без учёта времени. 
 * 
 * @param {Date|null} a 
 * @param {Date|null} b 
 * @returns {boolean} 
 */ 
function isSameDate(a: Date, b: Date): boolean {  
  if ((!b && a) || (a && !b)) return false;  
  if (!a && !b) return true;  
  return normalizeDate(a).getTime() == normalizeDate(b).getTime();  
}  
  
  
/** 
 * Парсит строку в объект Date. 
 * Поддерживаемые форматы: "DD.MM.YYYY" и "YYYY-MM-DD". 
 * 
 * @param {string} input 
 * @returns {Date|null} 
 */ 
function parseDate(input: string): Date | null { 
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(input)) { 
    const [dd, mm, yyyy] = input.split("."); 
    return new Date(Number(yyyy), Number(mm) - 1, Number(dd)); 
  } 
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) { 
    return new Date(input); 
  } 
  return null; 
} 
    
/**  
 * Правила копирования данных между задачами и таблицами. 
 */ 
type CopyRule = { 
    /** Необязательно, для логирования ошибок и читаемости настроек */ 
    comment?: string; 
    /** Массив из id форм, к которым будет применяться правило. Если не указан, правило применяется ко всем */ 
    permitted_forms?: number[];  
    /** Код поля с целевой задачей */ 
    target: string; 
    /** Условия переноса для задачи. Действует только для внетабличных полей */ 
    conditions?: Record<string, { 
        value?: any;  
        operator: "equal" | "not_equal" | "include" | "not_include" | "empty" | "not_empty" | "larger" | "less"; 
    }[]>; 
  
    /** Правила соответствия полей между собой. Ключ - поле-источник, значение - одно или несколько полей  целей */ 
    relations: Record<string, string|string[]>; // Соответствие кодов полей 
  
    /** Коды колонок для хранения ссылок на задачи */ 
    task_table_codes?: string[];  
    /** Коды колонок для хранения указаний на ряды таблицы-источника */ 
    codes_for_tables?: string[];  
  
    /** Условия для рядов */ 
    table_conditions: Record<string, { 
        value?: any;  
        operator: "equal" | "not_equal" | "include" | "not_include" | "empty" | "not_empty" | "larger" | "less"; 
    }[]>; 
  
    /** агрегация в таблицы */ 
    agregate_tables?: {unique_columns:Record<string, string>, values: Record<string, string>}[], 
    /** сортировка таблиц после всех превращений */ 
    sorting_rules?: Record<string, string[]>, 
    /** Если в задачу вызова надо подтянуть данные из целевой */ 
    reverse?: boolean; // Копировать данные в обратном направлении 
    /** Правила создания и поиска задачи */ 
    form_rules: { 
        id: number; // ID формы 
        filter_fields?: Record<string, string>; // правила фильтрации для поиска по реестру 
        task_field_code?: string[]; // Коды полей, которые надо заполнить задачей вызова 
        fields_on_creation?: Record<string, string|string[]>; // если в созданную задачу нужно перенести данные из задачи вызова при создании 
        only_existing?: boolean; // Не создавать новую, а искать существующие 
        include_archived?: boolean; // Учитывать закрытые задачи 
        take_last?: boolean; // Использовать последнюю созданную задачу 
        ignore_limit?: boolean; // Игнорировать лимиты на количество создаваемых в рамках одного вызова задач 
    }; 
    /** Если после отработки всегда надо поставить утверждение */ 
    need_to_approve?: boolean; 
    /** Если целевая задача закрыта, то надо переносить и переоткрывать */ 
    reopen_task?: boolean;  
    /** Если нужно отправлять данные в закрытую задачу без переоткрытия */ 
    to_closed_task?:boolean; 
    /** Копировать данные бесшумно */ 
    skip_notification?: boolean;  
}; 
  
/** Расширение для штатного объекта формы.*/ 
type ExtendedForm = FormResponse & {      
    /** Словарь с полями, у которых есть коды */  
    named_fields: Record <string, FormField>,      
    /** Словарь для поиска кода поля,если известен id */   
    id_to_code: Record <number, string>,      
    /** Массив, хранящий все поля формы, в том числе которые находятся внутри группп и таблиц */ 
    all_fields: FormField[], 
    /** Количество задач, созданных по форме в процессе запуска */ 
    created_by_bot: number      
  }      
            
/** Расширение для штатного объекта задачи */           
type ExtendedTask = TaskWithComments & {     
    /** Словарь с полями, у которых есть коды */   
    named_fields: Record <string, FormField>,   
    /** Массив, хранящий все поля формы, в том числе которые находятся внутри группы */   
    all_fields: FormField[], 
    /** Исправленные комментарии. Не создаются по умолчанию при получении задачи */ 
    named_comments: ExtendedTaskComment[]      
  }      
  
/** Расшрение для штатного объекта табличного ряда */           
type ExtendedTableRow = TableRow & {   
    /** Словарь соответствия кодов ячеек и ячеек*/    
    named_cells: Record <string, FormField>, 
    /** Истина только если ряд был добавлен в процессе обработки запроса */ 
    added_now: boolean    
  }      
  
/** Расширение для штатного объекта комментариев */   
type ExtendedTaskComment = TaskComment &{     
    named_fields_changes: Record <string, FormField>, 
    flat_fields: FormField[]    
  }     
    
       
/** 
 * Расширенный клиент для Pyrus API. 
 * Кеширует формы, каталоги и задачи; нормализует структуры (формы/задачи/комментарии), есть ряд вспомогательных функций 
 */ 
class ExtendedClient extends PyrusApiClient {    
  /** Кеш шаблонов форм (ключ — ID формы) */ 
  templates: Record<number, ExtendedForm>;    
  /** Данные профиля текущего пользователя */ 
  profile_info: ProfileResponse;   
  /** ID пользователя-бота */ 
  id: number;  
  /** Кеш загруженных справочников (ключ - id справочника) */ 
  saved_catalogs: Record<number, CatalogResponse>;  
  /** Кеш задач по ID, загружавшихся или обновляемых в процессе работы бота */ 
  saved_tasks: Record<number, ExtendedTask>; 
  
  /** 
   * Конструктор, который устанавливает начальные значения. 
   * @param token Токен доступа к Pyrus API 
   * @param id    ID пользователя бота 
   */ 
  constructor (token, id){      
    super(token);      
    this.templates = {};  
    this.saved_catalogs = {};     
    this.profile_info = null;   
    this.id = id;  
    this.saved_tasks = {};  
  }      
  
  /** 
   * Возвращает форму в формате ExtendedForm. 
   * Использует кеш; при отсутствии — запрашивает из API, исправляет и добавляет в кэш. 
   * @param id ID формы 
   * @returns Исправленную форму или null, если нет доступа к форме 
   */ 
  //Функция, которая запишет данные формы в соответствии со структурой типа ExtendedForm  
  async get_form(id: number): Promise<ExtendedForm>{      
    if (this.templates[id]) return this.templates[id];      
    try {      
      const form = await this.forms.get({id});      
      let new_form: ExtendedForm = this.fix_form(form);     
      this.templates[id] = new_form;      
      return new_form;      
    }      
    catch (error){      
      return null;      
    }      
  }      
      
  /** 
   * Возвращает каталог (со списком items), используя кеш; при необходимости обновляет. 
   * @param id     ID каталога 
   * @param update Принудительно обновить из API (игнорируя кеш) 
   * @returns Справочник или сообщение об ошибке при неудачном запросе 
   */ 
  async get_catalog(id: number, update?: boolean): Promise<CatalogResponse | string>{  
    if (this.saved_catalogs[id] && !update) return this.saved_catalogs[id];      
    try {      
      const catalog = await this.catalogs.get({id});    
      if (!catalog.items) catalog.items = [];        
      this.saved_catalogs[id] = catalog;      
      return catalog;      
    }      
    catch (error){      
      return error.toString();      
    }      
  }     
  
  async update_catalog(req: UpdateCatalogRequest): Promise<SyncCatalogResponse | string>{
      console.log('catalog_update', req.id);
      try{
        const res = await this.catalogs.update(req);
        if (this.saved_catalogs[req.id]){
            for (let elem of res.added ?? []){
                this.saved_catalogs[req.id].items.push(elem);
              }
            for (let elem of res.updated ?? []){
                let exist_elem = this.saved_catalogs[req.id].items.find(x=>x.item_id == elem.item_id);
                if (exist_elem) exist_elem = elem;
                else this.saved_catalogs[req.id].items.push(elem);
              }
            for (let elem of res.deleted ?? []){
              let exist_elem = this.saved_catalogs[req.id].items.findIndex(x=>x.item_id == elem.item_id);
                if (exist_elem > -1) this.saved_catalogs[req.id].items.splice(exist_elem, 1);
              }
          }
        return res;
        }
      catch(error){
      return error.toString();       
    }       
  }      
    
  /** 
   * Возвращает профиль пользователя/организации; кеширует ответ. 
   */ 
  async get_profile(): Promise<ProfileResponse>{   
    if (this.profile_info) return this.profile_info;   
    const profile = await this.profile.get();   
    this.profile_info = profile;   
    return profile;   
  }   
          
  /** 
   * Ищет профили запрошенных ID. Конвертирует роли в тип Person 
   * @param id Один ID или массив ID (пользователей/ролей) 
   * @returns Словарь, ключ - id пользователя, значение - профиль 
   */ 
  async get_info_by_id(id: number | number[]): Promise<Record<number, Person>>{   
    if (!this.profile_info) await this.get_profile();   
    let ids = [];   
    if (typeof id == 'number') ids = [Number(id)];   
    else ids = id.map(x=>Number(x));   
    let result: Record<number, Person> = {};   
    let found_ids = [];   
  
    // Сначала ищем среди persons 
    for (const person of this.profile_info.organization.persons){   
      if (ids.includes(person.id)){   
        result[person.id] = person   
        found_ids.push(person.id)   
      }   
      if (found_ids.length == ids.length) break;   
    }   
  
    // Затем среди roles 
    for (let role of this.profile_info.organization.roles){   
      //если находим - превращаем роль в Person 
      if (ids.includes(role.id)){    
        result[role.id] = {   
          id: role.id,   
          last_name: role.name,   
          position: role.name,   
          first_name: "",   
          banned: role.banned,   
          email: "",   
          type: "role",   
          skype: null,   
          phone: null   
        }   
        found_ids.push(role.id);   
      }   
      if (found_ids.length == ids.length) break;   
    }   
    return result;   
  }    
      
  /** 
   * Преобразует FormResponse к ExtendedForm: 
   * — разворачивает вложенные поля, 
   * — строит словари named_fields и id_to_code, 
   * — добавляет служебные поля ($task_id, $task_link и т.д.). 
   * @param form Оригинальный ответ формы 
   * @returns Исправленную форму 
   */ 
  private fix_form(form: FormResponse): ExtendedForm{      
    const all_fields = this.get_flat_fields(form.fields, true);      
    let new_form: ExtendedForm = {...form, named_fields: {}, id_to_code: {}, all_fields: all_fields, created_by_bot: 0};      
  
    for (let field of all_fields){      
      // Инициализируем value: для таблицы — [], иначе — null. Для лёгкости использования полей формы при подготовке полей для создания задач 
      field.value = field.type == 'table' ? [] : null;     
  
      //Если у поля нет кода, он нас не интересует 
      if (!field.info?.code) continue;      
      let code = field.info.code;  
      //В named_fields записываем ключ - код и значение - объект field. Связь устанавливается по ссылке, чтобы изменения в словаре провоцировало измнеение в fields и all_fields и наоборот 
      new_form.named_fields[code] = field;  
  
      //Заполняем id_to_code (ключ - id поля, значение - code поля)  
      if (field.id && !new_form.id_to_code[field.id]) new_form.id_to_code[field.id] = code;  
  
      if (field.type == "text"){      
        let analyzed_ids = [];  
        //Дальнейшая обработка используется для присвоения кодов дочерним полям полей Организация, Банк, Адрес и тд. 
        let next_field = all_fields.find(f => !analyzed_ids.includes(f.id) && f.name?.includes(`(${field.name})`)) || null;          
        while (next_field?.name) {      
          const shortName = next_field.name.replace(`(${field.name})`, "").replace(" ", "");      
          const subCode = `${code}*${shortName}`;  
          //Для полей типа Организация id_to_code будет записано в виде: ключ - ид поля, а значение - код основного поля + название дочернего поля без пробелов (заглавные буквы сохраняются) 
          new_form.id_to_code[next_field.id] = subCode;  
          new_form.named_fields[subCode] = next_field;      
          analyzed_ids.push(next_field.id);      
          next_field = all_fields.find(f => !analyzed_ids.includes(f.id) && f.name?.includes(`(${field.name})`)) || null;          
        }      
      }  
      else if (field.type == 'table'){ 
        // Для таблиц добавляем «виртуальные» служебные поля: номер ряда и ID задачи строки 
        new_form.named_fields[`${code}_$row_id`] = {id: null, parent_id:field.id, name:"Номер ряда",  code: `${code}_$row_id`, info: {code: `${code}_$row_id`}, value: null, type: "number"}; 
        new_form.all_fields.push(new_form.named_fields[`${code}_$row_id`]); 
        new_form.named_fields[`${code}_$task_id`] = {id: null, parent_id:field.id, name:"Номер задачи в таблице",  code: `${code}_$task_id`, info: {code: `${code}_$task_id`}, value: null, type: "number"}; 
        new_form.all_fields.push(new_form.named_fields[`${code}_$task_id`]); 
      }  
       
    }  
  
    //добавляем свойства задачи в качестве полей на шаблон формы 
    new_form.named_fields["$task_id"] = {id: null, parent_id: null, name: "Номер задачи", code: "$task_id", info: {code: "$task_id"}, value: null, type: "number"}; 
    new_form.all_fields.push(new_form.named_fields["$task_id"]); 
  
    new_form.named_fields["$task_link"] = {id: null, parent_id: null, name: `Ссылка на задачу`, code: "$task_link", info: {code: "$task_link"}, value: null, type: "text"}; 
    new_form.all_fields.push(new_form.named_fields["$task_link"]); 
  
    new_form.named_fields["$task_field"] = {id: null, parent_id: null, name: `Задача`, code: "$task_field", info: {code: "$task_field"}, value: null, type: "form_link"}; 
    new_form.all_fields.push(new_form.named_fields["$task_field"]); 
  
    new_form.named_fields["$due"] = {id: null, parent_id: null, name: "Срок", code: "$due", info: {code: "$due"}, value: null, type: 'date'}; 
    new_form.all_fields.push(new_form.named_fields["$due"]); 
  
    new_form.named_fields["$due_date"] = {id: null, parent_id: null, name: "Срок со временем", code: "$due_date", info: {code: "$due_date"}, value: null, type: 'date'}; 
    new_form.all_fields.push(new_form.named_fields["$due_date"]); 
  
    new_form.named_fields["$duration"] = {id: null, parent_id: null, name: "Интервал срока", code: "$duration", info: {code: "$duration"}, value: null, type: 'number'}; 
    new_form.all_fields.push(new_form.named_fields["$duration"]); 

    new_form.named_fields["$due_end_date"] = {id: null, parent_id: null, name: "Конец срока", code: "$due_end_date", info: {code: "$due_end_date"}, value: null, type: 'date'}; 
    new_form.all_fields.push(new_form.named_fields["$due_end_date"]); 
  
    new_form.named_fields["$close_state"] = {id: null, parent_id: null, name: "Закрыта", code: "$close_state", info: {code: "$close_state"}, value: null, type: 'checkmark'}; 
    new_form.all_fields.push(new_form.named_fields["$close_state"]); 
  
    new_form.named_fields["$close_date"] = {id: null, parent_id: null, name: "Закрыта", code: "$close_date", info: {code: "$close_date"}, value: null, type: 'date'}; 
    new_form.all_fields.push(new_form.named_fields["$close_date"]); 
  
    new_form.named_fields["$assignee"] = {id: null, parent_id: null, name: "Закрыта", code: "$assignee", info: {code: "$assignee"}, value: null, type: 'person'}; 
    new_form.all_fields.push(new_form.named_fields["$assignee"]); 
  
    new_form.named_fields["$last_modified_date"] = {id: null, parent_id: null, name: "Закрыта", code: "$last_modified_date", info: {code: "$last_modified_date"}, value: null, type: 'date'}; 
    new_form.all_fields.push(new_form.named_fields["$last_modified_date"]); 
  
    new_form.named_fields["$run_date"] = {id: null, parent_id: null, name: "Дата запуска", code: "$run_date", info: {code: "$run_date"}, value: null, type: 'date'}; 
    new_form.all_fields.push(new_form.named_fields["$run_date"]); 
  
    new_form.named_fields["$current_step"]= {id: null, parent_id: null, name: "Этап задачи", code: "$current_step", info: {code: "$current_step"}, value: null, type: "number"};    
    new_form.all_fields.push(new_form.named_fields["$current_step"]); 
  
    new_form.named_fields["$parent_task_id"] = {id: null, parent_id: null, name: "Номер задачи", code: "$parent_task_id", info: {code: "$parent_task_id"}, value: null, type: "number"}; 
    new_form.all_fields.push(new_form.named_fields["$parent_task_id"]); 
  
  
    if (Object.keys(new_form.steps ?? {}).length){ 
        for (const step of Object.keys(new_form.steps)){ 
            new_form.named_fields[`$approver_step_${step}`] = {id: null, parent_id: null, name: `Согласующий этапа ${new_form.steps[step]}`, code: `$approver_step_${step}`, info: {code: `$approver_step_${step}`}, value: null, type: 'number'}; 
            new_form.all_fields.push(new_form.named_fields[`$approver_step_${step}`]); 
            new_form.named_fields[`$approver_choice_step_${step}`] = {id: null, parent_id: null, name: `Решение этапа ${new_form.steps[step]}`, code: `$approver_choice_step_${step}`, info: {code: `$approver_choice_step_${step}`}, value: null, type: 'text'}; 
            new_form.all_fields.push(new_form.named_fields[`$approver_step_${step}`]); 
          } 
      } 
        new_form.named_fields['$approver_table'] = {id: -1, parent_id: null, name: `Таблица согласований`, code: `$approver_table`, info: {code: `$approver_table`}, value: [], type: 'table'}; 
        new_form.id_to_code[-1] = '$approver_table'; 
        new_form.named_fields[`$approver_table_$row_id`] = {id: null, parent_id:-1, name:"Номер ряда",  code: `$approver_table_$row_id`, info: {code: `$approver_table_$row_id`}, value: null, type: "number"}; 
        new_form.named_fields[`$approver_table_$task_id`] = {id: null, parent_id:-1, name:"Номер задачи в таблице",  code: `$approver_table_$task_id`, info: {code: `$approver_table_$task_id`}, value: null, type: "number"}; 
        new_form.named_fields['$approval_step'] = {id: null, parent_id: -1, name: `Этап`, code: '$approval_step', info: {code: '$approval_step'}, value: null, type: 'number'}; 
        new_form.named_fields['$approver'] = {id: null, parent_id: -1, name: `Согласующий`, code: '$approver', info: {code: '$approver'}, value: null, type: 'number'}; 
        new_form.named_fields['$approving_date'] = {id: null, parent_id: -1, name: `Дата согласования`, code: '$approving_date', info: {code: '$approving_date'}, value: null, type: 'date'}; 
        new_form.named_fields['$approval_choice'] = {id: null, parent_id: -1, name: `Решение`, code: '$approval_choice', info: {code: '$approval_choice'}, value: null, type: 'text'}; 
        new_form.named_fields['$approval_user'] = {id: null, parent_id: -1, name: `Согласовавший`, code: '$approval_user', info: {code: '$approval_user'}, value: null, type: 'number'}; 
        new_form.all_fields.push(...[new_form.named_fields['$approver_table'], new_form.named_fields[`$approver_table_$row_id`], new_form.named_fields[`$approver_table_$task_id`], new_form.named_fields['$approval_step'], new_form.named_fields['$approver'] 
          , new_form.named_fields['$approving_date'], new_form.named_fields['$approval_choice'], new_form.named_fields['$approval_user'] ]) 
    return new_form;      
  }      
      
  /** 
   * Разворачивает и собирает «плоский» массив полей (включая поля внутри групп и таблиц). 
   * @param fields  Исходные поля 
   * @param is_form true — обработка структуры форм; false — данных задачи 
   */ 
  private get_flat_fields(fields: FormField[], is_form: boolean = false): FormField[]{      
    let result = [];      
    for (let field of fields){      
      result.push(field);      
        
      // Для форм: выносим колонки таблиц в общий список 
      if (field.type == 'table' && field.info?.columns && is_form){      
        result.push(...field.info.columns);      
      }      
      // Для групп (title): добавляем вложенные поля, и если среди них таблицы — их колонки 
      else if (field.type == 'title' && ((is_form && field.info?.fields) || (!is_form && field.value?.fields))){        
        const field_array: FormField[] = is_form ? field.info?.fields ?? [] : field.value?.fields ?? [];  
        for (let title_field of field_array){      
          result.push(title_field);      
          if (title_field.type == 'table' && title_field.info?.columns && is_form){      
            result.push(...title_field.info.columns);      
          }      
        }      
      }      
    }      
    return result;      
  }      
      
  /** 
   * Возвращает задачу в формате ExtendedTask: загружает из API, фиксит и кеширует. 
   * @param task_id ID задачи 
   * @param update  Принудительно обновить из API (игнорируя кеш) 
   * @returns Загруженную задачу или сообщение об ошибке 
   */ 
  async get_task(task_id: number, update: boolean = false): Promise<ExtendedTask | string>{ 
    if (!update && this.saved_tasks[task_id]) return this.saved_tasks[task_id]; 
    try{      
      console.log("getting_task", task_id); 
      const task = await this.tasks.get({id: task_id});      
      if (task.task){     
        let fixed_task = await this.fix_task(task.task); 
        if (!fixed_task) return "Не удалось преобразовать задачу"; 
        this.saved_tasks[task_id] = fixed_task; 
        return fixed_task;     
      }         
      else return "Не удалось загрузить задачу"; 
    }      
    catch (error){ 
      console.log(error);      
      return error.toString();      
    }      
  } 
  
  /** 
   * Отправляет комментарий в задачу, в случае успеха обновляет кеш изменённой задачей (после исправления) и возвращает её. 
   * Перед отправкой превращает пустые значения полей типа Выбор в приемлемые для API 
   * @param task_id ID задачи 
   * @param comment Комментарий для отправки 
   * @returns Изменённую задачу или сообщение об ошибке 
   */ 
  async comment_task(task_id: number, comment: TaskCommentRequest): Promise<ExtendedTask | string>{ 
    try{ 
      // Предобработка значений перед отправкой (заполнение пустых multiple_choice) 
      if (comment.field_updates?.length){ 
        for (let field of comment.field_updates){ 
          if (field.type == 'multiple_choice' && !field.value) field.value = {choice_names: ["Не выбрано"], choice_ids: [0], choice_id: 0}; 
          else if (field.type == 'form_link' && field.value && (!field.value.subject || field.value.subject == '')) field.value = null; 
          else if (field.type == 'table'){ 
            for (let row of field.value as ExtendedTableRow[] ?? []){ 
              for (let cell of row.cells){ 
                if (cell.type == 'multiple_choice' && !cell.value) cell.value = {choice_names: ["Не выбрано"], choice_ids: [0], choice_id: 0}; 
                else if (cell.type == 'form_link' && cell.value  && (!cell.value.subject || cell.value.subject == '')) cell.value = null;
              } 
            } 
          } 
          if (field.code == '$close_state' && field.value == 'checked') comment.action = 'finished';
          else if (field.code == '$close_state' && field.value != 'checked') comment.action = 'reopened';
          if (field.code == '$assignee') comment.reassign_to = field.value ? field.value as Person : {id: 1730}; 
          if (field.code == '$due') comment.due = field.value as Date; 
          if (field.code == '$due_date') comment.due_date = field.value as Date; 
          if (field.code == '$duration') comment.duration = field.value ? Number(field.value) : null; 
          if (field.code == '$due_end_date'){
              if (field.value){
                const end_date = field.value as Date;
                let due_field = comment.field_updates.find(x=>x.code == '$due_date');
                if (!due_field) due_field = comment.field_updates.find(x=>x.code == '$due');
                if (!due_field){
                    const aim_task = await this.get_task(task_id);
                    if (aim_task && typeof aim_task != 'string'){
                        due_field = aim_task.named_fields['$due_date'];
                        if (due_field && due_field.value) comment.due = due_field.value as Date;
                      }
                  }
                if (due_field && due_field.value){
                    const start_date = due_field.value as Date;
                    let minutes = (end_date.getTime() - start_date.getTime())/1000/60;
                    comment.duration = minutes > 0 ? minutes : undefined;
                  }
                }
              else comment.duration = null;
            } 
        } 
        comment.field_updates = comment.field_updates.filter(x=>!x.code || !x.code.includes("$")); 
      } 
      if ((comment.due || comment.due_date) && !comment.duration){
          const aim_task = await this.get_task(task_id);
          if (aim_task && typeof aim_task != 'string' && aim_task.duration){
              comment.duration = aim_task.duration;
            }
        }
      // Отправляем комментарий 
      console.log("Отправка комментария в задачу", task_id);  
      //console.log("Отправка комментария в задачу", task_id, comment); 
      let new_task = await this.tasks.addComment(task_id, copy_by_value(comment));
      if (!new_task.task){ 
        return `Не удалось обновить задачу ${task_id}`; 
      } 
      // Фиксим и кешируем задачу 
      let fixed_task = await this.fix_task(new_task.task); 
      this.saved_tasks[task_id] = fixed_task; 
      return fixed_task; 
    } 
    catch(error){ 
      return `При обновлении задачи ${task_id} возникла ошибка: ${error}`; 
    } 
  } 
  
  /** 
   * Создаёт новую задачу, исправляет созданную задачу, кешерует её и возвращает в формате ExtendedTask 
   * @param comment Параметры создания задачи 
   * @returns Созданную задачу или сообщение об ошибке 
   */ 
  async create_task(comment: TaskRequest): Promise<ExtendedTask | string>{ 
    console.log("Создание задачи"); 
    try{ 
      let new_task = await this.tasks.create(comment); 
      if (!new_task.task){ 
        return `Не удалось обновить задачу создать задачу`; 
      } 
      let fixed_task = await this.fix_task(new_task.task); 
      console.log(fixed_task?.id); 
      this.saved_tasks[fixed_task.id] = fixed_task; 
      return fixed_task; 
    } 
    catch(error){ 
      return `Не удалось создать задачу: ${error}`; 
    } 
  } 
  
  /** 
   * Возвращает реестр задач формы с предварительным «исправлением» каждой задачи. 
   * @param form_id  ID формы 
   * @param form_req Параметры фильтрации реестра 
   * @returns Массив из задач реестра или сообщение об ошибке 
   */ 
  async get_registry_with_fix(form_id: number, form_req: FormRegisterRequest = null): Promise<ExtendedTask[] | string>{      
    try{      
      const form_register = await this.forms.getTasks(form_id, form_req);     
      let return_register: ExtendedTask[] = [];     
      if (form_register.tasks?.length > 0){     
        for (let task of form_register.tasks){     
          task.form_id = form_id;     
          task.approvals = [];     
          let fixed_task = await this.fix_task({...task, comments: []});     
          return_register.push(fixed_task);     
        }     
      }     
      return return_register;     
    }      
    catch (error){      
      return error.toString();      
    }      
  }      
  
  
      /** 
   * Формирует список согласований задачи в удобном для поиска виде. 
   * 
   * @param {ExtendedTask} task Объект задачи 
   * @returns {Record<number, Record<string, string>>} 
   *    Внешний ключ (number) — номер этапа (начиная с 1), нумерация с 1. 
   *    Внутренний ключ (number) — id согласующего на этапе 
   *    Значение (string) — статус согласования этапа 
   */ 
  prepare_approval_list(task: ExtendedTask): Record<number, Record<number, string>>{  
    let result:Record<number, Record<number, string>> = {};  
    //console.log(task.steps);  
    for (let step_num = 0; step_num < task.approvals.length; step_num++){  
        for (let person of task.approvals[step_num]){  
          if (!result[step_num+1]) {  
                result[step_num+1] = {};  
              }  
            result[step_num+1][person.person.id] = person.approval_choice;  
          }  
      }  
    return result;  
  }  
    
    /** 
   * Формирует историю согласования на основе комментов. 
   * 
   * @param {ExtendedTask} task Объект задачи 
   * @param {Record<number, Record<number, string>>} approval_list лист согласования из функции prepare_approval_list 
   * @returns {Record<number, Record<number, {user_approved: number | null, date: Date | null, existing_choice: string}>>} 
   *    Внешний ключ (number) — номер этапа (начиная с 1), нумерация с 1. 
   *    Внутренний ключ (number) — id согласующего на этапе 
   *    Объект c атрибутами: 
   *      user_approved - пользователь, который поставил согласование 
   *      date - последняя дата согласования 
   *      existing_choice - виза, если ещё не проставлена равна waiting 
   */ 
  get_approval_history(task: ExtendedTask, approval_list: Record<number, Record<number, string>>): Record<number, Record<number, {user_approved: number | null, date: Date | null, existing_choice: string}>>{  
    let result: Record<number, Record<number, {user_approved: number | null, date: Date | null, existing_choice: string}>> = {};  
    let current_step = 0;  
    for (let step_num in approval_list){  
        result[Number(step_num)] = {};  
        for (let approver in approval_list[step_num]){  
            result[Number(step_num)][Number(approver)] = {existing_choice: approval_list[step_num][approver], user_approved: null, date: null};  
          }  
      }  
    for (let comment of task.comments){  
        let existing_approvers = result[current_step] ?? {};  
        if (comment.approval_choice){  
            if (existing_approvers[comment.author.id] && comment.approval_choice == existing_approvers[comment.author.id].existing_choice){  
                existing_approvers[comment.author.id].date = comment.create_date;  
                existing_approvers[comment.author.id].user_approved = comment.author.id;  
              }  
            for (let role of comment.comment_as_roles ?? []){  
                if (existing_approvers[role.id] && comment.approval_choice == existing_approvers[role.id].existing_choice){  
                    existing_approvers[role.id].date = comment.create_date;  
                    existing_approvers[role.id].user_approved = comment.author.id;  
                  }  
              }  
          }  
        if (comment.changed_step) current_step = comment.changed_step;  
      }  
    return result;  
  }  
  
  /** 
   * Функция возвращает поля формы в удобном для работы виде на уровне задачи: 
   * — переносит значения и коды,  
   * — для таблиц добавляет служебные ячейки $row_id и $task_id, 
   * — добавляет в named_fields системные поля задачи ($task_id, $task_link, и т.д.). 
   * @param task Оригинальная задача (с комментариями) 
   * @returns Расширенную задачу или null, если нет доступа к форме 
   */ 
  async fix_task(task: TaskWithComments): Promise<ExtendedTask>{    
    let full_task: ExtendedTask = {...task, named_fields: {}, all_fields: [], named_comments: []};     
    if (!full_task.form_id) return full_task;     
  
    // Получаем форму и плоский список полей 
    const form = await this.get_form(full_task.form_id);     
    if (!form) return null;     
    full_task.all_fields = this.get_flat_fields(full_task.fields);     
    if (!full_task.subject) full_task.subject = `${form.name}:${task.id}`;
    // Копируем структуру полей формы и подменяем значения на фактические 
    full_task.named_fields = copy_by_value(form.named_fields);     
    for (let field of full_task.all_fields){     
      let field_code = form.id_to_code[field.id];     
      if (!field_code) continue;     
      full_task.named_fields[field_code] = field; 
      if (!field.value && field.value !== 0) field.value = null;      
  
      // Обработка таблиц: выстраиваем named_cells, дополняем отсутствующие ячейки 
      if (field.type == 'table' && field.value){   
        for (let row of field.value){     
          const extendedRow = row as ExtendedTableRow;     
          extendedRow.named_cells = extendedRow.named_cells || {}; 
          extendedRow.added_now = false;     
          let cell_ids: number[] = [];     
  
          if (row.cells){     
            for (let cell of row.cells) {     
              cell_ids.push(cell.id);  
              const cell_code = form.id_to_code[cell.id];    
              if (!cell_code) continue;     
              extendedRow.named_cells[cell_code] = cell;     
            }     
          }     
          else row.cells = [];     
  
          // Добавляем недостающие ячейки 
          const list_of_missing_fields = form.all_fields.filter(x=> x.parent_id == field.id && !cell_ids.includes(x.id));     
          for (let missing_cell of list_of_missing_fields){     
            let new_cell = {...missing_cell};     
            if (missing_cell.id) row.cells.push(new_cell);     
            if (missing_cell.info?.code) {          
              extendedRow.named_cells[missing_cell.info.code] = new_cell;     
            }     
          } 
          // Проставляем служебные значения в ячейки 
          extendedRow.named_cells[`${field_code}_$row_id`].value = row.row_id; 
          extendedRow.named_cells[`${field_code}_$task_id`].value = task.id; 
        }           
      }   
      else if (field.type == 'table'){ 
        field.value = [];  
      } 
    }     
  
    //добавляем свойства задачи в качестве полей на шаблон формы 
    full_task.named_fields["$task_id"].value =  task.id; 
    full_task.named_fields["$task_link"].value = `https://pyrus.com/t#id${task.id}`; 
    full_task.named_fields["$task_field"].value = {task_id: task.id, task_ids: [task.id], subject: task.subject} 
    full_task.named_fields["$close_state"].value = task.close_date ? "checked" : "unchecked"; 
    full_task.named_fields["$close_date"].value = task.close_date ?? null; 
    full_task.named_fields["$assignee"].value = task.responsible; 
    full_task.named_fields["$last_modified_date"].value = task.last_modified_date; 
    full_task.named_fields["$run_date"].value = new Date();
    full_task.named_fields["$current_step"].value= task.current_step; 
    full_task.named_fields['$parent_task_id'].value = task.parent_task_id ?? null; 
    full_task.all_fields.push(...[full_task.named_fields["$task_id"], full_task.named_fields["$task_link"], full_task.named_fields["$task_field"], full_task.named_fields["$close_state"], full_task.named_fields["$close_date"], full_task.named_fields["$assignee"] 
      , full_task.named_fields["$last_modified_date"], full_task.named_fields["$current_step"], full_task.named_fields["$parent_task_id"]]) 
  
    if (full_task.due) { 
            full_task.named_fields["$due"].value = full_task.due; 
            full_task.named_fields["$due_date"].value = full_task.due; 
      } 
    else if (full_task.due_date) { 
      full_task.named_fields["$due"].value = full_task.due_date; 
      full_task.named_fields["$due_date"].value = full_task.due_date; 
      } 

    if (full_task.duration !== null && full_task.duration !== undefined){ 
        full_task.named_fields["$duration"].value = full_task.duration; 
        let start_date = copy_by_value(full_task.named_fields['$due_date'].value)  as Date;
        start_date.setMinutes(start_date.getMinutes() + full_task.duration);
        full_task.named_fields['$due_end_date'].value = start_date;
      } 
  
  
    full_task.named_fields["$approver_table"].value = [];   
        if (full_task.approvals){ 
      //заполняем таблицу согласований 
      const full_task_approval_list = this.prepare_approval_list(full_task); 
      const full_task_approval_history = this.get_approval_history(full_task, full_task_approval_list); 
      if (Object.keys(full_task_approval_history).length){ 
          //для каждого этапа выделяем решение. Если на этапе стоит только один согласующий, то он становится утверждающим этот этап 
          for (let [step_num, step_approvals] of Object.entries(full_task_approval_history)){ 
              const approvers_amount = Object.keys(step_approvals).filter(x=>x != this.id.toString()).length; 
              let found_waiting = false; 
              let found_reject = false; 
              if (approvers_amount > 0){ 
                  for (let approver in step_approvals){ 
                      if (approver == this.id.toString()) continue;
                      const approval_info = step_approvals[approver]; 
                      if (approvers_amount == 1 && full_task.named_fields[`$approver_step_${step_num}`]){ 
                        if (approval_info.user_approved) full_task.named_fields[`$approver_step_${step_num}`].value = Number(approval_info.user_approved); 
                        else full_task.named_fields[`$approver_step_${step_num}`].value = Number(approver); 
                        } 
                      let new_row = await this.add_row_to_table(full_task.named_fields["$approver_table"].value as ExtendedTableRow[], full_task.named_fields["$approver_table"].id, full_task.form_id, full_task.id); 
                      new_row.named_cells['$approval_step'].value = Number(step_num); 
                      new_row.named_cells['$approver'].value = Number(approver); 
                      new_row.named_cells['$approving_date'].value = approval_info.date; 
                      new_row.named_cells['$approval_choice'].value = approval_info.existing_choice; 
                      new_row.named_cells['$approval_user'].value = approval_info.user_approved ? Number(approval_info.user_approved) : null; 
                      if (approval_info.existing_choice == 'waiting') found_waiting = true; 
                      if (approval_info.existing_choice == 'rejected') found_reject = true; 
                    } 
                  if (found_waiting && full_task.named_fields[`$approver_choice_step_${step_num}`]) full_task.named_fields[`$approver_choice_step_${step_num}`].value = 'waiting'; 
                  else if (found_reject && full_task.named_fields[`$approver_choice_step_${step_num}`]) full_task.named_fields[`$approver_choice_step_${step_num}`].value = 'rejected'; 
                  else if (full_task.named_fields[`$approver_choice_step_${step_num}`]) full_task.named_fields[`$approver_choice_step_${step_num}`].value = 'approved'; 
                } 
            } 
        } 
      } 
  
    return full_task;     
  }  
  
  /** 
   * Строит словарь {название опции -> ID} для поля multiple_choice по коду. 
   * @param code    Код поля multiple_choice 
   * @param task    (опц.) задача, чтобы вывести форму из неё 
   * @param form_id (опц.) ID формы (если задачи нет) 
   * @returns Словарь соответствия вариантов выбора и choice_id (только актуальные) 
   */ 
  async get_multiple_choice_dict(code: string, task?: ExtendedTask|null, form_id?: number|null): Promise<Record<string,number>>{  
    let result: Record<string, number> = {};  
    let task_form = task ? await this.get_form(task.form_id) : (form_id ? await this.get_form(form_id) : null);  
    if (task_form){  
      const field = task_form.named_fields[code]; 
      if (!field || field.type != "multiple_choice") return result;  
      let options = field.info.options;  
      for (const option of options){  
        if (!option.deleted) result[option.choice_value] = option.choice_id;  
      }  
    }  
    return result;   
  }     
  
  /** 
   * Добавляет строку в табличное поле и возвращает созданную строку. 
   * @param table Значение таблицы, в которую надо добавить ряд 
   * @param table_id ID поля-таблицы 
   * @param form_id  ID формы, к которой относится таблица 
   * @param task_id  ID задачи-владельца таблицы 
   * @returns Полный ряд таблицы с истинным параметром added_now 
   */ 
  async add_row_to_table(table: ExtendedTableRow[], table_id: number, form_id: number, task_id: number): Promise<ExtendedTableRow>{   
    const form = await this.get_form(form_id);  
    const max_row_id = table.length > 0 ? Math.max(...table.map(row => row.row_id)) : 0; 
    const table_code = form.id_to_code[table_id];   
    let new_cells = [];   
    let named_cells = {};   
    // Клонируем все поля-колонки данной таблицы 
    for (let field of form.all_fields){   
      if (table_id != field.parent_id) continue; 
      let new_field = copy_by_value(field);   
      field.value = null; 
      const field_code = form.id_to_code[field.id] ? form.id_to_code[field.id] : field.info?.code; 
      if (field_code){   
        named_cells[field_code] = new_field;   
      }   
      if (new_field.id) new_cells.push(new_field); 
    } 
  
    // Проставляем служебные значения в «виртуальные» ячейки 
    named_cells[`${table_code}_$row_id`].value = max_row_id + 1; 
    named_cells[`${table_code}_$task_id`].value = task_id;   
  
    // Конструируем строку и добавляем её в таблицу 
    let new_row = {row_id: max_row_id + 1, cells: new_cells, named_cells: named_cells, added_now: true}   
    table.push(new_row);  
    return new_row;   
  }   
  
  /** 
   * Возвращает комментарии со словарями изменённых полей. Если в комментарии не было изменения полей, словарь будет пустым, но не null 
   * После работы сохраняет изменённые поля в задачу (а соответственно и в кеш).  
   * Не вызывается по умолчанию при выполнении метода get_task 
   * @param task Задача (ExtendedTask), чьи комментарии нужно «исправить» 
   * @returns Массив исправленных комментариев. 
   */ 
  async fix_task_comments(task: ExtendedTask): Promise<ExtendedTaskComment[]>{     
    if (task.named_comments?.length) return task.named_comments;  
    let comments: ExtendedTaskComment[] = [];     
    const form = await this.get_form(task.form_id);     
    
    for (let comment of task.comments){     
      let new_comment: ExtendedTaskComment = {...comment, named_fields_changes: {}, flat_fields: []};     
    
      // Если в комментарии были обновления полей — восстанавливаем структуру  
      if (new_comment.field_updates && new_comment.field_updates.length != 0){  
        new_comment.flat_fields = this.get_flat_fields(new_comment.field_updates, false);    
        for (let field of new_comment.flat_fields){     
          if (!form.id_to_code[field.id]) continue;     
          const code = form.id_to_code[field.id];     
    
          // Проставляем пустые значения по типу, если не указано  
          if (!field.value) field.value = field.type == 'table' ? [] : null;     
    
          // Для таблиц — восстанавливаем named_cells у строк только у изменённых ячеек. Остальные не будут добавлены в named_cells  
          if (field.type == 'table'){     
            for (let row of field.value){     
              const extendedRow = row as ExtendedTableRow;      
              extendedRow.named_cells = extendedRow.named_cells || {};      
              if (row.cells){      
                for (let cell of row.cells) {       
                  if (!cell?.code) continue;      
                  extendedRow.named_cells[cell.code] = cell;      
                }      
              }      
              else row.cells = [];     
            }     
          }     
    
          new_comment.named_fields_changes[code] = field;       
        }     
      }     
    
      comments.push(new_comment);     
    }     
    
    task.named_comments = comments;  
    return comments;     
  }   
  
  /** 
   * Восстанавливает последние значения изменённых полей из цепочки комментариев. 
   * Позволяет получить «n-е с конца» значение для каждого кода. 
   * @param comments               Исправленные комментарии 
   * @param codes                  Список интересующих кодов полей 
   * @param depth                  (опц.) Какое по счёту значение брать (1 — последнее, 2 — предпоследнее и т.д.). По умолчанию - 1.  
   * @param specific_id            (опц.) Если интересует изменение, произведённое определённым пользвоателем 
   * @param include_last_comment   (опц.) Учитывать последний комментарий (по умолчанию - нет) 
   * @returns Словарь соответствия кода поля и его последнего состояния (с учётом depth) 
   */ 
  restore_last_values( 
    comments: ExtendedTaskComment[], 
    codes:string[], 
    depth: number = 1, 
    specific_id: number = null, 
    include_last_comment: boolean = false 
  ): Record<string, FormField>{  
    let counting: Record<string, number>= Object.fromEntries(codes.map(x=>[x,1]));  
    let result: Record<string, FormField> = {};  
  
    // Идём с конца к началу, опционально пропуская самый свежий комментарий 
    for (let i = comments.length - 1 - (include_last_comment ? 0 : 1); i >= 0; i--){  
      const comment = comments[i];  
  
      // Пропускаем пустые/неподходящие комментарии 
      if (Object.keys(comment.named_fields_changes).length == 0 || (specific_id && comment.author.id != specific_id)) continue;  
  
      for (const changed_code in comment.named_fields_changes){  
        // Когда счётчик дошёл до нужной глубины — фиксируем значение 
        if (counting[changed_code] == depth){  
          result[changed_code] = comment.named_fields_changes[changed_code];  
        }  
        if (counting[changed_code] != undefined) counting[changed_code] += 1;  
      }   
    }  
    return result;  
  }    
} 
    
/** 
 *Кастомная подготовка задачи перед переносом 
 *  
 * @param {ExtendedClient} bot Экземпляр клиента Pyrus API. 
 * @param {ExtendedTask} task Задача, из которой будет осуществляться перенос 
 * @param {CopyRule} rule Правило копирования. 
 * @param {number} rule_index Индекс правила (для уникальной метки применения). 
 * @returns Ничего не возвращает, все обновления задачи проводятся в функции 
 */ 
async function prepare_task(bot: ExtendedClient, task: ExtendedTask, rule: CopyRule, rule_index: number): Promise<ExtendedTask>{ 
    //КАСТОМНАЯ ОБРАБОТКА ЗАДАЧИ ПЕРЕД ПРИМЕНЕНИЕМ ПРАВИЛА 
    //Обязательно все изменения нужно отправить, иначе они не будут применены 
    //await bot.comment_task(task.id, {text: "Hello"}); 
    return task; 
  } 
  
/** 
 *Кастомные постобработки после копирования. Не рекомендуется обновлять задачу здесь, лучше вернуть список изменённых полей  
 *  
 * @param {ExtendedClient} bot Экземпляр клиента Pyrus API. 
 * @param {ExtendedTask} source_task Задача, из которой осуществлялся перенос 
 * @param {ExtendedTask} aim_task Задача, в которую перенесли данные 
 * @param {CopyRule} rule Правило копирования. 
 * @param {number} rule_index Индекс правила (для уникальной метки применения). 
 * @returns Список полей, которые изменились в постобработке  
 */ 
async function post_copy_updates(bot: ExtendedClient, source_task: ExtendedTask, aim_task: ExtendedTask, rule: CopyRule, rule_index: number): Promise<string[]>{ 
    //Кастомная постобработка. Все изменения, которые нужно сделать в задаче вызова, нужно отправить здесь. Изменения в целевой задаче происходят вне этой функции, надо вернуть только коды изменившихся полей. 
    let updated_fields: string[] = []; 
    return updated_fields; 
  } 
  
/** 
 * Кастомные проверки задач, подходящих для переноса 
 *  
 * @param {ExtendedClient} bot Экземпляр клиента Pyrus API. 
 * @param {ExtendedTask} task Задача, к которой применится правило 
 * @param {CopyRule} rule Правило копирования. 
 * @param {number} rule_index Индекс правила (для уникальной метки применения). 
 * @returns Результат проверки или сообщение об ошибке (в таком случае проверка будет считаться непройденной)  
 */ 
async function check_user_conditions(bot: ExtendedClient, task: ExtendedTask, rule: CopyRule, rule_index: number): Promise<boolean | string>{ 
    //ВСТАВЬТЕ СЮДА СВОИ КАСТОМНЫЕ ПРОВЕРКИ ПОД КОНКРЕТНЫЕ ФОРМЫ. 
    //if (task.form_id == <нужная форма> || rule_index == <последовательный номер конкретного правила, нумерация с 0>) 
    return true; 
  } 
  
/** 
 * Кастомные проверки строк таблиц, подходящих для переноса 
 *  
 * @param {ExtendedClient} bot Экземпляр клиента Pyrus API. 
 * @param {ExtendedTask} task Задача, к которой применится правило 
 * @param {ExtendedTableRow} row Строка для проверки 
 * @param {CopyRule} rule Правило копирования. 
 * @param {number} rule_index Индекс правила (для уникальной метки применения). 
 * @returns Результат проверки или сообщение об ошибке (в таком случае проверка будет считаться непройденной)  
 */ 
async function check_user_row_conditions(bot: ExtendedClient, task: ExtendedTask, row: ExtendedTableRow, rule: CopyRule, rule_index: number):Promise<boolean | string>{ 
    //ВСТАВЬТЕ СЮДА СВОИ КАСТОМНЫЕ ПРОВЕРКИ СТРОК ТАБЛИЦ ПОД КОНКРЕТНЫЕ ФОРМЫ. 
    //if (task.form_id == <нужная форма> || rule_index == <последовательный номер конкретного правила, нумерация с 0>) 
    return true; 
  }