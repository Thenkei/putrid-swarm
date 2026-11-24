/** The moped and three pieces of workshop furniture roll only along their wheel axes. */
export const aislePieces = [
  { x: 0, y: 1, vertical: false },
  { x: 2, y: 0, vertical: true },
  { x: 1, y: 3, vertical: false },
  { x: 4, y: 1, vertical: true },
] as const;

export const initialAisle = () => [0, 0, 0, 0];

export function pieceCells(offsets: readonly number[], index: number) {
  const piece = aislePieces[index]!;
  const offset = offsets[index]!;
  const x = piece.x + (piece.vertical ? 0 : offset);
  const y = piece.y + (piece.vertical ? offset : 0);
  return [{ x, y }, { x: x + Number(!piece.vertical), y: y + Number(piece.vertical) }];
}

export function slidePiece(offsets: readonly number[], index: number, direction: -1 | 1): number[] | null {
  const next = [...offsets];
  next[index] = next[index]! + direction;
  const cells = pieceCells(next, index);
  if (cells.some(c => c.x < 0 || c.x >= 5 || c.y < 0 || c.y >= 4)) return null;
  const blocked = aislePieces.some((_, other) => other !== index &&
    pieceCells(next, other).some(p => cells.some(c => p.x === c.x && p.y === c.y)));
  return blocked ? null : next;
}
