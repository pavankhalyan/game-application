// Week 3: advisory hints. Pure presentation + validation + fallback, plus a thin transport.
// Hints never apply game rules: only a player movement action may change state.
import { allowedActions } from './rules.js';
import { isAction, type Action, type GameConfig, type GameState } from './models.js';

export const HINT_URL = '/api/hint';
export const DEFAULT_HINT_TIMEOUT_MS = 2000;

const LABEL: Readonly<Record<Action, string>> = { north: 'North', south: 'South', east: 'East', west: 'West' };
export const actionLabel = (a: Action): string => LABEL[a];

export interface AllowedMovesView {
  readonly allowed: readonly Action[];
  readonly summary: string;
  /** Why these moves (and any hint restricted to them) are permitted. */
  readonly permission: string;
}

/** Pure: describes which moves the rules permit for this state. Does not mutate anything. */
export function presentAllowedMoves(config: GameConfig, state: GameState): AllowedMovesView {
  const allowed = allowedActions(config, state);
  if (state.status !== 'playing') {
    return { allowed, summary: 'None', permission: `No move is permitted because the game is ${state.status}.` };
  }
  if (allowed.length === 0) {
    return { allowed, summary: 'None', permission: 'No move is permitted: every direction is blocked by the board edge or a wall.' };
  }
  const blocked = 4 - allowed.length;
  const permission =
    `${allowed.map(actionLabel).join(', ')} ${allowed.length === 1 ? 'is' : 'are'} permitted because the game is playing with ` +
    `${state.movesRemaining} move${state.movesRemaining === 1 ? '' : 's'} left` +
    (blocked > 0 ? ` and ${blocked} other direction${blocked === 1 ? ' is' : 's are'} blocked by the board edge or a wall.` : '.');
  return { allowed, summary: allowed.map(actionLabel).join(', '), permission };
}

// ---------- transport ----------

export type HintTransport =
  | { readonly kind: 'response'; readonly status: number; readonly body: unknown; readonly jsonValid: boolean; readonly requestId: string | null }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'network-error' };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** POSTs the current state to the same-origin hint boundary. Never throws. */
export async function fetchHint(
  state: GameState,
  fetchFn: FetchLike = (u, i) => fetch(u, i),
  timeoutMs: number = DEFAULT_HINT_TIMEOUT_MS,
  url: string = HINT_URL,
): Promise<HintTransport> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state }),
      signal: controller.signal,
    });
    const requestId = response.headers.get('x-request-id');
    let body: unknown = null;
    let jsonValid = true;
    try {
      body = JSON.parse(await response.text());
    } catch (err) {
      if (controller.signal.aborted) return { kind: 'timeout' };
      jsonValid = false;
    }
    return { kind: 'response', status: response.status, body, jsonValid, requestId };
  } catch {
    return controller.signal.aborted ? { kind: 'timeout' } : { kind: 'network-error' };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- validation + fallback ----------

export type HintFailureReason = 'validation' | 'timeout' | 'malformed' | 'provider-failure' | 'irrelevant' | 'unavailable';

export interface HintAdvice {
  readonly kind: 'advice';
  readonly source: string;
  readonly requestId: string;
  readonly recommended: Action;
  readonly explanation: string;
  readonly allowed: readonly Action[];
  readonly permission: string;
}
export interface HintFallback {
  readonly kind: 'fallback';
  readonly reason: HintFailureReason;
  readonly requestId: string | null;
  /** Deterministic legal action (first permitted in North, South, East, West order), or null if none. */
  readonly recommended: Action | null;
  readonly explanation: string;
  readonly allowed: readonly Action[];
  readonly permission: string;
}
export type HintOutcome = HintAdvice | HintFallback;

const REASON_TEXT: Readonly<Record<HintFailureReason, string>> = {
  validation: 'The advice recommended a move the rules do not permit',
  timeout: 'The hint service timed out',
  malformed: 'The hint response was malformed',
  'provider-failure': 'The hint provider failed',
  irrelevant: 'The advice was not a game move',
  unavailable: 'The hint service is unavailable',
};

/** Pure: validates a transport result against the rules and returns trusted advice or a fallback. */
export function resolveHint(config: GameConfig, state: GameState, transport: HintTransport): HintOutcome {
  const view = presentAllowedMoves(config, state);
  const fallback = (reason: HintFailureReason, requestId: string | null): HintFallback => {
    const recommended = view.allowed[0] ?? null;
    const tail = recommended
      ? `Fallback suggestion: ${actionLabel(recommended)} (first permitted move).`
      : 'No move is available.';
    return { kind: 'fallback', reason, requestId, recommended, explanation: `${REASON_TEXT[reason]}. ${tail}`, allowed: view.allowed, permission: view.permission };
  };

  if (transport.kind === 'timeout') return fallback('timeout', null);
  if (transport.kind === 'network-error') return fallback('unavailable', null);

  const requestId = transport.requestId ?? extractRequestId(transport.body);
  if (transport.status < 200 || transport.status >= 300) return fallback('provider-failure', requestId);
  if (!transport.jsonValid) return fallback('malformed', requestId);

  const b = transport.body;
  if (typeof b !== 'object' || b === null || Array.isArray(b)) return fallback('malformed', requestId);
  const rec = b as Record<string, unknown>;
  if (
    typeof rec['requestId'] !== 'string' ||
    typeof rec['source'] !== 'string' ||
    typeof rec['recommendedAction'] !== 'string' ||
    typeof rec['explanation'] !== 'string'
  ) {
    return fallback('malformed', requestId);
  }
  if (!isAction(rec['recommendedAction'])) return fallback('irrelevant', rec['requestId']);
  if (!view.allowed.includes(rec['recommendedAction'])) return fallback('validation', rec['requestId']);
  return {
    kind: 'advice',
    source: rec['source'].slice(0, 40),
    requestId: rec['requestId'],
    recommended: rec['recommendedAction'],
    explanation: rec['explanation'].slice(0, 300),
    allowed: view.allowed,
    permission: view.permission,
  };
}

function extractRequestId(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && !Array.isArray(body)) {
    const id = (body as Record<string, unknown>)['requestId'];
    if (typeof id === 'string') return id.slice(0, 80);
  }
  return null;
}

export type HintTelemetryOutcome = 'success' | HintFailureReason;
export const hintTelemetryOutcome = (o: HintOutcome): HintTelemetryOutcome => (o.kind === 'advice' ? 'success' : o.reason);
