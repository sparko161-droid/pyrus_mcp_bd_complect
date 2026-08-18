import { PyrusApiClient } from 'pyrus-api';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Общая загрузка конфигурации для всех скриптов автоматизации.
 * Ни один скрипт не должен хардкодить ID разделов Базы знаний или читать .env сам.
 */

let loaded = false;

export function loadEnv(): void {
    if (loaded) return;
    loaded = true;
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        if (/^\s*#/.test(line)) continue;
        const m = line.match(/^([^=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim();
    }
}

function required(name: string): string {
    loadEnv();
    const v = process.env[name];
    if (!v) {
        console.error(`Ошибка: переменная окружения ${name} не задана. Добавьте её в .env (см. .env.example).`);
        process.exit(1);
    }
    return v;
}

/**
 * Клиент для НАШЕГО аккаунта: Базы знаний, выгрузки дерева, синхронизации.
 * Ключ личный у каждого инженера — иначе в Базе знаний не виден автор правки.
 */
export function getClient(): PyrusApiClient {
    return new PyrusApiClient(authFor());
}

export interface PyrusAuth {
    login: string;
    security_key: string;
    /**
     * Идентификатор сотрудника в конкретной организации.
     *
     * Обязателен, когда одна почта заведена в нескольких организациях: без него
     * Pyrus не понимает, в какую из них выдавать токен, и авторизация не проходит.
     * У инженера внедрения это обычный случай — он состоит в аккаунтах всех клиентов.
     */
    person_id?: string;
}

/**
 * Доступы к API конкретного клиента.
 *
 * У каждого клиента свой аккаунт Pyrus и свои доступы: один ключ на всех не
 * работает.
 *
 * Рабочие значения читаются отсюда — из `.env`, который в `.gitignore`, чтобы
 * скрипты не зависели от того, открыта ли сейчас документация. Сами доступы при
 * этом фиксируются в статье «Доступы и интеграции» кабинета клиента: по политике
 * компании это допустимо, репозиторий и База знаний закрытые.
 *
 * Имя переменных строится по номеру кабинета: для `clients/02_Локанта_СубДилер_iiko`
 * это `PYRUS_CLIENT_02_LOGIN`, `PYRUS_CLIENT_02_SECURITY_KEY`, `PYRUS_CLIENT_02_PERSON_ID`.
 * Без указания клиента берутся наши собственные доступы.
 */
export function authFor(clientKey?: string): PyrusAuth {
    loadEnv();

    if (!clientKey) {
        return {
            login: required('PYRUS_LOGIN'),
            security_key: required('PYRUS_SECURITY_KEY'),
            person_id: process.env.PYRUS_PERSON_ID || undefined
        };
    }

    // Из «02_Локанта_СубДилер_iiko» берём номер: имена переменных должны быть
    // короткими и латиницей, а номер кабинета уникален и не меняется.
    const num = clientKey.match(/^(\d+)/)?.[1] ?? clientKey;
    const prefix = `PYRUS_CLIENT_${num}`;

    const login = process.env[`${prefix}_LOGIN`];
    const key = process.env[`${prefix}_SECURITY_KEY`];

    if (!login || !key) {
        console.error(`Доступов к API клиента ${clientKey} нет в .env.\n`);
        console.error('У каждого клиента свой аккаунт Pyrus. Запросите у него три значения:');
        console.error('  1. логин интеграции (client id);');
        console.error('  2. ключ интеграции (client secret);');
        console.error('  3. идентификатор сотрудника в его организации (person_id / org id) —');
        console.error('     он обязателен, если ваша почта заведена в нескольких организациях,');
        console.error('     а у инженера внедрения это обычное дело: без него токен не выдаётся.\n');
        console.error(`Затем добавьте в .env:\n  ${prefix}_LOGIN=...\n  ${prefix}_SECURITY_KEY=...\n  ${prefix}_PERSON_ID=...`);
        process.exit(1);
    }

    return { login, security_key: key, person_id: process.env[`${prefix}_PERSON_ID`] || undefined };
}

/** Клиент API для аккаунта заказчика. */
export function getClientApi(clientKey: string): PyrusApiClient {
    return new PyrusApiClient(authFor(clientKey) as any);
}

/** Клиенты, для которых доступы уже прописаны. */
export function configuredClients(): string[] {
    loadEnv();
    return Object.keys(process.env)
        .map(k => k.match(/^PYRUS_CLIENT_(\w+?)_LOGIN$/)?.[1])
        .filter((v): v is string => Boolean(v))
        .sort();
}

/** Корень клиентского (публикуемого) дерева документации. */
export function kbRootPublic(): string {
    return required('PYRUS_KB_ROOT_PUBLIC');
}

/** Корень внутреннего дерева: ТЗ, спецификации, код, банк решений. Клиентам не показывается. */
export function kbRootInternal(): string {
    return required('PYRUS_KB_ROOT_INTERNAL');
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Обёртка для вызовов Pyrus API.
 *
 * Сеть до api.pyrus.com регулярно отвечает единицы секунд, а серия быстрых
 * последовательных запросов стабильно ловит `fetch failed`. Без ретраев любой
 * прогон синхронизации на несколько десятков статей разваливается на середине
 * и оставляет дерево в полусинхронизированном виде.
 */
export async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 4): Promise<T> {
    let lastError: any;
    for (let i = 1; i <= attempts; i++) {
        try {
            return await fn();
        } catch (e: any) {
            lastError = e;
            const transient = /fetch failed|ETIMEDOUT|ECONNRESET|socket hang up|429|500|502|503|504/i.test(e?.message || '');
            if (!transient || i === attempts) break;
            const backoff = 500 * 2 ** (i - 1);
            console.log(`    ↻ ${label}: попытка ${i}/${attempts} не прошла (${e?.message}), повтор через ${backoff} мс`);
            await sleep(backoff);
        }
    }
    throw lastError;
}

/** Разбор общих флагов командной строки. */
export function parseArgs(argv: string[] = process.argv.slice(2)) {
    const flags = new Set(argv.filter(a => a.startsWith('--')).map(a => a.split('=')[0]));
    const value = (name: string) => {
        const hit = argv.find(a => a.startsWith(`--${name}=`));
        return hit ? hit.slice(name.length + 3) : undefined;
    };
    return {
        dryRun: flags.has('--dry-run'),
        yes: flags.has('--yes'),
        client: value('client'),
        has: (f: string) => flags.has(`--${f}`),
        value
    };
}

/**
 * Страховка для операций, которые нельзя отменить (удаление и перенос в Базе знаний).
 * Без явного --yes скрипт обязан остановиться: Base знаний общая корпоративная,
 * случайный запуск затрагивает чужие разделы.
 */
export function requireConfirmation(action: string, targets: string[], yes: boolean): void {
    console.log(`\nОПЕРАЦИЯ БЕЗ ОТМЕНЫ: ${action}`);
    targets.forEach(t => console.log(`  - ${t}`));
    if (!yes) {
        console.error(`\nОстановлено. Проверьте список выше и повторите с флагом --yes.`);
        process.exit(2);
    }
    console.log('Подтверждено флагом --yes.\n');
}
