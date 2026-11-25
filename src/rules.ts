// Pure game rules. No DOM, clock, network or telemetry. Never mutates inputs.
import {
  ACTIONS,
  isAction,
  type Action,
  type EvaluationResult,
  type GameConfig,
  type GameState,
  type Position,
} from './models.js';

const DELTAS: Readonly<Record<Action, Position>> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

export function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

export function initialState(config: GameConfig): GameState {
  return {
    position: { x: config.start.x, y: config.start.y },
    movesRemaining: config.maxMoves,
    score: 0,
    collected: [],
    status: 'playing',
  };
}

export function evaluate(config: GameConfig, state: GameState, action: unknown): EvaluationResult {
  if (state.status !== 'playing') {
    return reject(state, action, 'game-over', `The game is already ${state.status}.`);
  }
  if (!isAction(action)) {
    return reject(state, action, 'unknown-action', 'Unknown action.');
  }
  const delta = DELTAS[action];
  const target: Position = { x: state.position.x + delta.x, y: state.position.y + delta.y };
  if (target.x < 0 || target.y < 0 || target.x >= config.width || target.y >= config.height) {
    return reject(state, action, 'out-of-bounds', 'That move leaves the board.');
  }
  if (config.walls.some((w) => samePosition(w, target))) {
    return reject(state, action, 'wall', 'A wall blocks that move.');
  }

  const movesRemaining = state.movesRemaining - 1;
  let score = state.score;
  let collected: readonly string[] = [...state.collected];
  for (const t of config.treasures) {
    if (samePosition(t.position, target) && !collected.includes(t.id)) {
      score += t.points;
      collected = [...collected, t.id];
    }
  }
  const hasAll = config.treasures.every((t) => collected.includes(t.id));
  let status: GameState['status'] = 'playing';
  if (samePosition(target, config.exit) && hasAll) {
    status = 'won'; // win takes precedence over running out of moves
  } else if (movesRemaining <= 0) {
    status = 'lost';
  }
  return { accepted: true, action, state: { position: target, movesRemaining, score, collected, status } };
}

/** Actions the rules would accept right now (fixed order: north, south, east, west). */
export function allowedActions(config: GameConfig, state: GameState): readonly Action[] {
  return ACTIONS.filter((a) => evaluate(config, state, a).accepted);
}

function reject(state: GameState, action: unknown, reason: 'out-of-bounds' | 'wall' | 'unknown-action' | 'game-over', message: string): EvaluationResult {
  return { accepted: false, action, reason, message, state };
}

/** Deep copy of plain game state, for telemetry snapshots. */
export function cloneState(state: GameState): GameState {
  return {
    position: { x: state.position.x, y: state.position.y },
    movesRemaining: state.movesRemaining,
    score: state.score,
    collected: [...state.collected],
    status: state.status,
  };
}
