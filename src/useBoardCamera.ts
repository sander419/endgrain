/**
 * Камера объёмного превью: общая для «Рецепта» и «Мозаики», чтобы доска
 * крутилась одинаково в обоих режимах и параметр `?view=3d` работал везде.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { clampPitch } from './core/view3d';

export interface BoardCamera {
  yaw: number;
  pitch: number;
}

const START: BoardCamera = { yaw: -0.62, pitch: 0.63 };
/** Радиан в секунду: доска делает оборот примерно за 25 секунд. */
const SPIN_SPEED = 0.25;

export function useBoardCamera(active: boolean) {
  const [threeD, setThreeD] = useState(
    () => new URLSearchParams(window.location.search).get('view') === '3d'
  );
  const [camera, setCamera] = useState<BoardCamera>(START);
  // Пока доску не тронули руками, она медленно поворачивается: иначе объём
  // читается как плоская картинка под углом, и никто не пробует её крутить.
  const [spin, setSpin] = useState(true);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!threeD || !active || !spin) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setCamera((current) => ({ ...current, yaw: current.yaw + dt * SPIN_SPEED }));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [threeD, active, spin]);

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    drag.current = { x: event.clientX, y: event.clientY };
    setSpin(false);
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const from = drag.current;
    if (!from) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    drag.current = { x: event.clientX, y: event.clientY };
    setCamera((current) => ({
      yaw: current.yaw + dx * 0.008,
      pitch: clampPitch(current.pitch - dy * 0.006),
    }));
  }, []);

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    drag.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* указатель уже отпущен */
    }
  }, []);

  const reset = useCallback(() => {
    setCamera(START);
    setSpin(true);
  }, []);

  return {
    threeD,
    setThreeD,
    camera,
    spin,
    setSpin,
    reset,
    /** Вешаются на канвас только когда включён объём. */
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
  };
}
