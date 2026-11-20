# Bảng truy vết Yêu cầu → Bằng chứng kiểm chứng

> Mọi bằng chứng dưới đây được tạo trực tiếp từ lệnh chạy thật (`npm run verify -- --phase <phase>`), không chỉnh sửa tay.

## Checkpoint 0 — Chuẩn bị

| Mã YC | Yêu cầu | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|---|
| CP0-1 | Cài đặt & build web + headless sạch (≤ 3 lệnh) | `npm install && npm run build` | [cp0-verify.log](cp0-verify.log) | Đạt |
| CP0-2 | Logic tách lõi + headless tất định 2 lần chạy khớp SHA-256 | `npm test` (7/7 pass, gồm `architecture.test.ts`) + double-run `dist/headless.mjs` | [cp0-verify.log](cp0-verify.log) (`sha256=ca4d4d...`) | Đạt |
| CP0-3 | 3D Hello chạy được trên Three.js + Vite | `npm run build:web` (`dist/web/index.html` + bundle 474 kB) | [cp0-verify.log](cp0-verify.log) | Đạt |
| CP0-4 | Harness, CI, hook & không lộ secret `.env` | Secret scan + `AGENTS.md` + CI + pre-commit + `verify-phase` skill | [cp0-verify.log](cp0-verify.log) | Đạt |

---

## Phase 1 — PRD-0 & Test Contract v1.0 (`tag: phase-1`)

| Mã YC | Yêu cầu | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|---|
| P1-1 | `game.contract.json` chuẩn v1.0, khớp 100% hằng số game | `tests/architecture.test.ts` (so khớp `game.contract.json` vs `DEFAULT_TUNING`) | [phase-1-verify.log](phase-1-verify.log) | Đạt |
| P1-2 | Di chuyển, xoay theo `cam_yaw_deg`, chuẩn hóa vector, nhảy & hạ cánh | `tests/simulation.unit.test.ts` (yaw 0°/90°, chéo `[1,1]`, jump arc) | [phase-1-verify.log](phase-1-verify.log) | Đạt |
| P1-3 | Nhặt đom đóm, nạp đèn, thắp 5 Đèn Lồng Lớn, thắng (`all_lit`) & tính điểm | `tests/simulation.unit.test.ts` + `win-all-lit.scenario.json` qua CLI headless | [phase-1-verify.log](phase-1-verify.log) | Đạt |
| P1-4 | Bóng Mực đuổi, sợ đèn (`safe_radius = 6m`), Tỏa sáng (`stunned` 3s, đẩy 6m, hồi 1.5s) | `tests/simulation.unit.test.ts` + `pulse-safe-zone.scenario.json` qua CLI headless | [phase-1-verify.log](phase-1-verify.log) | Đạt |
| P1-5 | Sát thương, rơi đom đóm, bất tử `invuln_s`, thua `no_flames` & `dawn` | `tests/simulation.unit.test.ts` + `lose-no-flames` & `lose-dawn` qua CLI headless | [phase-1-verify.log](phase-1-verify.log) | Đạt |
| P1-6 | CLI headless Test Contract v1.0, mã thoát `0`/`2`, JSONL chuẩn & tính tất định | `tests/headless.contract.test.ts` + chạy 2 lần `seed=42, ticks=600` so SHA-256 | [phase-1-verify.log](phase-1-verify.log) | Đạt |
| P1-7 | Game 3D Đêm 1 – Đảo Bến (Mây đội nón lá + đèn nhỏ, đảo sáng dần, HUD, chơi lại) | `npm run build:web` (`dist/web` sạch 0 lỗi TS/Vite) + kiểm tra kiến trúc tách lõi | [phase-1-verify.log](phase-1-verify.log) | Đạt |
| P1-8 | Đánh giá chéo độc lập trước khi tag | Subagent `Phase 1 Contract Auditor` rà soát & đã sửa toàn bộ lỗi tìm thấy + thêm regression test | [ai-log.md](../notes/ai-log.md) & [phase-1-verify.log](phase-1-verify.log) | Đạt |

---

## Phase 2 (Ticket-02)
*(Cập nhật khi triển khai Phase 2)*

## Phase 3 (Ticket-03)
*(Cập nhật khi triển khai Phase 3)*

## Phase 4 (Ticket-04)
*(Cập nhật khi triển khai Phase 4)*
