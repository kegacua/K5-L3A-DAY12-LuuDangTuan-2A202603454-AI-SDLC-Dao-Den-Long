# Changelog

## [Unreleased]

## [phase-2] — Ticket-02 "Ba hòn đảo" (Contract v1.1)
- Nâng cấp `game.contract.json` lên **Contract v1.1** với toàn bộ hằng số chuẩn hóa (tốc độ, sức chứa 10, chi phí đèn 10, bán kính nhặt 1m / tương tác 2m, Tỏa Sáng 3 đom đóm / 5m 3D / 3s, Lướt 14 m/s / 0.2s / 1.5s, rơi khỏi đảo `fall_enabled: true`, thời lượng 300/330/360s, điểm chuẩn `+10` mỗi đom đóm nạp, `+100` đèn, `+5` choáng).
- Thêm `src/core/maps.ts`: bản đồ chuẩn & vật lý địa hình 3 Đêm (**Đảo Bến** R=40, **Đảo Cau** 2 đảo R=28 + cầu tre + 2 bục nhảy, **Đảo Chuông** 3 tầng + 2 dốc gỗ 30°/150° + Tháp Chuông + bục nhảy + Gió mạnh).
- Viết lại `src/core/simulation.ts` theo đúng thứ tự **12 bước bắt buộc mỗi tick**, tích phân velocity-Verlet, trạng thái Bóng Mực chuẩn (`spawning`, `wander`, `chase`, `recoil`, `stunned`), đom đóm rơi TTL 480 tick, **Gió Lạc** (`drifters`), **Bùa Gió** (`charms`), **Tạm dừng/Tiếp tục** (`paused`/`resumed`), và toàn bộ trường snapshot/event v1.1.
- Nâng cấp `src/client/` (`main.ts`, `audio.ts`, `index.html`): chuỗi 3 Đêm (Menu chính → Giới thiệu Ông Đăng → Chơi → Kết quả / Bình Minh), bảng màu chuẩn Hex, ánh sáng môi trường `0.15 + 0.55 × (đèn sáng/tổng)`, Tạm dừng (`Esc`/`P`), Cài đặt lưu `localStorage`, nhạc nền đêm + full SFX, HUD đủ 10 ô đom đóm, hồi chiêu Lướt/Tỏa Sáng & mũi tên chỉ đèn ngoài màn hình.
- Cập nhật bộ test Phase 1 regression theo số liệu chuẩn Ticket-02 (có lý do rõ ràng trong `docs/notes/assumptions.md`) và thêm 6 bộ scenario headless cho mọi tính năng mới + benchmark 21.600 tick (`<= 30s`).
- Cập nhật Harness AI (`AGENTS.md`, `.agents/skills/verify-phase/SKILL.md`, `scripts/verify.mjs`).

## [phase-1] — Đêm 1: Đảo Bến (PRD-0 & Test Contract v1.0)
- Triển khai lõi mô phỏng 60Hz tất định, CLI headless Contract v1.0, game 3D Đảo Bến, 19 test tự động và đánh giá chéo độc lập.

## [CP0] — Chuẩn bị môi trường & bộ khung AI SDLC
- Khởi tạo stack `TypeScript + Three.js + Vite + Node headless + Vitest`, AI Harness, pre-commit hook và GitHub Actions CI.
