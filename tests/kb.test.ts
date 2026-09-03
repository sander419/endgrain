import { describe, it, expect } from 'vitest';
import { ARTICLES, articleById, articleTitle } from '../src/core/kb';
import { checkJoinery } from '../src/core/validate';
import { defaultRecipe } from '../src/core/defaults';
import type { Recipe } from '../src/core/types';

/**
 * Инвариант, взятый у КРУГа: битая ссылка в справке хуже её отсутствия —
 * она обещает объяснение и не даёт его.
 */
describe('энциклопедия', () => {
  it('у каждой статьи есть заголовок и текст', () => {
    for (const article of ARTICLES) {
      expect(article.title.trim(), article.id).not.toBe('');
      expect(article.body.length, article.id).toBeGreaterThan(0);
      for (const paragraph of article.body) {
        expect(paragraph.trim(), article.id).not.toBe('');
      }
    }
  });

  it('идентификаторы уникальны', () => {
    const ids = ARTICLES.map((article) => article.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ни одна ссылка «читайте также» не ведёт в пустоту', () => {
    for (const article of ARTICLES) {
      for (const id of article.related ?? []) {
        expect(articleById(id), `${article.id} → ${id}`).toBeDefined();
      }
    }
  });

  it('статья не ссылается сама на себя', () => {
    for (const article of ARTICLES) {
      expect(article.related ?? [], article.id).not.toContain(article.id);
    }
  });

  it('у статьи со ссылкой на источник адрес настоящий', () => {
    for (const article of ARTICLES) {
      if (!article.source?.url) continue;
      expect(article.source.url, article.id).toMatch(/^https:\/\//);
      expect(article.source.name.trim(), article.id).not.toBe('');
    }
  });

  it('статья объясняет механизм, а не повторяет вывод одной строкой', () => {
    // Абзац в две строки — это не статья, а тот же вывод другими словами.
    for (const article of ARTICLES) {
      const length = article.body.join(' ').length;
      expect(length, article.id).toBeGreaterThan(300);
    }
  });

  it('неизвестный идентификатор не роняет поиск', () => {
    expect(articleById(undefined)).toBeUndefined();
    expect(articleTitle(undefined)).toBe('');
  });
});

describe('замечания и статьи', () => {
  function warningsFor(patch: (recipe: Recipe) => Recipe) {
    return checkJoinery(patch(defaultRecipe()));
  }

  it('каждая ссылка из замечания ведёт в живую статью', () => {
    // Собираем замечания с разных рецептов, чтобы проверить не одно, а все.
    const sets = [
      warningsFor((recipe) => recipe),
      warningsFor((recipe) => ({
        ...recipe,
        panel: { ...recipe.panel, strips: recipe.panel.strips.map((s) => ({ ...s, widthMm: 5 })) },
      })),
      warningsFor((recipe) => ({
        ...recipe,
        panel: {
          ...recipe.panel,
          strips: recipe.panel.strips.map((s) => ({ ...s, speciesId: 'maple' })),
        },
      })),
      warningsFor((recipe) => ({
        ...recipe,
        panel: { ...recipe.panel, usableLengthMm: 3000 },
        crosscut: { ...recipe.crosscut, sliceThicknessMm: 10 },
      })),
    ];

    const seen = new Set<string>();
    for (const warnings of sets) {
      for (const warning of warnings) {
        seen.add(warning.id);
        if (!warning.articleId) continue;
        expect(articleById(warning.articleId), `${warning.id} → ${warning.articleId}`).toBeDefined();
      }
    }
    // Проверка имеет смысл, только если замечания вообще сработали.
    expect(seen.size).toBeGreaterThan(2);
  });

  it('замечание про усушку ведёт именно в статью про усушку', () => {
    const recipe = defaultRecipe();
    const warnings = checkJoinery({
      ...recipe,
      panel: {
        ...recipe.panel,
        strips: [
          { speciesId: 'beech', widthMm: 40 },
          { speciesId: 'cherry', widthMm: 40 },
        ],
      },
    });
    const conflict = warnings.find((warning) => warning.id === 'shrinkage_conflict');
    expect(conflict?.articleId).toBe('shrinkage');
  });
});
