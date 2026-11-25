// Learner-owned Week 3 tests: hint presentation, validation, fallback, transport.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig } from '../dist/src/config.js';
import { presentAllowedMoves, resolveHint, fetchHint } from '../dist/src/hint.js';
import { BOARD, deepFreeze, st } from './helpers.mjs';

const config = parseConfig(BOARD).config;

const reply = (action, extra = {}) => ({
  kind: 'response',
  status: 200,
  jsonValid: true,
  requestId: 'req-1',
  body: { requestId: 'req-1', source: 'local-stub', recommendedAction: action, explanation: 'because', ...extra },
});

// ---- allowed-moves presentation (expected lists derived by hand from the board) ----

test('presentation, normal state (1,0): east and west only (north is off-board, south is the wall)', () => {
  const v = presentAllowedMoves(config, st(1, 0, 5));
  assert.deepEqual(v.allowed, ['east', 'west']);
  assert.equal(v.summary, 'East, West');
  assert.match(v.permission, /permitted/);
  assert.match(v.permission, /5 moves left/);
});

test('presentation, boundary (2,0): south and west only', () => {
  assert.deepEqual(presentAllowedMoves(config, st(2, 0, 4, 10, ['t1'])).allowed, ['south', 'west']);
});

test('presentation, corner (0,0): south and east', () => {
  assert.deepEqual(presentAllowedMoves(config, st(0, 0, 6)).allowed, ['south', 'east']);
});

test('presentation with no permitted move: finished game', () => {
  const v = presentAllowedMoves(config, st(2, 2, 2, 10, ['t1'], 'won'));
  assert.deepEqual(v.allowed, []);
  assert.equal(v.summary, 'None');
  assert.match(v.permission, /won/);
});

test('presentation with no permitted move: playing but walled in', () => {
  const boxed = { ...config, width: 2, height: 1, start: { x: 0, y: 0 }, exit: { x: 0, y: 0 }, walls: [{ x: 1, y: 0 }], treasures: [] };
  const v = presentAllowedMoves(boxed, st(0, 0, 3));
  assert.deepEqual(v.allowed, []);
  assert.match(v.permission, /blocked/);
});

test('presentation does not mutate frozen inputs', () => {
  const s = deepFreeze(st(1, 0, 5));
  const c = deepFreeze(structuredClone(config));
  assert.doesNotThrow(() => presentAllowedMoves(c, s));
  assert.deepEqual(s, st(1, 0, 5));
});

// ---- validation ----

test('permitted hint response is displayed as advice', () => {
  const o = resolveHint(config, st(1, 0, 5), reply('east'));
  assert.equal(o.kind, 'advice');
  assert.equal(o.recommended, 'east');
  assert.equal(o.requestId, 'req-1');
  assert.equal(o.source, 'local-stub');
  assert.deepEqual(o.allowed, ['east', 'west']);
});

test('valid-shaped but illegal recommendation (south into the wall) is rejected and replaced by the fallback', () => {
  const o = resolveHint(config, st(1, 0, 5), reply('south'));
  assert.equal(o.kind, 'fallback');
  assert.equal(o.reason, 'validation');
  assert.equal(o.recommended, 'east'); // first permitted in north,south,east,west order
  assert.equal(o.requestId, 'req-1'); // request id still retained
});

test('off-board recommendation at a boundary is rejected', () => {
  const o = resolveHint(config, st(2, 0, 4, 10, ['t1']), reply('east'));
  assert.equal(o.kind, 'fallback');
  assert.equal(o.reason, 'validation');
  assert.equal(o.recommended, 'south');
});

test('non-move advice is classified irrelevant', () => {
  const o = resolveHint(config, st(1, 0, 5), reply('buy a sword'));
  assert.equal(o.kind, 'fallback');
  assert.equal(o.reason, 'irrelevant');
  assert.equal(o.recommended, 'east');
});

test('deterministic fallback: identical inputs give identical outputs', () => {
  const a = resolveHint(config, st(0, 0, 6), reply('north'));
  const b = resolveHint(config, st(0, 0, 6), reply('north'));
  assert.deepEqual(a, b);
  assert.equal(a.recommended, 'south');
});

test('timeout, network failure, provider failure and malformed bodies all fall back', () => {
  const s = st(0, 0, 6);
  const cases = [
    [{ kind: 'timeout' }, 'timeout', null],
    [{ kind: 'network-error' }, 'unavailable', null],
    [{ kind: 'response', status: 502, jsonValid: true, requestId: 'req-9', body: { error: 'x' } }, 'provider-failure', 'req-9'],
    [{ kind: 'response', status: 200, jsonValid: false, requestId: 'req-8', body: null }, 'malformed', 'req-8'],
    [{ kind: 'response', status: 200, jsonValid: true, requestId: null, body: { recommendedAction: 'east' } }, 'malformed', null],
    [{ kind: 'response', status: 200, jsonValid: true, requestId: null, body: [] }, 'malformed', null],
  ];
  for (const [transport, reason, requestId] of cases) {
    const o = resolveHint(config, s, transport);
    assert.equal(o.kind, 'fallback', reason);
    assert.equal(o.reason, reason);
    assert.equal(o.requestId, requestId);
    assert.equal(o.recommended, 'south');
  }
});

test('no permitted move: fallback recommends nothing', () => {
  const o = resolveHint(config, st(2, 2, 2, 10, ['t1'], 'won'), { kind: 'timeout' });
  assert.equal(o.kind, 'fallback');
  assert.equal(o.recommended, null);
  assert.match(o.explanation, /No move is available/);
});

test('even a plausible action is not trusted when no move is permitted', () => {
  const o = resolveHint(config, st(0, 0, 0, 0, [], 'lost'), reply('east'));
  assert.equal(o.kind, 'fallback');
  assert.equal(o.recommended, null);
});

test('game state is unchanged after resolving advice (frozen state)', () => {
  const s = deepFreeze(st(1, 0, 5, 0, []));
  resolveHint(config, s, reply('east'));
  resolveHint(config, s, reply('south'));
  assert.deepEqual(s, st(1, 0, 5, 0, []));
});

// ---- transport ----

const fakeResponse = (status, text, headers = {}) =>
  new Response(text, { status, headers });

test('fetchHint: hung request times out', async () => {
  const hang = (_u, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const t = await fetchHint(st(0, 0, 6), hang, 20);
  assert.deepEqual(t, { kind: 'timeout' });
});

test('fetchHint: network failure is distinguished from timeout', async () => {
  const t = await fetchHint(st(0, 0, 6), () => Promise.reject(new TypeError('fetch failed')), 200);
  assert.deepEqual(t, { kind: 'network-error' });
});

test('fetchHint: keeps request id header and flags invalid JSON', async () => {
  const t = await fetchHint(st(0, 0, 6), async () => fakeResponse(200, '{"a":', { 'x-request-id': 'hint-abc' }), 200);
  assert.equal(t.kind, 'response');
  assert.equal(t.jsonValid, false);
  assert.equal(t.requestId, 'hint-abc');
});

test('fetchHint sends only the game state (no personal data)', async () => {
  let sent;
  await fetchHint(st(0, 0, 6), async (_u, init) => { sent = JSON.parse(init.body); return fakeResponse(200, '{}'); }, 200);
  assert.deepEqual(Object.keys(sent), ['state']);
  assert.deepEqual(sent.state, st(0, 0, 6));
});
