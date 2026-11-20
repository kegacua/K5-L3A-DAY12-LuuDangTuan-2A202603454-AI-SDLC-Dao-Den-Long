# Changelog

## [Unreleased]

## [phase-1] — Đêm 1: Đảo Bến (PRD-0 & Test Contract v1.0)
- Thêm `game.contract.json` (Test Contract v1.0) và đồng bộ trực tiếp vào `src/core/config.ts`.
- Xây dựng lõi mô phỏng 60Hz tất định (`src/core/types.ts`, `src/core/rng.ts`, `src/core/config.ts`, `src/core/validation.ts`, `src/core/simulation.ts`): di chuyển theo `cam_yaw_deg`, nhảy, nhặt đom đóm, nạp & thắp 5 Đèn Lồng Lớn, Tỏa sáng làm choáng & đẩy lùi Bóng Mực, vùng an toàn `safe_radius`, sát thương & bất tử tạm thời, thắng/thua/tính điểm.
- Triển khai CLI headless chuẩn Test Contract v1.0 (`src/headless/cli.ts`) với JSONL snapshot/event/end và mã thoát `0` / `2` / `1`.
- Xây dựng game 3D Đảo Bến bằng Three.js (`src/client/main.ts`, `src/client/audio.ts`, `index.html`): Mây đội nón lá treo đèn lồng nhỏ, đảo sáng dần theo số đèn thắp, HUD đầy đủ, chơi lại tức thì, âm thanh Web Audio tổng hợp & hiệu ứng biển mây/tàn lửa (chỉ ở lớp hiển thị).
- Bổ sung bộ 4 scenario fixture (`tests/scenarios/`) và 18 test tự động (`tests/architecture.test.ts`, `tests/simulation.unit.test.ts`, `tests/headless.contract.test.ts`).
- **Thay thế test cũ (có lý do):** Gỡ bỏ bộ khung hello CP0 (`src/core/hello.ts`, `tests/core.hello.test.ts`, `tests/headless.smoke.test.ts`) vì đã được thay thế bởi lõi game và CLI chuẩn Test Contract v1.0 của Phase 1.

## [CP0] — Chuẩn bị môi trường & bộ khung AI SDLC
- Khởi tạo dự án đa nền tảng (`TypeScript + Three.js + Vite + Node.js headless + Vitest`).
- Tách sạch `src/core/`, `src/headless/` và `src/client/`.
- Thiết lập AI Harness: `AGENTS.md`, skill `.agents/skills/verify-phase/SKILL.md`, `scripts/verify.mjs`, `.githooks/pre-commit`, `.github/workflows/ci.yml`.
- Khởi tạo khung tài liệu ghi chép (`docs/notes/`, `docs/proof/`, `LICENSE`, `CREDITS.md`).
