---
name: verify-phase
description: Run full build, typecheck, unit/headless tests, determinism check, and save real unedited proof logs before completing or tagging a phase.
---

# Skill: Verify Phase & Capture Proof

Use this skill at the end of every phase (CP0, Phase 1–4) BEFORE tagging `phase-N`.

## Steps
1. **Verify clean requirements traceability:**
   - Ensure every mandatory requirement and assumption for the active phase is listed in `docs/notes/assumptions.md` and `docs/proof/README.md`.
2. **Run automated verification gate:**
   ```bash
   npm run verify -- --phase <phase-name>
   ```
   This runs:
   - Tracked secret / `.env` scan
   - `npm run typecheck`
   - `npm run build` (both `dist/web` and `dist/headless.mjs`)
   - `npm test` (unit + headless scenario + regression tests)
   - Headless determinism double-run SHA-256 check
   - Writes the real unedited report to `docs/proof/<phase-name>-verify.log`.
3. **Stop on red:**
   - If `npm run verify` exits non-zero, DO NOT declare the phase complete and DO NOT tag. Fix the root cause (or, if time is up, record the failure honestly as "Chưa đạt" with the real error reason).
4. **Independent review pass:**
   - Review `git diff` against the phase requirements, Test Contract, and `AGENTS.md` using a separate reviewer subagent or clean-eyes pass.
5. **Update notes & tag:**
   - Update `docs/proof/README.md`, `docs/notes/ai-log.md`, and `CHANGELOG.md`.
   - Commit small, clear changes, then tag (`git tag phase-N && git push origin main --tags`).
