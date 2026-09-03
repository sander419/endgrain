/**
 * Карта раскроя: что купить и как разложить бруски по доскам.
 * Схема рисуется в SVG — её можно распечатать и унести к станку.
 */
import { useMemo } from 'react';
import type { WoodSpecies } from './core';
import { STOCK_PRESETS, nestPieces } from './core/nesting';
import type { NestPiece, StockBoard } from './core/nesting';
import { Icon } from './Icon';
import { useWorkshop } from './WorkshopContext';
import { InventoryPanel } from './InventoryPanel';

interface Props {
  pieces: NestPiece[];
  kerfMm: number;
  species: Record<string, WoodSpecies>;
}

export function NestingPanel({ pieces, kerfMm, species }: Props) {
  const { profile, patch, pro } = useWorkshop();
  const stock = profile.stock;

  const update = (changes: Partial<StockBoard>) => patch({ stock: { ...stock, ...changes } });

  const result = useMemo(() => nestPieces(pieces, stock, kerfMm), [pieces, stock, kerfMm]);
  const nameOf = (speciesId: string) => species[speciesId]?.name ?? speciesId;
  const colorOf = (speciesId: string) => species[speciesId]?.colorHex ?? '#9a8a78';

  const pieceById = useMemo(
    () => new Map(pieces.map((piece) => [piece.pieceId, piece])),
    [pieces]
  );

  return (
    <section className="nesting">
      <h3><Icon name="saw" size={14} />Карта раскроя</h3>

      <div className="stock-controls">
        <label>
          Доска, длина
          <input
            type="number" min={100} step={50}
            value={stock.lengthMm}
            onChange={(event) => update({ lengthMm: Number(event.target.value) })}
          />
        </label>
        <label>
          ширина
          <input
            type="number" min={20} step={10}
            value={stock.widthMm}
            onChange={(event) => update({ widthMm: Number(event.target.value) })}
          />
        </label>
        <div className="stock-presets">
          {STOCK_PRESETS.map((preset) => (
            <button
              key={`${preset.lengthMm}x${preset.widthMm}`}
              className={
                preset.lengthMm === stock.lengthMm && preset.widthMm === stock.widthMm ? 'on' : ''
              }
              onClick={() => update(preset)}
            >
              {preset.lengthMm}×{preset.widthMm}
            </button>
          ))}
        </div>
      </div>

      {result.unplaced.length > 0 && (
        <p className="nesting-bad">
          {result.unplaced.length}{' '}
          {result.unplaced.length === 1 ? 'брусок не влезает' : 'брусков не влезают'} в такую доску:
          нужен размер от {Math.ceil(Math.max(...result.unplaced.map((p) => p.lengthMm)))} ×{' '}
          {Math.ceil(Math.max(...result.unplaced.map((p) => p.widthMm)))} мм.
        </p>
      )}

      {result.boards.length > 0 && (
        <>
          <ul className="buy-list">
            {result.bySpecies.map((row) => (
              <li key={row.speciesId}>
                <span className="dot" style={{ background: colorOf(row.speciesId) }} />
                <b>{row.boards}</b> {row.boards === 1 ? 'доска' : row.boards < 5 ? 'доски' : 'досок'}{' '}
                {nameOf(row.speciesId)} {stock.lengthMm}×{stock.widthMm} — {row.pieces} брусков,
                остаток {Math.round(row.offcutLengthMm)} мм
              </li>
            ))}
          </ul>

          <p className="nesting-total">
            В стружку уходит <b>{(100 - result.yieldPct).toFixed(1)}%</b> распиленной части —
            пропилы {result.kerfMm} мм и припуски. Нетронутые хвосты досок (
            {Math.round(result.bySpecies.reduce((sum, row) => sum + row.offcutLengthMm, 0))} мм
            суммарно) в отход не записаны: это материал на следующий проект.
          </p>

          <div className="cut-maps">
            {result.boards.map((board) => (
              <figure key={`${board.speciesId}-${board.index}`}>
                <figcaption>
                  {nameOf(board.speciesId)} №{board.index} · {board.lengthMm}×{board.widthMm} мм ·
                  режем {Math.round(board.usedLengthMm)} мм, выход {board.yieldPct.toFixed(0)}%
                  {board.offcutLengthMm > 1 &&
                    ` · остаток ${Math.round(board.offcutLengthMm)} мм`}
                </figcaption>
                <svg
                  viewBox={`0 0 ${board.lengthMm} ${board.widthMm}`}
                  preserveAspectRatio="none"
                  role="img"
                  aria-label={`Раскрой доски ${board.index}`}
                >
                  <rect
                    x={0} y={0} width={board.lengthMm} height={board.widthMm}
                    fill="#221a14" stroke="#4a3a2c" strokeWidth={2}
                  />
                  {board.pieces.map((piece) => (
                    <rect
                      key={piece.pieceId}
                      x={piece.xMm} y={piece.yMm}
                      width={piece.lengthMm} height={piece.widthMm}
                      fill={colorOf(pieceById.get(piece.pieceId)?.speciesId ?? board.speciesId)}
                      stroke="rgba(0,0,0,0.55)" strokeWidth={1.5}
                    />
                  ))}
                </svg>
              </figure>
            ))}
          </div>
        </>
      )}

      {pro && <InventoryPanel pieces={pieces} kerfMm={kerfMm} species={species} />}
    </section>
  );
}
