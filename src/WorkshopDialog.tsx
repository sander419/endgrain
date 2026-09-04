/**
 * Настройки мастерской: чем подписывать документы и каким ключом открыт
 * платный слой.
 *
 * Всё, что здесь вводится, попадает в бумагу, которую видит клиент, поэтому
 * поля названы задачей («как подписывать документы»), а не сущностью
 * («реквизиты»). Диалог, а не вкладка: настраивают это один раз, а место
 * на экране нужно доске.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useWorkshop } from './WorkshopContext';
import {
  t,
  tcount,
  exportProfile,
  importProfile,
  MAX_LOGO_CHARS,
  PRICING,
  canContact,
  formatRub,
  purchaseLink,
  purchaseMessage,
} from './core';
import type { LicenseState } from './core';

interface Props {
  onClose: () => void;
}

/** `2027-09-01` → `01.09.2027`. Дата из ключа, не из локали браузера. */
export function formatIsoDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : iso;
}

export function licenseStatusText(license: LicenseState): string {
  if (license.tier === 'workshop') {
    // Проба называется пробой и считает дни: молчаливая проба, которая
    // однажды просто перестаёт работать, читается как поломка.
    if (license.trial) {
      if (license.daysLeft !== null && license.daysLeft <= 0) return t('license.status.trialLast');
      return t('license.status.trial', {
        days: tcount('unit.day', license.daysLeft ?? 0),
      });
    }
    return license.expiresAt
      ? t('license.status.valid', { date: formatIsoDay(license.expiresAt) })
      : t('license.status.perpetual');
  }
  if (license.reason === 'expired' && license.expiresAt) {
    return license.trial
      ? t('license.status.trialExpired', { date: formatIsoDay(license.expiresAt) })
      : t('license.status.expired', { date: formatIsoDay(license.expiresAt) });
  }
  if (license.reason === 'malformed') return t('license.status.malformed');
  if (license.reason === 'forged') return t('license.status.forged');
  return t('license.status.none');
}

const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const LOGO_LIMIT_KB = Math.round(MAX_LOGO_CHARS / 1024);

