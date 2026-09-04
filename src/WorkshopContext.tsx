/**
 * Мастерская как контекст: профиль и лицензия в одном месте.
 *
 * Оба нужны в разных концах приложения — профиль в печатных листах и панели
 * экономики, лицензия в каждой платной кнопке, — и оба меняются редко.
 * Прокидывать их пропсами через студию мозаики и обратно значило бы
 * протащить их через десяток компонентов, которым они не нужны.
 *
 * Проверка ключа асинхронна (`crypto.subtle`), поэтому первый кадр всегда
 * бесплатный, а платное появляется, когда подпись сошлась. Это заметно
 * только тем, у кого ключ есть, и выглядит как обычная загрузка. Обратный
 * порядок — показать платное и отобрать — был бы хуже.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  FREE,
  loadLicenseKey,
  saveLicenseKey,
  verifyLicenseKey,
  loadProfile,
  saveProfile,
  isPro,
} from './core';
import type { LicenseState, WorkshopProfile } from './core';

interface WorkshopValue {
  profile: WorkshopProfile;
  /** Точечная правка профиля: пишет в хранилище и возвращает применённое. */
  patch: (changes: Partial<WorkshopProfile>) => void;
  /** Замена целиком — для загрузки профиля из файла. */
  replace: (profile: WorkshopProfile) => void;
  license: LicenseState;
  licenseKey: string;
  applyLicenseKey: (key: string) => Promise<LicenseState>;
  /** Открыт ли платный слой. Одно место, где это решается. */
  pro: boolean;
  /** Хранилище отказало хотя бы раз за сессию. */
  storageFailed: boolean;
  /** Сообщить об отказе записи из другого места — заказов, журнала факта. */
  reportStorageFailure: () => void;
}

const WorkshopContext = createContext<WorkshopValue | null>(null);

export function WorkshopProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<WorkshopProfile>(loadProfile);
  const [licenseKey, setLicenseKey] = useState<string>(loadLicenseKey);
  const [license, setLicense] = useState<LicenseState>(FREE);

  useEffect(() => {
    let cancelled = false;
    verifyLicenseKey(licenseKey)
      .then((state) => {
        if (!cancelled) setLicense(state);
      })
      .catch(() => {
        // Проверка не должна ронять приложение ни при каких условиях:
        // бесплатная часть работает и без неё.
        if (!cancelled) setLicense(FREE);
      });
    return () => {
      cancelled = true;
    };
  }, [licenseKey]);

  /**
   * Запись могла не пройти: приватный режим, отключённое хранилище,
   * переполнение. Флаг поднимается один раз и живёт до перезагрузки —
   * молчать об этом нельзя, иначе мастерская теряет настройки незаметно.
   */
  const [storageFailed, setStorageFailed] = useState(false);

  const reportStorageFailure = useCallback(() => setStorageFailed(true), []);

  const patch = useCallback((changes: Partial<WorkshopProfile>) => {
    setProfile((current) => {
      const stored = saveProfile({ ...current, ...changes });
      if (!stored.saved) setStorageFailed(true);
      return stored.value;
    });
  }, []);

  const replace = useCallback((next: WorkshopProfile) => {
    const stored = saveProfile(next);
    if (!stored.saved) setStorageFailed(true);
    setProfile(stored.value);
  }, []);

  const applyLicenseKey = useCallback(async (key: string) => {
    const state = await verifyLicenseKey(key);
    // Ключ сохраняется, даже если он просрочен или не сошёлся: человек должен
    // видеть в поле то, что вставил, и понимать, что именно не приняли.
    saveLicenseKey(key);
    setLicenseKey(key.trim());
    setLicense(state);
    return state;
  }, []);

  const value = useMemo<WorkshopValue>(
    () => ({
      profile,
      patch,
      replace,
      license,
      licenseKey,
      applyLicenseKey,
      pro: isPro(license),
      storageFailed,
      reportStorageFailure,
    }),
    [profile, patch, replace, license, licenseKey, applyLicenseKey, storageFailed, reportStorageFailure]
  );

  return <WorkshopContext.Provider value={value}>{children}</WorkshopContext.Provider>;
}

export function useWorkshop(): WorkshopValue {
  const value = useContext(WorkshopContext);
  if (!value) throw new Error('useWorkshop вне WorkshopProvider');
  return value;
}
