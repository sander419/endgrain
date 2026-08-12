import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PRESETS,
  PROCESS_STEPS,
  M3_PER_BOARD_FOOT,
  SPECIES_BY_ID,
  SPECIES_CATALOG,
  applyPreset,
  buildShareUrl,
  checkJoinery,
  defaultRecipe,
  formatLength,
  getStepHint,
  mulberry32,
  plural,
  projectRecipe,
  randomizeWild,
  readDnaFromLocation,
} from './core';
import type { PresetId, ProcessStep, Recipe } from './core';
import {
  duplicateStrip,
  flipSlice,
  manualSliceCount,
  mirrorStrips,
  moveStrip,
  resetAllSlices,
  resetSlice,
  reverseStrips,
  shiftSlice,
  swapSlices,
} from './core';
import { hitTestSlice, renderScene } from './render/board';
import { PrintSheet } from './PrintSheet';
import { useHistoryState } from './useHistoryState';
import { MosaicStudio } from './MosaicStudio';
import { MoisturePanel } from './MoisturePanel';
import { EconomicsPanel } from './EconomicsPanel';
import './App.css';

const STORAGE_KEY = 'endgrain.recipe.v1';

/**
 * В ссылке лежат только использованные породы, поэтому каталог подмешиваем
 * обратно: иначе после открытия чужой ДНК в списке пород не из чего выбирать.
 * Правки пользователя (цвет, цена) перекрывают каталог.
 */
function withCatalog(recipe: Recipe): Recipe {
  // Справочные поля пород (усушка, твёрдость, источник) в ссылку не едут —
  // подмешиваем их из каталога, а поверх кладём то, что пришло из ссылки.
  const species: Recipe['species'] = { ...SPECIES_BY_ID };
  for (const [id, incoming] of Object.entries(recipe.species ?? {})) {
    species[id] = { ...SPECIES_BY_ID[id], ...incoming };
  }
  return { ...recipe, species };
}

function loadInitialRecipe(): { recipe: Recipe; seed: number } {
  const fromUrl = readDnaFromLocation();
  if (fromUrl) return { recipe: withCatalog(fromUrl.recipe), seed: fromUrl.seed ?? 1 };
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return { recipe: withCatalog(JSON.parse(saved) as Recipe), seed: 1 };
  } catch {
    /* битый localStorage — просто берём дефолт */
  }
  return { recipe: defaultRecipe(), seed: 1 };
}

/** `#step=crosscut` открывает нужный этап сразу — для демо-ссылок и снимков. */
function initialStep(): ProcessStep {
  const match = window.location.hash.match(/step=(\w+)/);
  const found = PROCESS_STEPS.find((s) => s.id === match?.[1]);
  return found?.id ?? 'final';
}

