/**
 * Витрина мастерской: собрать каталог и забрать его файлом.
 *
 * Карточка не заполняется с нуля — она собирается из того, что уже посчитано:
 * снимок, размеры, породы, масса, номер рецепта, предложенная цена. Мастерской
 * остаётся дописать название и описание, то есть ровно то, чего инструмент
 * знать не может.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useWorkshop } from './WorkshopContext';
import {
  addShowcaseItem,
  buildShowcaseHtml,
  createShowcaseItem,
  exportShowcase,
  importShowcase,
  itemTitle,
  loadShowcase,
  moveShowcaseItem,
  removeShowcaseItem,
  saveShowcase,
  showcaseWeightBytes,
  t,
  updateShowcaseItem,
  visibleItems,
} from './core';
import type { BoardFacts, ShowcaseItem } from './core';
import { shrinkForShowcase } from './render/thumb';

interface Props {
  /** Доска, открытая сейчас, и способ снять её снимок. */
  board: { facts: BoardFacts; capture: () => string | null } | null;
  /** Цена, предложенная расчётом: подставляется в новую карточку. */
  suggestedPriceRub: number;
  onClose: () => void;
}

const money = (value: number) => Math.round(value).toLocaleString('ru-RU');

/** «1.4 МБ» — размер файла словами, чтобы решение было осознанным. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function fileName(workshop: string): string {
  const base = workshop.trim() || 'витрина';
  // Windows и OneDrive не принимают эти символы в имени файла.
  return `${base.replace(/[\\/:*?"<>|]/g, '-')} — доски.html`;
}

export function ShowcaseDialog({ board, suggestedPriceRub, onClose }: Props) {
  const { profile } = useWorkshop();
  const [items, setItems] = useState<ShowcaseItem[]>(loadShowcase);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const change = (next: ShowcaseItem[]) => {
    const result = saveShowcase(next);
    setItems(result.items);
    if (result.overflow) setNote(t('showcase.overflow'));
  };

  const hasContacts = useMemo(() => {
    const { phone, telegram, email } = profile.contacts;
    return !!(phone.trim() || telegram.trim() || email.trim());
  }, [profile.contacts]);

  const page = useMemo(
    () => ({
      workshop: profile.name,
      about: profile.about,
      logoDataUri: profile.logoDataUri,
      contacts: profile.contacts,
      items,
    }),
    [profile, items]
  );

  const shown = visibleItems(items);
  const weight = showcaseWeightBytes(items);

  const add = async () => {
    if (!board || busy) return;
    setBusy(true);
    try {
      const image = await shrinkForShowcase(board.capture() ?? '');
      const facts = board.facts;
      change(
        addShowcaseItem(
          items,
          createShowcaseItem({
            imageDataUri: image,
            code: facts.code,
            dna: facts.dna,
            mode: facts.mode,
            lengthMm: facts.lengthMm,
            widthMm: facts.widthMm,
            thicknessMm: facts.thicknessMm,
            massKg: facts.massKg,
            species: facts.species.map((item) => item.name),
            priceRub: Math.round(suggestedPriceRub),
          })
        )
      );
      setNote(t('showcase.added'));
    } finally {
      setBusy(false);
    }
  };

  const patch = (id: string, changes: Partial<ShowcaseItem>) =>
    change(updateShowcaseItem(items, id, changes));

  const download = () => {
    const blob = new Blob([buildShowcaseHtml(page)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName(profile.name);
    link.click();
    URL.revokeObjectURL(url);
    setNote(t('showcase.downloaded'));
  };

  const preview = () => {
    const blob = new Blob([buildShowcaseHtml(page)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    // Ссылку не отзываем сразу: вкладка ещё не успела её прочитать.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const onExport = () => {
    const blob = new Blob([exportShowcase(items)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'endgrain-витрина.json';
    link.click();
    URL.revokeObjectURL(url);
    setNote(t('showcase.exported'));
  };

  const onImport = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const loaded = importShowcase(typeof reader.result === 'string' ? reader.result : '');
      if (!loaded) {
        setNote(t('showcase.importFailed'));
        return;
      }
      change(loaded);
      setNote(t('showcase.imported', { count: loaded.length }));
    };
    reader.onerror = () => setNote(t('showcase.importFailed'));
    reader.readAsText(file);
  };

  return (
    <div className="help-backdrop" onClick={onClose}>
      <div
        className="help showcase-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="showcase-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="showcase-title">{t('showcase.title')}</h2>
          <button ref={closeRef} className="icon" onClick={onClose} aria-label={t('workshop.action.close')}>✕</button>
        </header>

        <p className="help-lead">{t('showcase.lead')}</p>

        {!hasContacts && <p className="advice">{t('showcase.noContacts')}</p>}

        <div className="workshop-actions">
          <button className="primary" onClick={add} disabled={!board || busy}>
            <Icon name="board" size={13} />
            {t('showcase.action.add')}
          </button>
          {!board && <span className="help-note">{t('showcase.noBoard')}</span>}
        </div>

        {items.length === 0 ? (
          <p className="help-note">{t('showcase.empty')}</p>
        ) : (
          <>
            <p className="help-note">
              {t('showcase.count', { shown: shown.length, total: items.length })}
              {' · '}
              {t('showcase.weight', { size: formatBytes(weight) })}
            </p>

            <ul className="showcase-list">
              {items.map((item, index) => (
                <li key={item.id} className={item.hidden ? 'off' : ''}>
                  {item.imageDataUri ? (
                    <img src={item.imageDataUri} alt="" />
                  ) : (
                    <span className="showcase-noimage"><Icon name="board" size={18} /></span>
                  )}

                  <div className="showcase-fields">
                    <input
                      type="text"
                      value={item.title}
                      placeholder={t('showcase.field.titlePlaceholder')}
                      aria-label={t('showcase.field.title')}
                      onChange={(event) => patch(item.id, { title: event.target.value })}
                    />
                    <input
                      type="text"
                      value={item.description}
                      placeholder={t('showcase.field.descriptionPlaceholder')}
                      aria-label={t('showcase.field.description')}
                      onChange={(event) => patch(item.id, { description: event.target.value })}
                    />
                    <div className="showcase-row">
                      <label>
                        <span>{t('showcase.field.price')}</span>
                        <input
                          type="number" min={0} step={100}
                          value={item.priceRub}
                          onChange={(event) => patch(item.id, { priceRub: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        <span>{t('showcase.field.lead')}</span>
                        <input
                          type="text"
                          value={item.leadTime}
                          placeholder={t('showcase.field.leadPlaceholder')}
                          onChange={(event) => patch(item.id, { leadTime: event.target.value })}
                        />
                      </label>
                    </div>
                    <p className="showcase-meta">
                      {itemTitle(item)} · {Math.round(item.lengthMm)} × {Math.round(item.widthMm)} ·{' '}
                      {item.code ? `№ ${item.code}` : '—'}
                      {item.priceRub > 0 ? ` · ${money(item.priceRub)} ₽` : ''}
                    </p>
                    <div className="showcase-actions">
                      <button className="link" onClick={() => change(moveShowcaseItem(items, item.id, -1))} disabled={index === 0}>
                        {t('showcase.action.up')}
                      </button>
                      <button className="link" onClick={() => change(moveShowcaseItem(items, item.id, 1))} disabled={index === items.length - 1}>
                        {t('showcase.action.down')}
                      </button>
                      <button className="link" onClick={() => patch(item.id, { hidden: !item.hidden })}>
                        {item.hidden ? t('showcase.action.show') : t('showcase.action.hide')}
                      </button>
                      <button
                        className="link"
                        onClick={() => {
                          change(removeShowcaseItem(items, item.id));
                          setNote(t('showcase.removed'));
                        }}
                      >
                        {t('showcase.action.remove')}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <div className="workshop-actions">
              <button className="primary" onClick={download} disabled={shown.length === 0}>
                <Icon name="download" size={13} />
                {t('showcase.action.download')}
              </button>
              <button onClick={preview} disabled={shown.length === 0}>
                {t('showcase.action.preview')}
              </button>
            </div>
          </>
        )}

        <div className="workshop-actions">
          <button onClick={onExport} disabled={items.length === 0}>{t('showcase.action.export')}</button>
          <button onClick={() => fileRef.current?.click()}>{t('showcase.action.import')}</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            onImport(event.target.files?.[0]);
            event.target.value = '';
          }}
        />

        {note && <p className="workshop-note">{note}</p>}
      </div>
    </div>
  );
}
