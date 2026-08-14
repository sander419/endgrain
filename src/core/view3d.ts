/**
 * Математика 3D-превью. Камера ортографическая, без перспективы: так плоскость
 * доски проецируется аффинно, а значит верхнюю грань можно положить на экран
 * готовой текстурой (`drawImage` + `setTransform`), не рисуя её заново под углом.
 *
 * Мир: X — вдоль длины доски, Y — поперёк (ширина), Z — вверх (толщина).
 * Углы: `yaw` — поворот вокруг Z, `pitch` — подъём камеры (π/2 — вид строго сверху).
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/** Точка мира на экране (единицы мира, без масштаба и сдвига). */
export function project(point: Vec3, yaw: number, pitch: number): Vec2 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = point.x * cy - point.y * sy;
  const y1 = point.x * sy + point.y * cy;
  return {
    x: x1,
    y: y1 * Math.sin(pitch) - point.z * Math.cos(pitch),
  };
}

/**
 * Удалённость от камеры: больше — дальше. Функция линейная, поэтому годится
 * и для отсечения невидимых граней по нормали.
 *
 * Знак согласован с `project`: там мир +Y уезжает вниз экрана, а низ экрана —
 * это ближний край доски. Перепутанный знак рисует дальние боковины, которые
 * тут же накрывает верхняя грань, и доска выглядит нулевой толщины.
 */
export function depth(point: Vec3, yaw: number, pitch: number): number {
  const y1 = point.x * Math.sin(yaw) + point.y * Math.cos(yaw);
  return -y1 * Math.cos(pitch) - point.z * Math.sin(pitch);
}

/** Грань видна, если её внешняя нормаль смотрит навстречу камере. */
export function isFaceVisible(normal: Vec3, yaw: number, pitch: number): boolean {
  return depth(normal, yaw, pitch) < 0;
}

/** Восемь углов параллелепипеда с началом в (0,0,0). */
export function boxCorners(lengthMm: number, widthMm: number, thicknessMm: number): Vec3[] {
  const corners: Vec3[] = [];
  for (const z of [0, thicknessMm]) {
    for (const y of [0, widthMm]) {
      for (const x of [0, lengthMm]) {
        corners.push({ x, y, z });
      }
    }
  }
  return corners;
}

export interface View3d {
  scale: number;
  offsetX: number;
  offsetY: number;
  yaw: number;
  pitch: number;
}

/**
 * Масштаб и сдвиг так, чтобы коробка целиком попала в канвас с полями.
 * Считается по восьми углам: при повороте габарит меняется, и «на глаз»
 * подобранный масштаб съедает углы доски.
 */
export function fitView(
  corners: Vec3[],
  canvasWidth: number,
  canvasHeight: number,
  pad: number,
  yaw: number,
  pitch: number
): View3d {
  const points = corners.map((corner) => project(corner, yaw, pitch));
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const contentW = Math.max(1e-6, maxX - minX);
  const contentH = Math.max(1e-6, maxY - minY);
  const availW = Math.max(1, canvasWidth - pad * 2);
  const availH = Math.max(1, canvasHeight - pad * 2);
  const scale = Math.min(availW / contentW, availH / contentH);
  return {
    scale,
    offsetX: (canvasWidth - (minX + maxX) * scale) / 2,
    offsetY: (canvasHeight - (minY + maxY) * scale) / 2,
    yaw,
    pitch,
  };
}

/** Точка мира в пикселях канваса. */
export function toScreen(point: Vec3, view: View3d): Vec2 {
  const p = project(point, view.yaw, view.pitch);
  return { x: p.x * view.scale + view.offsetX, y: p.y * view.scale + view.offsetY };
}

/**
 * Аффинная матрица для `setTransform`: кладёт картинку размером
 * `imageW × imageH` на горизонтальный прямоугольник [0,lengthMm] × [0,widthMm]
 * на высоте z. Порядок как у canvas: [a, b, c, d, e, f].
 */
export function planeTransform(
  imageW: number,
  imageH: number,
  lengthMm: number,
  widthMm: number,
  z: number,
  view: View3d
): [number, number, number, number, number, number] {
  const origin = toScreen({ x: 0, y: 0, z }, view);
  const alongX = toScreen({ x: lengthMm, y: 0, z }, view);
  const alongY = toScreen({ x: 0, y: widthMm, z }, view);
  return [
    (alongX.x - origin.x) / imageW,
    (alongX.y - origin.y) / imageW,
    (alongY.x - origin.x) / imageH,
    (alongY.y - origin.y) / imageH,
    origin.x,
    origin.y,
  ];
}

/** Ограничение подъёма камеры: снизу доску не показываем, плашмя — тоже. */
export const MIN_PITCH = (12 * Math.PI) / 180;
export const MAX_PITCH = (88 * Math.PI) / 180;

export function clampPitch(pitch: number): number {
  return Math.min(MAX_PITCH, Math.max(MIN_PITCH, pitch));
}
