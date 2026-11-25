# Evidence

Fill in only what you personally observe. Leave `NOT YET RUN` until you have run it.
Keep the four evidence types separate: TypeScript source, compiled JS (`dist/`), packaged artifact (`release/*.tgz`), running local process, browser request/response, local telemetry events.

## Environment (Week 1)
| Item | Value |
|---|---|
| Node version (`node -v`) | NOT YET RUN |
| npm version (`npm -v`) | NOT YET RUN |
| Date / time of run | NOT YET RUN |

## Commands I ran myself
| Command | Result (paste real output summary) | Status |
|---|---|---|
| `npm install` | NOT YET RUN | NOT YET RUN |
| `npm run build` | NOT YET RUN | NOT YET RUN |
| `npm test` (expect 60 tests: learner, hint, app, server) | NOT YET RUN | NOT YET RUN |
| `npm run package` (creates `release/treasure-hunt-game-1.0.0.tgz`) | NOT YET RUN | NOT YET RUN |
| `npm run verify:release` | NOT YET RUN | NOT YET RUN |
| `npm start` then open http://127.0.0.1:3000 | NOT YET RUN | NOT YET RUN |

## Claude-session observations (NOT a substitute for my own runs)
Claude ran these during the build session; I must re-run and confirm them:
- Baseline before any code (empty repo): `npm test` failed with `TS5058 tsconfig.json does not exist` (see `evidence/baseline-output.txt`). No supplied tests existed.
- After implementation Claude reported 60/60 tests passing and 6/6 local release checks passing. **Unverified until I reproduce them.**

## Local telemetry event rows (from browser localStorage key `treasure-hunt.events.v1`)
Paste real rows copied from DevTools > Application > Local Storage. Do not invent request IDs or run IDs.

| Run ID | Seq | Action | Result | Notes |
|---|---|---|---|---|
| NOT YET RUN | | | | |

## Hint request IDs seen (from the Request ID field / `x-request-id` header)
| Mode | Request ID | Displayed outcome |
|---|---|---|
| success | NOT YET RUN | NOT YET RUN |
| validation | NOT YET RUN | NOT YET RUN |
| timeout | NOT YET RUN | NOT YET RUN |
| malformed | NOT YET RUN | NOT YET RUN |
| provider-failure | NOT YET RUN | NOT YET RUN |
| irrelevant | NOT YET RUN | NOT YET RUN |

Note: hints come from a **local deterministic stub**, not a live AI/model call.
