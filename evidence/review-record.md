# Review record

Complete after I personally review the Claude-written code. Do not mark an item reviewed unless I have read it.

| File | What I checked | Reviewed? | Issues / changes I made |
|---|---|---|---|
| src/models.ts | Types match the contract; readonly fields | NOT YET RUN | |
| src/rules.ts | Order of checks, win-before-loss precedence, no mutation, treasure once | NOT YET RUN | |
| src/genre.ts | BFS route selection is deterministic | NOT YET RUN | |
| src/config.ts | parseConfig rejects bad definitions | NOT YET RUN | |
| src/api.ts | `response.ok` checked before parsing; network vs HTTP vs JSON vs definition | NOT YET RUN | |
| src/app.ts | Input -> Rule -> Render -> Telemetry; stale-hint token logic; reload keeps session | NOT YET RUN | |
| src/hint.ts | Illegal advice never trusted; deterministic fallback; timeout handling | NOT YET RUN | |
| src/telemetry.ts | No sensitive data; failure never throws | NOT YET RUN | |
| src/render.ts, controls.ts | textContent only (no innerHTML) | NOT YET RUN | |
| server/server.ts | Failure modes; path allowlist for /js/ | NOT YET RUN | |
| tests/*.test.mjs | Expected values are independent of the code under test | NOT YET RUN | |
| scripts/*.mjs | Package and verify steps do what they say (local only) | NOT YET RUN | |

## Things I should challenge
- The "supplied starter" did not exist in my folder, so controls, renderer, telemetry helper, `parseConfig`, hint host and `allowedActions` were all written by Claude. Is that acceptable for the assessment? NOT YET RUN
- `validation` and `irrelevant` hint modes are my (Claude's) interpretation of the brief, not a supplied definition.
