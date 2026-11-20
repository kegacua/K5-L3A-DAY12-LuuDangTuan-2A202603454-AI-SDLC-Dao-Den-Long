# Bảng truy vết Yêu cầu → Bằng chứng kiểm chứng

> Mọi bằng chứng dưới đây được tạo trực tiếp từ lệnh chạy thật (`npm run verify -- --phase <phase>`), không chỉnh sửa tay.

## Checkpoint 0 — Chuẩn bị

| Mã YC | Yêu cầu | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|---|
| CP0-1 | Cài đặt & build web + headless sạch (≤ 3 lệnh) | `npm install && npm run build` | [cp0-verify.log](cp0-verify.log) | Đạt |
| CP0-2 | Logic tách lõi + headless tất định 2 lần chạy khớp SHA-256 | `npm test` (7/7 pass, gồm `architecture.test.ts`) + double-run `dist/headless.mjs` | [cp0-verify.log](cp0-verify.log) (`sha256=ca4d4d...`) | Đạt |
| CP0-3 | 3D Hello chạy được trên Three.js + Vite | `npm run build:web` (`dist/web/index.html` + bundle 474 kB) | [cp0-verify.log](cp0-verify.log) | Đạt |
| CP0-4 | Harness, CI, hook & không lộ secret `.env` | Secret scan + `AGENTS.md` + CI + pre-commit + `verify-phase` skill | [cp0-verify.log](cp0-verify.log) | Đạt |
| CP0-5 | Tự kiểm clone sạch sang thư mục khác và chạy lại thành công | `git clone` sang thư mục tạm & chạy verify | Chờ commit CP0 rồi kiểm tra | Chưa chạy |

---

## Phase 1 (PRD-0)
*(Cập nhật khi triển khai Phase 1)*

## Phase 2 (Ticket-02)
*(Cập nhật khi triển khai Phase 2)*

## Phase 3 (Ticket-03)
*(Cập nhật khi triển khai Phase 3)*

## Phase 4 (Ticket-04)
*(Cập nhật khi triển khai Phase 4)*
