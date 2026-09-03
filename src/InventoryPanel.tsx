/**
 * Склад: свои доски и план «сколько докупить».
 *
 * Живёт рядом с картой раскроя, потому что отвечает на её же вопрос, только
 * правильнее. «Сколько купить» — верный вопрос ровно один раз, в первый;
 * дальше в мастерской стоит стеллаж остатков, и разница между двумя ответами
 * и есть сэкономленные деньги.
 */
import { useMemo } from 'react';
import { Icon } from './Icon';
import { useWorkshop } from './WorkshopContext';
import { createInventoryBoard, planFromInventory, t, tcount } from './core';
import type { InventoryBoard, NestPiece, WoodSpecies } from './core';

interface Props {
  pieces: NestPiece[];
  kerfMm: number;
  species: Record<string, WoodSpecies>;
}

export function InventoryPanel({ pieces, kerfMm, species }: Props) {
  const { profile, patch } = useWorkshop();
  const inventory = profile.inventory;
  const catalog = Object.values(species);

  const plan = useMemo(
    () => planFromInventory(pieces, inventory, profile.stock, kerfMm),
    [pieces, inventory, profile.stock, kerfMm]
  );

  const withoutStock = useMemo(
    () => planFromInventory(pieces, [], profile.stock, kerfMm),
    [pieces, profile.stock, kerfMm]
  );

  const setBoards = (boards: InventoryBoard[]) => patch({ inventory: boards });

  const add = () =>
    setBoards([
      ...inventory,
      createInventoryBoard({
        speciesId: catalog[0]?.id ?? 'maple',
        lengthMm: profile.stock.lengthMm,
        widthMm: profile.stock.widthMm,
        count: 1,
      }),
    ]);

  const update = (id: string, changes: Partial<InventoryBoard>) =>
    setBoards(inventory.map((board) => (board.id === id ? { ...board, ...changes } : board)));

  const remove = (id: string) => setBoards(inventory.filter((board) => board.id !== id));

  const saved = withoutStock.boardsToBuy - plan.boardsToBuy;

  return (
    <section className="inventory">
      <h3><Icon name="layers" size={14} />{t('stock.title')}</h3>
      <p className="note">{t('stock.lead')}</p>

      {inventory.length === 0 && <p className="note">{t('stock.empty')}</p>}

      <ul className="inventory-list">
        {inventory.map((board) => (
          <li key={board.id}>
            <select
              value={board.speciesId}
              aria-label={t('stock.field.species')}
              onChange={(event) => update(board.id, { speciesId: event.target.value })}
            >
              {catalog.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              type="number" min={100} step={50}
              aria-label={t('stock.field.length')}
              value={board.lengthMm}
              onChange={(event) => update(board.id, { lengthMm: Number(event.target.value) })}
            />
            <input
              type="number" min={20} step={10}
              aria-label={t('stock.field.width')}
              value={board.widthMm}
              onChange={(event) => update(board.id, { widthMm: Number(event.target.value) })}
            />
            <input
              type="number" min={1} step={1}
              aria-label={t('stock.field.count')}
              value={board.count}
              onChange={(event) => update(board.id, { count: Number(event.target.value) })}
            />
            <button className="link" onClick={() => remove(board.id)}>
              {t('stock.action.remove')}
            </button>
          </li>
        ))}
      </ul>

      <button onClick={add}>{t('stock.action.add')}</button>

      {inventory.length > 0 && pieces.length > 0 && (
        <dl className="inventory-result">
          <div>
            <dt>{t('stock.result.covered', { pct: plan.coveredPct.toFixed(0) })}</dt>
            <dd>{t('stock.result.fromStock', { boards: tcount('unit.board', plan.boardsFromStock) })}</dd>
          </div>
          <div>
            <dt>
              {plan.boardsToBuy === 0
                ? t('stock.result.nothingToBuy')
                : t('stock.result.toBuy', { boards: tcount('unit.boardAcc', plan.boardsToBuy) })}
            </dt>
            <dd>
              {saved > 0
                ? t('stock.result.saved', { boards: tcount('unit.boardAcc', withoutStock.boardsToBuy) })
                : ''}
            </dd>
          </div>
          {plan.unplaced.length > 0 && (
            <div>
              <dt className="movement-danger">
                {t('stock.result.unplaced', { count: plan.unplaced.length })}
              </dt>
              <dd>{plan.unplaced.map((piece) => piece.pieceId).join(', ')}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
