// Real HTTP round-trips against the local server in each deterministic failure mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameServer } from '../dist/server/server.js';
import { loadBoard } from '../dist/src/api.js';
import { fetchHint, resolveHint } from '../dist/src/hint.js';
import { parseConfig } from '../dist/src/config.js';
import { BOARD, st } from './helpers.mjs';

const config = parseConfig(BOARD).config;

async function withServer(opts, fn) {
  const server = createGameServer(opts);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const f = (u, i) => fetch(base + u, i);
  try {
    await fn(f, base);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
}

test('board modes: ok is verified; 500/503/malformed/invalid are each reported distinctly', async () => {
  const expected = { ok: 'ok', 'http-500': 'http-error', 'http-503': 'http-error', 'malformed-json': 'malformed-json', 'invalid-definition': 'invalid-definition' };
  for (const [boardMode, kind] of Object.entries(expected)) {
    await withServer({ boardMode }, async (f) => {
      const r = await loadBoard(f);
      assert.equal(r.kind, kind, boardMode);
      if (boardMode === 'http-503') assert.equal(r.status, 503);
    });
  }
});

test('server serves the page and compiled modules, 404 otherwise', async () => {
  await withServer({}, async (_f, base) => {
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/js/main.js`)).status, 200);
    assert.equal((await fetch(`${base}/js/../package.json`)).status, 404);
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  });
});

test('hint modes through the real boundary at state (1,0)', async () => {
  const state = st(1, 0, 5);
  const expected = {
    success: ['advice', undefined],
    validation: ['fallback', 'validation'],
    irrelevant: ['fallback', 'irrelevant'],
    malformed: ['fallback', 'malformed'],
    'provider-failure': ['fallback', 'provider-failure'],
  };
  for (const [hintMode, [kind, reason]] of Object.entries(expected)) {
    await withServer({ hintMode }, async (f) => {
      const t = await fetchHint(state, f, 1000);
      const o = resolveHint(config, state, t);
      assert.equal(o.kind, kind, hintMode);
      assert.equal(o.reason, reason, hintMode);
      assert.match(o.requestId, /^hint-/, `${hintMode} keeps the request id`);
      if (kind === 'advice') assert.equal(o.source, 'local-stub');
    });
  }
});

test('hint timeout mode: client times out and falls back', async () => {
  await withServer({ hintMode: 'timeout', timeoutStallMs: 3000 }, async (f) => {
    const t = await fetchHint(st(1, 0, 5), f, 100);
    assert.deepEqual(t, { kind: 'timeout' });
    assert.equal(resolveHint(config, st(1, 0, 5), t).reason, 'timeout');
  });
});

test('hint server unreachable: network-error fallback', async () => {
  const t = await fetchHint(st(1, 0, 5), () => fetch('http://127.0.0.1:1/api/hint', { method: 'POST' }), 500);
  assert.equal(t.kind, 'network-error');
});

test('hint endpoint rejects garbage bodies with 400', async () => {
  await withServer({}, async (_f, base) => {
    const r = await fetch(`${base}/api/hint`, { method: 'POST', body: 'not json' });
    assert.equal(r.status, 400);
  });
});
