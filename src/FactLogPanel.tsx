/**
 * Журнал факта: план против того, что вышло.
 *
 * Единственная панель, которая делает расчёт точнее не формулой, а данными
 * мастерской. Поэтому и полей в ней ровно два обязательных — часы и материал:
 * человек у станка не переключает секундомер между фугованием и склейкой,
 * и требовать разбивку по операциям значило бы получить пустой журнал.
 */
import { useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { useWorkshop } from './WorkshopContext';
import {
  CONFIDENT_BOARDS,
  DEFAULT_TIME_NORMS,
  addFactEntry,
  createFactEntry,
  estimateTime,
  exportFactLog,
  formatDuration,
  importFactLog,
  loadFactLog,
  removeFactEntry,
  saveFactLog,
  summariseFactLog,
  t,
  tcount,
  todayIso,
} from './core';
import type { BoardFacts, FactEntry, ProductionInput } from './core';

interface Props {
  input: ProductionInput;
  facts: BoardFacts | null;
}

const money = (value: number) => `${Math.round(value).toLocaleString('ru-RU')} ₽`;

export function FactLogPanel({ input, facts }: Props) {
  const { profile, patch } = useWorkshop();
  const [entries, setEntries] = useState<FactEntry[]>(loadFactLog);
  const [hours, setHours] = useState('');
  const [material, setMaterial] = useState('');
  const [count, setCount] = useState(1);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const plannedMin = useMemo(
    () => estimateTime(input, profile.norms).totalMin,
    [input, profile.norms]
  );

  const summary = useMemo(
    () => summariseFactLog(entries, DEFAULT_TIME_NORMS),
    [entries]
  );

  const change = (next: FactEntry[]) => setEntries(saveFactLog(next));

  const usingOwnNorms = useMemo(
    () =>
      (Object.keys(DEFAULT_TIME_NORMS) as (keyof typeof DEFAULT_TIME_NORMS)[]).some(
        (key) => profile.norms[key] !== DEFAULT_TIME_NORMS[key]
      ),
    [profile.norms]
  );

  const add = () => {
    const actualMin = Number(hours) * 60;
    if (!Number.isFinite(actualMin) || actualMin <= 0) return;
    change(
      addFactEntry(
        entries,
        createFactEntry({
          date: todayIso(),
          code: facts?.code ?? '',
          summary: facts?.summary ?? '',
          count,
          // План берётся по нормативам по умолчанию, а не по уже
          // откалиброванным: иначе множитель считался бы от самого себя
          // и с каждым применением уползал бы всё дальше.
          plannedMin: estimateTime(input, DEFAULT_TIME_NORMS).totalMin * count,
          actualMin,
          plannedMaterialRub: input.materialCostRub * count,
          actualMaterialRub: Number(material) || 0,
          note,
        })
      )
    );
    setHours('');
    setMaterial('');
    setNote('');
    setCount(1);
  };

  const apply = () => {
    patch({ norms: summary.suggested });
    setMessage(t('fact.applied'));
  };

  const reset = () => {
    patch({ norms: DEFAULT_TIME_NORMS });
    setMessage(t('fact.reset.done'));
  };

  const onExport = () => {
    const blob = new Blob([exportFactLog(entries)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'endgrain-журнал-факта.json';
    link.click();
    URL.revokeObjectURL(url);
    setMessage(t('fact.export.done'));
  };

  const onImport = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const loaded = importFactLog(typeof reader.result === 'string' ? reader.result : '');
      if (!loaded) {
        setMessage(t('fact.import.failed'));
        return;
      }
      change(loaded);
      setMessage(t('fact.import.done', { count: loaded.length }));
    };
    reader.onerror = () => setMessage(t('fact.import.failed'));
    reader.readAsText(file);
  };

  const drift = Math.round(Math.abs(summary.timeRatio - 1) * 100);

  return (
    <section className="factlog dom-money">
      <h2><Icon name="ruler" />{t('fact.title')}</h2>
      <p className="note-small">{t('fact.lead')}</p>

      <p className={usingOwnNorms ? 'ok' : 'note-small'}>
        {usingOwnNorms ? t('fact.custom') : t('fact.default')} · {t('fact.planned')}:{' '}
        {formatDuration(plannedMin)}
      </p>

      <div className="fact-form">
        <label>
          <span>{t('fact.field.hours')}</span>
          <input
            type="number" min={0} step={0.5}
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
        </label>
        <label>
          <span>{t('fact.field.count')}</span>
          <input
            type="number" min={1} step={1}
            value={count}
            onChange={(event) => setCount(Math.max(1, Number(event.target.value) || 1))}
          />
        </label>
        <label>
          <span>{t('fact.field.material')}</span>
          <input
            type="number" min={0} step={100}
            value={material}
            onChange={(event) => setMaterial(event.target.value)}
          />
        </label>
      </div>

      <input
        type="text"
        className="order-note"
        value={note}
        placeholder={t('fact.field.notePlaceholder')}
        onChange={(event) => setNote(event.target.value)}
      />

      <div className="workshop-actions">
        <button className="primary" onClick={add} disabled={!(Number(hours) > 0)}>
          {t('fact.action.add')}
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="note-small">{t('fact.empty')}</p>
      ) : (
        <>
          <dl>
            <div>
              <dt>{t('fact.planned')}</dt>
              <dd>{formatDuration(summary.plannedMin)}</dd>
            </div>
            <div className="accent">
              <dt>{t('fact.actual')}</dt>
              <dd>{formatDuration(summary.actualMin)}</dd>
            </div>
          </dl>

          <p className={summary.timeRatio > 1.05 ? 'advice' : 'ok'}>
            {drift < 2
              ? t('fact.ratio.even')
              : summary.timeRatio > 1
                ? t('fact.ratio.slower', { pct: drift })
                : t('fact.ratio.faster', { pct: drift })}
          </p>

          <p className="note-small">
            {summary.confident
              ? t('fact.confident', { boards: tcount('unit.board', summary.boards) })
              : t('fact.notEnough', {
                  boards: tcount('unit.board', summary.boards),
                  need: tcount('unit.boardAcc', CONFIDENT_BOARDS),
                })}
            {summary.plannedMaterialRub > 0 && (
              <>
                {' '}
                {t('fact.material.ratio', {
                  pct: Math.round((summary.materialRatio - 1) * 100),
                })}
              </>
            )}
          </p>

          <div className="workshop-actions">
            <button onClick={apply} disabled={!summary.confident}>{t('fact.action.apply')}</button>
            {usingOwnNorms && <button onClick={reset}>{t('fact.action.reset')}</button>}
          </div>

          <ul className="fact-list">
            {entries.slice(0, 5).map((item) => (
              <li key={item.id}>
                <b>{item.date || '—'}</b> · {item.summary || item.code || '—'} ·{' '}
                {tcount('unit.board', item.count)} ·{' '}
                {formatDuration(item.actualMin)}
                {item.actualMaterialRub > 0 && ` · ${money(item.actualMaterialRub)}`}
                {item.note && <em> — {item.note}</em>}
                <button className="link" onClick={() => change(removeFactEntry(entries, item.id))}>
                  {t('fact.action.remove')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="workshop-actions">
        <button onClick={onExport} disabled={entries.length === 0}>
          <Icon name="download" size={13} />
          {t('fact.action.export')}
        </button>
        <button onClick={() => fileRef.current?.click()}>{t('fact.action.import')}</button>
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

      {message && <p className="workshop-note">{message}</p>}
    </section>
  );
}