export default function App() {
  const initial = useMemo(loadInitialRecipe, []);
  const [recipe, setRecipe, history] = useHistoryState<Recipe>(initial.recipe);
  const [seed, setSeed] = useState(initial.seed);
  const [step, setStep] = useState<ProcessStep>(initialStep);
  const [oil, setOil] = useState(0.35);
  const [explode, setExplode] = useState(1);
  const [toast, setToast] = useState<string | null>(null);
  const [boardImage, setBoardImage] = useState<string | null>(null);
  const [selectedSlice, setSelectedSlice] = useState<number | null>(null);
  const [mode, setMode] = useState<'recipe' | 'mosaic'>(() => {
    // ?mode=mosaic — прямая ссылка на конструктор, удобно для демо.
    const fromQuery = new URLSearchParams(window.location.search).get('mode');
    if (fromQuery === 'mosaic' || fromQuery === 'recipe') return fromQuery;
    return localStorage.getItem('endgrain.mode') === 'mosaic' ? 'mosaic' : 'recipe';
  });

  useEffect(() => {
    try { localStorage.setItem('endgrain.mode', mode); } catch { /* приватный режим */ }
  }, [mode]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const projection = useMemo(() => projectRecipe(recipe), [recipe]);
  const warnings = useMemo(() => checkJoinery(recipe), [recipe]);
  const manualCount = manualSliceCount(recipe);

  /** Ширины по породам — вход для расчёта движения древесины. */
  const moistureUsage = useMemo(() => {
    const bySpecies = new Map<string, { totalWidthMm: number; stripWidthMm: number }>();
    for (const strip of recipe.panel.strips) {
      const found = bySpecies.get(strip.speciesId);
      if (found) found.totalWidthMm += strip.widthMm;
      else bySpecies.set(strip.speciesId, { totalWidthMm: strip.widthMm, stripWidthMm: strip.widthMm });
    }
    return [...bySpecies.entries()].map(([speciesId, value]) => ({ speciesId, ...value }));
  }, [recipe.panel.strips]);
  const { undo, redo, canUndo, canRedo } = history;
  const units = recipe.units;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(recipe));
    } catch {
      /* приватный режим — не беда */
    }
  }, [recipe]);

  // Ссылку с ДНК могут открыть во вкладке, где приложение уже запущено:
  // меняется только hash, документ не перезагружается. Без этого судья
  // кликает по ссылке и видит чужой рецепт вместо присланного.
  useEffect(() => {
    const onHashChange = () => {
      const dna = readDnaFromLocation();
      if (!dna) return;
      setRecipe(withCatalog(dna.recipe));
      if (typeof dna.seed === 'number') setSeed(dna.seed);
      setStep(initialStep());
      flash('Открыта ДНК доски из ссылки');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Анимация разлёта деталей при входе на этап.
  useEffect(() => {
    const wantsExplode = step === 'strips' || step === 'flip';
    let frame = 0;
    const start = performance.now();
    const from = explode;
    const to = wantsExplode ? 1 : 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 450);
      const eased = 1 - Math.pow(1 - t, 3);
      setExplode(from + (to - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = parent.clientWidth;
    const cssH = parent.clientHeight;
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderScene(ctx, recipe, projection, { step, oil, explode, selectedSlice });
  }, [recipe, projection, step, oil, explode, selectedSlice]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  // Планка могла исчезнуть после смены длины щита или толщины среза.
  useEffect(() => {
    setSelectedSlice((current) =>
      current !== null && current >= projection.sliceCount ? null : current
    );
  }, [projection.sliceCount]);

  const onCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const hit = hitTestSlice(
      ctx, recipe, projection,
      { step, oil, explode },
      (event.clientX - rect.left) * scaleX,
      (event.clientY - rect.top) * scaleY
    );
    setSelectedSlice((current) => (hit === current ? null : hit));
  };

  const editSelected = (fn: (recipe: Recipe, sliceIndex: number) => Recipe) => {
    if (selectedSlice === null) return;
    setRecipe((r) => fn(r, selectedSlice));
  };

  const moveSelected = (direction: -1 | 1) => {
    if (selectedSlice === null) return;
    const target = selectedSlice + direction;
    if (target < 0 || target >= projection.sliceCount) return;
    setRecipe((r) => swapSlices(r, selectedSlice, target));
    setSelectedSlice(target);
  };

  // Горячие клавиши: планка выбирается стрелками, правится F и скобками.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField = !!target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);

      // Отмена работает всегда, даже когда курсор в поле ввода.
      if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'я')) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if (inField) return;

      const total = projection.sliceCount;
      if (total === 0) return;

      if (event.key === 'Escape') { setSelectedSlice(null); return; }

      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const delta = event.key === 'ArrowRight' ? 1 : -1;
        setSelectedSlice((current) => {
          if (current === null) return delta > 0 ? 0 : total - 1;
          return (current + delta + total) % total;
        });
        return;
      }

      if (selectedSlice === null) return;

      const key = event.key.toLowerCase();
      if (key === 'f' || key === 'а') {
        event.preventDefault();
        setRecipe((r) => flipSlice(r, selectedSlice));
      } else if (event.key === ']' || event.key === 'ъ') {
        event.preventDefault();
        setRecipe((r) => shiftSlice(r, selectedSlice, 1));
      } else if (event.key === '[' || event.key === 'х') {
        event.preventDefault();
        setRecipe((r) => shiftSlice(r, selectedSlice, -1));
      } else if (key === 'r' || key === 'к') {
        event.preventDefault();
        setRecipe((r) => resetSlice(r, selectedSlice));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedSlice, projection.sliceCount, setRecipe, undo, redo]);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  };

  const patchPanel = (patch: Partial<Recipe['panel']>) =>
    setRecipe((r) => ({ ...r, panel: { ...r.panel, ...patch } }));
  const patchCrosscut = (patch: Partial<Recipe['crosscut']>) =>
    setRecipe((r) => ({ ...r, crosscut: { ...r.crosscut, ...patch } }));
  const patchTransform = (patch: Partial<Recipe['transform']>) =>
    setRecipe((r) => ({ ...r, transform: { ...r.transform, ...patch } }));

  const updateStrip = (index: number, patch: Partial<Recipe['panel']['strips'][number]>) =>
    setRecipe((r) => ({
      ...r,
      panel: {
        ...r.panel,
        strips: r.panel.strips.map((s, i) => (i === index ? { ...s, ...patch } : s)),
      },
    }));

  const addStrip = () =>
    setRecipe((r) => {
      const last = r.panel.strips[r.panel.strips.length - 1];
      const nextSpecies = SPECIES_CATALOG.find((s) => s.id !== last?.speciesId) ?? SPECIES_CATALOG[0];
      return {
        ...r,
        panel: {
          ...r.panel,
          strips: [...r.panel.strips, { speciesId: nextSpecies.id, widthMm: last?.widthMm ?? 40 }],
        },
      };
    });

  const removeStrip = (index: number) =>
    setRecipe((r) => ({
      ...r,
      panel: { ...r.panel, strips: r.panel.strips.filter((_, i) => i !== index) },
    }));

  const onPreset = (id: PresetId) => {
    setRecipe((r) => applyPreset(r, id, mulberry32(seed)));
    setStep('final');
  };

  const onWild = () => {
    const nextSeed = Math.floor(Math.random() * 1e9);
    setSeed(nextSeed);
    setRecipe((r) => randomizeWild(r, mulberry32(nextSeed)));
    setStep('final');
  };

  const onShare = async () => {
    const url = buildShareUrl(recipe, seed);
    try {
      await navigator.clipboard.writeText(url);
      flash('ДНК доски скопирована в буфер');
    } catch {
      window.location.hash = url.split('#')[1] ?? '';
      flash('ДНК доски в адресной строке');
    }
  };

  /** Картинка узора для печатного листа — всегда офскрин на белом, под бумагу. */
  const captureBoardImage = useCallback(() => {
    const offscreen = document.createElement('canvas');
    const lengthMm = projection.finalDimensions.topLengthMm || 1;
    const widthMm = projection.finalDimensions.topWidthMm || 1;
    offscreen.width = 1200;
    // Высота под пропорции доски, чтобы на листе не было пустых полей.
    offscreen.height = Math.round((1200 - 72) * (widthMm / lengthMm)) + 72;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;
    renderScene(ctx, recipe, projection, { step: 'final', oil, explode: 0, background: '#ffffff' });
    return offscreen.toDataURL('image/png');
  }, [recipe, projection, oil]);

  const onPrint = () => {
    setBoardImage(captureBoardImage());
    // Дать React отрисовать печатный лист до вызова диалога печати.
    window.setTimeout(() => window.print(), 60);
  };

  const onExportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `endgrain-${projection.finalDimensions.topLengthMm}x${projection.finalDimensions.topWidthMm}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    flash('Отпечаток доски сохранён');
  };

  const dims = projection.finalDimensions;
  const boardFeet = projection.totals.rawVolumeM3 / M3_PER_BOARD_FOOT;
  const cuts = Math.max(0, projection.sliceCount - 1);

  // ?print=1 — предпросмотр инструкции прямо на экране, без диалога печати.
  const printPreview = typeof window !== 'undefined' && window.location.search.includes('print=1');

  useEffect(() => {
    if (printPreview) setBoardImage(captureBoardImage());
  }, [printPreview, captureBoardImage]);

  return (
    <div className={printPreview ? 'app show-print' : 'app'}>
      <header className="topbar">
        <div className="brand">
          <span className="logo">▨</span>
          <div>
            <h1>End-Grain Compiler</h1>
            <p>Рисуешь не узор, а рецепт распила — всё остальное считается само</p>
          </div>
        </div>
        <div className="mode-switch">
          <button className={mode === 'recipe' ? 'on' : ''} onClick={() => setMode('recipe')}>
            Рецепт
          </button>
          <button className={mode === 'mosaic' ? 'on' : ''} onClick={() => setMode('mosaic')}>
            Мозаика
          </button>
        </div>

        <div className="topbar-actions" hidden={mode !== 'recipe'}>
          <span className="undo-group">
            <button className="icon" onClick={undo} disabled={!canUndo} title="Отменить (Ctrl+Z)">↶</button>
            <button className="icon" onClick={redo} disabled={!canRedo} title="Вернуть (Ctrl+Shift+Z)">↷</button>
          </span>
          <span className="seed" title="Один seed — один и тот же узор">seed {seed}</span>
          <button className="primary" onClick={onShare}>Скопировать ДНК доски</button>
          <button onClick={onPrint}>Инструкция для мастерской</button>
          <button onClick={onExportPng}>Снять отпечаток</button>
        </div>
      </header>

      {mode === 'mosaic' && <MosaicStudio oil={oil} onOilChange={setOil} />}

      <main className="layout" hidden={mode !== 'recipe'}>
        <aside className="panel editor">
          <section>
            <h2>Бруски щита A</h2>
            <div className="strips">
              {recipe.panel.strips.map((strip, index) => (
                <div className="strip-row" key={index}>
                  <span
                    className="swatch"
                    style={{ background: recipe.species[strip.speciesId]?.colorHex ?? '#888' }}
                  />
                  <select
                    value={strip.speciesId}
                    onChange={(e) => updateStrip(index, { speciesId: e.target.value })}
                  >
                    {SPECIES_CATALOG.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={strip.widthMm}
                    onChange={(e) => updateStrip(index, { widthMm: Number(e.target.value) })}
                  />
                  <span className="unit">мм</span>
                  <span className="row-tools">
                    <button
                      className="icon" title="Выше"
                      onClick={() => setRecipe((r) => moveStrip(r, index, index - 1))}
                      disabled={index === 0}
                    >↑</button>
                    <button
                      className="icon" title="Ниже"
                      onClick={() => setRecipe((r) => moveStrip(r, index, index + 1))}
                      disabled={index === recipe.panel.strips.length - 1}
                    >↓</button>
                    <button
                      className="icon" title="Дублировать"
                      onClick={() => setRecipe((r) => duplicateStrip(r, index))}
                    >⧉</button>
                    <button
                      className="icon" title="Убрать брусок"
                      onClick={() => removeStrip(index)}
                      disabled={recipe.panel.strips.length <= 1}
                    >×</button>
                  </span>
                </div>
              ))}
            </div>
            <button className="wide" onClick={addStrip}>+ Добавить брусок</button>
            <div className="row-actions">
              <button onClick={() => setRecipe(mirrorStrips)} title="A-B-C → A-B-C-C-B-A">
                Зеркалить набор
              </button>
              <button onClick={() => setRecipe(reverseStrips)} title="Развернуть порядок брусков">
                Развернуть
              </button>
            </div>
          </section>

          <section>
            <h2>Размеры</h2>
            <label>
              Толщина брусков
              <input
                type="number" min={1}
                value={recipe.panel.stripThicknessMm}
                onChange={(e) => patchPanel({ stripThicknessMm: Number(e.target.value) })}
              />
            </label>
            <label>
              Длина щита A
              <input
                type="number" min={1}
                value={recipe.panel.usableLengthMm}
                onChange={(e) => patchPanel({ usableLengthMm: Number(e.target.value) })}
              />
            </label>
            <label>
              Толщина доски (срез)
              <input
                type="number" min={1}
                value={recipe.crosscut.sliceThicknessMm}
                onChange={(e) => patchCrosscut({ sliceThicknessMm: Number(e.target.value) })}
              />
            </label>
            <label>
              Пропил (kerf)
              <input
                type="number" min={0} step={0.1}
                value={recipe.crosscut.sawKerfMm}
                onChange={(e) => patchCrosscut({ sawKerfMm: Number(e.target.value) })}
              />
            </label>
          </section>

          <section>
            <h2>Трансформация</h2>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={recipe.transform.flipOddSlices}
                onChange={(e) => patchTransform({ flipOddSlices: e.target.checked })}
              />
              Переворачивать нечётные планки на 180°
            </label>
            <label>
              Циклический сдвиг
              <input
                type="number" min={0} max={recipe.panel.strips.length}
                value={recipe.transform.cyclicShiftStep}
                onChange={(e) => patchTransform({ cyclicShiftStep: Number(e.target.value) })}
              />
            </label>
          </section>

          <section>
            <h2>Пресеты</h2>
            <div className="presets">
              {PRESETS.map((preset) => (
                <button key={preset.id} title={preset.tagline} onClick={() => onPreset(preset.id)}>
                  {preset.name}
                </button>
              ))}
            </div>
            <button className="wide wild" onClick={onWild}>🎲 Сгенерировать дикую доску</button>
          </section>

          <section>
            <h2>Единицы</h2>
            <div className="segmented">
              <button
                className={units === 'mm' ? 'on' : ''}
                onClick={() => setRecipe((r) => ({ ...r, units: 'mm' }))}
              >мм</button>
              <button
                className={units === 'inch' ? 'on' : ''}
                onClick={() => setRecipe((r) => ({ ...r, units: 'inch' }))}
              >дюймы</button>
            </div>
          </section>
        </aside>

        <section className="stage">
          <div className="steps">
            {PROCESS_STEPS.map((s, index) => (
              <button
                key={s.id}
                className={step === s.id ? 'on' : ''}
                onClick={() => setStep(s.id)}
              >
                <b>{index + 1}</b> {s.title}
              </button>
            ))}
          </div>

          <div className="canvas-wrap">
            <canvas
              ref={canvasRef}
              onClick={onCanvasClick}
              className={step === 'final' || step === 'flip' ? 'pickable' : ''}
            />
          </div>

          {(step === 'final' || step === 'flip') && (
            <div className={selectedSlice === null ? 'slice-bar empty' : 'slice-bar'}>
              {selectedSlice === null ? (
                <span className="slice-help">
                  Кликни планку на доске, чтобы править её отдельно. Или стрелками ← →
                </span>
              ) : (
                <>
                  <b>Планка {selectedSlice + 1} из {projection.sliceCount}</b>
                  <button onClick={() => editSelected(flipSlice)} title="F">Перевернуть 180°</button>
                  <button onClick={() => editSelected((r, i) => shiftSlice(r, i, -1))} title="[">Сдвиг ←</button>
                  <button onClick={() => editSelected((r, i) => shiftSlice(r, i, 1))} title="]">Сдвиг →</button>
                  <button onClick={() => moveSelected(-1)} disabled={selectedSlice === 0}>Левее</button>
                  <button
                    onClick={() => moveSelected(1)}
                    disabled={selectedSlice >= projection.sliceCount - 1}
                  >Правее</button>
                  <button onClick={() => editSelected(resetSlice)} title="R">Сбросить</button>
                  <button className="ghost" onClick={() => setSelectedSlice(null)}>Снять выбор</button>
                  <span className="keys">← → выбор · F переворот · [ ] сдвиг · R сброс · Ctrl+Z отмена</span>
                </>
              )}
            </div>
          )}

          {manualCount > 0 && (
            <p className="manual-note">
              Правлено вручную: {manualCount} {plural(manualCount, 'планка', 'планки', 'планок')}.
              <button className="link" onClick={() => setRecipe(resetAllSlices)}>Сбросить все правки</button>
            </p>
          )}

          <p className="hint">{getStepHint(step, recipe, projection)}</p>

          <div className="oil">
            <label>Масло / проявка текстуры</label>
            <input
              type="range" min={0} max={100}
              value={Math.round(oil * 100)}
              onChange={(e) => setOil(Number(e.target.value) / 100)}
            />
            <span>{Math.round(oil * 100)}%</span>
          </div>
        </section>

        <aside className="panel report">
          <section>
            <h2>Готовая доска</h2>
            <div className="big">
              {formatLength(dims.topLengthMm, units)} × {formatLength(dims.topWidthMm, units)} × {formatLength(dims.thicknessMm, units)}
            </div>
            <dl>
              <div><dt>Планок</dt><dd>{projection.sliceCount}</dd></div>
              <div><dt>Внутренних резов</dt><dd>{cuts}</dd></div>
              <div><dt>Длины щита нужно</dt><dd>{formatLength(projection.panel.requiredRoughLengthMm, units)}</dd></div>
              <div><dt>Остаток щита</dt><dd>{formatLength(projection.panel.designRemainderLengthMm, units)}</dd></div>
            </dl>
          </section>

          <section>
            <h2>Материал и отходы</h2>
            <dl>
              <div><dt>Сырой объём</dt><dd>{projection.totals.rawVolumeM3.toFixed(5)} м³</dd></div>
              <div><dt>В доске</dt><dd>{projection.totals.netVolumeM3.toFixed(5)} м³</dd></div>
              <div><dt>Board feet</dt><dd>{boardFeet.toFixed(2)}</dd></div>
              <div><dt>На пропил</dt><dd>{Math.round(projection.waste.crosscutKerfM3 * 1e9).toLocaleString('ru-RU')} мм³</dd></div>
              <div><dt>На торцовку</dt><dd>{Math.round(projection.waste.endTrimM3 * 1e9).toLocaleString('ru-RU')} мм³</dd></div>
              <div className="accent"><dt>Отходы</dt><dd>{projection.totals.wastePct.toFixed(1)}%</dd></div>
              <div className="accent"><dt>Материал</dt><dd>{Math.round(projection.totals.totalCost).toLocaleString('ru-RU')} ₽</dd></div>
            </dl>
          </section>

          <section>
            <h2>По породам</h2>
            <table className="materials">
              <tbody>
                {projection.materials
                  .filter((m) => m.rawVolumeM3 > 0)
                  .map((m) => (
                    <tr key={m.speciesId}>
                      <td>
                        <span
                          className="swatch small"
                          style={{ background: recipe.species[m.speciesId]?.colorHex }}
                        />
                        {m.speciesName}
                      </td>
                      <td>{m.rawVolumeM3.toFixed(5)} м³</td>
                      <td>{m.netMassKg.toFixed(1)} кг</td>
                      <td>{Math.round(m.cost).toLocaleString('ru-RU')} ₽</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>

          <EconomicsPanel
            input={{
              strips: recipe.panel.strips.length,
              glueUps: 1,
              crosscuts: cuts,
              lengthMm: dims.topLengthMm,
              widthMm: dims.topWidthMm,
              materialCostRub: projection.totals.totalCost,
            }}
          />

          <MoisturePanel usage={moistureUsage} species={recipe.species} />

          <section>
            <h2>Столярный чек</h2>
            {!projection.valid && (
              <ul className="issues">
                {projection.issues.map((issue) => <li key={issue}>{issue}</li>)}
              </ul>
            )}
            {warnings.length > 0 && (
              <ul className="warnings">
                {warnings.map((w) => (
                  <li key={w.id + w.problem} className={`warn warn-${w.severity}`}>
                    <b>{w.problem}</b>
                    <span><i>Почему:</i> {w.why}</span>
                    <span><i>Чем грозит:</i> {w.consequence}</span>
                    <span><i>Что сделать:</i> {w.fix}</span>
                    {w.source && <em className="warn-source">{w.source}</em>}
                  </li>
                ))}
              </ul>
            )}
            {projection.valid && warnings.length === 0 && (
              <p className="ok">Рецепт изготовим как есть.</p>
            )}
          </section>
        </aside>
      </main>

      {toast && <div className="toast">{toast}</div>}

      {mode === 'recipe' && <PrintSheet
        recipe={recipe}
        projection={projection}
        warnings={warnings}
        boardImage={boardImage}
        shareUrl={buildShareUrl(recipe, seed)}
      />}
    </div>
  );
}
