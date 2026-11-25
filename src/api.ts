// Board loading over the same-origin endpoint GET /api/boards/reference.
import { parseConfig } from './config.js';
import type { GameConfig } from './models.js';

export const BOARD_URL = '/api/boards/reference';

export type LoadResult =
  | { readonly kind: 'ok'; readonly config: GameConfig }
  | { readonly kind: 'network-error'; readonly message: string }
  | { readonly kind: 'http-error'; readonly status: number }
  | { readonly kind: 'malformed-json' }
  | { readonly kind: 'invalid-definition'; readonly reason: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Returns only validated configuration. Never throws. */
export async function loadBoard(fetchFn: FetchLike = (u, i) => fetch(u, i), url: string = BOARD_URL): Promise<LoadResult> {
  let response: Response;
  try {
    response = await fetchFn(url, { headers: { accept: 'application/json' } });
  } catch (err) {
    return { kind: 'network-error', message: err instanceof Error ? err.message : 'Network request failed' };
  }
  // HTTP error bodies (even JSON ones) are never treated as game data.
  if (!response.ok) return { kind: 'http-error', status: response.status };
  let text: string;
  try {
    text = await response.text();
  } catch (err) {
    return { kind: 'network-error', message: err instanceof Error ? err.message : 'Failed reading response' };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: 'malformed-json' };
  }
  const parsed = parseConfig(json);
  return parsed.ok ? { kind: 'ok', config: parsed.config } : { kind: 'invalid-definition', reason: parsed.reason };
}

export function describeLoad(result: LoadResult): string {
  switch (result.kind) {
    case 'ok':
      return `Verified board "${result.config.id}"`;
    case 'network-error':
      return `Network error: ${result.message}`;
    case 'http-error':
      return `HTTP ${result.status}`;
    case 'malformed-json':
      return 'Malformed JSON in response';
    case 'invalid-definition':
      return `Unexpected board definition: ${result.reason}`;
  }
}
