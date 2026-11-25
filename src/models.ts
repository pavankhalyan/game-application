// Pure data types shared by rules, API, hints, telemetry and the UI.

export interface Position {
  readonly x: number;
  readonly y: number;
}

export const ACTIONS = ['north', 'south', 'east', 'west'] as const;
export type Action = (typeof ACTIONS)[number];

export type GameStatus = 'playing' | 'won' | 'lost';

export interface TreasureConfig {
  readonly id: string;
  readonly position: Position;
  readonly points: number;
}

export interface GameConfig {
  readonly genre: string;
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly start: Position;
  readonly exit: Position;
  readonly walls: readonly Position[];
  readonly treasures: readonly TreasureConfig[];
  readonly maxMoves: number;
}

export interface GameState {
  readonly position: Position;
  readonly movesRemaining: number;
  readonly score: number;
  readonly collected: readonly string[];
  readonly status: GameStatus;
}

export type RejectionReason = 'out-of-bounds' | 'wall' | 'unknown-action' | 'game-over';

export interface Accepted {
  readonly accepted: true;
  readonly action: Action;
  readonly state: GameState;
}

export interface Rejected {
  readonly accepted: false;
  readonly action: unknown;
  readonly reason: RejectionReason;
  readonly message: string;
  /** The unchanged input state, returned as-is. */
  readonly state: GameState;
}

export type EvaluationResult = Accepted | Rejected;

export function isAction(value: unknown): value is Action {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value);
}
