/**
 * Профиль мастерской: какие станки есть — такой и рецепт.
 *
 * Инструкция «отфрезеруй на CNC» бесполезна тому, у кого нет CNC, а совет
 * «выровняй на фуганке» — тому, у кого только рубанок и шлифмашина. Поэтому
 * операции описаны через ТРЕБОВАНИЕ к инструменту, а не через конкретный станок,
 * и у каждой есть обходной путь с честной оценкой, во сколько раз он дольше.
 */

export type ToolId =
  | 'tablesaw'
  | 'mitresaw'
  | 'bandsaw'
  | 'jointer'
  | 'planer'
  | 'drumSander'
  | 'router'
  | 'orbitalSander'
  | 'clamps'
  | 'cnc';

export interface ToolMeta {
  id: ToolId;
  name: string;
  hint: string;
}

export const TOOLS: ToolMeta[] = [
  { id: 'tablesaw', name: 'Циркулярная пила', hint: 'Продольный и поперечный рез с кареткой' },
  { id: 'mitresaw', name: 'Торцовочная пила', hint: 'Поперечный рез в размер' },
  { id: 'bandsaw', name: 'Ленточная пила', hint: 'Роспуск и кривой рез, тонкий пропил' },
  { id: 'jointer', name: 'Фуговальный станок', hint: 'Плоскость и прямой угол кромки' },
  { id: 'planer', name: 'Рейсмус', hint: 'Толщина в размер' },
  { id: 'drumSander', name: 'Барабанный шлифстанок', hint: 'Выравнивание торцевого щита' },
  { id: 'router', name: 'Фрезер', hint: 'Фаска, канавки, выравнивание по салазкам' },
  { id: 'orbitalSander', name: 'Эксцентриковая шлифмашина', hint: 'Финишная шлифовка' },
  { id: 'clamps', name: 'Струбцины', hint: 'Без них склейки не будет' },
  { id: 'cnc', name: 'ЧПУ-фрезер', hint: 'Не обязателен: доска делается без него' },
];

/** Типовой набор мастерской-одиночки. */
export const DEFAULT_TOOLS: ToolId[] = [
  'tablesaw', 'mitresaw', 'jointer', 'planer', 'router', 'orbitalSander', 'clamps',
];

export type StepId =
  | 'dimension'
  | 'jointEdges'
  | 'glueUpPanel'
  | 'crosscut'
  | 'glueUpBoard'
  | 'flatten'
  | 'chamfer'
  | 'sand'
  | 'finish';

export interface StepPlan {
  id: StepId;
  title: string;
  /** Как делать при наличии основного инструмента. */
  primary: string;
  /** Инструменты, любой из которых закрывает шаг штатно. */
  requires: ToolId[];
  /** Чем заменить, если ничего из requires нет. */
  fallback?: {
    text: string;
    /** Во сколько раз дольше обходной путь. */
    timeFactor: number;
    /** Инструменты, нужные для обходного пути. */
    needs: ToolId[];
  };
  /** Совсем без вариантов: шаг невозможен. */
  blocking?: boolean;
}

/**
 * Порядок операций изготовления торцевой доски. Формулировки — то, что реально
 * делают руками, без отсылок к конкретным брендам станков.
 */
