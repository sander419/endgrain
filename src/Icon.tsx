/**
 * Единый набор иконок — outline, 1.6px обводка, currentColor. Без библиотеки:
 * набор маленький (то, что реально используется в интерфейсе), а подключать
 * icon-пакет ради 16 значков — лишний вес и лишняя зависимость.
 *
 * currentColor означает, что цвет иконки задаётся снаружи (обычно тем же
 * правилом, что красит заголовок секции) — так иконка и цветовой акцент
 * всегда остаются одним и тем же цветом, а не рассинхронизируются.
 */
import type { SVGProps } from 'react';

export type IconName =
  | 'grid' | 'brush' | 'board' | 'factory' | 'star'
  | 'layers' | 'swatch' | 'wrench' | 'coin' | 'droplet'
  | 'shield' | 'link' | 'print' | 'download' | 'ruler' | 'saw'
  | 'rotate' | 'type' | 'camera' | 'sun';

const PATHS: Record<IconName, string> = {
  // Стиль — сетка мотива
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  // Рисовать — кисть
  brush: 'M4 20c0-3 1-5 3-6l9-9 3 3-9 9c-1 2-3 3-6 3zM14 5l5 5',
  // Доска — прямоугольник с делениями (щит из брусков)
  board: 'M3 6h18v12H3zM7 6v12M11 6v12M15 6v12M19 6v12',
  // Производство — щиты/завод
  factory: 'M4 20V10l4 3V10l4 3V10l4 3V4h4v16zM4 20h16',
  // Избранное — звезда
  star: 'M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6-4.6-4.1 6.1-.6z',
  // Материал — слои
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  // Порода — образец цвета
  swatch: 'M6 3h8a2 2 0 0 1 2 2v13a3 3 0 1 1-6 0V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11',
  // Мастерская — гаечный ключ
  wrench: 'M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-3 3-2-2z',
  // Экономика — монета
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5c0-1.1 1-2 2.5-2s2.5.7 2.5 1.7-1 1.5-2.5 1.8-2.5.8-2.5 1.8S10.9 15 12.4 15s2.5-.6 2.5-1.7',
  // Влажность — капля
  droplet: 'M12 3s6 6.5 6 10.5a6 6 0 1 1-12 0C6 9.5 12 3 12 3z',
  // Столярный чек — щит
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  // ДНК-ссылка — звенья цепи
  link: 'M9 15l6-6M8 16l-2 2a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4-1M16 8l2-2a3 3 0 0 0-4-4l-3 3a3 3 0 0 0-1 4',
  // Инструкция — печать
  print: 'M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-2M6 14h12v7H6z',
  // Отпечаток — стрелка вниз
  download: 'M12 3v13m0 0-4-4m4 4 4-4M4 20h16',
  // Размеры — линейка
  ruler: 'M3 8h18v8H3zM7 8v3M11 8v3M15 8v3M19 8v3',
  // Распил — пила
  saw: 'M2 12h14M14 6l6 6-6 6M6 9l-2 3 2 3',
  // Трансформация — разворот
  rotate: 'M4 12a8 8 0 1 1 2.4 5.7M4 12v5h5',
  // Текст — литера
  type: 'M5 5h14M12 5v15',
  // Фото — камера
  camera: 'M4 8h3l2-2h6l2 2h3v11H4zM12 12.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  // От центра — лучи
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
};

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 15, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
