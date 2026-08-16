import { describe, expect, it } from 'vitest';
import { markIntroSeen, shouldShowIntro } from '../src/HelpDialog';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
    data,
  };
}

describe('шпаргалка при первом визите', () => {
  it('показывается новому посетителю', () => {
    expect(shouldShowIntro(memoryStorage())).toBe(true);
  });

  it('после закрытия больше не всплывает', () => {
    const storage = memoryStorage();
    markIntroSeen(storage);
    expect(shouldShowIntro(storage)).toBe(false);
  });

  it('в приватном режиме показывается, а не падает', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(shouldShowIntro(broken)).toBe(true);
    expect(() => markIntroSeen(broken)).not.toThrow();
  });
});
