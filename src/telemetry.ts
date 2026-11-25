// Local-only event recording. No personal or sensitive data is recorded.
import type { Action, GameState } from './models.js';
import type { HintTelemetryOutcome } from './hint.js';

export interface ActionEvent {
  readonly type: 'action';
  readonly runId: string;
  readonly sequence: number;
  readonly action: string;
  readonly result: 'accepted' | 'rejected';
  readonly reason: string | null;
  readonly before: GameState;
  readonly after: GameState;
}

export interface HintEvent {
  readonly type: 'hint';
  readonly runId: string;
  readonly hintSequence: number;
  readonly requestId: string | null;
  /** 'discarded-stale' means the response arrived after the player moved or restarted. */
  readonly outcome: HintTelemetryOutcome | 'discarded-stale';
  readonly fallbackUsed: boolean;
  readonly recommended: Action | null;
}

export type TelemetryEvent = ActionEvent | HintEvent;

export interface Recorder {
  /** Returns true if the event was stored locally. Must never throw. */
  record(event: TelemetryEvent): boolean;
  readAll(): readonly TelemetryEvent[];
}

export const STORAGE_KEY = 'treasure-hunt.events.v1';
const MAX_EVENTS = 500;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createLocalRecorder(storage: StorageLike | null): Recorder {
  const readAll = (): readonly TelemetryEvent[] => {
    try {
      const raw = storage?.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? (parsed as TelemetryEvent[]) : [];
    } catch {
      return [];
    }
  };
  return {
    readAll,
    record(event) {
      if (!storage) return false;
      try {
        const events = [...readAll(), event].slice(-MAX_EVENTS);
        storage.setItem(STORAGE_KEY, JSON.stringify(events));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Resolve browser localStorage safely (access itself can throw when blocked). */
export function browserStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