export function WorkshopDialog({ onClose }: Props) {
  const { profile, patch, replace, license, licenseKey, applyLicenseKey, storageFailed } =
    useWorkshop();
  const [draftKey, setDraftKey] = useState(licenseKey);
  const [note, setNote] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const profileFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setContact = (field: keyof typeof profile.contacts, value: string) =>
    patch({ contacts: { ...profile.contacts, [field]: value } });

  const onApplyKey = async () => {
    const state = await applyLicenseKey(draftKey);
    setNote(licenseStatusText(state));
  };

  const onRemoveKey = async () => {
    await applyLicenseKey('');
    setDraftKey('');
    setNote(t('license.status.none'));
  };

  const onLogo = (file: File | undefined) => {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setNote(t('workshop.field.logoWrongType'));
      return;
    }
    // Проверка до чтения: незачем тащить в память файл, который всё равно
    // не поместится в хранилище.
    if (file.size > MAX_LOGO_CHARS * 0.7) {
      setNote(t('workshop.field.logoTooBig', { limit: LOGO_LIMIT_KB }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result.length > MAX_LOGO_CHARS) {
        setNote(t('workshop.field.logoTooBig', { limit: LOGO_LIMIT_KB }));
        return;
      }
      patch({ logoDataUri: result });
      setNote(null);
    };
    reader.onerror = () => setNote(t('workshop.field.logoUnreadable'));
    reader.readAsDataURL(file);
  };

  const onExport = () => {
    const blob = new Blob([exportProfile(profile)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'endgrain-мастерская.json';
    link.click();
    URL.revokeObjectURL(url);
    setNote(t('workshop.export.done'));
  };

  const onImport = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const next = importProfile(typeof reader.result === 'string' ? reader.result : '');
      if (!next) {
        setNote(t('workshop.import.failed'));
        return;
      }
      replace(next);
      setNote(t('workshop.import.done'));
    };
    reader.onerror = () => setNote(t('workshop.import.failed'));
    reader.readAsText(file);
  };

  const pro = license.tier === 'workshop';
  // Покупателю показываем цену, пока он не купил. Пробе — тоже: она затем
  // и нужна, чтобы к концу срока человек знал, сколько это стоит.
  const paid = pro && !license.trial;

  /**
   * Кнопка запроса. Текст копируется отдельно: у личных чатов Telegram
   * нет параметра с сообщением, а письмо, которое надо сочинять самому,
   * пишут заметно реже.
   */
  const ask = (intent: 'trial' | 'year' | 'forever') => {
    const link = purchaseLink();
    if (!link) return null;
    const request = purchaseMessage(intent, profile.name);
    return (
      <div className="buy-actions">
        <a className="buy-link" href={link} target="_blank" rel="noreferrer noopener">
          {t('license.buy.write')}
        </a>
        <button
          className="link"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(request);
              setNote(t('license.buy.copied'));
            } catch {
              // Буфер может быть закрыт политикой браузера — тогда показываем
              // текст прямо в поле сообщения, копировать придётся руками.
              setNote(request);
            }
          }}
        >
          {t('license.buy.copy')}
        </button>
      </div>
    );
  };

  return (
    <div className="help-backdrop" onClick={onClose}>
      <div
        className="help workshop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workshop-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="workshop-title">{t('workshop.dialog.title')}</h2>
          <button ref={closeRef} className="icon" onClick={onClose} aria-label={t('workshop.action.close')}>✕</button>
        </header>

        <p className="help-lead">{t('workshop.dialog.lead')}</p>

        {storageFailed && <p className="advice movement-danger">{t('storage.full')}</p>}

        <h3>{t('license.section')}</h3>
        <p className={pro ? 'ok' : 'advice'}>
          <b>{pro ? t('license.tier.workshop') : t('license.tier.free')}</b>
          {license.tier === 'workshop' && license.workshop ? ` · ${license.workshop}` : ''}
          {' · '}
          {licenseStatusText(license)}
        </p>

        <label className="field">
          <span>{t('license.field.key')}</span>
          <textarea
            rows={2}
            value={draftKey}
            spellCheck={false}
            placeholder={t('license.field.keyPlaceholder')}
            onChange={(event) => setDraftKey(event.target.value)}
          />
        </label>
        <p className="help-note">{t('license.field.keyHint')}</p>
        <div className="workshop-actions">
          <button className="primary" onClick={onApplyKey} disabled={!draftKey.trim()}>
            {t('license.action.apply')}
          </button>
          <button onClick={onRemoveKey} disabled={!licenseKey}>{t('license.action.remove')}</button>
        </div>

        {!pro && <p className="help-note">{t('license.locked.body')}</p>}

        {!paid && (
          <div className="buy">
            <h4>{t('license.buy.title')}</h4>

            <div className="buy-row">
              <b>{t('license.buy.trial', { days: tcount('unit.day', PRICING.trialDays) })}</b>
              <span>{t('license.buy.trialNote')}</span>
              {ask('trial')}
            </div>

            <div className="buy-row">
              <b>{t('license.buy.year', { price: formatRub(PRICING.yearRub) })}</b>
              {ask('year')}
            </div>

            <div className="buy-row">
              <b>{t('license.buy.forever', { price: formatRub(PRICING.foreverRub) })}</b>
              {ask('forever')}
            </div>

            <p className="help-note">{t('license.buy.what')}</p>
            <p className="help-note">{t('license.buy.keepsWork')}</p>
            {!canContact() && <p className="advice">{t('license.buy.noContact')}</p>}
          </div>
        )}

        <h3>{t('workshop.section.identity')}</h3>

        <label className="field">
          <span>{t('workshop.field.name')}</span>
          <input
            type="text"
            value={profile.name}
            placeholder={t('workshop.field.namePlaceholder')}
            onChange={(event) => patch({ name: event.target.value })}
          />
        </label>

        <label className="field">
          <span>{t('workshop.field.contact')}</span>
          <input
            type="text"
            value={profile.contact}
            placeholder={t('workshop.field.contactPlaceholder')}
            onChange={(event) => patch({ contact: event.target.value })}
          />
        </label>

        <label className="field">
          <span>{t('workshop.field.about')}</span>
          <input
            type="text"
            value={profile.about}
            placeholder={t('workshop.field.aboutPlaceholder')}
            onChange={(event) => patch({ about: event.target.value })}
          />
        </label>

        <div className="workshop-logo">
          {profile.logoDataUri ? (
            <img src={profile.logoDataUri} alt="" />
          ) : (
            <span className="workshop-logo-empty"><Icon name="board" size={18} /></span>
          )}
          <div>
            <div className="workshop-actions">
              <button onClick={() => fileRef.current?.click()}>{t('workshop.field.logo')}</button>
              {profile.logoDataUri && (
                <button onClick={() => patch({ logoDataUri: '' })}>
                  {t('workshop.field.logoRemove')}
                </button>
              )}
            </div>
            <p className="help-note">{t('workshop.field.logoHint', { limit: LOGO_LIMIT_KB })}</p>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={LOGO_TYPES.join(',')}
          hidden
          onChange={(event) => {
            onLogo(event.target.files?.[0]);
            event.target.value = '';
          }}
        />

        <h3>{t('workshop.section.contacts')}</h3>
        <p className="help-note">{t('workshop.contacts.hint')}</p>

        <div className="workshop-contacts">
          <label className="field">
            <span>{t('workshop.field.phone')}</span>
            <input
              type="tel"
              value={profile.contacts.phone}
              placeholder={t('workshop.field.phonePlaceholder')}
              onChange={(event) => setContact('phone', event.target.value)}
            />
          </label>
          <label className="field">
            <span>{t('workshop.field.telegram')}</span>
            <input
              type="text"
              value={profile.contacts.telegram}
              placeholder={t('workshop.field.telegramPlaceholder')}
              onChange={(event) => setContact('telegram', event.target.value)}
            />
          </label>
          <label className="field">
            <span>{t('workshop.field.email')}</span>
            <input
              type="email"
              value={profile.contacts.email}
              onChange={(event) => setContact('email', event.target.value)}
            />
          </label>
          <label className="field">
            <span>{t('workshop.field.site')}</span>
            <input
              type="text"
              value={profile.contacts.site}
              onChange={(event) => setContact('site', event.target.value)}
            />
          </label>
        </div>

        <h3>{t('workshop.section.transfer')}</h3>
        <p className="help-note">{t('workshop.tools.hint')}</p>
        <div className="workshop-actions">
          <button onClick={onExport}><Icon name="download" size={13} />{t('workshop.action.export')}</button>
          <button onClick={() => profileFileRef.current?.click()}>{t('workshop.action.import')}</button>
        </div>
        <input
          ref={profileFileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            onImport(event.target.files?.[0]);
            event.target.value = '';
          }}
        />

        {note && <p className="workshop-note">{note}</p>}

        <div className="help-actions">
          <button className="primary" onClick={onClose}>{t('workshop.action.close')}</button>
        </div>
      </div>
    </div>
  );
}
