// Local same-origin server: static files, GET /api/boards/reference, POST /api/hint.
// The hint endpoint is a deterministic LOCAL STUB (no model, no network calls).
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ACTIONS, type GameConfig, type GameState } from '../src/models.js';
import { allowedActions } from '../src/rules.js';
import { parseConfig } from '../src/config.js';

export const BOARD_MODES = ['ok', 'http-500', 'http-503', 'malformed-json', 'invalid-definition'] as const;
export const HINT_MODES = ['success', 'validation', 'timeout', 'malformed', 'provider-failure', 'irrelevant'] as const;
export type BoardMode = (typeof BOARD_MODES)[number];
export type HintMode = (typeof HINT_MODES)[number];

export const REFERENCE_BOARD = {
  genre: 'treasure-hunt',
  id: 'reference',
  width: 3,
  height: 3,
  start: { x: 0, y: 0 },
  exit: { x: 2, y: 2 },
  walls: [{ x: 1, y: 1 }],
  treasures: [{ id: 't1', position: { x: 2, y: 0 }, points: 10 }],
  maxMoves: 6,
} as const;

export interface ServerOptions {
  boardMode: BoardMode;
  hintMode: HintMode;
  /** How long the timeout mode stalls before replying. */
  timeoutStallMs: number;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

function send(res: ServerResponse, status: number, body: string, type = 'application/json; charset=utf-8', extra: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...extra });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 10_000) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function asState(v: unknown): GameState | null {
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  const p = s['position'] as Record<string, unknown> | undefined;
  if (!p || !Number.isInteger(p['x']) || !Number.isInteger(p['y'])) return null;
  if (!Number.isInteger(s['movesRemaining']) || !Number.isInteger(s['score']) || !Array.isArray(s['collected'])) return null;
  if (s['status'] !== 'playing' && s['status'] !== 'won' && s['status'] !== 'lost') return null;
  return v as GameState;
}

async function handleHint(req: IncomingMessage, res: ServerResponse, opts: ServerOptions, config: GameConfig): Promise<void> {
  const requestId = `hint-${randomUUID().slice(0, 8)}`;
  const idHeader = { 'x-request-id': requestId };
  let state: GameState | null = null;
  try {
    state = asState((JSON.parse(await readBody(req)) as { state?: unknown }).state);
  } catch {
    state = null;
  }
  if (!state) return send(res, 400, JSON.stringify({ requestId, error: 'Invalid request body' }), undefined, idHeader);

  const allowed = allowedActions(config, state);
  const illegal = ACTIONS.find((a) => !allowed.includes(a)) ?? 'north';
  const ok = (action: string, explanation: string): string =>
    JSON.stringify({ requestId, source: 'local-stub', recommendedAction: action, explanation });

  switch (opts.hintMode) {
    case 'success': {
      const pick = allowed[0];
      return send(res, 200, ok(pick ?? 'none', pick ? `Local stub: ${pick} is a permitted move.` : 'Local stub: no permitted move.'), undefined, idHeader);
    }
    case 'validation':
      return send(res, 200, ok(illegal, 'Local stub (validation mode): deliberately recommends an illegal move.'), undefined, idHeader);
    case 'irrelevant':
      return send(res, 200, ok('buy a sword', 'Local stub (irrelevant mode): not a game move.'), undefined, idHeader);
    case 'malformed':
      return send(res, 200, '{"requestId": "' + requestId + '", "source": ', undefined, idHeader);
    case 'provider-failure':
      return send(res, 502, JSON.stringify({ requestId, error: 'Simulated provider failure' }), undefined, idHeader);
    case 'timeout':
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, opts.timeoutStallMs);
        res.on('close', () => {
          clearTimeout(t);
          resolve();
        });
      });
      if (!res.writableEnded && !res.destroyed) send(res, 200, ok(allowed[0] ?? 'none', 'Too late.'), undefined, idHeader);
  }
}

export function createGameServer(partial: Partial<ServerOptions> = {}): Server {
  const opts: ServerOptions = { boardMode: 'ok', hintMode: 'success', timeoutStallMs: 5000, ...partial };
  const parsed = parseConfig(REFERENCE_BOARD);
  if (!parsed.ok) throw new Error(`Reference board invalid: ${parsed.reason}`);
  const config = parsed.config;

  return createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      try {
        if (url.pathname === '/api/health' && req.method === 'GET') {
          return send(res, 200, JSON.stringify({ status: 'ok', boardMode: opts.boardMode, hintMode: opts.hintMode }));
        }
        if (url.pathname === '/api/boards/reference' && req.method === 'GET') {
          switch (opts.boardMode) {
            case 'ok':
              return send(res, 200, JSON.stringify(REFERENCE_BOARD));
            case 'http-500':
              return send(res, 500, JSON.stringify({ error: 'Internal error', ...REFERENCE_BOARD }));
            case 'http-503':
              return send(res, 503, JSON.stringify({ error: 'Service unavailable' }));
            case 'malformed-json':
              return send(res, 200, '{"genre": "treasure-hunt", ');
            case 'invalid-definition':
              return send(res, 200, JSON.stringify({ ...REFERENCE_BOARD, genre: 'quiz' }));
          }
        }
        if (url.pathname === '/api/hint' && req.method === 'POST') return await handleHint(req, res, opts, config);

        if (req.method === 'GET') {
          let file: string | null = null;
          if (url.pathname === '/' || url.pathname === '/index.html') file = path.join(ROOT, 'public', 'index.html');
          else if (url.pathname === '/styles.css') file = path.join(ROOT, 'public', 'styles.css');
          else if (/^\/js\/[a-z]+\.js$/.test(url.pathname)) file = path.join(ROOT, 'dist', 'src', url.pathname.slice(4));
          if (file) {
            const data = await readFile(file).catch(() => null);
            if (data) return send(res, 200, data.toString('utf8'), MIME[path.extname(file)] ?? 'text/plain');
          }
        }
        send(res, 404, JSON.stringify({ error: 'Not found' }));
      } catch {
        if (!res.headersSent) send(res, 500, JSON.stringify({ error: 'Server error' }));
      }
    })();
  });
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const boardMode = (arg('board-mode') ?? process.env['BOARD_MODE'] ?? 'ok') as BoardMode;
  const hintMode = (arg('hint-mode') ?? process.env['HINT_MODE'] ?? 'success') as HintMode;
  if (!BOARD_MODES.includes(boardMode) || !HINT_MODES.includes(hintMode)) {
    console.error(`Invalid mode. board-mode: ${BOARD_MODES.join('|')}  hint-mode: ${HINT_MODES.join('|')}`);
    process.exit(1);
  }
  const port = Number(arg('port') ?? process.env['PORT'] ?? 3000);
  createGameServer({ boardMode, hintMode }).listen(port, '127.0.0.1', () => {
    console.log(`Treasure Hunt listening on http://127.0.0.1:${port} (board-mode=${boardMode}, hint-mode=${hintMode}; hints are a local stub, not a live model)`);
  });
}
