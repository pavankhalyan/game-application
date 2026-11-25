// Genre selection: this application is a treasure hunt. Selects the treasure route.
import { ACTIONS, type Action, type GameConfig } from './models.js';
import { evaluate, initialState } from './rules.js';

export const GENRE_ID = 'treasure-hunt';

/**
 * Select the shortest route that collects every treasure and then wins,
 * found by breadth-first search over the pure rules (fixed action order, so deterministic).
 * Returns null when no winning route exists.
 */
export function selectRoute(config: GameConfig): readonly Action[] | null {
  const key = (s: ReturnType<typeof initialState>): string =>
    `${s.position.x},${s.position.y}|${[...s.collected].sort().join(',')}|${s.movesRemaining}`;
  const start = initialState(config);
  const queue: Array<{ state: typeof start; path: readonly Action[] }> = [{ state: start, path: [] }];
  const seen = new Set<string>([key(start)]);
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i]!;
    for (const action of ACTIONS) {
      const result = evaluate(config, item.state, action);
      if (!result.accepted) continue;
      const path = [...item.path, action];
      if (result.state.status === 'won') return path;
      if (result.state.status !== 'playing') continue;
      const k = key(result.state);
      if (!seen.has(k)) {
        seen.add(k);
        queue.push({ state: result.state, path });
      }
    }
  }
  return null;
}
