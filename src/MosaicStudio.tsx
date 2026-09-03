import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FAMILY_NAMES,
  FAVORITES_LIMIT,
  GENERATORS,
  GENERATOR_BY_ID,
  SPECIES_CATALOG,
  addFavorite,
  analyseMosaic,
  buildMosaicShareUrl,
  compileMosaic,
  emptyMosaic,
  encodeMosaicDna,
  factsFromMosaic,
  formatLength,
  generateMosaic,
  loadFavorites,
  mosaicSize,
  paintCell,
  plural,
  readMosaicDnaFromLocation,
  removeFavorite,
  resizeMosaic,
} from './core';
import { toBase64Url } from './core';
import type {
  BoardFacts,
  ControlKey,
  Favorite,
  GeneratorFamily,
  GeneratorId,
  Mosaic,
  MosaicRecipe,
  WoodSpecies,
} from './core';
import { columnsForText } from './core/textFit';
import { hitTestCell, renderMosaic } from './render/mosaicBoard';
import { gridFromMosaic, gridKey, renderBoard3d } from './render/board3d';
import { useBoardCamera } from './useBoardCamera';
import { NestingPanel } from './NestingPanel';
import type { NestPiece } from './core/nesting';
import { textToMosaic } from './render/textMosaic';
import { imageToMosaic } from './render/imageMosaic';
import { MosaicPrintSheet } from './MosaicPrintSheet';
import { MoisturePanel } from './MoisturePanel';
import { EconomicsPanel } from './EconomicsPanel';
import { useWorkshop } from './WorkshopContext';
import { BatchPanel } from './BatchPanel';
import { WorkshopPanel } from './WorkshopPanel';
import { useHistoryState } from './useHistoryState';
import { Icon } from './Icon';
import type { IconName } from './Icon';

const STORAGE_KEY = 'endgrain.mosaic.v1';

/** Этапы работы: у каждого свои инструменты, своя раскладка и своя подсказка. */
type Tab = 'style' | 'draw' | 'board' | 'plan' | 'money' | 'saved';

/**
 * Раскладка меняется по этапу, и это главное решение всего экрана:
 * — `create`: рисуешь, поэтому холст занимает центр во всю высоту;
 * — `analyze`: читаешь отчёт, поэтому холст уезжает в угол превьюшкой,
 *   а место отдаётся таблицам и цифрам;
 * — `gallery`: холста нет вовсе.
 * Держать холст огромным на этапе чтения цифр — тратить главное место экрана
 * на картинку, которую ты уже нарисовал.
 */
type StageKind = 'create' | 'analyze' | 'gallery';

interface TabMeta {
  id: Tab;
  label: string;
  hint: string;
  icon: IconName;
  kind: StageKind;
  /** Подсказка «что здесь делать» — показывается над инструментами этапа. */
  tip: string;
}

const TABS: TabMeta[] = [
  {
    id: 'style', label: 'Стиль', icon: 'grid', kind: 'create',
    hint: 'Выбрать узор и покрутить его параметры',
    tip: 'Выбери узор слева, потом покрути его ручки. «Другой вариант» даёт новую версию того же стиля, а не случайный рисунок.',
  },
  {
    id: 'draw', label: 'Рисовать', icon: 'brush', kind: 'create',
    hint: 'Кисть, текст, своё фото',
    tip: 'Возьми породу-кисть и рисуй прямо по доске, зажав мышь. Или набери надпись, или загрузи фото — оно сведётся к твоим породам. Ctrl+Z отменяет.',
  },
  {
    id: 'board', label: 'Доска', icon: 'board', kind: 'create',
    hint: 'Размер сетки, породы, толщина',
    tip: 'Здесь физика: сколько клеток, какого размера брусок, какие породы в работе. Смена сетки сохраняет рисунок — перерисовать можно на вкладке «Стиль».',
  },
  {
    id: 'plan', label: 'Производство', icon: 'factory', kind: 'analyze',
    hint: 'Щиты, порядок сборки, столярный чек',
    tip: 'Во что рисунок превращается на верстаке. Наведи на щит — его колонки подсветятся на доске.',
  },
  {
    id: 'money', label: 'Экономика', icon: 'coin', kind: 'analyze',
    hint: 'Время, себестоимость, цена продажи, движение древесины',
    tip: 'Сколько времени уйдёт, во что обойдётся и за сколько продавать. Ставки мастерской настраиваются и запоминаются.',
  },
  {
    id: 'saved', label: 'Избранное', icon: 'star', kind: 'gallery',
    hint: 'Отложенные варианты',
    tip: 'Отложенные рисунки. Можно спокойно экспериментировать дальше — вариант не потеряется.',
  },
];

