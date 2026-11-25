// Learner-owned Week 2 tests: rules, config, API lifecycle, app loop.
import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, initialState, allowedActions } from '../dist/src/rules.js';
import { parseConfig } from '../dist/src/config.js';
import { selectRoute } from '../dist/src/genre.js';
import { BOARD, deepFreeze, st } from './helpers.mjs';

const config = parseConfig(BOARD).config;

function play(actions, from = initialState(config), cfg = config) {
  let s = from;
  for (const a of actions) {
    const r = evaluate(cfg, s, a);
    s = r.state;
  }
  return s;
}

test('parseConfig accepts the reference board', () => {
  assert.equal(parseConfig(BOARD).ok, true);
});

test('initial state: (0,0), 6 moves, score 0, nothing collected, playing', () => {
  assert.deepEqual(initialState(config), st(0, 0, 6, 0, [], 'playing'));
});

test('valid movement: east costs exactly one move', () => {
  const r = evaluate(config, initialState(config), 'east');
  assert.equal(r.accepted, true);
  assert.deepEqual(r.state, st(1, 0, 5));
});

test('all four directions move by one cell from the centre-adjacent cell (1,0)->(0,0) etc.', () => {
  assert.deepEqual(evaluate(config, st(1, 0, 5), 'west').state.position, { x: 0, y: 0 });
  assert.deepEqual(evaluate(config, st(0, 1, 5), 'north').state.position, { x: 0, y: 0 });
  assert.deepEqual(evaluate(config, st(0, 1, 5), 'south').state.position, { x: 0, y: 2 });
});

test('wall at (1,1): moving into it is rejected and state is preserved', () => {
  for (const [from, action] of [[st(1, 0, 5), 'south'], [st(0, 1, 5), 'east'], [st(2, 1, 4), 'west'], [st(1, 2, 4), 'north']]) {
    const r = evaluate(config, from, action);
    assert.equal(r.accepted, false);
    assert.equal(r.reason, 'wall');
    assert.deepEqual(r.state, from);
  }
});

test('out of bounds: rejected with state preserved at every edge', () => {
  const cases = [[st(0, 0, 6), 'north'], [st(0, 0, 6), 'west'], [st(2, 2, 3), 'south'], [st(2, 2, 3), 'east']];
  for (const [from, action] of cases) {
    const r = evaluate(config, from, action);
    assert.equal(r.accepted, false);
    assert.equal(r.reason, 'out-of-bounds');
    assert.deepEqual(r.state, from);
  }
});

test('unknown or invalid actions are rejected and preserve state', () => {
  for (const bad of ['jump', '', 'NORTH', undefined, null, 5, {}, ['north']]) {
    const r = evaluate(config, st(0, 0, 6), bad);
    assert.equal(r.accepted, false);
    assert.equal(r.reason, 'unknown-action');
    assert.deepEqual(r.state, st(0, 0, 6));
  }
});

test('treasure t1 gives 10 points exactly once', () => {
  const atTreasure = play(['east', 'east']);
  assert.deepEqual(atTreasure, st(2, 0, 4, 10, ['t1']));
  // leave and re-enter: no second award
  const again = play(['south', 'north'], atTreasure);
  assert.deepEqual(again, st(2, 0, 2, 10, ['t1']));
});

test('full public-start winning path: east, east, south, south', () => {
  assert.deepEqual(play(['east', 'east', 'south', 'south']), st(2, 2, 2, 10, ['t1'], 'won'));
});

test('exit without treasure does not win', () => {
  const s = play(['south', 'south', 'east', 'east']);
  assert.deepEqual(s, st(2, 2, 2, 0, [], 'playing'));
});

test('losing when moves reach zero without winning', () => {
  const s = play(['east', 'west', 'east', 'west', 'east', 'west']);
  assert.deepEqual(s, st(0, 0, 0, 0, [], 'lost'));
});

test('win takes precedence over zero moves', () => {
  const tight = { ...config, maxMoves: 4 };
  const s = play(['east', 'east', 'south', 'south'], initialState(tight), tight);
  assert.deepEqual(s, st(2, 2, 0, 10, ['t1'], 'won'));
});

test('actions after completion are rejected and preserve state (won and lost)', () => {
  for (const done of [st(2, 2, 2, 10, ['t1'], 'won'), st(0, 0, 0, 0, [], 'lost')]) {
    const r = evaluate(config, done, 'east');
    assert.equal(r.accepted, false);
    assert.equal(r.reason, 'game-over');
    assert.deepEqual(r.state, done);
  }
});

test('rules never mutate their input state or config (deep-frozen inputs)', () => {
  const frozenCfg = deepFreeze(structuredClone(config));
  const frozenState = deepFreeze(st(1, 0, 5, 0, []));
  const snapshot = structuredClone(frozenState);
  for (const a of ['east', 'south', 'north', 'bogus']) {
    evaluate(frozenCfg, frozenState, a);
  }
  assert.deepEqual(frozenState, snapshot);
});

test('REGRESSION: collecting treasure must not push into the input state collected array', () => {
  const input = st(1, 0, 5, 0, []);
  const r = evaluate(config, input, 'east');
  assert.deepEqual(r.state.collected, ['t1']);
  assert.deepEqual(input.collected, []);
  assert.notEqual(r.state.collected, input.collected);
});

test('allowedActions at the start are exactly south and east', () => {
  assert.deepEqual([...allowedActions(config, st(0, 0, 6))].sort(), ['east', 'south']);
});

test('selectRoute finds the unique shortest winning route', () => {
  assert.deepEqual(selectRoute(config), ['east', 'east', 'south', 'south']);
});

test('selectRoute returns null when no route can win (budget too small)', () => {
  assert.equal(selectRoute({ ...config, maxMoves: 3 }), null);
});

test('parseConfig rejects unexpected definitions', () => {
  assert.equal(parseConfig({ ...BOARD, genre: 'quiz' }).ok, false);
  assert.equal(parseConfig({ error: 'Service unavailable' }).ok, false);
  assert.equal(parseConfig(null).ok, false);
  assert.equal(parseConfig([]).ok, false);
  assert.equal(parseConfig({ ...BOARD, walls: [{ x: 0, y: 0 }] }).ok, false); // start on wall
  assert.equal(parseConfig({ ...BOARD, width: 'three' }).ok, false);
  assert.equal(parseConfig({ ...BOARD, treasures: [{ id: 't1', position: { x: 9, y: 9 }, points: 10 }] }).ok, false);
});
