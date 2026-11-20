# AGENTS.md — Đảo Đèn Lồng (Day 12 AI SDLC · v1.0.0)

## Architecture Rules (Non-Negotiable)
1. **Strict core/render separation:** `src/core/` MUST remain pure TypeScript with ZERO imports from `three`, DOM, `window`, or `document`. All game rules, 3-night terrain maps (`src/core/maps.ts`), leaderboard sorting (`src/core/leaderboard.ts`), physics, timers, integer fuel math, and state transitions live in `src/core/`.
2. **Determinism & integer precision:** Never use `Date.now()`, `performance.now()`, or `Math.random()` inside `src/core/`. Use fixed `dt` (`1/60s`) ticks, Mulberry32 PRNG (`src/core/rng.ts`), code-unit ID sorting (`compareId`), and **integer 1/60 fuel units** (`fuelSixtieths`, `0..6000`).
3. **Single source of truth for tuning:** `src/core/config.ts` imports `game.contract.json` (Contract v1.3) directly (`bench_cmd`, `soak_cmd`, `run_cmd`, `headless_cmd`, `tuning`).
4. **Exact 12-step tick order (v1.2/v1.3):** (1) Input & Pause, (2) Timers + `1/60` fuel decay + `5/60` per draining Shade + extinguish `<= 0` (`lantern_out`), (3) Move Mây + fall check (`Y < -10`), (4) Pick up motes (dynamic `capacity = min(20, 10 + 2*successful_lights)`) & charms, (5) Interact with lanterns (light/relight/`refuel`), (6) Safe-zone push-out (`fuel >= 30` only), (7) Light Pulse (`+15` draining shade / `+5` others), (8) Move Shades & Drifters, (9) Collisions (Drifters steal BEFORE Shades hit), (10) Scheduled spawns (`readySimTick = simTick + 1`), (11) Win/Loss priority (`no_flames` > dawn check `dawn_survived`/`dawn`), (12) Snapshot.
5. **Client performance & accessibility:** Use `InstancedMesh` + `MeshLambertMaterial` for motes/shades, dispose dynamically created geometries/materials on restart, keep UI text `>= 18px` at `1280×720`, and disable creative extras in `?bench=1`.

## Commands
- Install: `npm ci`
- Build all targets: `npm run build`
- Play app (local server + disk leaderboard): `node dist/app.mjs` (`--export-leaderboard out.json`)
- Dev 3D client: `npm run dev`
- Typecheck & Tests: `npm run typecheck` · `npm test`
- Headless CLI: `node dist/headless.mjs --seed 42 --night <1|2|3> --ticks 600 --out out.jsonl`
- 3D Benchmark (1280×720): `node dist/bench.mjs --seed 42 --duration 30 --out bench.json`
- 10-Night Soak Test: `node --no-opt --expose-gc dist/soak.mjs --seed 7 --nights 10 --out soak.json`
- Full verification + proof log: `npm run verify -- --phase <cp0|phase-1|phase-2|phase-3|phase-4>`

## Verification & Quality Gates
- **No proof, not done:** Never claim a requirement passes without running `npm run verify` and inspecting the real output.
- **Honest evidence:** Never hand-edit proof logs, never write vacuous tests, and never silently skip broken tests.
- **Cross-review:** Run an independent reviewer subagent auditing code diff against the active ticket & Test Contract before tagging.
- **Security:** Never commit `.env`, API keys, or tokens. Keep harness files in git history; never force-push past published tags.

## Phase History Updates
- **CP0:** Initialized stack, verification script, pre-commit hook, and CI workflow.
- **Phase 1:** Contract v1.0 sync, Step-1 timer decrement, cross-OS deterministic ID allocation/sorting.
- **Phase 2:** Contract v1.1 (3 Nights, 12-step tick order, velocity-Verlet physics, Drifters/Charms/Wind).
- **Phase 3:** Ticket-03 Change Request / Contract v1.2 (integer 1/60 fuel, `drain`, dynamic capacity, `dawn_survived`, ADR-001, colorblind mode).
- **Phase 4:** Ticket-04 / Contract v1.3 (`bench_cmd`, `soak_cmd`, `InstancedMesh` + `MeshLambertMaterial` optimization, disk leaderboard + `--export-leaderboard`, full accessibility, Docker/zip packaging, full git-history secret scan, and `retro.md`).
