import {BotHookRequest, BotHookResponse, TaskWithComments, UpdateCatalogRequest, SyncCatalogResponse, FormResponse, FormField, PyrusApiClient, TableRow, MultipleChoice, FormFilter, AttachedFile, NewFile, ProjectArray, TaskRequest, FormFieldCatalog, FormFieldInfo, OperatorId, Catalog, FormLink, CatalogResponse, TaskComment, FormRegisterRequest, TaskCommentRequest, ProfileResponse, Person} from "pyrus-api";       
// tb - v 7.0 
let error_log: Record<number, string[]> = {}; //переменная для хранения ошибок в процессе переносов. Ключем является задача, из которой происходил перенос, в ней будет направлено сообщение об ошибке 
  
export default async function(request: BotHookRequest): Promise<BotHookResponse> {     
  const start_time = new Date();     
  const bot = new ExtendedClient(request.access_token, request.user_id);    
  let full_task = await bot.fix_task(request.task);   
  if (!full_task?.form_id) return {text: "Бот не может отработать в этой задаче", approval_choice: "rejected"};   
  let result: TaskCommentRequest | null = {};  
  try{  
    const settings = request.bot_settings ? JSON.parse(request.bot_settings) : {};     
    result = await function_to_do(bot, full_task, settings);   
    console.log("error_log", error_log); 
    for (let error_task_id of Object.keys(error_log)){ //отправляем ошибки в соответствующие задачи 
      const error_task = await bot.get_task(Number(error_task_id)) as ExtendedTask; 
      if (error_task.close_date) continue; 
      const task_error_log = Array.from(new Set(error_log[error_task_id])).join("\n"); //ошибки могут повторяться 
      let task_comments = error_task.comments; 
      let error_comment: string | null = task_error_log; 
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
            console.log(result);  
            return {text: "При обновлении задачи возникла ошибка"};  
          }   
    }    
}   
  
async function function_to_do(bot: ExtendedClient, task: ExtendedTask, settings: any): Promise<TaskCommentRequest | null>{   
    return {}  
  }   

  //функция для обновления лога ошибок, точка входа для запуска процессов копирования в задаче 
