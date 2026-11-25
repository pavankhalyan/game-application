// Renderer boundary. Uses textContent / createElement only: never innerHTML.
import type { ViewModel } from './app.js';
import { actionLabel } from './hint.js';
import { ACTIONS } from './models.js';

const SOURCE_NOTE: Readonly<Record<string, string>> = {
  'local-stub': 'local-stub (deterministic local stub, not a live AI model)',
};

export function renderView(doc: Document, m: ViewModel): void {
  const setText = (id: string, text: string): void => {
    const el = doc.getElementById(id);
    if (el) el.textContent = text;
  };
  const setDisabled = (id: string, disabled: boolean): void => {
    const el = doc.getElementById(id) as HTMLButtonElement | null;
    if (el) el.disabled = disabled;
  };

  setText('api-status', m.apiStatus);
  setText('telemetry-status', m.telemetryStatus);
  setText('event-count', String(m.eventCount));
  setText('run-id', m.runId ?? '—');
  setText('message', m.message);
  setText('position', m.state ? `(${m.state.position.x},${m.state.position.y})` : '—');
  setText('moves', m.state ? String(m.state.movesRemaining) : '—');
  setText('score', m.state ? String(m.state.score) : '—');
  setText('treasure', m.state ? (m.state.collected.length ? m.state.collected.join(', ') : 'none') : '—');
  setText('status', m.state ? m.state.status : 'not started');

  setDisabled('btn-start', !m.canStart);
  setDisabled('btn-reload', !m.canReload);
  setDisabled('btn-hint', !m.canHint);
  for (const a of ACTIONS) setDisabled(`btn-${a}`, !m.canMove);

  renderBoard(doc, m);
  renderHint(doc, m, setText);
}

function renderBoard(doc: Document, m: ViewModel): void {
  const board = doc.getElementById('board');
  if (!board) return;
  board.replaceChildren();
  if (!m.config || !m.state) return;
  const { config, state } = m;
  board.style.gridTemplateColumns = `repeat(${config.width}, 3rem)`;
  for (let y = 0; y < config.height; y++) {
    for (let x = 0; x < config.width; x++) {
      const cell = doc.createElement('div');
      cell.className = 'cell';
      let glyph = '.';
      let label = 'empty';
      if (config.walls.some((w) => w.x === x && w.y === y)) [glyph, label] = ['#', 'wall'];
      else if (x === config.exit.x && y === config.exit.y) [glyph, label] = ['E', 'exit'];
      const t = config.treasures.find((tr) => tr.position.x === x && tr.position.y === y);
      if (t && !state.collected.includes(t.id)) [glyph, label] = ['T', `treasure ${t.id}`];
      if (state.position.x === x && state.position.y === y) {
        glyph = 'P';
        label = `player (${label})`;
        cell.classList.add('player');
      }
      cell.textContent = glyph;
      cell.setAttribute('aria-label', `(${x},${y}) ${label}`);
      board.appendChild(cell);
    }
  }
}

function renderHint(doc: Document, m: ViewModel, setText: (id: string, t: string) => void): void {
  setText('hint-allowed', m.allowedMoves ? m.allowedMoves.summary : '—');
  const h = m.hint;
  if (h.status === 'idle' || !h.outcome) {
    const loading = h.status === 'loading';
    setText('hint-state', loading ? 'Loading hint…' : 'No hint requested');
    for (const id of ['hint-recommended', 'hint-explanation', 'hint-source', 'hint-request-id', 'hint-permission']) setText(id, '—');
    if (!loading && m.allowedMoves) setText('hint-permission', m.allowedMoves.permission);
    return;
  }
  const o = h.outcome;
  if (o.kind === 'advice') {
    setText('hint-state', 'Advice (validated against the rules)');
    setText('hint-source', SOURCE_NOTE[o.source] ?? `${o.source} (unverified source label)`);
  } else {
    setText('hint-state', `Fallback used (${o.reason})`);
    setText('hint-source', 'local deterministic fallback');
  }
  setText('hint-recommended', o.recommended ? actionLabel(o.recommended) : 'No action available');
  setText('hint-explanation', o.explanation);
  setText('hint-request-id', o.requestId ?? 'none (no response received)');
  setText('hint-permission', o.permission);
}