const TAB_BY_ID: Record<Tab, TabMeta> = Object.fromEntries(
  TABS.map((item) => [item.id, item])
) as Record<Tab, TabMeta>;

const FAMILY_ICONS: Record<GeneratorFamily, IconName> = {
  joinery: 'saw',
  geometry: 'ruler',
  radial: 'sun',
  generative: 'grid',
};

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
  scale: number;
  rays: number;
  rings: number;
  seed: number;
  paletteIds: string[];
}

const DEFAULT_PARAMS: Params = {
  generator: 'tumbling',
  rows: 21,
  cols: 21,
  cellMm: 25,
  scale: 3,
  rays: 6,
  rings: 6,
  seed: 7,
  // Контрастная четвёрка: на светлой палитре узор в дереве не читается.
  paletteIds: ['maple', 'oak', 'walnut', 'wenge'],
};

/** ?gen=landscape — прямая ссылка на конкретный стиль, для демо. */
function paramsFromQuery(base: Params): Params {
  const query = new URLSearchParams(window.location.search);
  const generator = query.get('gen');
  if (generator && GENERATORS.some((item) => item.id === generator)) {
    return { ...base, generator: generator as GeneratorId };
  }
  return base;
}

const FAMILY_ORDER: GeneratorFamily[] = ['joinery', 'geometry', 'radial', 'generative'];

interface Props {
  oil: number;
  onOilChange: (value: number) => void;
  /**
   * Куда студия кладёт свои факты и способ снять картинку. Через эту ссылку
   * заказы и документы работают в мозаике, не зная о её внутреннем состоянии.
   */
  boardRef?: { current: { facts: BoardFacts; capture: () => string } | null };
  /** Печатается документ клиенту — свой лист с инструкцией показывать нельзя. */
  printingDocument?: boolean;
}

