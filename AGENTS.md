# AGENTS.md — Đảo Đèn Lồng (Day 12 AI SDLC)

## Architecture Rules (Non-Negotiable)
1. **Strict core/render separation:** `src/core/` MUST remain pure TypeScript with ZERO imports from `three`, DOM, `window`, or `document`. All game rules, physics, timers, and state transitions live in `src/core/`.
2. **Determinism first:** Never use `Date.now()`, `performance.now()`, or `Math.random()` inside `src/core/`. Use fixed `dt` ticks and a seeded PRNG when randomness is required.
3. **Test Contract priority:** Read the phase Test Contract before designing or coding. Match CLI flags, schemas, and filenames verbatim.
4. **No invented requirements:** Only implement requirements from the active phase document or documented assumptions in `docs/notes/assumptions.md`.

## Commands
- Install: `npm install`
- Dev 3D client: `npm run dev`
- Typecheck: `npm run typecheck`
- Build (web + headless): `npm run build`
- Tests: `npm test`
- Headless CLI: `npm run headless`
- Full verification + proof log: `npm run verify -- --phase <cp0|phase-1|phase-2|phase-3|phase-4>`
- Install git pre-commit hook: `npm run hooks:install`

## Verification & Quality Gates
- **No proof, not done:** Never claim a requirement passes without running `npm run verify` and inspecting the real output.
- **Honest evidence:** Never hand-edit proof logs, never write vacuous/always-pass tests, and never silently skip broken tests. If a new phase invalidates an old test, update or remove it with an explicit reason in `docs/notes/assumptions.md` and `CHANGELOG.md`.
- **Cross-review:** After implementing a phase, run an independent review pass (separate subagent or clean checklist review) checking code diff against requirements and Test Contract before tagging.
- **Security:** Never commit `.env`, API keys, or tokens. Keep harness files in git history; never force-push past published tags.

## Phase History Updates
- **CP0:** Initialized stack (`TypeScript + Three.js + Vite + Node headless + Vitest`), verification script, pre-commit hook, and CI workflow.
