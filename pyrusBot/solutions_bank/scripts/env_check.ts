import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseArgs } from './lib/env';

/**
 * Проверка и фиксация состояния окружения рабочего места.
 * 
 * Фиксирует ПК и дату последней успешной проверки в `.env_state.json`.
 * Если ПК изменился или прошло более 7 дней — возвращает ненулевой код,
 * сигнализируя Оркестратору и инженеру о необходимости первичной проверки.
 *
 * Usage:
 *   npx tsx solutions_bank/scripts/env_check.ts           # проверка актуальности (exit 0 если свежее)
 *   npx tsx solutions_bank/scripts/env_check.ts --record  # записать текущий ПК и время
 */

const CWD = process.cwd();
const STATE_FILE = path.join(CWD, '.env_state.json');
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

interface EnvState {
    last_check_at: string;
    hostname: string;
    status: string;
}

const args = parseArgs();

if (args.has('record')) {
    const state: EnvState = {
        last_check_at: new Date().toISOString(),
        hostname: os.hostname(),
        status: 'valid',
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
    console.log(`✅ Состояние окружения зафиксировано (ПК: ${state.hostname}, время: ${state.last_check_at}).`);
    process.exit(0);
}

if (!fs.existsSync(STATE_FILE)) {
    console.log('⚠️ Файл .env_state.json не найден. Требуется первичная проверка окружения.');
    process.exit(1);
}

try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const state: EnvState = JSON.parse(raw);
    const currentHost = os.hostname();
    const ageMs = Date.now() - new Date(state.last_check_at).getTime();
    const daysOld = (ageMs / (1000 * 60 * 60 * 24)).toFixed(1);

    if (state.hostname !== currentHost) {
        console.log(`⚠️ Проект запущен на новом ПК ("${currentHost}" вместо "${state.hostname}"). Требуется проверка окружения (bootstrap.ps1).`);
        process.exit(1);
    }

    if (ageMs > MAX_AGE_MS) {
        console.log(`⚠️ Последняя проверка окружения проводилась ${daysOld} дней назад (более 7 дней). Требуется повторная проверка.`);
        process.exit(1);
    }

    console.log(`✅ Окружение актуально (ПК: ${currentHost}, проверке ${daysOld} дн., дата: ${state.last_check_at}).`);
    process.exit(0);
} catch (e) {
    console.log('⚠️ Не удалось прочитать .env_state.json. Требуется проверка окружения.');
    process.exit(1);
}
