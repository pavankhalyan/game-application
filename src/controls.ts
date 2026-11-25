// DOM controls: wires buttons to handlers. Idempotent per document so listeners are never doubled.
import type { Handlers } from './app.js';
import { ACTIONS } from './models.js';

const connected = new WeakSet<object>();

export function connectControls(doc: Document, handlers: Handlers): void {
  if (connected.has(doc)) return;
  connected.add(doc);
  const on = (id: string, fn: () => void): void => {
    doc.getElementById(id)?.addEventListener('click', fn);
  };
  on('btn-start', handlers.onStart);
  on('btn-reload', handlers.onReload);
  on('btn-hint', handlers.onHint);
  for (const action of ACTIONS) on(`btn-${action}`, () => handlers.onMove(action));
}
