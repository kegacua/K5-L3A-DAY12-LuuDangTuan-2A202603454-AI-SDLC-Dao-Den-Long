# AGENTS.md — Đảo Đèn Lồng (Day 12 AI SDLC)

## Architecture Rules (Non-Negotiable)
1. **Strict core/render separation:** `src/core/` MUST remain pure TypeScript with ZERO imports from `three`, DOM, `window`, or `document`. All game rules, 3-night terrain maps (`src/core/maps.ts`), physics, timers, fuel math, and state transitions live in `src/core/`.
2. **Determinism & integer precision:** Never use `Date.now()`, `performance.now()`, or `Math.random()` inside `src/core/`. Use fixed `dt` (`1/60s`) ticks, Mulberry32 PRNG (`src/core/rng.ts`), code-unit ID sorting (`compareId`), and **integer 1/60 fuel units** (`fuelSixtieths`, `0..6000`) to avoid floating-point drift at `fuel === 30` and `fuel <= 0`.
3. **Single source of truth for tuning:** `src/core/config.ts` imports `game.contract.json` (Contract v1.2) directly so tuning constants can never drift from the Test Contract.
4. **Exact 12-step tick order (v1.2):** (1) Input & Pause (freeze `sim_tick`/timers/fuel/TTL/spawns when paused), (2) Decrement countdown timers + subtract lantern fuel (`1/60` decay + `5/60` per draining Shade) + extinguish `fuel <= 0` (`lantern_out`), (3) Move Mây (jump, dash, jump pads, wind) + fall check (`Y < -10`), (4) Pick up motes (dynamic `capacity = min(20, 10 + 2*successful_lights)`) & charms, (5) Interact with lanterns (unlit: deposit/light/relight; lit `<100`: `refuel`), (6) Safe-zone push-out (`fuel >= 30` only), (7) Light Pulse (3D radius, `+15` for draining shade, `+5` others), (8) Move Shades (`spawning|wander|chase|recoil|stunned|drain`) & Drifters, (9) Collisions (Drifters steal BEFORE Shades hit, ascending ID), (10) Scheduled spawns (`readySimTick = simTick + 1`), (11) Win/Loss priority (`no_flames` > dawn check: `lit >= ceil(0.6*N)` → `dawn_survived` else `dawn`; NO early `all_lit` win), (12) Snapshot.
5. **No invented requirements:** Keep creative additions strictly in `src/client/` with zero impact on headless output.

## Commands
- Install: `npm ci`
- Dev 3D client: `npm run dev`
- Typecheck: `npm run typecheck`
- Build (web + headless): `npm run build`
- Tests: `npm test`
- Headless CLI: `node dist/headless.mjs --seed 42 --night <1|2|3> --ticks 600 --out out.jsonl`
- Full verification + proof log: `npm run verify -- --phase <cp0|phase-1|phase-2|phase-3|phase-4>`

## Verification & Quality Gates
- **No proof, not done:** Never claim a requirement passes without running `npm run verify` and inspecting the real output.
- **Honest evidence:** Never hand-edit proof logs, never write vacuous tests, and never silently skip broken tests. Document every test change required by a Change Request in ADR, `docs/notes/assumptions.md`, and `CHANGELOG.md`.
- **Cross-review:** After implementing each phase, run an independent reviewer subagent auditing code diff against the active ticket & Test Contract before tagging.
- **Performance budget:** Full Night 3 headless run (`<= 21,600` ticks) MUST complete in `<= 30s`; 3D client target `>= 30 FPS` at 1280×720.
- **Security:** Never commit `.env`, API keys, or tokens. Keep harness files in git history; never force-push past published tags.

## Phase History Updates
- **CP0:** Initialized stack (`TypeScript + Three.js + Vite + Node headless + Vitest`), verification script, pre-commit hook, and CI workflow.
- **Phase 1:** Added single-source-of-truth contract sync, Step-1 timer decrement rule, and cross-OS deterministic ID allocation/sorting.
- **Phase 2:** Updated for Contract v1.1 (3 Nights, 12-step tick order, velocity-Verlet physics, Drifters/Charms/Wind, 21,600-tick performance gate).
- **Phase 3:** Updated for Ticket-03 Change Request / Contract v1.2 (integer 1/60 lantern fuel, `drain` Shade state, dynamic capacity, dawn survival win `dawn_survived`, ADR-001, and colorblind accessibility).
