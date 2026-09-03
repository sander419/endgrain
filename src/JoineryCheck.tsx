/**
 * Столярный чек: вердикт, замечания и статьи — одинаково в обоих режимах.
 *
 * До этого файла «Рецепт» и «Мозаика» рисовали свои замечания по-разному:
 * там объекты с четырьмя вопросами, здесь строки текста прямо в разметке.
 * Пока вердикта не было, разница была косметической. С вердиктом она стала
 * содержательной: он обязан собираться из тех же замечаний, которые человек
 * видит на экране, иначе панель говорит одно, а вердикт другое.
 */
import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import { articleById, t } from './core';
import type { ArticleId, JoineryWarning, Readiness } from './core';

const LEVEL_KEY = {
  ready: 'readiness.ready',
  warnings: 'readiness.warnings',
  missingData: 'readiness.missingData',
  impossible: 'readiness.impossible',
} as const;

/** Вердикт красится тем же языком, что и замечания: info / caution / danger. */
const LEVEL_CLASS = {
  ready: 'ok',
  warnings: 'caution',
  missingData: 'caution',
  impossible: 'danger',
} as const;

export function ReadinessBadge({ readiness }: { readiness: Readiness }) {
  return (
    <div className={`readiness readiness-${LEVEL_CLASS[readiness.level]}`}>
      <b>{t(LEVEL_KEY[readiness.level])}</b>
      {readiness.level === 'ready' ? (
        <span>{t('readiness.ready.body')}</span>
      ) : (
        <ul>
          {readiness.reasons.map((reason) => (
            <li key={reason.id + reason.text} className={`reason-${reason.level}`}>
              {reason.text}
              <em> — {t('readiness.where', { where: reason.where })}</em>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface WarningListProps {
  warnings: JoineryWarning[];
  onArticle: (id: ArticleId) => void;
}

export function WarningList({ warnings, onArticle }: WarningListProps) {
  if (warnings.length === 0) return null;
  return (
    <ul className="warnings">
      {warnings.map((warning) => (
        <li key={warning.id + warning.problem} className={`warn warn-${warning.severity}`}>
          <b>{warning.problem}</b>
          <span><i>Почему:</i> {warning.why}</span>
          <span><i>Чем грозит:</i> {warning.consequence}</span>
          <span><i>Что сделать:</i> {warning.fix}</span>
          {warning.source && <em className="warn-source">{warning.source}</em>}
          {warning.articleId && (
            <button className="link warn-article" onClick={() => onArticle(warning.articleId!)}>
              {t('kb.why')} →
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

interface ArticleDialogProps {
  id: ArticleId;
  onOpen: (id: ArticleId) => void;
  onClose: () => void;
}

export function ArticleDialog({ id, onOpen, onClose }: ArticleDialogProps) {
  const article = articleById(id);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!article) return null;

  const related = (article.related ?? [])
    .map((relatedId) => articleById(relatedId))
    .filter((item): item is NonNullable<typeof item> => !!item);

  return (
    <div className="help-backdrop" onClick={onClose}>
      <div
        className="help article-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="article-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="article-title">{article.title}</h2>
          <button ref={closeRef} className="icon" onClick={onClose} aria-label={t('kb.close')}>✕</button>
        </header>

        {article.body.map((paragraph) => (
          <p key={paragraph.slice(0, 40)}>{paragraph}</p>
        ))}

        {article.source && (
          <p className="help-note">
            <Icon name="shield" size={12} /> {t('kb.source')}: {article.source.name}
            {article.source.url && (
              <>
                {' — '}
                <a href={article.source.url} target="_blank" rel="noreferrer noopener">
                  {article.source.url}
                </a>
              </>
            )}
          </p>
        )}

        {related.length > 0 && (
          <p className="article-related">
            {t('kb.related')}:{' '}
            {related.map((item, index) => (
              <span key={item.id}>
                {index > 0 && ' · '}
                <button className="link" onClick={() => onOpen(item.id)}>{item.title}</button>
              </span>
            ))}
          </p>
        )}

        <div className="help-actions">
          <button className="primary" onClick={onClose}>{t('kb.close')}</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Плашка «оценка» рядом с числом, у которого нет справочного значения.
 *
 * Ставится там, где число выглядит как факт и читается как факт. Себестоимость
 * материала — главный такой случай: она считается из цены пород, а справочной
 * цены не существует ни у одного поставщика.
 */
export function EstMark({ note }: { note: string }) {
  return (
    <abbr className="est-mark" title={note}>
      оценка
    </abbr>
  );
}
