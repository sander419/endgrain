/**
 * Поиск по инструменту: Ctrl+K.
 *
 * Инструмент вырос: два режима, одиннадцать вкладок, десять статей, документы,
 * заказы, склад. Человек, который зашёл раз в неделю, помнит, что нужное «где-то
 * было», но не помнит где — и вместо работы обходит вкладки. Одна строка
 * с поиском по вкладкам, действиям и статьям снимает это целиком.
 *
 * Ищет по названию и подсказке сразу: «клей» находит и вкладку «Производство»
 * по подсказке, и статью про струбцины.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from './core';

export interface Command {
  id: string;
  title: string;
  /** Что это и зачем — вторая строка. По ней тоже ищется. */
  hint?: string;
  /** Группа для заголовка в списке: «Вкладки», «Действия», «Энциклопедия». */
  group: string;
  run: () => void;
}

interface Props {
  commands: Command[];
  onClose: () => void;
}

function score(command: Command, query: string): number {
  if (!query) return 1;
  const title = command.title.toLowerCase();
  const hint = (command.hint ?? '').toLowerCase();
  // Совпадение в начале названия важнее совпадения в середине подсказки:
  // человек чаще всего начинает печатать именно название.
  if (title.startsWith(query)) return 4;
  if (title.includes(query)) return 3;
  if (hint.includes(query)) return 2;
  return 0;
}

export function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const found = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return commands
      .map((command) => ({ command, weight: score(command, needle) }))
      .filter((item) => item.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .map((item) => item.command)
      .slice(0, 40);
  }, [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setCursor(0);
  }, [query]);

  // Выбранная строка должна оставаться видимой при движении стрелками —
  // иначе на длинном списке курсор уезжает под край.
  useEffect(() => {
    const node = listRef.current?.children[cursor] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((current) => (found.length ? (current + 1) % found.length : 0));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((current) => (found.length ? (current - 1 + found.length) % found.length : 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const command = found[cursor];
      if (!command) return;
      onClose();
      command.run();
    }
  };

  let lastGroup = '';

  return (
    <div className="help-backdrop palette-backdrop" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.title')}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKey}
      >
        <input
          ref={inputRef}
          type="text"
          className="palette-input"
          placeholder={t('palette.placeholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {found.length === 0 ? (
          <p className="palette-empty">{t('palette.empty')}</p>
        ) : (
          <ul className="palette-list" ref={listRef}>
            {found.map((command, index) => {
              const header = command.group !== lastGroup ? command.group : '';
              lastGroup = command.group;
              return (
                <li
                  key={command.id}
                  className={index === cursor ? 'on' : ''}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => {
                    onClose();
                    command.run();
                  }}
                >
                  {header && <span className="palette-group">{header}</span>}
                  <b>{command.title}</b>
                  {command.hint && <span className="palette-hint">{command.hint}</span>}
                </li>
              );
            })}
          </ul>
        )}

        <p className="palette-keys">{t('palette.keys')}</p>
      </div>
    </div>
  );
}