export const STEP_PLANS: StepPlan[] = [
  {
    id: 'dimension',
    title: 'Выстрогать бруски в размер',
    primary: 'Рейсмус выводит толщину всех брусков одинаковой — это условие плотной склейки.',
    requires: ['planer'],
    fallback: {
      text: 'Без рейсмуса толщину выводят фрезером по салазкам либо шлифмашиной с контролем штангенциркулем. Долго и требует терпения, но выполнимо.',
      timeFactor: 2.5,
      needs: ['router', 'orbitalSander'],
    },
  },
  {
    id: 'jointEdges',
    title: 'Отфуговать кромки',
    primary: 'Фуганок даёт прямую кромку под 90° — без неё в склейке останутся щели.',
    requires: ['jointer'],
    fallback: {
      text: 'Кромку ровняют на циркулярной пиле с направляющей или фрезером по прямой рейке. Проверять угольником каждую заготовку.',
      timeFactor: 1.6,
      needs: ['tablesaw', 'router'],
    },
  },
  {
    id: 'glueUpPanel',
    title: 'Склеить щит',
    primary: 'Струбцины через каждые 15–20 см, усилие равномерное с обеих сторон.',
    requires: ['clamps'],
    blocking: true,
  },
  {
    id: 'crosscut',
    title: 'Нарезать планки',
    primary: 'Циркулярная пила с кареткой держит перпендикулярность на всю ширину щита.',
    requires: ['tablesaw', 'bandsaw', 'mitresaw'],
    blocking: true,
  },
  {
    id: 'glueUpBoard',
    title: 'Склеить доску из планок',
    primary: 'Собрать насухо по карте, потом клеить: торец пьёт клей, наносить надо щедро.',
    requires: ['clamps'],
    blocking: true,
  },
  {
    id: 'flatten',
    title: 'Вывести плоскость',
    primary: 'Барабанный шлифстанок — единственный безопасный способ выровнять торцевой щит.',
    requires: ['drumSander'],
    fallback: {
      text: 'Рейсмус на торцевую доску пускать нельзя — вырывает волокна и бьёт заготовку. Выравнивают фрезером по салазкам (router sled), потом шлифуют.',
      timeFactor: 3,
      needs: ['router'],
    },
  },
  {
    id: 'chamfer',
    title: 'Снять фаску',
    primary: 'Фрезер с кромочной фрезой по периметру.',
    requires: ['router'],
    fallback: {
      text: 'Фаску снимают шлифмашиной или рубанком под 45°, потом равняют вручную.',
      timeFactor: 1.5,
      needs: ['orbitalSander'],
    },
  },
  {
    id: 'sand',
    title: 'Отшлифовать',
    primary: 'От 80 до 220 зерна, торец берёт абразив хуже пласти.',
    requires: ['orbitalSander', 'drumSander'],
    fallback: {
      text: 'Вручную с бруском. На торцевой доске это долго, но результат тот же.',
      timeFactor: 4,
      needs: [],
    },
  },
  {
    id: 'finish',
    title: 'Промаслить',
    primary: 'Минеральное масло или масло с воском в несколько слоёв с промежуточной сушкой.',
    requires: [],
  },
];

export interface ResolvedStep {
  plan: StepPlan;
  /** Есть ли штатный инструмент. */
  hasPrimary: boolean;
  /** Текст, который надо показать: штатный или обходной. */
  instruction: string;
  /** Доступен ли обходной путь, если штатного инструмента нет. */
  fallbackAvailable: boolean;
  /** Шаг нечем сделать вообще. */
  blocked: boolean;
  /** Множитель времени для этого шага. */
  timeFactor: number;
}

function hasAny(tools: ToolId[], needed: ToolId[]): boolean {
  return needed.length === 0 || needed.some((tool) => tools.includes(tool));
}

export function resolveSteps(tools: ToolId[]): ResolvedStep[] {
  return STEP_PLANS.map((plan) => {
    const hasPrimary = hasAny(tools, plan.requires);
    if (hasPrimary) {
      return {
        plan, hasPrimary: true, instruction: plan.primary,
        fallbackAvailable: false, blocked: false, timeFactor: 1,
      };
    }

    if (plan.fallback && hasAny(tools, plan.fallback.needs)) {
      return {
        plan, hasPrimary: false, instruction: plan.fallback.text,
        fallbackAvailable: true, blocked: false, timeFactor: plan.fallback.timeFactor,
      };
    }

    return {
      plan,
      hasPrimary: false,
      instruction: plan.fallback?.text ?? plan.primary,
      fallbackAvailable: false,
      blocked: true,
      timeFactor: plan.fallback?.timeFactor ?? 1,
    };
  });
}

export interface WorkshopReadiness {
  steps: ResolvedStep[];
  /** Шаги, которые нечем закрыть. */
  blocked: ResolvedStep[];
  /** Шаги, идущие обходным путём. */
  workarounds: ResolvedStep[];
  /**
   * Насколько дольше выйдет вся работа против полностью оснащённой мастерской.
   * Считается по шагам, которые идут в обход, взвешенно и грубо: это ориентир,
   * а не смета.
   */
  timeMultiplier: number;
  /** Можно ли вообще сделать доску этим набором. */
  feasible: boolean;
}

export function assessWorkshop(tools: ToolId[]): WorkshopReadiness {
  const steps = resolveSteps(tools);
  const blocked = steps.filter((step) => step.blocked);
  const workarounds = steps.filter((step) => step.fallbackAvailable);

  // Обходные пути растягивают не всю работу, а свой шаг. Усредняем по числу
  // шагов, чтобы множитель не улетал в космос от одного долгого обхода.
  const total = steps.reduce((sum, step) => sum + step.timeFactor, 0);
  const timeMultiplier = steps.length > 0 ? total / steps.length : 1;

  return {
    steps,
    blocked,
    workarounds,
    timeMultiplier,
    feasible: blocked.length === 0,
  };
}
