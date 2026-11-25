# AI assistance record

## Tool used
Claude Code (Claude, via the VS Code extension) was used to inspect the repository, propose a plan and implement the changes.

## Important context
The repository folder was **empty** when work began. No academy starter existed in the folder (no package.json, controls, renderer, telemetry helpers, `parseConfig`, hint host, `/api/*` endpoints or supplied tests). After being told to create them, Claude wrote **everything** from scratch, including the pieces the brief calls "supplied". Nothing here is the official academy starter, and there are no supplied tests that were preserved.

## Prompt (summary)
Build a deterministic 3x3 browser treasure-hunt game in TypeScript (start (0,0), wall (1,1), treasure t1 at (2,0) worth 10, exit (2,2), 6 moves) with pure rules, a same-origin board API with full request-lifecycle handling, an Input -> Rule -> Render -> Telemetry loop, local telemetry, a Week 3 advisory hint feature with runtime validation, deterministic fallback and stale-response suppression, learner-owned tests, evidence templates and local release scripts. No frameworks, no external services, no fabricated evidence.

## Files created by Claude (all files; none pre-existed)
- Config: package.json, package-lock.json, tsconfig.json, .gitignore
- Source: src/models.ts, genre.ts, rules.ts, config.ts, api.ts, hint.ts, telemetry.ts, controls.ts, render.ts, app.ts, main.ts
- Server: server/server.ts
- Browser: public/index.html, public/styles.css
- Tests: tests/helpers.mjs, learner.test.mjs, learner-hint.test.mjs, app.test.mjs, server.test.mjs
- Scripts: scripts/package.mjs, scripts/verify-release.mjs
- Docs/evidence: README.md, evidence/*.md, evidence/baseline-output.txt

## Changes I must review
- All the rule logic in src/rules.ts (precedence of win over zero-moves loss; one-time treasure scoring).
- The stale-hint logic in src/app.ts (`hintSeq`, `version`, run ID comparison).
- How src/hint.ts classifies `validation` vs `irrelevant` vs `malformed` vs `provider-failure` (my interpretation of the brief).
- Test expectations: confirm each is written from the game rules, not copied from the implementation.
- Dependencies: only `typescript` and `@types/node` (dev) were installed from npm.

## Commands I must run myself
```
npm install
npm run build
npm test
npm run package
npm run verify:release
npm start                       # then open http://127.0.0.1:3000
npm start -- --board-mode=http-503
npm start -- --hint-mode=timeout
```
Record real results in evidence.md and browser-checks.md.

## Areas I must be able to explain individually
- Why rules are pure and how that makes them testable.
- Why `response.ok` is checked before parsing and why an HTTP 503 JSON body is not game data.
- Why a validly-shaped hint can still be illegal, and how fallback is chosen.
- How stale hint responses are detected and discarded.
- Why telemetry failure must not roll back a valid move.
- The difference between source, compiled JS, packaged tgz, running process, browser request and local events.
- That hints are from a local stub, not a live model.

## Process notes (honesty)
- During the session Claude ran a broad `taskkill` on `node.exe` while cleaning up a smoke-test server; it had no effect (the server was stopped later by PID). Not a repository change.
- Claude's reported test/release results are from its own session and are not my evidence.
