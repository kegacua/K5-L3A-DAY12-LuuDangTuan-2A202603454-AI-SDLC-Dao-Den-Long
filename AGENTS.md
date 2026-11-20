# AGENTS.md — Đảo Đèn Lồng (Day 12 AI SDLC)

## Architecture Rules (Non-Negotiable)
1. **Strict core/render separation:** `src/core/` MUST remain pure TypeScript with ZERO imports from `three`, DOM, `window`, or `document`. All game rules, 3-night terrain maps (`src/core/maps.ts`), physics, timers, and state transitions live in `src/core/`.
2. **Determinism first:** Never use `Date.now()`, `performance.now()`, or `Math.random()` inside `src/core/`. Use fixed `dt` (`1/60s`) ticks, Mulberry32 PRNG (`src/core/rng.ts`), and code-unit ID sorting (`compareId`, never `localeCompare`).
3. **Single source of truth for tuning:** `src/core/config.ts` imports `game.contract.json` (Contract v1.1) directly so tuning constants can never drift from the Test Contract.
4. **Exact 12-step tick order:** Maintain Ticket-02's 12-step order in `stepWorld`: (1) Input & Pause (freeze `sim_tick`/timers/TTL/spawns when paused), (2) Decrement all countdown timers, (3) Move Mây (jump, dash, jump pads, wind) + fall check (`Y < -10`), (4) Pick up motes & charms, (5) Interact with lanterns, (6) Safe-zone push-out, (7) Light Pulse (3D radius), (8) Move Shades & Drifters, (9) Collisions (Drifters steal BEFORE Shades hit, ascending ID), (10) Scheduled spawns (`readySimTick = simTick + 1`), (11) Win/Loss priority (`no_flames` > `all_lit` > `dawn`), (12) Snapshot.
5. **Exact physics & entities:** Use velocity-Verlet vertical integration (`y += vy*dt - 0.5*g*dt^2`) for exact jump apex/flight arcs; use only standardized Shade state names (`spawning`, `wander`, `chase`, `recoil`, `stunned`).
6. **No invented requirements:** Keep creative additions strictly in `src/client/` with zero impact on headless output.

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
- **Honest evidence:** Never hand-edit proof logs, never write vacuous tests, and never silently skip broken tests. Document every test change required by a new phase in `docs/notes/assumptions.md` and `CHANGELOG.md`.
- **Cross-review:** After implementing each phase, run an independent reviewer subagent auditing code diff against the active ticket & Test Contract before tagging.
- **Performance budget:** Full Night 3 headless run (21,600 ticks) MUST complete in `<= 30s`; 3D client target `>= 30 FPS` at 1280×720.
- **Security:** Never commit `.env`, API keys, or tokens. Keep harness files in git history; never force-push past published tags.

## Phase History Updates
- **CP0:** Initialized stack (`TypeScript + Three.js + Vite + Node headless + Vitest`), verification script, pre-commit hook, and CI workflow.
- **Phase 1:** Added single-source-of-truth contract sync (`game.contract.json` -> `src/core/config.ts`), Step-1 timer decrement rule, and cross-OS deterministic ID allocation/sorting after independent Contract Auditor review.
- **Phase 2:** Updated for Contract v1.1 (3 Nights: Đảo Bến / Đảo Cau / Đảo Chuông), exact 12-step tick order, velocity-Verlet jump/launch physics, standardized Shade FSM states, Drifters/Charms/Wind, and 21,600-tick headless performance gate (`<= 30s`).
