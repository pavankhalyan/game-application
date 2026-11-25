// App lifecycle tests with fake ports (no DOM, no network): API loading, loop, telemetry, stale hints.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBoard } from '../dist/src/api.js';
import { GameApp } from '../dist/src/app.js';
import { parseConfig } from '../dist/src/config.js';
import { BOARD, st } from './helpers.mjs';

const config = parseConfig(BOARD).config;
const json = (status, body) => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

// ---- api.ts ----

test('api: valid board is returned as verified configuration', async () => {
  const r = await loadBoard(json(200, BOARD));
  assert.equal(r.kind, 'ok');
  assert.deepEqual(r.config.start, { x: 0, y: 0 });
});

test('api: HTTP 503 and 500 JSON bodies are never treated as game data (status reported)', async () => {
  assert.deepEqual(await loadBoard(json(503, { error: 'down' })), { kind: 'http-error', status: 503 });
  assert.deepEqual(await loadBoard(json(500, BOARD)), { kind: 'http-error', status: 500 }); // valid-looking body still rejected
});

test('api: network error, malformed JSON and unexpected definition are distinguished', async () => {
  assert.equal((await loadBoard(() => Promise.reject(new TypeError('fetch failed')))).kind, 'network-error');
  assert.equal((await loadBoard(json(200, '{"genre": '))).kind, 'malformed-json');
  assert.equal((await loadBoard(json(200, { ...BOARD, genre: 'quiz' }))).kind, 'invalid-definition');
  assert.equal((await loadBoard(json(200, { error: 'x' }))).kind, 'invalid-definition');
});

// ---- harness ----

function harness({ loads = [{ kind: 'ok', config }], recorderOk = true, hint } = {}) {
  const models = [];
  const events = [];
  let handlers = null;
  let connectCalls = 0;
  let runN = 0;
  const loadQueue = [...loads];
  const app = new GameApp({
    loadBoard: async () => loadQueue.length > 1 ? loadQueue.shift() : loadQueue[0],
    requestHint: hint ?? (async () => ({ kind: 'timeout' })),
    recorder: { record: (e) => { if (recorderOk) events.push(structuredClone(e)); return recorderOk; }, readAll: () => events },
    newRunId: () => `run-${++runN}`,
    connect: (h) => { connectCalls++; handlers = h; },
    render: (m) => models.push(m),
  });
  return { app, models, events, last: () => models[models.length - 1], handlers: () => handlers, connects: () => connectCalls, setLoads: (l) => { loadQueue.length = 0; loadQueue.push(...l); } };
}

const move = (app, ...actions) => actions.forEach((a) => app.act(a));

test('lifecycle: controls connect exactly once, Loading shown first, Start enabled only after verification', async () => {
  const h = harness();
  const p = h.app.init();
  assert.equal(h.models[1].apiStatus, 'Loading…'); // rendered before the await resolves
  assert.equal(h.models[1].canStart, false);
  await p;
  await h.app.init(); // second init must not reconnect
  assert.equal(h.connects(), 1);
  assert.equal(h.last().canStart, true);
  assert.match(h.last().apiStatus, /Verified/);
});

test('lifecycle: Start stays disabled when the first load fails', async () => {
  const h = harness({ loads: [{ kind: 'http-error', status: 503 }] });
  await h.app.init();
  assert.equal(h.last().canStart, false);
  assert.match(h.last().apiStatus, /HTTP 503/);
});

test('lifecycle: start, accepted move, rejected wall move, progress is visible', async () => {
  const h = harness();
  await h.app.init();
  h.app.start();
  assert.equal(h.last().runId, 'run-1');
  assert.deepEqual(h.last().state, st(0, 0, 6));
  move(h.app, 'east');
  assert.deepEqual(h.last().state, st(1, 0, 5));
  move(h.app, 'south'); // wall
  assert.deepEqual(h.last().state, st(1, 0, 5));
  assert.match(h.last().message, /Rejected: A wall blocks/);
});

test('lifecycle: full winning path, controls disabled, completed-state action rejected, fresh restart', async () => {
  const h = harness();
  await h.app.init();
  h.app.start();
  move(h.app, 'east', 'east');
  assert.deepEqual(h.last().state, st(2, 0, 4, 10, ['t1']));
  move(h.app, 'south', 'south');
  assert.deepEqual(h.last().state, st(2, 2, 2, 10, ['t1'], 'won'));
  assert.equal(h.last().canMove, false);
  assert.equal(h.last().canHint, false);
  move(h.app, 'west');
  assert.deepEqual(h.last().state, st(2, 2, 2, 10, ['t1'], 'won'));
  assert.equal(h.events.at(-1).result, 'rejected');
  assert.equal(h.events.at(-1).reason, 'game-over');
  h.app.start();
  assert.deepEqual(h.last().state, st(0, 0, 6));
  assert.equal(h.last().runId, 'run-2');
  assert.equal(h.last().canMove, true);
});

test('telemetry: one event per attempted action with run id, sequence, result and copied before/after', async () => {
  const h = harness();
  await h.app.init();
  h.app.start();
  move(h.app, 'east', 'south', 'bogus');
  assert.equal(h.events.length, 3);
  assert.deepEqual(h.events.map((e) => [e.runId, e.sequence, e.action, e.result]), [
    ['run-1', 1, 'east', 'accepted'],
    ['run-1', 2, 'south', 'rejected'],
    ['run-1', 3, 'bogus', 'rejected'],
  ]);
  assert.deepEqual(h.events[0].before, st(0, 0, 6));
  assert.deepEqual(h.events[0].after, st(1, 0, 5));
  assert.deepEqual(h.events[1].before, st(1, 0, 5));
  assert.deepEqual(h.events[1].after, st(1, 0, 5));
  assert.equal(h.last().telemetryStatus, 'Recorded locally');
});

