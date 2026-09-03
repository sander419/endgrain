/**
 * Энциклопедия: реестр статей и связь с замечаниями.
 *
 * Зачем она в инструменте, а не в блоге. Замечание отвечает на четыре вопроса
 * коротко — что не так, почему, чем грозит, что делать, — и этого хватает,
 * чтобы принять решение. Не хватает, чтобы понять. Понимание нужно тому, кто
 * потом объясняет клиенту, почему доска стоит столько и почему её нельзя
 * в посудомойку, — а это и есть мастерская, которая покупает инструмент.
 *
 * Инвариант, взятый у КРУГа и закреплённый тестом: **у каждой ссылки есть
 * живая статья, а у каждой статьи — текст**. Битая ссылка в справке хуже
 * её отсутствия: она обещает объяснение и не даёт его.
 */
import { ARTICLES_RU } from '../i18n/articles.ru';

export type ArticleId =
  | 'movement'
  | 'shrinkage'
  | 'glue_line'
  | 'clamping'
  | 'janka'
  | 'kerf'
  | 'nesting'
  | 'planer'
  | 'contrast'
  | 'care';

export interface Article {
  id: ArticleId;
  title: string;
  /** Абзацы. Разметки нет намеренно: статья читается, а не листается. */
  body: string[];
  source?: { name: string; url?: string };
  /** Соседние статьи. Односторонняя ссылка допустима: связи не всегда взаимны. */
  related?: ArticleId[];
}

export const ARTICLES: Article[] = ARTICLES_RU;

const BY_ID = new Map(ARTICLES.map((article) => [article.id, article]));

export function articleById(id: ArticleId | undefined): Article | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function articleTitle(id: ArticleId | undefined): string {
  return articleById(id)?.title ?? '';
}
