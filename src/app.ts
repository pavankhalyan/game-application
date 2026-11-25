// Application controller. Loop: Input -> Rule -> Render -> Telemetry.
// All I/O is injected through Ports so the lifecycle is testable without a browser.
import { describeLoad, type LoadResult } from './api.js';
import { presentAllowedMoves, resolveHint, hintTelemetryOutcome, type AllowedMovesView, type HintOutcome, type HintTransport } from './hint.js';
import type { GameConfig, GameState } from './models.js';
import { cloneState, evaluate, initialState } from './rules.js';
import type { Recorder, TelemetryEvent } from './telemetry.js';

export interface HintView {
  readonly status: 'idle' | 'loading' | 'ready';
  readonly outcome: HintOutcome | null;
}

export interface ViewModel {
  readonly apiStatus: string;
  readonly telemetryStatus: string;
  readonly runId: string | null;
  readonly message: string;
  readonly config: GameConfig | null;
  readonly state: GameState | null;
  readonly canStart: boolean;
  readonly canReload: boolean;
  readonly canMove: boolean;
  readonly canHint: boolean;
  readonly hint: HintView;
  readonly allowedMoves: AllowedMovesView | null;
  readonly eventCount: number;
}

export interface Handlers {
  onStart(): void;
  onReload(): void;
  onMove(action: unknown): void;
  onHint(): void;
}

export interface Ports {
  loadBoard(): Promise<LoadResult>;
  requestHint(state: GameState): Promise<HintTransport>;
  recorder: Recorder;
  newRunId(): string;
  /** Wire DOM (or fake) controls to handlers. */
  connect(handlers: Handlers): void;
  render(model: ViewModel): void;
}

export class GameApp {
  private connected = false;
  private verified: GameConfig | null = null; // latest verified configuration
  private session: GameConfig | null = null; // config of the running game (survives failed reloads)
  private state: GameState | null = null;
  private runId: string | null = null;
  private sequence = 0;
  private version = 0; // bumps whenever state changes or the run restarts
  private hintSeq = 0;
  private hint: HintView = { status: 'idle', outcome: null };
  private apiStatus = 'Not loaded';
  private telemetryStatus = 'No events yet';
  private message = 'Load game data to begin.';
  private loading = false;

  constructor(private readonly ports: Ports) {}

  /** Connects controls exactly once, then loads and validates configuration. */
  async init(): Promise<void> {
    if (!this.connected) {
      this.connected = true;
      this.ports.connect({
        onStart: () => this.start(),
        onReload: () => void this.loadConfig(),
        onMove: (a) => this.act(a),
        onHint: () => void this.requestHint(),
      });
    }
    this.render();
    await this.loadConfig();
  }

  async loadConfig(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    this.apiStatus = 'Loading…'; // shown before awaiting the request
    this.render();
    const result = await this.ports.loadBoard();
    this.loading = false;
    if (result.kind === 'ok') {
      this.verified = result.config;
      this.apiStatus = describeLoad(result);
      if (!this.state) this.message = 'Board verified. Press Start.';
    } else {
      // Keep the last verified config and any running session untouched.
      this.apiStatus = `Load failed: ${describeLoad(result)}` + (this.verified ? ' (keeping last verified board)' : '');
      if (!this.state) this.message = 'No verified board available.';
    }
    this.render();
  }

  start(): void {
    if (!this.verified) return;
    this.session = this.verified;
    this.state = initialState(this.session);
    this.runId = this.ports.newRunId();
    this.sequence = 0;
    this.version++;
    this.hintSeq++; // invalidate any pending hint
    this.hint = { status: 'idle', outcome: null };
    this.telemetryStatus = 'No events yet';
    this.message = 'Game started. Collect t1 then reach the exit.';
    this.render();
  }

  act(action: unknown): void {
    if (!this.session || !this.state || !this.runId) return;
    const before = cloneState(this.state);
    const result = evaluate(this.session, this.state, action); // Rule
    if (result.accepted) {
      this.state = result.state;
      this.version++;
      this.hintSeq++; // discard any pending hint
      this.hint = { status: 'idle', outcome: null };
      this.message =
        result.state.status === 'won' ? 'You won!' : result.state.status === 'lost' ? 'You lost: out of moves.' : `Moved ${String(action)}.`;
    } else {
      this.message = `Rejected: ${result.message}`;
    }
    this.render(); // Render
    this.sequence++;
    this.record({
      // Telemetry
      type: 'action',
      runId: this.runId,
      sequence: this.sequence,
      action: typeof action === 'string' ? action.slice(0, 40) : typeof action,
      result: result.accepted ? 'accepted' : 'rejected',
      reason: result.accepted ? null : result.reason,
      before,
      after: cloneState(this.state),
    });
  }

  async requestHint(): Promise<void> {
    if (!this.session || !this.state || !this.runId || this.state.status !== 'playing') return;
    const token = ++this.hintSeq;
    const version = this.version;
    const runId = this.runId;
    const config = this.session;
    const snapshot = cloneState(this.state);
    this.hint = { status: 'loading', outcome: null };
    this.render();
    const transport = await this.ports.requestHint(snapshot);
    if (token !== this.hintSeq || version !== this.version || runId !== this.runId) {
      this.record({ type: 'hint', runId, hintSequence: token, requestId: null, outcome: 'discarded-stale', fallbackUsed: false, recommended: null });
      return; // stale: never displayed
    }
    const outcome = resolveHint(config, snapshot, transport);
    this.hint = { status: 'ready', outcome };
    this.render();
    this.record({
      type: 'hint',
      runId,
      hintSequence: token,
      requestId: outcome.requestId,
      outcome: hintTelemetryOutcome(outcome),
      fallbackUsed: outcome.kind === 'fallback',
      recommended: outcome.recommended,
    });
  }

  private record(event: TelemetryEvent): void {
    const ok = this.ports.recorder.record(event);
    this.telemetryStatus = ok ? 'Recorded locally' : 'Local recording unavailable';
    this.render();
  }

  private render(): void {
    const playing = this.state?.status === 'playing';
    this.ports.render({
      apiStatus: this.apiStatus,
      telemetryStatus: this.telemetryStatus,
      runId: this.runId,
      message: this.message,
      config: this.session,
      state: this.state,
      canStart: this.verified !== null,
      canReload: !this.loading,
      canMove: playing,
      canHint: playing && this.hint.status !== 'loading',
      hint: this.hint,
      allowedMoves: this.session && this.state ? presentAllowedMoves(this.session, this.state) : null,
      eventCount: this.ports.recorder.readAll().length,
    });
  }
}
