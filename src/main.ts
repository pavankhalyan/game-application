// Browser entry: wires the real DOM, fetch and localStorage into GameApp.
import { loadBoard } from './api.js';
import { GameApp } from './app.js';
import { connectControls } from './controls.js';
import { fetchHint } from './hint.js';
import { renderView } from './render.js';
import { browserStorage, createLocalRecorder } from './telemetry.js';

const app = new GameApp({
  loadBoard: () => loadBoard(),
  requestHint: (state) => fetchHint(state),
  recorder: createLocalRecorder(browserStorage()),
  newRunId: () => globalThis.crypto.randomUUID(),
  connect: (handlers) => connectControls(document, handlers),
  render: (model) => renderView(document, model),
});

void app.init();
