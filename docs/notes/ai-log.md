# Nhật ký dùng AI, Token & Cập nhật Harness

> Theo dõi công cụ AI, ước tính token/chi phí mỗi phase, cách tiết kiệm token, các lỗi của AI và cách cập nhật harness để không lặp lại.

---

## Tổng hợp Token & Chi phí ước tính

| Phase | Công cụ AI | Số lượt chính | Ước tính Token (In / Out) | Chi phí ước tính | Cách tiết kiệm token |
|---|---|---:|---|---|---|
| CP0 | Antigravity (IDE agent) | ~4 | ~12k / ~6k | Trong gói tài khoản (~\$0.05 nếu tính API) | Đọc song song 6 file lab một lượt; giữ `AGENTS.md` ngắn (< 40 dòng); gom batch ghi file song song; dùng script tự verify thay vì hỏi AI lặp lại |
| Phase 1 | *(cập nhật sau)* | | | | |
| Phase 2 | *(cập nhật sau)* | | | | |
| Phase 3 | *(cập nhật sau)* | | | | |
| Phase 4 | *(cập nhật sau)* | | | | |

---

## Nhật ký theo Phase

### Checkpoint 0 (Chuẩn bị)
- **Việc AI làm:** Đọc hiểu 6 file hướng dẫn lab, kiểm tra môi trường máy (`node v20.8.1`, `npm 10.2.4`, `python 3.11.0`, `git 2.42.0`), đề xuất stack TypeScript + Three.js + Node headless, dựng bộ khung CP0 (hello 3D, headless CLI, test, script `verify.mjs`, CI, pre-commit hook, tài liệu).
- **Lỗi AI / Điểm cần lưu ý:** Không bịa yêu cầu game khi chưa có PRD-0; chủ động dừng lại xác nhận dựng CP0 trước.
- **Cập nhật Harness:** Khởi tạo `AGENTS.md`, `.agents/skills/verify-phase/SKILL.md`, `.githooks/pre-commit`, `.github/workflows/ci.yml`.
- **Kiểm chứng:** Chạy thật `npm run verify -- --phase cp0` và kiểm tra clone sạch.

### Phase 1 — Evaluation & AI Error Log
*(Cập nhật cuối Phase 1)*

### Phase 2 — Evaluation & AI Error Log
*(Cập nhật cuối Phase 2)*

### Phase 3 — Evaluation & AI Error Log
*(Cập nhật cuối Phase 3)*

### Phase 4 — Evaluation & AI Error Log
*(Cập nhật cuối Phase 4)*
