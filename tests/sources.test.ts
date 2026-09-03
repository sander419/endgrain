import { describe, it, expect } from 'vitest';
import { SPECIES_CATALOG, SPECIES_BY_ID } from '../src/core/defaults';

/**
 * Контракт справочника пород. Держит правило из docs/DATA-SOURCES.md:
 * число, показанное как факт, обязано иметь источник.
 *
 * Проверка не формальная. При сверке 12.08.2026 выяснилось, что усушка дуба
 * стояла 4.4/8.8 вместо 5.6/10.5, а плотность врала у пяти пород из семи —
 * то есть движение древесины считалось по выдуманным числам. Тест не даст
 * добавить восьмую породу тем же способом.
 */
describe('справочник пород', () => {
  it('у каждой породы есть источник с датой сверки', () => {
    for (const species of SPECIES_CATALOG) {
      expect(species.source, species.id).toBeDefined();
      expect(species.source?.name, species.id).toBeTruthy();
      expect(species.source?.url, species.id).toMatch(/^https:\/\//);
      expect(species.source?.verifiedAt, species.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('заполнены все поля, на которых стоят расчёты', () => {
    // Порода без усушки создаёт видимость проверки движения там, где проверки нет.
    for (const species of SPECIES_CATALOG) {
      expect(species.densityKgM3, species.id).toBeGreaterThan(0);
      expect(species.jankaHardnessN, species.id).toBeGreaterThan(0);
      expect(species.shrinkageRadialPct, species.id).toBeGreaterThan(0);
      expect(species.shrinkageTangentialPct, species.id).toBeGreaterThan(0);
      expect(species.shrinkageVolumetricPct, species.id).toBeGreaterThan(0);
      expect(species.scientificName, species.id).toMatch(/^[A-Z][a-z]+ /);
    }
  });

  it('числа лежат в физически возможных пределах', () => {
    for (const species of SPECIES_CATALOG) {
      // Бальса 100, гваяковое дерево 1300 — за этими границами опечатка.
      expect(species.densityKgM3, species.id).toBeGreaterThanOrEqual(100);
      expect(species.densityKgM3, species.id).toBeLessThanOrEqual(1300);
      // Усушка вдоль волокна ничтожна, поперёк редко выходит за 15%.
      expect(species.shrinkageRadialPct, species.id).toBeLessThan(15);
      expect(species.shrinkageTangentialPct, species.id).toBeLessThan(20);
    }
  });

  it('тангенциальная усушка не меньше радиальной', () => {
    // Физика: поперёк годовых колец дерево садится сильнее, чем вдоль них.
    // Обратное соотношение означает, что колонки таблицы перепутаны местами.
    for (const species of SPECIES_CATALOG) {
      expect(species.shrinkageTangentialPct!, species.id).toBeGreaterThanOrEqual(
        species.shrinkageRadialPct!
      );
    }
  });

  it('объёмная усушка не меньше суммы радиальной и тангенциальной', () => {
    // V ≈ R + T + R·T/100. Заметное расхождение вниз — признак, что число
    // взято из другой строки справочника.
    for (const species of SPECIES_CATALOG) {
      const sum = species.shrinkageRadialPct! + species.shrinkageTangentialPct!;
      expect(species.shrinkageVolumetricPct!, species.id).toBeGreaterThanOrEqual(sum - 0.5);
    }
  });

  it('цена есть у каждой породы: без неё себестоимость молча занулится', () => {
    for (const species of SPECIES_CATALOG) {
      expect(species.pricePerCubicMeter, species.id).toBeGreaterThan(0);
    }
  });

  it('цвет пригоден для инлайнового стиля и для подбора породы по фото', () => {
    for (const species of SPECIES_CATALOG) {
      expect(species.colorHex, species.id).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('идентификаторы уникальны и совпадают с индексом', () => {
    const ids = SPECIES_CATALOG.map((species) => species.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const species of SPECIES_CATALOG) {
      expect(SPECIES_BY_ID[species.id]).toBe(species);
    }
  });

  it('названия пород различаются: два «дуба» в палитре не выбрать', () => {
    const names = SPECIES_CATALOG.map((species) => species.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
