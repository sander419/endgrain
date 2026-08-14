import { describe, expect, it } from 'vitest';
import {
  MAX_PITCH,
  MIN_PITCH,
  boxCorners,
  clampPitch,
  fitView,
  isFaceVisible,
  planeTransform,
  project,
  toScreen,
} from '../src/core/view3d';

const TOP = Math.PI / 2;

describe('проекция', () => {
  it('строго сверху даёт план: толщина не смещает точку', () => {
    const a = project({ x: 100, y: 40, z: 0 }, 0, TOP);
    const b = project({ x: 100, y: 40, z: 25 }, 0, TOP);
    expect(a.x).toBeCloseTo(100, 6);
    expect(a.y).toBeCloseTo(40, 6);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
  });

  it('поворот на 90° уводит длину доски в вертикаль экрана', () => {
    const p = project({ x: 100, y: 0, z: 0 }, TOP, TOP);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(100, 6);
  });

  it('при взгляде сбоку толщина видна как высота, вверх — вверх экрана', () => {
    const bottom = project({ x: 0, y: 0, z: 0 }, 0, 0);
    const top = project({ x: 0, y: 0, z: 25 }, 0, 0);
    expect(top.y).toBeLessThan(bottom.y);
  });
});

describe('видимость граней', () => {
  const pitch = (35 * Math.PI) / 180;

  it('верх виден всегда, низ — никогда', () => {
    for (const yaw of [0, 0.7, 2.5, 4.9]) {
      expect(isFaceVisible({ x: 0, y: 0, z: 1 }, yaw, pitch)).toBe(true);
      expect(isFaceVisible({ x: 0, y: 0, z: -1 }, yaw, pitch)).toBe(false);
    }
  });

  it('к камере обращена только одна боковина из пары', () => {
    expect(isFaceVisible({ x: 0, y: 1, z: 0 }, 0, pitch)).toBe(true);
    expect(isFaceVisible({ x: 0, y: -1, z: 0 }, 0, pitch)).toBe(false);
  });

  it('после поворота на 180° ближней становится противоположная грань', () => {
    expect(isFaceVisible({ x: 0, y: 1, z: 0 }, Math.PI, pitch)).toBe(false);
    expect(isFaceVisible({ x: 0, y: -1, z: 0 }, Math.PI, pitch)).toBe(true);
  });

  /**
   * Главная проверка: видимая боковина рисуется НИЖЕ своего ребра на экране,
   * то есть в стороне от доски, а не под её верхней гранью.
   */
  it('толщина видимой боковины уходит вниз экрана, а не под доску', () => {
    const yaw = -0.62;
    const nearFace = { x: 0, y: 1, z: 0 };
    expect(isFaceVisible(nearFace, yaw, pitch)).toBe(true);

    const edgeTop = project({ x: 260, y: 525, z: 40 }, yaw, pitch);
    const edgeBottom = project({ x: 260, y: 525, z: 0 }, yaw, pitch);
    const boardCentre = project({ x: 260, y: 260, z: 40 }, yaw, pitch);
    expect(edgeBottom.y).toBeGreaterThan(edgeTop.y);
    expect(edgeTop.y).toBeGreaterThan(boardCentre.y);
  });
});

describe('вписывание в канвас', () => {
  const corners = boxCorners(560, 240, 38);

  it('доска целиком в кадре при любом повороте', () => {
    for (const yaw of [0, 0.4, 1.1, 2.2, 3.9, 5.6]) {
      const view = fitView(corners, 800, 600, 40, yaw, (35 * Math.PI) / 180);
      const points = corners.map((corner) => toScreen(corner, view));
      for (const point of points) {
        expect(point.x).toBeGreaterThanOrEqual(40 - 0.001);
        expect(point.x).toBeLessThanOrEqual(800 - 40 + 0.001);
        expect(point.y).toBeGreaterThanOrEqual(40 - 0.001);
        expect(point.y).toBeLessThanOrEqual(600 - 40 + 0.001);
      }
    }
  });

  it('кадр использован до края хотя бы по одной оси', () => {
    const view = fitView(corners, 800, 600, 40, 0.6, (35 * Math.PI) / 180);
    const points = corners.map((corner) => toScreen(corner, view));
    const width = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
    const height = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
    const touchesX = Math.abs(width - (800 - 80)) < 0.001;
    const touchesY = Math.abs(height - (600 - 80)) < 0.001;
    expect(touchesX || touchesY).toBe(true);
  });
});

describe('текстура верхней грани', () => {
  it('матрица кладёт углы картинки ровно на углы доски', () => {
    const view = fitView(boxCorners(560, 240, 38), 800, 600, 40, 0.8, (40 * Math.PI) / 180);
    const [a, b, c, d, e, f] = planeTransform(1400, 600, 560, 240, 38, view);
    const apply = (u: number, v: number) => ({ x: a * u + c * v + e, y: b * u + d * v + f });

    const cases: [number, number, { x: number; y: number; z: number }][] = [
      [0, 0, { x: 0, y: 0, z: 38 }],
      [1400, 0, { x: 560, y: 0, z: 38 }],
      [0, 600, { x: 0, y: 240, z: 38 }],
      [1400, 600, { x: 560, y: 240, z: 38 }],
    ];

    for (const [u, v, world] of cases) {
      const expected = toScreen(world, view);
      const actual = apply(u, v);
      expect(actual.x).toBeCloseTo(expected.x, 6);
      expect(actual.y).toBeCloseTo(expected.y, 6);
    }
  });
});

describe('ограничение подъёма камеры', () => {
  it('снизу и плашмя доску не показываем', () => {
    expect(clampPitch(-1)).toBeCloseTo(MIN_PITCH, 6);
    expect(clampPitch(Math.PI)).toBeCloseTo(MAX_PITCH, 6);
    expect(clampPitch(0.7)).toBeCloseTo(0.7, 6);
  });
});
