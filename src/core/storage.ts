/**
 * Хранилище браузера: чтение и запись с честным ответом «не влезло».
 *
 * До этого модуля каждый `save*` глушил ошибку записи молча. Для настройки
 * это было терпимо, для заказов и журнала факта — нет: мастерская заводит
 * заказ, закрывает вкладку и обнаруживает, что его нет. Молчаливая потеря
 * данных — худшее, что может сделать инструмент, который ведёт чужой учёт.
 *
 * Отсюда правило: запись возвращает результат, а вызывающий обязан его
 * показать. Проглотить `false` тоже можно, но теперь это видно в коде.
 *
 * БЮДЖЕТ. Браузеры дают примерно 5 МБ на источник, и это на всё вместе:
 * профиль с логотипом, заказы с ДНК, витрину с картинками, журнал факта.
 * Поэтому пределы отдельных списков заданы не «сколько не жалко», а так,
 * чтобы их сумма помещалась с запасом (см. `STORAGE_BUDGET`).
 */

/**
 * Сколько всего мы себе позволяем, байт. Половина типичной квоты: вторая
 * половина — запас на служебные ключи и на браузеры, где квота меньше.
 */
export const STORAGE_BUDGET = 2_500_000;

export function readJson(key: string): unknown {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : undefined;
  } catch {
    // Приватный режим, отключённое хранилище или битые данные — всё это
    // значит «сохранённого нет», а не «приложение сломано».
    return undefined;
  }
}

/** `true` — записано. `false` — переполнено или недоступно. */
export function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* нечего удалять или хранилище недоступно */
  }
}

/** Результат записи: что сохранили и получилось ли. */
export interface Stored<T> {
  value: T;
  /** `false` — данные живут только до перезагрузки, и это надо показать. */
  saved: boolean;
}

/**
 * Сколько занимают наши ключи. Считается по длине строк: точного размера
 * браузер не сообщает, а порядок величины нужен, чтобы предупредить заранее,
 * а не в момент отказа.
 */
export function usedBytes(prefix = 'endgrain.'): number {
  try {
    let total = 0;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(prefix)) continue;
      total += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
    return total;
  } catch {
    return 0;
  }
}
