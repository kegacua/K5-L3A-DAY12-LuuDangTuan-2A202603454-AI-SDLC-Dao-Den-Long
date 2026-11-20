# Changelog

## [Unreleased]

## [CP0] — Chuẩn bị môi trường & bộ khung AI SDLC
- Khởi tạo dự án đa nền tảng (`TypeScript + Three.js + Vite + Node.js headless + Vitest`).
- Tách sạch `src/core/` (logic thuần, tất định, không phụ thuộc DOM/Three.js), `src/headless/` (CLI headless) và `src/client/` (3D Three.js).
- Thiết lập AI Harness: `AGENTS.md`, skill `.agents/skills/verify-phase/SKILL.md`, script kiểm chứng `scripts/verify.mjs`, git hook `.githooks/pre-commit`, và GitHub Actions CI `.github/workflows/ci.yml`.
- Khởi tạo khung tài liệu ghi chép (`docs/notes/`, `docs/proof/`, `LICENSE`, `CREDITS.md`).
