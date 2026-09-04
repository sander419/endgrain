#!/usr/bin/env node
/**
 * Выпуск лицензионных ключей мастерским.
 *
 * Приватный ключ живёт только здесь, на машине автора, и в репозиторий
 * не попадает: tools/license-private.jwk.json стоит в .gitignore.
 * Публичный — не секрет, лежит в src/core/licensePublicKey.ts и едет
 * в бандл, потому что именно им приложение проверяет подпись.
 *
 * Зависимостей нет: node:crypto умеет WebCrypto с 16-й версии.
 *
 *   node tools/issue-license.mjs --ask        ← вопросы вместо флагов
 *   node tools/issue-license.mjs keygen
 *   node tools/issue-license.mjs --workshop "Хиборг" --trial
 *   node tools/issue-license.mjs --workshop "Хиборг" --months 12
 *   node tools/issue-license.mjs --workshop "Хиборг" --perpetual
 *   node tools/issue-license.mjs --check <ключ>
 *
 * Команда печатает готовое сообщение покупателю: ключ, срок и что с ним
 * делать. Собирать письмо руками каждый раз — способ рано или поздно
 * отправить чужой ключ не тому.
 */
import { webcrypto } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRIVATE_PATH = join(HERE, 'license-private.jwk.json');
const PUBLIC_MODULE = join(HERE, '..', 'src', 'core', 'licensePublicKey.ts');
const ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN = { name: 'ECDSA', hash: 'SHA-256' };

/** Сколько длится проба по умолчанию. Две недели — это два-три реальных заказа. */
const TRIAL_DAYS = 14;

function toBase64Url(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input);
  return Buffer.from(bytes).toString('base64url');
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item.startsWith('--')) {
      const name = item.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) args[name] = true;
      else {
        args[name] = next;
        i += 1;
      }
    } else args._.push(item);
  }
  return args;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function keygen() {
  if (await exists(PRIVATE_PATH)) {
    // Перевыпуск пары обнуляет ВСЕ ранее проданные ключи. Это не то, что
    // случайно делают одной командой.
    console.error(`Приватный ключ уже есть: ${PRIVATE_PATH}`);
    console.error('Новая пара сделает недействительными все выданные лицензии.');
    console.error('Если это правда нужно — удалите файл руками и повторите.');
    process.exitCode = 1;
    return;
  }

  const pair = await webcrypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify']);
  const privateJwk = await webcrypto.subtle.exportKey('jwk', pair.privateKey);
  const publicJwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);

  await writeFile(PRIVATE_PATH, `${JSON.stringify(privateJwk, null, 2)}\n`, 'utf8');
  await writeFile(PUBLIC_MODULE, publicKeyModule(publicJwk), 'utf8');

  console.log(`Приватный ключ: ${PRIVATE_PATH}`);
  console.log('  Он не в репозитории. Потеряете — придётся перевыпускать все лицензии.');
  console.log('  Сделайте копию там же, где храните остальные секреты.');
  console.log(`Публичный ключ записан в ${PUBLIC_MODULE} — его нужно закоммитить.`);
}

