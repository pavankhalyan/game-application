# Browser checks

Record what you actually saw. Browser DevTools network/console traces belong here; application events belong in evidence.md; usefulness judgements belong in evaluation-record.md.
Start the server for each scenario, hard-refresh the page, and write `PASS`, `FAIL` or `NOT YET RUN`.

## Server modes
| # | Scenario | Start command | What to check | Result | Notes / screenshot file |
|---|---|---|---|---|---|
| 1 | Verified API load | `npm start` | API status shows "Verified board"; Start enabled; request `GET /api/boards/reference` is 200 | NOT YET RUN | |
| 2 | HTTP 503 on load | `npm start -- --board-mode=http-503` | Status shows "HTTP 503"; Start disabled | NOT YET RUN | |
| 3 | HTTP 500 on load | `npm start -- --board-mode=http-500` | "HTTP 500"; valid-looking body NOT used; Start disabled | NOT YET RUN | |
| 4 | Malformed JSON | `npm start -- --board-mode=malformed-json` | "Malformed JSON"; Start disabled | NOT YET RUN | |
| 5 | Unexpected definition | `npm start -- --board-mode=invalid-definition` | "Unexpected board definition"; Start disabled | NOT YET RUN | |
| 6 | Reload failure keeps session | start OK, play 1 move, stop server (or restart in 503 mode), click Reload | Load failure shown; game still playable; state unchanged | NOT YET RUN | |

## Gameplay (with `npm start`)
| # | Check | Result | Notes |
|---|---|---|---|
| 7 | Start: position (0,0), moves 6, score 0, status playing, new run ID | NOT YET RUN | |
| 8 | East accepted: (1,0), moves 5 | NOT YET RUN | |
| 9 | South from (1,0) rejected (wall), reason shown, state unchanged | NOT YET RUN | |
| 10 | North from (0,0) rejected (out of bounds), reason shown | NOT YET RUN | |
| 11 | Reach (2,0): score 10, treasure t1 shown; leave and re-enter: score stays 10 | NOT YET RUN | |
| 12 | East, East, South, South from fresh start: status won, move buttons disabled | NOT YET RUN | |
| 13 | Restart: fresh state and a different run ID | NOT YET RUN | |
| 14 | Lose: 6 moves without winning (e.g. East, West x3) shows lost, controls disabled | NOT YET RUN | |
| 15 | Telemetry shows "Recorded locally"; event count increases per attempt | NOT YET RUN | |
| 16 | Telemetry failure: block site data / use a private window with storage disabled, move; message "Local recording unavailable" and the move still applied | NOT YET RUN | |

## Hints (restart server with each mode; start a game and click Hint)
| # | Command | Expected | Result | Request ID seen |
|---|---|---|---|---|
| 17 | `npm start` | "Loading hint…", then advice, source says local stub, allowed actions listed | NOT YET RUN | |
| 18 | `npm start -- --hint-mode=validation` | Illegal advice rejected; "Fallback used (validation)" with a legal move | NOT YET RUN | |
| 19 | `npm start -- --hint-mode=irrelevant` | Fallback (irrelevant) | NOT YET RUN | |
| 20 | `npm start -- --hint-mode=malformed` | Fallback (malformed); game playable | NOT YET RUN | |
| 21 | `npm start -- --hint-mode=provider-failure` | Fallback (provider-failure); game playable | NOT YET RUN | |
| 22 | `npm start -- --hint-mode=timeout` | After ~2s fallback (timeout); no request ID; game playable | NOT YET RUN | |
| 23 | Timeout mode: click Hint then immediately move | Stale hint never appears; position/moves/score unchanged by the hint itself | NOT YET RUN | |
| 24 | Stop the server after page load, click Hint, then move | Fallback (unavailable); movement still works | NOT YET RUN | |
| 25 | After a hint, position/moves/score/treasure identical to before | NOT YET RUN | | |