test('telemetry failure does not undo the move and is reported', async () => {
  const h = harness({ recorderOk: false });
  await h.app.init();
  h.app.start();
  move(h.app, 'east');
  assert.deepEqual(h.last().state, st(1, 0, 5));
  assert.equal(h.last().telemetryStatus, 'Local recording unavailable');
  move(h.app, 'east'); // still playable
  assert.deepEqual(h.last().state, st(2, 0, 4, 10, ['t1']));
});

test('failed reload keeps the running session and last verified board', async () => {
  const h = harness();
  await h.app.init();
  h.app.start();
  move(h.app, 'east');
  h.setLoads([{ kind: 'http-error', status: 503 }]);
  await h.app.loadConfig();
  assert.match(h.last().apiStatus, /HTTP 503/);
  assert.match(h.last().apiStatus, /keeping last verified/);
  assert.deepEqual(h.last().state, st(1, 0, 5));
  assert.equal(h.last().canStart, true);
  assert.equal(h.last().canMove, true);
  move(h.app, 'east');
  assert.deepEqual(h.last().state, st(2, 0, 4, 10, ['t1']));
});

// ---- hints ----

const advice = (action) => async () => ({
  kind: 'response', status: 200, jsonValid: true, requestId: 'req-7',
  body: { requestId: 'req-7', source: 'local-stub', recommendedAction: action, explanation: 'e' },
});

test('hint: loading is shown, advice is displayed, game state/score/moves are unchanged', async () => {
  const h = harness({ hint: advice('east') });
  await h.app.init();
  h.app.start();
  move(h.app, 'east');
  const before = structuredClone(h.last().state);
  const p = h.app.requestHint();
  assert.equal(h.last().hint.status, 'loading');
  assert.equal(h.last().canHint, false);
  await p;
  assert.equal(h.last().hint.status, 'ready');
  assert.equal(h.last().hint.outcome.kind, 'advice');
  assert.equal(h.last().hint.outcome.requestId, 'req-7');
  assert.deepEqual(h.last().state, before);
  const hintEvent = h.events.at(-1);
  assert.deepEqual([hintEvent.type, hintEvent.outcome, hintEvent.fallbackUsed, hintEvent.requestId], ['hint', 'success', false, 'req-7']);
  assert.equal(h.events.filter((e) => e.type === 'action').length, 1); // hint is not a game action
});

test('hint: illegal recommendation falls back and is logged as validation + fallback', async () => {
  const h = harness({ hint: advice('south') }); // south from (1,0) is the wall
  await h.app.init();
  h.app.start();
  move(h.app, 'east');
  await h.app.requestHint();
  const o = h.last().hint.outcome;
  assert.equal(o.kind, 'fallback');
  assert.equal(o.recommended, 'east');
  assert.deepEqual([h.events.at(-1).outcome, h.events.at(-1).fallbackUsed], ['validation', true]);
});

test('hint: timeout/service failure leaves the game playable', async () => {
  const h = harness({ hint: async () => ({ kind: 'timeout' }) });
  await h.app.init();
  h.app.start();
  await h.app.requestHint();
  assert.equal(h.last().hint.outcome.reason, 'timeout');
  assert.equal(h.last().canMove, true);
  move(h.app, 'east');
  assert.deepEqual(h.last().state, st(1, 0, 5));
  assert.equal(h.events.find((e) => e.type === 'hint').outcome, 'timeout');
});

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test('stale hint is discarded after the player moves', async () => {
  const d = deferred();
  const h = harness({ hint: () => d.promise });
  await h.app.init();
  h.app.start();
  const p = h.app.requestHint();
  move(h.app, 'east'); // state changes while the hint is pending
  d.resolve({ kind: 'response', status: 200, jsonValid: true, requestId: 'old', body: { requestId: 'old', source: 'local-stub', recommendedAction: 'south', explanation: 'x' } });
  await p;
  assert.equal(h.last().hint.status, 'idle');
  assert.equal(h.last().hint.outcome, null);
  assert.equal(h.events.at(-1).outcome, 'discarded-stale');
  assert.deepEqual(h.last().state, st(1, 0, 5));
});

test('stale hint is discarded after restart (new run id)', async () => {
  const d = deferred();
  const h = harness({ hint: () => d.promise });
  await h.app.init();
  h.app.start();
  const p = h.app.requestHint();
  h.app.start();
  d.resolve({ kind: 'timeout' });
  await p;
  assert.equal(h.last().hint.status, 'idle');
  assert.equal(h.last().runId, 'run-2');
  assert.equal(h.events.at(-1).outcome, 'discarded-stale');
});

test('a rejected move while a hint is pending does not discard it (state is unchanged)', async () => {
  const d = deferred();
  const h = harness({ hint: () => d.promise });
  await h.app.init();
  h.app.start();
  const p = h.app.requestHint();
  move(h.app, 'north'); // out of bounds
  d.resolve({ kind: 'timeout' });
  await p;
  assert.equal(h.last().hint.status, 'ready');
});
