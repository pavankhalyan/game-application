// parseConfig: turns unknown JSON into a validated GameConfig or a reason.
import { GENRE_ID } from './genre.js';
import type { GameConfig, Position, TreasureConfig } from './models.js';

export type ParseResult =
  | { readonly ok: true; readonly config: GameConfig }
  | { readonly ok: false; readonly reason: string };

const fail = (reason: string): ParseResult => ({ ok: false, reason });
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

function pos(v: unknown): Position | null {
  if (!isObj(v)) return null;
  const x = v['x'];
  const y = v['y'];
  return isInt(x) && isInt(y) ? { x, y } : null;
}

export function parseConfig(raw: unknown): ParseResult {
  if (!isObj(raw)) return fail('Definition is not an object.');
  if (raw['genre'] !== GENRE_ID) return fail(`Unexpected definition: expected genre "${GENRE_ID}".`);
  const id = raw['id'];
  const width = raw['width'];
  const height = raw['height'];
  const maxMoves = raw['maxMoves'];
  if (typeof id !== 'string' || id.length === 0) return fail('Missing board id.');
  if (!isInt(width) || !isInt(height) || width < 1 || height < 1 || width > 20 || height > 20) return fail('Invalid board size.');
  if (!isInt(maxMoves) || maxMoves < 1) return fail('Invalid move budget.');
  const start = pos(raw['start']);
  const exit = pos(raw['exit']);
  if (!start || !exit) return fail('Invalid start or exit position.');
  const inBoard = (p: Position): boolean => p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  if (!inBoard(start) || !inBoard(exit)) return fail('Start or exit is outside the board.');
  const rawWalls = raw['walls'];
  const rawTreasures = raw['treasures'];
  if (!Array.isArray(rawWalls) || !Array.isArray(rawTreasures)) return fail('Walls and treasures must be arrays.');
  const walls: Position[] = [];
  for (const w of rawWalls) {
    const p = pos(w);
    if (!p || !inBoard(p)) return fail('Invalid wall position.');
    walls.push(p);
  }
  const treasures: TreasureConfig[] = [];
  for (const t of rawTreasures) {
    if (!isObj(t)) return fail('Invalid treasure.');
    const tid = t['id'];
    const points = t['points'];
    const p = pos(t['position']);
    if (typeof tid !== 'string' || !isInt(points) || points < 0) return fail('Invalid treasure.');
    if (!p || !inBoard(p)) return fail('Invalid treasure position.');
    if (treasures.some((x) => x.id === tid)) return fail('Duplicate treasure id.');
    treasures.push({ id: tid, position: p, points });
  }
  const blocked = (p: Position): boolean => walls.some((w) => w.x === p.x && w.y === p.y);
  if (blocked(start) || blocked(exit) || treasures.some((t) => blocked(t.position))) {
    return fail('Start, exit or treasure is on a wall.');
  }
  const config: GameConfig = { genre: GENRE_ID, id, width, height, start, exit, walls, treasures, maxMoves };
  return { ok: true, config };
}
