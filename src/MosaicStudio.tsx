import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GENERATORS,
  SPECIES_CATALOG,
  compileMosaic,
  emptyMosaic,
  formatLength,
  generateMosaic,
  mosaicSize,
  paintCell,
  plural,
  resizeMosaic,
} from './core';
import type { GeneratorId, Mosaic, MosaicRecipe, WoodSpecies } from './core';
import { hitTestCell, renderMosaic } from './render/mosaicBoard';
import { textToMosaic } from './render/textMosaic';
import { imageToMosaic } from './render/imageMosaic';
import { MosaicPrintSheet } from './MosaicPrintSheet';
import { useHistoryState } from './useHistoryState';

const STORAGE_KEY = 'endgrain.mosaic.v1';

/** Породы от светлой к тёмной — в этом порядке их ждут генераторы. */
function byLightness(a: WoodSpecies, b: WoodSpecies): number {
  const luminance = (hex: string) => {
    const n = hex.replace('#', '');
    return 0.2126 * parseInt(n.slice(0, 2), 16)
      + 0.7152 * parseInt(n.slice(2, 4), 16)
      + 0.0722 * parseInt(n.slice(4, 6), 16);
  };
  return luminance(b.colorHex) - luminance(a.colorHex);
}

interface Params {
  generator: GeneratorId;
  rows: number;
  cols: number;
  cellMm: number;
  rays: number;
  rings: number;
  seed: number;
  paletteIds: string[];
}

const DEFAULT_PARAMS: Params = {
  generator: 'mandala',
  rows: 21,
  cols: 21,
  cellMm: 25,
  rays: 6,
  rings: 6,
  seed: 7,
  // Контрастная четвёрка: на светлой палитре узор в дереве не читается.
  paletteIds: ['maple', 'oak', 'walnut', 'wenge'],
};

/** ?gen=landscape — прямая ссылка на конкретный генератор, для демо. */
function paramsFromQuery(base: Params): Params {
  const query = new URLSearchParams(window.location.search);
  const generator = query.get('gen');
  if (generator && GENERATORS.some((item) => item.id === generator)) {
    return { ...base, generator: generator as GeneratorId };
  }
  return base;
}

interface Props {
  oil: number;
  onOilChange: (value: number) => void;
}