export function MosaicStudio({ oil, onOilChange, boardRef, printingDocument }: Props) {
  const { pro } = useWorkshop();
  // ?stage=plan — прямая ссылка на этап, как ?gen= и ?print=.
  const [tab, setTab] = useState<Tab>(() => {
    const fromQuery = new URLSearchParams(window.location.search).get('stage');
    return TABS.some((item) => item.id === fromQuery) ? (fromQuery as Tab) : 'style';
  });
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

  // Не совпадает ли текущая мозаика с тем, что рисует выбранный стиль —
  // например, после загрузки чужой ДНК-ссылки, надписи или фото. Без этого
  // подсветка на вкладке «Стиль» врёт: показывает «Рельеф», пока на доске
  // явно что-то другое. Читаем ДНК из хэша ещё раз — функция чистая
  // и дешёвая, зато не нужно дёргать setState из чужого инициализатора.
  const [customLoaded, setCustomLoaded] = useState(() => readMosaicDnaFromLocation() !== null);

  const [mosaic, setMosaic, history] = useHistoryState<Mosaic>(() => {
    // Ссылка с ДНК (#mdna=) старше query и localStorage: по ней пришли смотреть
    // конкретный рисунок, а не свой сохранённый.
    const fromDna = readMosaicDnaFromLocation();
    if (fromDna) return fromDna;

    const start = paramsFromQuery(DEFAULT_PARAMS);
    if (start.generator === DEFAULT_PARAMS.generator) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) return JSON.parse(saved) as Mosaic;
      } catch { /* дефолт */ }
    }
    return generateMosaic(start.generator, { ...start, palette: start.paletteIds });
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
  const [highlightPanel, setHighlightPanel] = useState<number | null>(null);
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null);
  const [painting, setPainting] = useState(false);
  const [boardImage, setBoardImage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>(() => loadFavorites());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPhotoRef = useRef<HTMLImageElement | null>(null);

  const speciesMap = useMemo(
    () => Object.fromEntries(SPECIES_CATALOG.map((species) => [species.id, species])),
    []
  );

  const meta = GENERATOR_BY_ID[params.generator];

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
  const analysis = useMemo(() => analyseMosaic(mosaic), [mosaic]);
  const size = mosaicSize(mosaic);

  /**
   * Для мозаики «брусок» — это клетка, а суммарная ширина породы складывается
   * из клеток одной колонки: движение доски набирается поперёк, а не по всей площади.
   */
  const moistureUsage = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of mosaic.cells) {
      const cell = row[0];
      if (cell) counts.set(cell, (counts.get(cell) ?? 0) + 1);
    }
    // Если первая колонка не содержит какую-то породу, берём её по всей сетке —
    // иначе она выпадет из отчёта.
    for (const row of mosaic.cells) {
      for (const cell of row) if (!counts.has(cell)) counts.set(cell, 1);
    }
    return [...counts.entries()].map(([speciesId, cells]) => ({
      speciesId,
      totalWidthMm: cells * mosaic.cellMm,
      stripWidthMm: mosaic.cellMm,
    }));
  }, [mosaic]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mosaic));
      localStorage.setItem(`${STORAGE_KEY}.params`, JSON.stringify(params));
    } catch { /* приватный режим */ }
  }, [mosaic, params]);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2200);
  };

  const regenerate = useCallback(
    (next: Params) => {
      const ordered = SPECIES_CATALOG.filter((s) => next.paletteIds.includes(s.id))
        .sort(byLightness)
        .map((s) => s.id);
      setMosaic(generateMosaic(next.generator, { ...next, palette: ordered }));
      setCustomLoaded(false);
    },
    [setMosaic]
  );

  /** Правка параметров стиля: всегда перерисовывает — иначе ползунок «мёртвый». */
  const patchStyle = (changes: Partial<Params>) => {
    setParams((current) => {
      const next = { ...current, ...changes };
      regenerate(next);
      return next;
    });
  };

  /** Правка размеров доски: рисунок сохраняется, сетка подрезается/добивается. */
  const patchBoard = (changes: Partial<Params>) => {
    setParams((current) => {
      const next = { ...current, ...changes };
      if (changes.rows !== undefined || changes.cols !== undefined) {
        setMosaic((m) => resizeMosaic(m, next.rows, next.cols, palette[0] ?? 'maple'));
      }
      if (changes.cellMm !== undefined) {
        setMosaic((m) => ({ ...m, cellMm: next.cellMm }));
      }
      return next;
    });
  };

  const setFromText = useCallback(
    (value: string) => {
      // Сетка расширяется под длину надписи: на 21 колонке слово из шести букв
      // превращается в тёмную полосу — на знак остаётся три клетки.
      const cols = columnsForText(value, params.cols);
      if (cols !== params.cols) setParams((current) => ({ ...current, cols }));
      setMosaic(
        textToMosaic(value, {
          rows: params.rows,
          cols,
          cellMm: params.cellMm,
          background: palette[0] ?? 'maple',
          foreground: palette[palette.length - 1] ?? 'wenge',
        })
      );
      setCustomLoaded(true);
    },
    [setMosaic, setParams, params.rows, params.cols, params.cellMm, palette]
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
        setCustomLoaded(true);
      } catch {
        setPhotoError('Не получилось разобрать изображение.');
      }
    },
    [setMosaic, params.rows, params.cols, params.cellMm, palette, speciesMap]
  );

  const onPhotoSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (palette.length < 2) {
      setPhotoError('Добавь минимум 2 породы во вкладке «Доска» — фото не из чего собрать.');
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Щиты подсвечиваются только на вкладке производства — там это по делу. */
  const showPanels = tab === 'plan';

  // На вкладке рисования объём выключен: кисть работает по плоской сетке.
  const camera3d = useBoardCamera(tab !== 'draw');
  const show3d = camera3d.threeD && tab !== 'draw';
  const grid3d = useMemo(
    () =>
      gridFromMosaic(
        mosaic.cells,
        mosaic.cellMm,
        (speciesId) => speciesMap[speciesId]?.colorHex ?? '#888888',
        oil
      ),
    [mosaic, speciesMap, oil]
  );
  const grid3dKey = useMemo(() => gridKey(grid3d), [grid3d]);

  /**
   * Бруски для карты раскроя: у мозаики их заготавливают по щитам, поэтому
   * длина берётся у щита, а ширина — у клетки с припуском на строжку кромок.
   */
  const stockPieces = useMemo<NestPiece[]>(() => {
    const jointMm = recipe.allowances.stripWidthJointMm;
    return plan.panels.flatMap((panel) =>
      panel.order.map((speciesId, index) => ({
        pieceId: `p${panel.index}-${index}`,
        speciesId,
        lengthMm: panel.roughLengthMm,
        widthMm: mosaic.cellMm + jointMm,
      }))
    );
  }, [plan.panels, mosaic.cellMm, recipe.allowances.stripWidthJointMm]);

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
    if (show3d) {
      renderBoard3d(ctx, {
        grid: grid3d,
        thicknessMm: plan.finalDimensions.thicknessMm,
        yaw: camera3d.camera.yaw,
        pitch: camera3d.camera.pitch,
        textureKey: `mosaic:${grid3dKey}`,
      });
      return;
    }
    renderMosaic(ctx, mosaic, { species: speciesMap, oil, showPanels, plan, hover, highlightPanel });
  }, [
    mosaic, speciesMap, oil, showPanels, plan, hover, highlightPanel,
    show3d, grid3d, grid3dKey, camera3d.camera,
  ]);

  useEffect(() => { draw(); }, [draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  // Ссылку с ДНК могут открыть во вкладке, где студия уже запущена.
  useEffect(() => {
    const onHashChange = () => {
      const fromDna = readMosaicDnaFromLocation();
      if (!fromDna) return;
      setMosaic(fromDna);
      setCustomLoaded(true);
      flash('Открыта ДНК мозаики из ссылки');
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [setMosaic]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === 'z' || event.key === 'я')) {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
      }
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

  /** Кисть работает только на вкладке рисования — иначе случайные клики портят узор. */
  const paintAt = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (tab !== 'draw') return;
    const cell = cellAt(event);
    if (!cell) return;
    setMosaic((current) => paintCell(current, cell.row, cell.col, brush));
  };

  /**
   * Снимок рисунка. Фон — параметр: в интерфейсе доска лежит на тёмном, а
   * в документе, который печатают и отдают клиенту, тёмная заливка на пол-листа
   * это ведро краски и мятый лист.
   */
  const renderThumbnail = useCallback(
    (target: Mosaic, width = 220, background = '#14100d'): string => {
      const { rows, cols } = mosaicSize(target);
      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = Math.max(1, Math.round((width * rows) / Math.max(1, cols)));
      const ctx = offscreen.getContext('2d');
      if (!ctx) return '';
      renderMosaic(ctx, target, { species: speciesMap, oil, background });
      return offscreen.toDataURL('image/png');
    },
    [speciesMap, oil]
  );

  const onSaveFavorite = () => {
    const next = addFavorite(favorites, {
      title: meta?.name ?? 'Рисунок',
      mosaic,
      thumbnail: renderThumbnail(mosaic),
      summary: `${size.cols}×${size.rows} · ${plan.totals.glueUps} ${plural(plan.totals.glueUps, 'щит', 'щита', 'щитов')}`,
    });
    setFavorites(next);
    flash(next.length >= FAVORITES_LIMIT ? 'Сохранено, старые вытесняются' : 'Отложено в избранное');
  };

  const onShare = async () => {
    const url = buildMosaicShareUrl(mosaic);
    try {
      await navigator.clipboard.writeText(url);
      flash('ДНК мозаики скопирована в буфер');
    } catch {
      window.location.hash = url.split('#')[1] ?? '';
      flash('ДНК мозаики в адресной строке');
    }
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
    setBoardImage(renderThumbnail(mosaic, 1200));
    window.setTimeout(() => window.print(), 60);
  };

  // Ссылка обновляется на каждый рендер, а не по списку зависимостей: она
  // ничего не пересчитывает, а промахнуться списком тут значило бы отдать
  // в документ клиенту вчерашнюю доску.
  useEffect(() => {
    if (!boardRef) return;
    boardRef.current = {
      facts: factsFromMosaic(
        plan,
        speciesMap,
        toBase64Url(JSON.stringify(encodeMosaicDna(mosaic)))
      ),
      capture: () => renderThumbnail(mosaic, 1200, '#ffffff'),
    };
  });

  const dims = plan.finalDimensions;
  const paletteTooSmall = meta && palette.length < meta.minPalette;

  const controlValue = (key: ControlKey): number => params[key];

  const stage = TAB_BY_ID[tab];
  const analyzing = stage.kind === 'analyze';

  return (
    <>
      <div className="studio-tabs">
        {TABS.map((item, index) => (
          <button
            key={item.id}
            className={tab === item.id ? 'on' : ''}
            title={item.hint}
            onClick={() => setTab(item.id)}
          >
            <span className="step-num">{index + 1}</span>
            <Icon name={item.icon} size={14} />
            {item.label}
            {item.id === 'saved' && favorites.length > 0 && (
              <span className="badge">{favorites.length}</span>
            )}
          </button>
        ))}
      </div>

      <main className={`layout studio stage-${stage.kind}`}>
        <aside className="panel editor" hidden={stage.kind !== 'create'}>
          <p className="stage-tip"><Icon name={stage.icon} size={14} />{stage.tip}</p>

          {tab === 'style' && (
            <>
              {customLoaded && (
                <p className="note-small custom-loaded">
                  На доске рисунок не из этого списка — из ссылки, текста, фото или кисти.
                  Выбери стиль ниже, чтобы заменить его.
                </p>
              )}
              {FAMILY_ORDER.map((family) => (
                <section key={family}>
                  <h2><Icon name={FAMILY_ICONS[family]} />{FAMILY_NAMES[family]}</h2>
                  <div className="presets">
                    {GENERATORS.filter((item) => item.family === family).map((item) => (
                      <button
                        key={item.id}
                        className={!customLoaded && params.generator === item.id ? 'on' : ''}
                        title={item.tagline}
                        onClick={() => patchStyle({ generator: item.id })}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </section>
              ))}

              <section>
                <h2><Icon name="wrench" size={13} />Настройка стиля</h2>
                <p className="note-small style-tagline">
                  {customLoaded
                    ? 'Ручки ниже применяются к последнему выбранному стилю, не к текущей картинке.'
                    : meta?.tagline}
                </p>

                {meta?.controls.map((control) => (
                  <label key={control.key}>
                    {control.label}
                    <input
                      type="range"
                      min={control.min}
                      max={control.max}
                      value={controlValue(control.key)}
                      onChange={(event) => patchStyle({ [control.key]: Number(event.target.value) } as Partial<Params>)}
                    />
                    <span className="value">{controlValue(control.key)}</span>
                  </label>
                ))}

                {meta?.controls.length === 0 && (
                  <p className="note-small">У этого стиля нет настроек — рисунок задан целиком.</p>
                )}

                {meta?.seeded ? (
                  <button
                    className="wide wild"
                    onClick={() => patchStyle({ seed: Math.floor(Math.random() * 1e9) })}
                  >
                    🎲 Другой вариант этого стиля
                  </button>
                ) : (
                  <p className="note-small">
                    Фрактал задан математикой: вариантов у него нет, только размер сетки.
                  </p>
                )}

                {paletteTooSmall && (
                  <p className="warn-text">
                    Стилю нужно минимум {meta?.minPalette} породы, сейчас {palette.length}.
                    Добавь во вкладке «Доска».
                  </p>
                )}
              </section>
            </>
          )}

          {tab === 'draw' && (
            <>
              <section>
                <h2><Icon name="brush" />Кисть</h2>
                <div className="palette">
                  {palette.map((id) => (
                    <button
                      key={id}
                      className={`chip on${brush === id ? ' brush' : ''}`}
                      onClick={() => setBrush(id)}
                    >
                      <span className="swatch small" style={{ background: speciesMap[id]?.colorHex }} />
                      {speciesMap[id]?.name}
                    </button>
                  ))}
                </div>
                <p className="note-small">
                  Рисуй прямо по доске — клетка это торец бруска. Ctrl+Z отменяет.
                  Породы для палитры набираются во вкладке «Доска».
                </p>
                <button
                  className="wide"
                  onClick={() => setMosaic(emptyMosaic(params.rows, params.cols, palette[0] ?? 'maple', params.cellMm))}
                >
                  Очистить доску
                </button>
              </section>

              <section>
                <h2><Icon name="type" />Свой текст</h2>
                <textarea
                  value={text}
                  rows={2}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="СЛОВО&#10;ВТОРАЯ СТРОКА"
                />
                <button className="wide" onClick={() => setFromText(text)}>Набрать текстом</button>
                <p className="note-small">
                  Буквы ложатся в клетки: чем крупнее сетка, тем читаемее. Короткое слово
                  на 20+ клеток в ширину читается уверенно.
                </p>
              </section>

              <section>
                <h2><Icon name="camera" />Своё фото</h2>
                <label className="wide file-input">
                  <input type="file" accept="image/*" onChange={onPhotoSelected} />
                  {photoName ? `📷 ${photoName}` : '📷 Выбрать фото'}
                </label>
                {lastPhotoRef.current && (
                  <label>
                    Контраст
                    <input
                      type="range" min={0} max={100}
                      value={Math.round(photoContrast * 100)}
                      onChange={(event) => onContrastChange(Number(event.target.value) / 100)}
                    />
                    <span className="value">{Math.round(photoContrast * 100)}</span>
                  </label>
                )}
                {photoError && <p className="warn-text">{photoError}</p>}
                <p className="note-small">
                  Фото обрезается по центру и сводится к породам палитры. Силуэт с контрастным
                  фоном получается лучше портрета — на редкой сетке мелкие детали не читаются.
                </p>
              </section>
            </>
          )}

          {tab === 'board' && (
            <>
              <section>
                <h2><Icon name="swatch" />Породы в работе</h2>
                <div className="palette">
                  {SPECIES_CATALOG.map((species) => {
                    const inPalette = params.paletteIds.includes(species.id);
                    const last = inPalette && params.paletteIds.length <= 2;
                    return (
                      <button
                        key={species.id}
                        className={`chip${inPalette ? ' on' : ''}`}
                        title={
                          last
                            ? 'Меньше двух пород узора не получится'
                            : inPalette ? 'Убрать из палитры' : 'Добавить в палитру'
                        }
                        disabled={last}
                        onClick={() =>
                          patchStyle({
                            paletteIds: inPalette
                              ? params.paletteIds.filter((id) => id !== species.id)
                              : [...params.paletteIds, species.id],
                          })
                        }
                      >
                        <span className="swatch small" style={{ background: species.colorHex }} />
                        {species.name}
                      </button>
                    );
                  })}
                </div>
                <p className="note-small">
                  Клик добавляет или убирает породу. Генераторы раскладывают их от светлой
                  к тёмной, поэтому контрастный набор читается лучше.
                </p>
              </section>

              <section>
                <h2><Icon name="grid" />Сетка</h2>
                <label>
                  Клеток по ширине
                  <input
                    type="number" min={3} max={60} value={params.cols}
                    onChange={(event) => patchBoard({ cols: clampInput(event.target.value, 3, 60, params.cols) })}
                  />
                </label>
                <label>
                  Клеток по высоте
                  <input
                    type="number" min={3} max={60} value={params.rows}
                    onChange={(event) => patchBoard({ rows: clampInput(event.target.value, 3, 60, params.rows) })}
                  />
                </label>
                <label>
                  Сторона клетки, мм
                  <input
                    type="number" min={8} max={80} value={params.cellMm}
                    onChange={(event) => patchBoard({ cellMm: clampInput(event.target.value, 8, 80, params.cellMm) })}
                  />
                </label>
                <p className="note-small">
                  Размер доски: {formatLength(dims.topLengthMm, 'mm')} × {formatLength(dims.topWidthMm, 'mm')}.
                  Смена сетки сохраняет рисунок — чтобы перерисовать под новый размер, зайди
                  в «Стиль» и нажми «Другой вариант».
                </p>
              </section>

              <section>
                <h2><Icon name="saw" />Распил</h2>
                <label>
                  Толщина доски, мм
                  <input
                    type="number" min={10} max={80} value={sliceThicknessMm}
                    onChange={(event) => setSliceThickness(clampInput(event.target.value, 10, 80, sliceThicknessMm))}
                  />
                </label>
                <label>
                  Пропил (kerf), мм
                  <input
                    type="number" min={0} max={10} step={0.1} value={sawKerfMm}
                    onChange={(event) => setKerf(clampInput(event.target.value, 0, 10, sawKerfMm))}
                  />
                </label>
              </section>
            </>
          )}

        </aside>

        <section className="stage">
          {tab === 'saved' ? (
            <div className="gallery">
              <div className="gallery-head">
                <p className="stage-tip"><Icon name={stage.icon} size={14} />{stage.tip}</p>
                <button className="primary" onClick={onSaveFavorite}>
                  <Icon name="star" size={13} />Отложить текущий рисунок
                </button>
                <span className="note-small">{favorites.length} из {FAVORITES_LIMIT}</span>
              </div>
              {favorites.length === 0 && (
                <p className="empty">
                  Пока пусто. Нарисуй что-нибудь и нажми «Отложить» — можно спокойно
                  экспериментировать дальше, вариант не потеряется.
                </p>
              )}
              {favorites.map((item) => (
                <figure key={item.id} className="gallery-card">
                  <img src={item.thumbnail} alt={item.title} />
                  <figcaption>
                    <b>{item.title}</b>
                    <span>{item.summary}</span>
                  </figcaption>
                  <div className="gallery-actions">
                    <button
                      onClick={() => {
                        setMosaic(item.mosaic);
                        setTab('style');
                        flash('Рисунок восстановлен');
                      }}
                    >
                      Открыть
                    </button>
                    <button
                      className="ghost"
                      onClick={() => {
                        setFavorites(removeFavorite(favorites, item.id));
                        flash('Удалено из избранного');
                      }}
                    >
                      Убрать
                    </button>
                  </div>
                </figure>
              ))}
            </div>
          ) : (
            <>
              <div className="canvas-wrap">
                {show3d ? (
                  <canvas ref={canvasRef} className="grabbable" {...camera3d.handlers} />
                ) : (
                  <canvas
                    ref={canvasRef}
                    className={tab === 'draw' ? 'pickable' : ''}
                    onMouseDown={(event) => { setPainting(true); paintAt(event); }}
                    onMouseUp={() => setPainting(false)}
                    onMouseLeave={() => { setPainting(false); setHover(null); }}
                    onMouseMove={(event) => {
                      if (tab === 'draw') setHover(cellAt(event));
                      if (painting) paintAt(event);
                    }}
                  />
                )}
                {tab !== 'draw' && (
                  <div className="view-toggle">
                    <button
                      className={camera3d.threeD ? '' : 'on'}
                      onClick={() => camera3d.setThreeD(false)}
                    >
                      <Icon name="grid" size={13} />План
                    </button>
                    <button
                      className={camera3d.threeD ? 'on' : ''}
                      onClick={() => camera3d.setThreeD(true)}
                    >
                      <Icon name="board" size={13} />3D
                    </button>
                    {show3d && (
                      <button className="ghost" onClick={camera3d.reset} title="Вернуть камеру">↺</button>
                    )}
                  </div>
                )}
                {show3d && (
                  <p className="view-hint">
                    {camera3d.spin
                      ? 'Тяни мышью, чтобы повернуть доску'
                      : `Толщина ${Math.round(plan.finalDimensions.thicknessMm)} мм — толщина среза`}
                  </p>
                )}
              </div>

              {/* На этапах чтения цифры выносим прямо под превью: там они и нужны. */}
              <p className="hint">
                {size.cols} × {size.rows} клеток по {params.cellMm} мм ·{' '}
                {plan.totals.glueUps} {plural(plan.totals.glueUps, 'щит', 'щита', 'щитов')} ·{' '}
                {plan.totals.stripsToPrepare} брусков · {plan.totals.crosscuts} резов
                {plan.flippedSlices > 0 && ` · ${plan.flippedSlices} планок кладём перевёрнутыми`}
              </p>

              <div className="oil">
                <label>Масло</label>
                <input
                  type="range" min={0} max={100}
                  value={Math.round(oil * 100)}
                  onChange={(event) => onOilChange(Number(event.target.value) / 100)}
                />
                <span>{Math.round(oil * 100)}%</span>
              </div>

              {analyzing && (
                <section className="stage-summary">
                  <h2><Icon name="board" />Готовая доска</h2>
                  <div className="big">
                    {formatLength(dims.topLengthMm, 'mm')} × {formatLength(dims.topWidthMm, 'mm')} × {formatLength(dims.thicknessMm, 'mm')}
                  </div>
                  <dl>
                    <div><dt>Сырой объём</dt><dd>{plan.totals.rawVolumeM3.toFixed(5)} м³</dd></div>
                    <div><dt>В доске</dt><dd>{plan.totals.netVolumeM3.toFixed(5)} м³</dd></div>
                    <div className="accent"><dt>Отходы</dt><dd>{plan.totals.wastePct.toFixed(1)}%</dd></div>
                    <div className="accent"><dt>Материал</dt><dd>{Math.round(plan.totals.totalCost).toLocaleString('ru-RU')} ₽</dd></div>
                  </dl>
                </section>
              )}
            </>
          )}
        </section>

        {/* Правая колонка держит только то, что относится к текущему этапу.
            Раньше здесь висело всё сразу — отсюда и брался визуальный шум. */}
        <aside className="panel report" hidden={stage.kind === 'gallery'}>
          {analyzing && <p className="stage-tip"><Icon name={stage.icon} size={14} />{stage.tip}</p>}

          {stage.kind === 'create' && (
            <section className="quick-summary">
              <h2><Icon name="board" />Что получается</h2>
              <div className="big">
                {formatLength(dims.topLengthMm, 'mm')} × {formatLength(dims.topWidthMm, 'mm')}
              </div>
              <dl>
                <div><dt>Толщина</dt><dd>{formatLength(dims.thicknessMm, 'mm')}</dd></div>
                <div><dt>Щитов склеить</dt><dd>{plan.totals.glueUps}</dd></div>
                <div className="accent"><dt>Отходы</dt><dd>{plan.totals.wastePct.toFixed(1)}%</dd></div>
                <div className="accent"><dt>Материал</dt><dd>{Math.round(plan.totals.totalCost).toLocaleString('ru-RU')} ₽</dd></div>
              </dl>
              <p className="note-small">
                Полный расчёт — на этапах «Производство» и «Экономика».
              </p>
            </section>
          )}

          {tab === 'plan' && (
            <>
              <section className="dom-production">
                <h2><Icon name="factory" />Как это собирать</h2>
                <dl>
                  <div><dt>Щитов склеить</dt><dd>{plan.totals.glueUps}</dd></div>
                  <div><dt>Брусков заготовить</dt><dd>{plan.totals.stripsToPrepare}</dd></div>
                  <div><dt>Поперечных резов</dt><dd>{plan.totals.crosscuts}</dd></div>
                  <div><dt>Планок в доске</dt><dd>{plan.cols}</dd></div>
                </dl>
              </section>

              <section className="dom-production">
                <h2><Icon name="layers" />Щиты</h2>
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
                        <span>
                          {panel.slices} {plural(panel.slices, 'планка', 'планки', 'планок')} ·{' '}
                          {Math.round(panel.roughLengthMm)} мм
                        </span>
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
                <p className="note-small">Наведи на щит — его колонки подсветятся на доске.</p>
              </section>

              <NestingPanel pieces={stockPieces} kerfMm={sawKerfMm} species={speciesMap} />

              <section className="dom-production">
                <h2><Icon name="rotate" />Способ сборки</h2>
                {analysis.block ? (
                  <p className="advice">
                    Рисунок повторяется блоком <b>{analysis.block.blockCols}×{analysis.block.blockRows}</b>{' '}
                    ({analysis.block.repeatsX}×{analysis.block.repeatsY} раз). Собери один блок и
                    размножь его: короткие струбцины вместо длинных, блоки клеятся параллельно,
                    а брак в одном блоке не убивает всю доску.
                  </p>
                ) : (
                  <p className="note-small">
                    Рисунок не повторяется — доска собирается одной склейкой из {plan.cols} планок.
                  </p>
                )}
                {analysis.symmetry.vertical && (
                  <p className="advice">
                    Рисунок зеркален по вертикали — половина планок получается переворотом
                    на 180°, поэтому щитов вдвое меньше.
                  </p>
                )}
              </section>

              <section>
                <h2><Icon name="shield" />Столярный чек</h2>
                <ul className="warnings">
                  {!plan.valid && plan.issues.map((issue) => <li key={issue}>{issue}</li>)}
                  {plan.totals.glueUps > 8 && !analysis.block && (
                    <li>
                      {plan.totals.glueUps} щитов — это {plan.totals.glueUps} отдельных склеек.
                      Симметричный или повторяющийся рисунок обойдётся дешевле.
                    </li>
                  )}
                  {params.cellMm < 15 && <li>Клетка меньше 15 мм — бруски тонкие, склейка капризная.</li>}
                  {plan.cols > 30 && <li>Больше 30 планок за одну склейку не стянуть: клей подгруппами.</li>}
                  {paletteTooSmall && <li>Пород меньше, чем нужно стилю — узор выйдет бедным.</li>}
                </ul>
                {plan.valid && plan.totals.glueUps <= 8 && params.cellMm >= 15 && plan.cols <= 30 && !paletteTooSmall && (
                  <p className="ok">Рисунок изготовим как есть.</p>
                )}
              </section>
            </>
          )}

          {tab === 'money' && (
            <>
              <WorkshopPanel />

              <EconomicsPanel
                input={{
                  strips: plan.totals.stripsToPrepare,
                  glueUps: plan.totals.glueUps,
                  crosscuts: plan.totals.crosscuts,
                  lengthMm: dims.topLengthMm,
                  widthMm: dims.topWidthMm,
                  materialCostRub: plan.totals.totalCost,
                }}
              />

              {pro && (
                <BatchPanel
                  input={{
                    strips: plan.totals.stripsToPrepare,
                    glueUps: plan.totals.glueUps,
                    crosscuts: plan.totals.crosscuts,
                    lengthMm: dims.topLengthMm,
                    widthMm: dims.topWidthMm,
                    materialCostRub: plan.totals.totalCost,
                  }}
                  pieces={stockPieces}
                  kerfMm={sawKerfMm}
                />
              )}

              <MoisturePanel usage={moistureUsage} species={speciesMap} />
            </>
          )}

          <section className="actions-block">
            <div className="row-actions">
              <button className="primary" onClick={onShare}><Icon name="link" size={14} />Скопировать ДНК</button>
              <button onClick={onSaveFavorite}><Icon name="star" size={14} />Отложить</button>
            </div>
            <div className="row-actions">
              <button onClick={onPrint}><Icon name="print" size={14} />Инструкция</button>
              <button onClick={onExportPng}><Icon name="download" size={14} />Отпечаток</button>
            </div>
          </section>
        </aside>
      </main>

      {toast && <div className="toast">{toast}</div>}

      {!printingDocument && <MosaicPrintSheet
        plan={plan}
        species={speciesMap}
        cellMm={params.cellMm}
        kerfMm={sawKerfMm}
        boardImage={boardImage}
      />}
    </>
  );
}

/** Пустое или нечисловое поле не должно обнулять доску — держим прежнее значение. */
function clampInput(raw: string, min: number, max: number, fallback: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
