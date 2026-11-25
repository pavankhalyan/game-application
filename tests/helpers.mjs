// Shared test fixtures. Expected values in tests are written out by hand, not derived from src/.
export const BOARD = {
  genre: 'treasure-hunt',
  id: 'reference',
  width: 3,
  height: 3,
  start: { x: 0, y: 0 },
  exit: { x: 2, y: 2 },
  walls: [{ x: 1, y: 1 }],
  treasures: [{ id: 't1', position: { x: 2, y: 0 }, points: 10 }],
  maxMoves: 6,
};

export function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.values(o).forEach(deepFreeze);
  }
  return o;
}

export const st = (x, y, movesRemaining, score = 0, collected = [], status = 'playing') => ({
  position: { x, y },
  movesRemaining,
  score,
  collected,
  status,
});