export function MosaicStudio({ oil, onOilChange }: Props) {
  const [params, setParams] = useState<Params>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_KEY}.params`);
      if (saved) return paramsFromQuery({ ...DEFAULT_PARAMS, ...(JSON.parse(saved) as Params) });
    } catch { /* дефолт */ }
    return paramsFromQuery(DEFAULT_PARAMS);
  });

  const palette = useMemo(
    () =>
      SPECIES_CATALOG.filter((species) => params.paletteIds.includes(species.id))
        .sort(byLightness)
        .map((species) => species.id),
    [params.paletteIds]
  );

  const [mosaic, setMosaic, history] = useHistoryState<Mosaic>(() => {
    const start = paramsFromQuery(DEFAULT_PARAMS);
    // Ссылка с ?gen= всегда открывает свежий рисунок, иначе — сохранённый.
    if (start.generator === DEFAULT_PARAMS.generator) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved) as Mosaic;
      } catch { /* дефолт */ }
    }
    return generateMosaic(start.generator, {
      rows: start.rows,
      cols: start.cols,
      cellMm: start.cellMm,
      palette: start.paletteIds,
      rays: start.rays,
      rings: start.rings,
      seed: start.seed,
    });
  });

  const [brush, setBrush] = useState<string>(palette[palette.length - 1] ?? 'walnut');
  const [text, setText] = useState(
    () => new URLSearchParams(window.location.search).get('text') ?? 'ДОМ'
  );
  const [photoContrast, setPhotoContrast] = useState(0.35);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const [sliceThicknessMm, setSliceThickness] = useState(40);
  const [sawKerfMm, setKerf] = useState(3);
  const [showPanels, setShowPanels] = useState(true);
  const [highlightPanel, setHighlightPanel] = useState<number | null>(null);
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const [painting, setPainting] = useState(false);
  const [boardImage, setBoardImage] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPhotoRef = useRef<HTMLImageElement | null>(null);

  const speciesMap = useMemo(
    () => Object.fromEntries(SPECIES_CATALOG.map((species) => [species.id, species])),
    []
  );

  const recipe: MosaicRecipe = useMemo(
    () => ({
      units: 'mm',
      species: speciesMap,
      mosaic,
      crosscut: { sliceThicknessMm, sawKerfMm, bladeAngleDeg: 90 },
      allowances: { thicknessSurfacingMm: 3, stripWidthJointMm: 2, panelEndTrimMm: 30 },
    }),
    [speciesMap, mosaic, sliceThicknessMm, sawKerfMm]
  );

  const plan = useMemo(() => compileMosaic(recipe), [recipe]);
  const size = mosaicSize(mosaic);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mosaic));
      localStorage.setItem(`${STORAGE_KEY}.params`, JSON.stringify(params));
    } catch { /* приватный режим */ }
  }, [mosaic, params]);

  const regenerate = useCallback(
    (next: Params) => {
      if (next.paletteIds.length === 0) return;
      const ordered = SPECIES_CATALOG.filter((s) => next.paletteIds.includes(s.id))
        .sort(byLightness)
        .map((s) => s.id);
      setMosaic(
        generateMosaic(next.generator, {
          rows: next.rows,
          cols: next.cols,
          cellMm: next.cellMm,
          palette: ordered,
          rays: next.rays,
          rings: next.rings,
          seed: next.seed,
        })
      );
    },
    [setMosaic]
  );

  const patch = (changes: Partial<Params>, regen = true) => {
    setParams((current) => {
      const next = { ...current, ...changes };
      if (regen) regenerate(next);
      else if (changes.rows || changes.cols) {
        setMosaic((m) => resizeMosaic(m, next.rows, next.cols, palette[0] ?? 'maple'));
      }
      return next;
    });
  };

  const setFromText = useCallback(
    (value: string) => {
      setMosaic(
        textToMosaic(value, {
          rows: params.rows,
          cols: params.cols,
          cellMm: params.cellMm,
          background: palette[0] ?? 'maple',
          foreground: palette[palette.length - 1] ?? 'wenge',
        })
      );
    },
    [setMosaic, params.rows, params.cols, params.cellMm, palette]
  );

  const applyPhoto = useCallback(
    (image: HTMLImageElement, contrast: number) => {
      try {
        setMosaic(
          imageToMosaic(image, {
            rows: params.rows,
            cols: params.cols,
            cellMm: params.cellMm,
            palette,
            species: speciesMap,
            contrast,
          })
        );
        setPhotoError(null);
      } catch {
        setPhotoError('Не получилось разобрать изображение.');
      }
    },
    [setMosaic, params.rows, params.cols, params.cellMm, palette, speciesMap]
  );

  const onPhotoSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // разрешить выбрать тот же файл повторно
    if (!file) return;
    if (palette.length < 2) {
      setPhotoError('Добавь минимум 2 породы в палитру ниже — фото не из чего собрать.');
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      lastPhotoRef.current = image;
      setPhotoName(file.name);
      applyPhoto(image, photoContrast);
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      setPhotoError('Файл не открылся как изображение.');
      URL.revokeObjectURL(url);
    };
    image.src = url;
  };

  const onContrastChange = (value: number) => {
    setPhotoContrast(value);
    if (lastPhotoRef.current) applyPhoto(lastPhotoRef.current, value);
  };

  // ?text=СЛОВО — сразу набрать надпись, для демо-ссылок.
  useEffect(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('text');
    if (fromQuery) setFromText(fromQuery);
    // Только на старте: дальше текст набирается кнопкой.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== parent.clientWidth * dpr || canvas.height !== parent.clientHeight * dpr) {
      canvas.width = parent.clientWidth * dpr;
      canvas.height = parent.clientHeight * dpr;
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderMosaic(ctx, mosaic, { species: speciesMap, oil, showPanels, plan, hover, highlightPanel });
  }, [mosaic, speciesMap, oil, showPanels, plan, hover, highlightPanel]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'я')) {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [history]);

  const cellAt = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const rect = canvas.getBoundingClientRect();
    return hitTestCell(
      ctx, mosaic,
      (event.clientX - rect.left) * (canvas.width / rect.width),
      (event.clientY - rect.top) * (canvas.height / rect.height)
    );
  };

  const paintAt = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const cell = cellAt(event);
    if (!cell) return;
    setMosaic((current) => paintCell(current, cell.row, cell.col, brush));
  };

  const onExportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `endgrain-mosaic-${size.cols}x${size.rows}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const onPrint = () => {
    const offscreen = document.createElement('canvas');
    offscreen.width = 1200;
    offscreen.height = Math.round((1200 * size.rows) / Math.max(1, size.cols));
    const ctx = offscreen.getContext('2d');
    if (ctx) {
      renderMosaic(ctx, mosaic, { species: speciesMap, oil, background: '#ffffff' });
      setBoardImage(offscreen.toDataURL('image/png'));
    }
    window.setTimeout(() => window.print(), 60);
  };

  const dims = plan.finalDimensions;

  return (
    <>
      <main className="layout">
        <aside className="panel editor">
          <section>
            <h2>Рисунок</h2>
            <div className="presets">
              {GENERATORS.map((generator) => (
                <button
                  key={generator.id}
                  className={params.generator === generator.id ? 'on' : ''}
                  title={generator.tagline}
                  onClick={() => patch({ generator: generator.id })}
                >
                  {generator.name}
                </button>
              ))}
            </div>
            <div className="row-actions">
              <button onClick={() => patch({ seed: Math.floor(Math.random() * 1e9) })}>
                🎲 Другой вариант
              </button>
            </div>
          </section>

          <section>
            <h2>Свой текст</h2>
            <textarea
              value={text}
              rows={2}
              onChange={(event) => setText(event.target.value)}
              placeholder="СЛОВО&#10;ВТОРАЯ СТРОКА"
            />
            <button className="wide" onClick={() => setFromText(text)}>
              Набрать текстом
            </button>
            <p className="note-small">
              Буквы ложатся в клетки: чем крупнее сетка, тем читаемее. Тонкие шрифты рассыпаются —
              лучше короткое слово на 20+ клеток в ширину.
            </p>
          </section>

          <section>
            <h2>Своё фото</h2>
            <label className="wide file-input">
              <input type="file" accept="image/*" onChange={onPhotoSelected} />
              {photoName ? `📷 ${photoName}` : '📷 Выбрать фото'}
            </label>
            {lastPhotoRef.current && (
              <label className="oil">
                <span>Контраст</span>
                <input
                  type="range" min={0} max={100}
                  value={Math.round(photoContrast * 100)}
                  onChange={(event) => onContrastChange(Number(event.target.value) / 100)}
                />
                <span>{Math.round(photoContrast * 100)}%</span>
              </label>
            )}
            {photoError && <p className="warn-text">{photoError}</p>}
            <p className="note-small">
              Фото обрезается по центру под пропорции доски и сводится к {palette.length}{' '}
              {plural(palette.length, 'породе', 'породам', 'породам')} из палитры ниже. Силуэт
              с контрастным фоном получается лучше, чем портрет — на редкой сетке мелкие детали
              лица не читаются.
            </p>
          </section>

          <section>
            <h2>Сетка</h2>
            <label>
              Клеток по ширине
              <input
                type="number" min={3} max={60} value={params.cols}
                onChange={(event) => patch({ cols: Number(event.target.value) }, false)}
              />
            </label>
            <label>
              Клеток по высоте
              <input
                type="number" min={3} max={60} value={params.rows}
                onChange={(event) => patch({ rows: Number(event.target.value) }, false)}
              />
            </label>
            <label>
              Сторона клетки
              <input
                type="number" min={8} max={80} value={params.cellMm}
                onChange={(event) => {
                  const cellMm = Number(event.target.value);
                  setParams((c) => ({ ...c, cellMm }));
                  setMosaic((m) => ({ ...m, cellMm }));
                }}
              />
            </label>
            <label>
              Лучей
              <input
                type="number" min={2} max={24} value={params.rays}
                onChange={(event) => patch({ rays: Number(event.target.value) })}
              />
            </label>
            <label>
              Колец
              <input
                type="number" min={2} max={16} value={params.rings}
                onChange={(event) => patch({ rings: Number(event.target.value) })}
              />
            </label>
            <div className="row-actions">
              <button onClick={() => regenerate(params)}>Перерисовать</button>
              <button onClick={() => setMosaic(emptyMosaic(params.rows, params.cols, palette[0] ?? 'maple', params.cellMm))}>
                Очистить
              </button>
            </div>
          </section>

          <section>
            <h2>Палитра и кисть</h2>
            <div className="palette">
              {SPECIES_CATALOG.map((species) => {
                const inPalette = params.paletteIds.includes(species.id);
                return (
                  <button
                    key={species.id}
                    className={`chip${inPalette ? ' on' : ''}${brush === species.id ? ' brush' : ''}`}
                    title={inPalette ? 'Кисть · правый клик убирает из палитры' : 'Добавить в палитру'}
                    onClick={() => {
                      if (inPalette) setBrush(species.id);
                      else patch({ paletteIds: [...params.paletteIds, species.id] });
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (params.paletteIds.length > 2) {
                        patch({ paletteIds: params.paletteIds.filter((id) => id !== species.id) });
                      }
                    }}
                  >
                    <span className="swatch small" style={{ background: species.colorHex }} />
                    {species.name}
                  </button>
                );
              })}
            </div>
            <p className="note-small">
              Клик по породе из палитры — выбрать кисть, по остальным — добавить. Правый клик убирает.
              Рисуй прямо по доске: клетка = торец бруска.
            </p>
          </section>

          <section>
            <h2>Распил</h2>
            <label>
              Толщина доски
              <input
                type="number" min={10} max={80} value={sliceThicknessMm}
                onChange={(event) => setSliceThickness(Number(event.target.value))}
              />
            </label>
            <label>
              Пропил (kerf)
              <input
                type="number" min={0} step={0.1} value={sawKerfMm}
                onChange={(event) => setKerf(Number(event.target.value))}
              />
            </label>
            <label className="checkbox">
              <input
                type="checkbox" checked={showPanels}
                onChange={(event) => setShowPanels(event.target.checked)}
              />
              Показывать щиты над доской
            </label>
          </section>
        </aside>

        <section className="stage">
          <div className="canvas-wrap">
            <canvas
              ref={canvasRef}
              className="pickable"
              onMouseDown={(event) => { setPainting(true); paintAt(event); }}
              onMouseUp={() => setPainting(false)}
              onMouseLeave={() => { setPainting(false); setHover(null); }}
              onMouseMove={(event) => {
                setHover(cellAt(event));
                if (painting) paintAt(event);
              }}
            />
          </div>

          <p className="hint">
            {size.cols} × {size.rows} клеток по {params.cellMm} мм ·{' '}
            {plan.totals.glueUps} {plural(plan.totals.glueUps, 'щит', 'щита', 'щитов')} ·{' '}
            {plan.totals.stripsToPrepare} брусков · {plan.totals.crosscuts} резов
            {plan.flippedSlices > 0 && ` · ${plan.flippedSlices} планок кладём перевёрнутыми`}
          </p>

          <div className="oil">
            <label>Масло / проявка текстуры</label>
            <input
              type="range" min={0} max={100}
              value={Math.round(oil * 100)}
              onChange={(event) => onOilChange(Number(event.target.value) / 100)}
            />
            <span>{Math.round(oil * 100)}%</span>
          </div>
        </section>

        <aside className="panel report">
          <section>
            <h2>Готовая доска</h2>
            <div className="big">
              {formatLength(dims.topLengthMm, 'mm')} × {formatLength(dims.topWidthMm, 'mm')} × {formatLength(dims.thicknessMm, 'mm')}
            </div>
            <dl>
              <div><dt>Щитов склеить</dt><dd>{plan.totals.glueUps}</dd></div>
              <div><dt>Брусков заготовить</dt><dd>{plan.totals.stripsToPrepare}</dd></div>
              <div><dt>Поперечных резов</dt><dd>{plan.totals.crosscuts}</dd></div>
              <div><dt>Планок в доске</dt><dd>{plan.cols}</dd></div>
            </dl>
          </section>

          <section>
            <h2>Щиты</h2>
            <div className="panels-list">
              {plan.panels.map((panel) => (
                <div
                  key={panel.index}
                  className="panel-card"
                  onMouseEnter={() => setHighlightPanel(panel.index)}
                  onMouseLeave={() => setHighlightPanel(null)}
                >
                  <div className="panel-head">
                    <b>Щит {panel.index}</b>
                    <span>{panel.slices} {plural(panel.slices, 'планка', 'планки', 'планок')} · {Math.round(panel.roughLengthMm)} мм</span>
                  </div>
                  <div className="panel-order">
                    {panel.order.map((speciesId, index) => (
                      <span
                        key={index}
                        className="cell-dot"
                        title={speciesMap[speciesId]?.name}
                        style={{ background: speciesMap[speciesId]?.colorHex }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2>Материал и отходы</h2>
            <dl>
              <div><dt>Сырой объём</dt><dd>{plan.totals.rawVolumeM3.toFixed(5)} м³</dd></div>
              <div><dt>В доске</dt><dd>{plan.totals.netVolumeM3.toFixed(5)} м³</dd></div>
              <div><dt>На пропил</dt><dd>{Math.round(plan.waste.crosscutKerfM3 * 1e9).toLocaleString('ru-RU')} мм³</dd></div>
              <div><dt>На торцовку</dt><dd>{Math.round(plan.waste.endTrimM3 * 1e9).toLocaleString('ru-RU')} мм³</dd></div>
              <div className="accent"><dt>Отходы</dt><dd>{plan.totals.wastePct.toFixed(1)}%</dd></div>
              <div className="accent"><dt>Материал</dt><dd>{Math.round(plan.totals.totalCost).toLocaleString('ru-RU')} ₽</dd></div>
            </dl>
          </section>

          <section>
            <h2>По породам</h2>
            <table className="materials">
              <tbody>
                {plan.materials.map((material) => (
                  <tr key={material.speciesId}>
                    <td>
                      <span className="swatch small" style={{ background: speciesMap[material.speciesId]?.colorHex }} />
                      {material.speciesName}
                    </td>
                    <td>{material.pieces} бр.</td>
                    <td>{material.rawVolumeM3.toFixed(5)} м³</td>
                    <td>{Math.round(material.cost).toLocaleString('ru-RU')} ₽</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2>Столярный чек</h2>
            <ul className="warnings">
              {!plan.valid && plan.issues.map((issue) => <li key={issue}>{issue}</li>)}
              {plan.totals.glueUps > 8 && (
                <li>
                  {plan.totals.glueUps} щитов — это {plan.totals.glueUps} отдельных склеек.
                  Симметричный рисунок дешевле: зеркальные колонки режутся из одного щита.
                </li>
              )}
              {params.cellMm < 15 && <li>Клетка меньше 15 мм — бруски тонкие, склейка капризная.</li>}
              {plan.cols > 30 && <li>Больше 30 планок за одну склейку не стянуть: клей подгруппами.</li>}
            </ul>
            {plan.valid && plan.totals.glueUps <= 8 && params.cellMm >= 15 && plan.cols <= 30 && (
              <p className="ok">Рисунок изготовим как есть.</p>
            )}
          </section>

          <section>
            <div className="row-actions">
              <button onClick={onPrint}>Инструкция</button>
              <button onClick={onExportPng}>Отпечаток</button>
            </div>
          </section>
        </aside>
      </main>

      <MosaicPrintSheet
        plan={plan}
        species={speciesMap}
        cellMm={params.cellMm}
        boardImage={boardImage}
      />
    </>
  );
}