function add_error(task_id: number, error: string){  
    if (!error_log[task_id]) error_log[task_id] = [error]; 
    else error_log[task_id].push(error); 
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
    else if (value instanceof Date) return new Date(value.getTime()); 
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
 * @param {Date} date1 
 * @param {Date} date2 
 * @returns {number} 
 */ 
function get_time_seconds(date1: Date, date2: Date){    
    return Math.floor((date2.getTime() - date1.getTime())/1000)    
  }    
  
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
  profile_info: ProfileResponse | null;   
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
  constructor (token: string, id: number){      
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
  async get_form(id: number | null | undefined): Promise<ExtendedForm | null>{   
    if (!id) return null;   
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
      return String(error);      
    }      
  }     
  
  async update_catalog(req: UpdateCatalogRequest): Promise<SyncCatalogResponse | string>{
      console.log('catalog_update', req.id);
      try{
        const res = await this.catalogs.update(req);
        if (this.saved_catalogs[req.id]){
            for (let elem of res.added ?? []){
                this.saved_catalogs[req.id].push(elem);
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
      return String(error);       
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
    for (const person of this.profile_info?.organization.persons ?? []){   
      if (ids.includes(person.id)){   
        result[person.id] = person   
        found_ids.push(person.id)   
      }   
      if (found_ids.length == ids.length) break;   
    }   
  
    // Затем среди roles 
    for (let role of this.profile_info?.organization.roles ?? []){   
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
          skype: "",   
          phone: ""   
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
      field.value = field.type == 'table' ? [] : (null as unknown as typeof field.value);     
  
      //Если у поля нет кода, он нас не интересует 
      if (!field.info?.code) continue;      
      let code = field.info.code;  
      //В named_fields записываем ключ - код и значение - объект field. Связь устанавливается по ссылке, чтобы изменения в словаре провоцировало измнеение в fields и all_fields и наоборот 
      new_form.named_fields[code] = field;  
  
      //Заполняем id_to_code (ключ - id поля, значение - code поля)  
      if (field.id && !new_form.id_to_code[field.id]) new_form.id_to_code[field.id] = code;  
  
      if (field.type == "text"){      
        let analyzed_ids: number[] = [];  
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
  
    new_form.named_fields["$current_step"]= {id: null, parent_id: null, name: "Этап задачи", code: "$current_step", info: {code: "$current_step"}, value: null, type: "number"};    
    new_form.all_fields.push(new_form.named_fields["$current_step"]); 
  
    new_form.named_fields["$parent_task_id"] = {id: null, parent_id: null, name: "Номер задачи", code: "$parent_task_id", info: {code: "$parent_task_id"}, value: null, type: "number"}; 
    new_form.all_fields.push(new_form.named_fields["$parent_task_id"]); 
    
    /*if (Object.keys(new_form.steps ?? {}).length){ 
        for (const step of Object.keys(new_form.steps)){ 
            new_form.named_fields[`$approver_step_${step}`] = {id: null, parent_id: null, name: `Согласующий этапа ${new_form.steps[step]}`, code: `$approver_step_${step}`, info: {code: `$approver_step_${step}`}, value: null, type: 'number'}; 
            new_form.all_fields.push(new_form.named_fields[`$approver_step_${step}`]); 
            new_form.named_fields[`$approver_choice_step_${step}`] = {id: null, parent_id: null, name: `Решение этапа ${new_form.steps[step]}`, code: `$approver_choice_step_${step}`, info: {code: `$approver_choice_step_${step}`}, value: null, type: 'text'}; 
            new_form.all_fields.push(new_form.named_fields[`$approver_step_${step}`]); 
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
          , new_form.named_fields['$approving_date'], new_form.named_fields['$approval_choice'], new_form.named_fields['$approval_user'] ])*/
    }  
  
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
      return String(error);      
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
      if (fixed_task){
        this.saved_tasks[fixed_task.id] = fixed_task; 
        return fixed_task; 
      }
      else return "Создание прошло успешно, но преобразование не удалось"
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
  async get_registry_with_fix(form_id: number, form_req: FormRegisterRequest | null = null): Promise<ExtendedTask[] | string>{      
    try{      
      const form_register = await this.forms.getTasks(form_id, form_req ?? {});     
      let return_register: ExtendedTask[] = [];     
      if (form_register.tasks?.length > 0){     
        for (let task of form_register.tasks){     
          task.form_id = form_id;     
          let fixed_task = await this.fix_task({...task, comments: []});     
          if (fixed_task) return_register.push(fixed_task);     
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
   * — добавляет в named_fields системные поля задачи ($task_id, $task_link, и т.д.). 
   * @param task Оригинальная задача (с комментариями) 
   * @returns Расширенную задачу или null, если нет доступа к форме 
   */ 
  async fix_task(task: TaskWithComments): Promise<ExtendedTask | null>{    
    let full_task: ExtendedTask = {...task, named_fields: {}, all_fields: [], named_comments: []};     
    if (!full_task.form_id) return full_task;     
  
    // Получаем форму и плоский список полей 
    const form = await this.get_form(full_task.form_id);     
    if (!form) return null;     
    full_task.all_fields = this.get_flat_fields(full_task.fields ?? []);     
    if (!full_task.subject) full_task.subject = `${form.name}:${task.id}`;
    // Копируем структуру полей формы и подменяем значения на фактические 
    full_task.named_fields = copy_by_value(form.named_fields);     
    for (let field of full_task.all_fields){     
      let field_code = form.id_to_code[field.id];     
      if (!field_code) continue;     
      full_task.named_fields[field_code] = field; 
      if (!field.value && field.value !== 0) field.value = (null as unknown as typeof field.value);     
  
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
  
  
    /*full_task.named_fields["$approver_table"].value = [];   
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
      }*/ 
  
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
      let options = field.info?.options;  
      for (const option of options ?? []){  
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
    let new_row: ExtendedTableRow = {row_id: -1, cells: [], named_cells: {}, added_now: true}   
    if (!form) return new_row;  
    const max_row_id = table.length > 0 ? Math.max(...table.map(row => row.row_id)) : 0; 
    const table_code = form.id_to_code[table_id];   
    let new_cells: FormField[] = [];   
    let named_cells: Record<string, FormField> = {};   
    // Клонируем все поля-колонки данной таблицы 
    for (let field of form.all_fields){   
      if (table_id != field.parent_id) continue; 
      let new_field = copy_by_value(field);   
      field.value = (null as unknown as typeof field.value); 
      const field_code = form.id_to_code[field.id] ? form.id_to_code[field.id] : field.info?.code; 
      if (field_code){   
        named_cells[field_code] = new_field;   
      }   
      if (new_field.id) new_cells.push(new_field); 
    } 
  
    // Конструируем строку и добавляем её в таблицу 
    new_row = {row_id: max_row_id + 1, cells: new_cells, named_cells: named_cells, added_now: true}   
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
    specific_id: number | null = null, 
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