function publicKeyModule(jwk) {
  return `/**
 * Публичный ключ, которым приложение проверяет подпись лицензии.
 *
 * Файл сгенерирован: node tools/issue-license.mjs keygen
 * Руками не править. Смена этой пары делает недействительными все выданные
 * ключи, поэтому она и вынесена в отдельный файл — чтобы такое изменение
 * было видно в диффе одной строкой, а не терялось среди правок логики.
 *
 * Секрета здесь нет: публичный ключ на то и публичный.
 */
export const PUBLIC_KEY: JsonWebKey = {
  kty: '${jwk.kty}',
  crv: '${jwk.crv}',
  x: '${jwk.x}',
  y: '${jwk.y}',
  ext: true,
};
`;
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

async function issue(args) {
  const workshop = typeof args.workshop === 'string' ? args.workshop.trim() : '';
  if (!workshop) {
    console.error('Укажите мастерскую: --workshop "Название"');
    console.error('Название попадает в документы клиенту и подписано ключом.');
    process.exitCode = 1;
    return;
  }

  if (!(await exists(PRIVATE_PATH))) {
    console.error(`Приватного ключа нет: ${PRIVATE_PATH}`);
    console.error('Сначала: node tools/issue-license.mjs keygen');
    process.exitCode = 1;
    return;
  }

  const trial = args.trial === true || args.trial !== undefined;
  const trialDays = trial ? Number(args.trial === true ? TRIAL_DAYS : args.trial) : 0;
  if (trial && (!Number.isFinite(trialDays) || trialDays <= 0)) {
    console.error('--trial без значения даёт 14 дней; с значением — положительное число дней');
    process.exitCode = 1;
    return;
  }

  const months = trial || args.perpetual ? null : Number(args.months ?? 12);
  if (months !== null && (!Number.isFinite(months) || months <= 0)) {
    console.error('--months должно быть положительным числом, либо укажите --perpetual');
    process.exitCode = 1;
    return;
  }

  const issued = new Date();
  const payload = { v: 1, w: workshop, p: 'workshop', i: isoDay(issued) };
  if (trial) {
    const expires = new Date(issued);
    expires.setDate(expires.getDate() + trialDays);
    payload.e = isoDay(expires);
    // Проба помечена в теле, поэтому её нельзя выдать за покупку: пометка
    // подписана вместе со сроком и названием.
    payload.k = 'trial';
  } else if (months !== null) {
    const expires = new Date(issued);
    expires.setMonth(expires.getMonth() + months);
    payload.e = isoDay(expires);
  }

  const privateJwk = JSON.parse(await readFile(PRIVATE_PATH, 'utf8'));
  const privateKey = await webcrypto.subtle.importKey('jwk', privateJwk, ALGORITHM, false, ['sign']);

  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signature = await webcrypto.subtle.sign(
    SIGN,
    privateKey,
    new TextEncoder().encode(payloadB64)
  );
  const key = `${payloadB64}.${toBase64Url(signature)}`;

  console.log(`Мастерская: ${workshop}`);
  console.log(`Тип:        ${trial ? `проба на ${trialDays} дн.` : 'покупка'}`);
  console.log(`Выпущен:    ${payload.i}`);
  console.log(`Действует:  ${payload.e ?? 'бессрочно'}`);
  console.log(`Длина:      ${key.length} символов`);
  console.log('');
  const text = message(workshop, key, payload, trial, trialDays);
  console.log('─── сообщение покупателю ───────────────────────────────');
  console.log(text);
  console.log('────────────────────────────────────────────────────────');

  if (args.copy) {
    const copied = await copyToClipboard(text);
    console.log('');
    console.log(
      copied
        ? 'Сообщение скопировано в буфер обмена — вставляйте в переписку.'
        : 'Скопировать в буфер не вышло: выделите текст выше мышью.'
    );
  }
}

/** Готовый текст: скопировать и отправить. */
function message(workshop, key, payload, trial, trialDays) {
  const until = payload.e ? `до ${payload.e.split('-').reverse().join('.')}` : 'бессрочно';
  const head = trial
    ? `Ключ для «${workshop}» — проба на ${trialDays} дней, ${until}.`
    : `Ключ для «${workshop}», действует ${until}.`;

  return [
    head,
    '',
    key,
    '',
    'Что делать: откройте sander419.github.io/endgrain/, нажмите «Моя мастерская»',
    'в шапке, вставьте ключ в поле и нажмите «Применить».',
    '',
    'Ключ проверяется на вашем компьютере, без интернета. Он привязан',
    'к мастерской, а не к машине: переносите на любое число рабочих мест.',
    'Профиль и заказы храните файлом — кнопки выгрузки там же.',
    ...(trial
      ? [
          '',
          'После пробы всё сделанное остаётся: заказы, витрина, журнал факта',
          'никуда не денутся, просто перестанут открываться платные вкладки.',
        ]
      : []),
  ].join('\n');
}

async function check(key) {
  // Публичный ключ лежит в модуле на TypeScript, который Node не импортирует.
  // Достаём x и y текстом: это вспомогательная команда, ради неё не стоит
  // тянуть в инструмент сборку.
  const source = await readFile(PUBLIC_MODULE, 'utf8');
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    // Якорь на начало строки обязателен: без него `y: '…'` находится
    // внутри `kty: 'EC'`, и в ключ уезжает «EC» вместо координаты.
    x: source.match(/^\s+x: '([^']+)'/m)?.[1],
    y: source.match(/^\s+y: '([^']+)'/m)?.[1],
    ext: true,
  };
  if (!jwk.x || !jwk.y) {
    console.error(`Публичный ключ не читается из ${PUBLIC_MODULE}`);
    process.exitCode = 1;
    return;
  }

  const [payloadB64, signatureB64] = String(key).trim().split('.');
  if (!payloadB64 || !signatureB64) {
    console.error('Ключ не разбирается: ожидается «тело.подпись»');
    process.exitCode = 1;
    return;
  }

  const publicKey = await webcrypto.subtle.importKey('jwk', jwk, ALGORITHM, false, ['verify']);
  const ok = await webcrypto.subtle.verify(
    SIGN,
    publicKey,
    Buffer.from(signatureB64, 'base64url'),
    new TextEncoder().encode(payloadB64)
  );

  if (!ok) {
    // Тело подделанного ключа читать нечего: оно не наше. Разбирать его
    // и печатать «мастерская такая-то» значило бы придать ему вид документа.
    console.error('Подпись:    НЕ СХОДИТСЯ');
    process.exitCode = 1;
    return;
  }

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  console.log('Подпись:    сходится');
  console.log(`Мастерская: ${payload.w}`);
  console.log(`Выпущен:    ${payload.i}`);
  console.log(`Действует:  ${payload.e ?? 'бессрочно'}`);
}

