import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_TOOLS, TOOLS, assessWorkshop } from './core';
import type { ToolId } from './core';
import { Icon } from './Icon';

const STORAGE_KEY = 'endgrain.workshop.v1';

export function loadTools(): ToolId[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed as ToolId[];
    }
  } catch {
    /* приватный режим или битые данные */
  }
  return DEFAULT_TOOLS;
}

/**
 * «Что у меня есть» → «как это делать». Инструкция под чужой набор станков
 * бесполезна: половина шагов окажется невыполнимой, и человек бросит на первом.
 */
export function WorkshopPanel() {
  const [tools, setTools] = useState<ToolId[]>(loadTools);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tools));
    } catch {
      /* приватный режим — набор не переживёт перезагрузку */
    }
  }, [tools]);

  const readiness = useMemo(() => assessWorkshop(tools), [tools]);

  const toggle = (id: ToolId) => {
    setTools((current) =>
      current.includes(id) ? current.filter((tool) => tool !== id) : [...current, id]
    );
  };

  const slower = Math.round((readiness.timeMultiplier - 1) * 100);

  return (
    <section className="workshop dom-tools">
      <h2><Icon name="wrench" />Моя мастерская</h2>

      <div className="palette">
        {TOOLS.map((tool) => {
          const on = tools.includes(tool.id);
          return (
            <button
              key={tool.id}
              className={`chip${on ? ' on' : ''}`}
              title={tool.hint}
              onClick={() => toggle(tool.id)}
            >
              {on ? '✓' : '+'} {tool.name}
            </button>
          );
        })}
      </div>

      {!readiness.feasible && (
        <p className="advice movement-danger">
          <b>Этим набором доску не сделать.</b> Не закрыты шаги:{' '}
          {readiness.blocked.map((step) => step.plan.title.toLowerCase()).join(', ')}.
          Без них рецепт не имеет смысла — обходного пути тут нет.
        </p>
      )}

      {readiness.feasible && readiness.workarounds.length > 0 && (
        <p className="advice">
          Доска делается, но {readiness.workarounds.length}{' '}
          {readiness.workarounds.length === 1 ? 'шаг идёт' : 'шага идут'} обходным путём —
          примерно на {slower}% дольше. Инструкция ниже уже переписана под твой набор.
        </p>
      )}

      {readiness.feasible && readiness.workarounds.length === 0 && (
        <p className="ok">Набор закрывает все операции штатно.</p>
      )}

      <button className="link" onClick={() => setOpen(!open)}>
        {open ? 'Свернуть порядок работ' : 'Показать порядок работ под мой набор'}
      </button>

      {open && (
        <ol className="steps-list">
          {readiness.steps.map((step) => (
            <li
              key={step.plan.id}
              className={step.blocked ? 'blocked' : step.fallbackAvailable ? 'workaround' : ''}
            >
              <b>{step.plan.title}</b>
              {step.blocked && <em> нечем сделать</em>}
              {step.fallbackAvailable && <em> обходной путь</em>}
              <span>{step.instruction}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
