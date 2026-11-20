# Giả định, Tiêu chí nghiệm thu & Thay đổi thiết kế

> Ghi lại rõ các yêu cầu bắt buộc, giả định cho chỗ mơ hồ, tiêu chí nghiệm thu kiểm chứng được, và mọi thay đổi thiết kế qua từng phase.

---

## Checkpoint 0 — Chuẩn bị môi trường

### Mục tiêu & Tiêu chí nghiệm thu
- **CP0-1 (Đa nền tảng & ≤ 3 lệnh):** Clone sạch trên macOS/Linux/Windows có Node.js 20+, chạy `npm install`, `npm run build`, `npm run headless` (hoặc `npm run dev`) thành công.
- **CP0-2 (Tách lõi & tính tất định):** `src/core/hello.ts` không import `three`/DOM; chạy `dist/headless.mjs` 2 lần với cùng đầu vào cho ra SHA-256 giống hệt nhau.
- **CP0-3 (3D Hello):** `npm run build:web` build thành công ứng dụng Three.js 3D hiển thị đảo đèn lồng + đom đóm điều khiển bởi `src/core/hello.ts`.
- **CP0-4 (Harness & Bảo mật):** Có `AGENTS.md`, skill `verify-phase`, git pre-commit hook, GitHub Actions CI, `.gitignore` chặn `.env`/key.

### Giả định kỹ thuật
- Chọn **Node.js 20+ / TypeScript / Three.js / Vite / Vitest** vì chạy đồng nhất trên Windows (máy phát triển) và macOS/Linux (máy chấm), không cần build native C++/OpenGL, headless chạy nhanh cho benchmark và đóng gói Release `v1.0.0` dưới dạng web tĩnh + Node CLI.

---

## Phase 1 (PRD-0)
*(Chờ phát hành đề Phase 1 từ Lab Board)*

## Phase 2 (Ticket-02)
*(Chờ phát hành đề Phase 2)*

## Phase 3 (Ticket-03)
*(Chờ phát hành đề Phase 3)*

## Phase 4 (Ticket-04)
*(Chờ phát hành đề Phase 4)*