/**
 * Положить текст в буфер обмена Windows.
 *
 * Через PowerShell, а не через `clip.exe`: clip определяет Unicode только
 * по метке порядка байт, и эта метка потом остаётся первым символом
 * вставленного текста — невидимой, но настоящей. Сообщение клиенту,
 * начинающееся с невидимого символа, — мелочь ровно до первого раза,
 * когда она где-нибудь вылезет.
 *
 * Текст едет через временный файл: передавать его аргументом командной
 * строки нельзя — кавычки и переводы строк в нём есть всегда.
 */
async function copyToClipboard(text) {
  if (process.platform !== 'win32') return false;
  const file = join(tmpdir(), `endgrain-key-${process.pid}.txt`);
  try {
    await writeFile(file, text, 'utf8');
    const done = await new Promise((resolve) => {
      const ps = spawn('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Set-Clipboard -Value (Get-Content -Raw -Encoding UTF8 -LiteralPath '${file}')`,
      ]);
      ps.on('error', () => resolve(false));
      ps.on('close', (code) => resolve(code === 0));
    });
    return done;
  } catch {
    return false;
  } finally {
    // Ключ не секрет от того, кто его выпустил, но и валяться во временной
    // папке ему незачем.
    await rm(file, { force: true }).catch(() => {});
  }
}

/**
 * Ответы на вопросы.
 *
 * В терминале — обычный диалог. Когда ввод не терминал (скрипт, конвейер),
 * весь он читается сразу и раздаётся по строкам: `readline` на закрытом
 * потоке гонится с событием `close`, и ответ, который уже есть, теряется.
 * Гонку проще убрать, чем выиграть, — заодно инструмент становится
 * пригодным для скриптов.
 */
async function answers(prompts) {
  if (!process.stdin.isTTY) {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    const lines = input.split(/\r?\n/);
    prompts.forEach((prompt, index) => console.log(prompt + (lines[index] ?? '')));
    return prompts.map((_, index) => lines[index] ?? '');
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const given = [];
    for (const prompt of prompts) given.push(await rl.question(prompt));
    return given;
  } finally {
    rl.close();
  }
}

async function ask() {
  console.log('Кому выдаём ключ?');
  console.log('');
  console.log('  1 — проба на 14 дней');
  console.log('  2 — ключ на год');
  console.log('  3 — бессрочный ключ');
  console.log('');

  const [rawName, rawChoice] = await answers(['Название мастерской: ', 'Что выдаём? [1]: ']);
  const workshop = rawName.trim();

  if (!workshop) {
    console.error('');
    console.error('Пусто — ключ не выпущен. Название подписывается вместе с ключом.');
    process.exitCode = 1;
    return null;
  }

  const choice = rawChoice.trim() || '1';
  console.log('');

  if (choice === '2') return { workshop, months: '12' };
  if (choice === '3') return { workshop, perpetual: true };
  return { workshop, trial: true };
}

const args = parseArgs(process.argv.slice(2));
if (args._[0] === 'keygen') await keygen();
else if (args.check) await check(args.check);
else if (args.ask) {
  const answers = await ask();
  if (answers) await issue({ ...answers, _: [], copy: true });
} else await issue(args);
