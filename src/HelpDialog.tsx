/**
 * Шпаргалка «как пользоваться». Открывается сама при первом визите и дальше
 * по кнопке в шапке.
 *
 * Почему сама: человек, пришедший по ссылке, видит незнакомый инструмент и
 * панель с производственными числами. Без первого экрана он читает это как
 * рисовалку и уходит, не поняв, что здесь считается изготовление.
 */
import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

const SEEN_KEY = 'endgrain.help.seen';

/** Показывать ли шпаргалку без спроса. Вынесено ради теста и честного дефолта. */
export function shouldShowIntro(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(SEEN_KEY) !== '1';
  } catch {
    // Приватный режим: лучше показать лишний раз, чем не показать никогда.
    return true;
  }
}

export function markIntroSeen(storage: Pick<Storage, 'setItem'>): void {
  try {
    storage.setItem(SEEN_KEY, '1');
  } catch {
    /* приватный режим — покажем и в следующий раз */
  }
}

interface Props {
  onClose: () => void;
}

export function HelpDialog({ onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="help-backdrop" onClick={onClose}>
      <div
        className="help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="help-title">Как этим пользоваться</h2>
          <button ref={closeRef} className="icon" onClick={onClose} aria-label="Закрыть">✕</button>
        </header>

        <p className="help-lead">
          Это не рисовалка узоров. Ты рисуешь картинку, а инструмент считает, как эту доску
          изготовить: сколько раз клеить, сколько брусков напилить, сколько досок купить.
        </p>

        <ol className="help-steps">
          <li>
            <b>Выбери узор.</b> Слева — 16 стилей: мандала, лабиринт, ёлочка, пейзаж.
            Можно набрать надпись или нарисовать своё кистью на вкладке «Рисовать».
          </li>
          <li>
            <b>Задай размеры.</b> Вкладка «Доска»: сколько клеток, какая сторона клетки
            и толщина. Справа сразу видно, что получится в миллиметрах.
          </li>
          <li>
            <b>Посмотри цену работы.</b> Вкладка «Производство»: щитов склеить, брусков
            заготовить, резов сделать. Симметричный рисунок обходится примерно вдвое дешевле.
          </li>
          <li>
            <b>Узнай, что купить.</b> Там же карта раскроя: задаёшь размер покупной доски —
            получаешь, сколько их взять и как разложить на них бруски.
          </li>
          <li>
            <b>Распечатай инструкцию.</b> Кнопка внизу справа: спецификация с припусками,
            порядок работ и схема, какая планка из какого щита и какой стороной.
          </li>
        </ol>

        <div className="help-cols">
          <section>
            <h3>Два режима</h3>
            <p>
              <b>Мозаика</b> — любая картинка по клеткам, но под каждую уникальную колонку
              рисунка клеится свой щит.
            </p>
            <p>
              <b>Рецепт</b> — классическая доска: один щит, распил на планки, перестановка.
              Дёшево, но картинка только из перестановок.
            </p>
          </section>
          <section>
            <h3>Мелочи, которые экономят время</h3>
            <p><b>3D</b> — переключатель над доской, тяни мышью.</p>
            <p><b>Масло</b> — покажет цвет после пропитки.</p>
            <p><b>Скопировать ДНК</b> — весь проект в ссылке, без аккаунтов.</p>
            <p>В режиме «Рецепт» планку можно перетащить мышью на другое место.</p>
          </section>
        </div>

        <p className="help-note">
          Красные и жёлтые предупреждения — не украшение: каждое объясняет, что не так и что
          сделать. Физически неизготовимую доску нарисовать не получится.
        </p>

        <div className="help-actions">
          <button className="primary" onClick={onClose}>
            <Icon name="board" size={14} />Понятно, поехали
          </button>
        </div>
      </div>
    </div>
  );
}
