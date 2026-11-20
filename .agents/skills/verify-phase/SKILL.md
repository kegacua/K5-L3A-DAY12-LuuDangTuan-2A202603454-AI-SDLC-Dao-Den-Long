---
name: verify-phase
description: Run full build, typecheck, unit/headless Contract v1.1 regression & feature tests, multi-night determinism check, 21,600-tick performance benchmark, and save real unedited proof logs before tagging a phase.
---

# Skill: Verify Phase & Capture Proof (Updated for Contract v1.1 / Phase 2+)

Use this skill at the end of every phase (CP0, Phase 1–4) BEFORE tagging `phase-N`.

## Steps
1. **Verify requirements & acceptance criteria traceability:**
   - Ensure every mandatory requirement, assumption, and Part 3 acceptance criterion is documented in `docs/notes/assumptions.md` and linked in `docs/proof/README.md`.
   - Ensure at least 1 headless scenario fixture exists in `tests/scenarios/` for every new feature introduced in the phase.
2. **Run automated verification gate:**
   ```bash
   npm run verify -- --phase <phase-name>
   ```
   This runs:
   - Tracked secret / `.env` scan
   - `npm run typecheck` (`tsc --noEmit`)
   - `npm run build` (both `dist/web` and `dist/headless.mjs`)
   - `npm test` (architecture guardrails + unit tests + Phase 1 regression + Phase 2+ headless scenario tests)
   - Multi-night headless determinism double-run SHA-256 comparison across Nights 1, 2, and 3
   - Full Night 3 headless benchmark (`21,600 ticks <= 30,000 ms`)
   - Writes the real unedited report to `docs/proof/<phase-name>-verify.log`.
3. **Stop on red:**
   - If `npm run verify` exits non-zero, DO NOT declare the phase complete and DO NOT tag. Fix the root cause (or, if time is up, record the failure honestly as "Chưa đạt" with the real error reason).
4. **Independent cross-review pass:**
   - Launch a separate read-only reviewer subagent to audit `src/core/`, `src/headless/`, `game.contract.json`, and `tests/` verbatim against the active Ticket and Test Contract. Fix all CRITICAL/MAJOR findings and re-run `npm run verify`.
5. **Update notes & tag:**
   - Update `docs/proof/README.md`, `docs/notes/ai-log.md`, `AGENTS.md`, and `CHANGELOG.md`.
   - Commit small, logical groups of changes, then tag (`git tag phase-N && git push origin main --tags`).
