/**
 * Паспорт изделия — вкладыш в коробку покупателю.
 *
 * Он делает две вещи сразу. Первая: спасает доску. Торцевая доска умирает
 * от посудомойки, замачивания и сушки у батареи, и покупатель, который об этом
 * не знает, через полгода считает, что мастерская продала брак. Вторая:
 * возвращает покупателя. Номер рецепта на бумаге — единственный способ
 * повторить доску точь-в-точь, и назвать его можно только той мастерской,
 * которая её сделала.
 */
import { t } from './core';
import type { BoardFacts, WorkshopProfile } from './core';
import { documentTitle } from './core';
import { formatIsoDay } from './WorkshopDialog';

interface Props {
  facts: BoardFacts;
  profile: WorkshopProfile;
  licensedTo?: string;
  /** День изготовления, ISO. */
  madeAt: string;
  boardImage: string | null;
}

const CARE_KEYS = [
  'passport.care.wash',
  'passport.care.soak',
  'passport.care.oil',
  'passport.care.dry',
  'passport.care.heat',
  'passport.care.frozen',
] as const;

export function PassportSheet({ facts, profile, licensedTo, madeAt, boardImage }: Props) {
  const title = documentTitle(profile, licensedTo);

  return (
    <div className="print-sheet passport-sheet">
      <header className="sheet-head">
        {profile.logoDataUri && <img className="sheet-logo" src={profile.logoDataUri} alt="" />}
        <div>
          {title && <div className="sheet-workshop">{title}</div>}
          {profile.contact && <div className="sheet-contact">{profile.contact}</div>}
        </div>
      </header>

      <h1>{t('passport.title')}</h1>
      <p className="sub">{t('passport.made', { date: formatIsoDay(madeAt) })}</p>

      {boardImage && <img className="preview" src={boardImage} alt="" />}

      <table>
        <tbody>
          <tr>
            <td>{t('passport.size')}</td>
            <td>
              {Math.round(facts.lengthMm)} × {Math.round(facts.widthMm)} ×{' '}
              {Math.round(facts.thicknessMm)} мм
            </td>
          </tr>
          <tr>
            <td>{t('passport.weight')}</td>
            <td>{facts.massKg > 0 ? `${facts.massKg.toFixed(1)} кг` : '—'}</td>
          </tr>
          <tr>
            <td>{t('passport.species')}</td>
            <td>
              {facts.species.length
                ? facts.species
                    .map((item) =>
                      item.scientificName ? `${item.name} (${item.scientificName})` : item.name
                    )
                    .join(', ')
                : '—'}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="note">{t('passport.wood')}</p>

      <h2>{t('passport.care')}</h2>
      <ul>
        {CARE_KEYS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>

      {facts.code && (
        <>
          <h2>{t('passport.repeat')}</h2>
          <p>
            <b>{t('orders.code', { code: facts.code })}</b>
          </p>
          <p className="note">{t('passport.repeat.body')}</p>
        </>
      )}

      <footer>
        {title && <p className="note">{title}</p>}
        {profile.contact && <p className="note">{profile.contact}</p>}
      </footer>
    </div>
  );
}
