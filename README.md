# Đảo Đèn Lồng — Day 12 AI SDLC

> **Video demo:** *(Sẽ cập nhật link video `.mp4` dưới 5 phút tại Release `v1.0.0` ở Phase 4)*
> **Trạng thái hiện tại:** Checkpoint 0 (Chuẩn bị môi trường, kiến trúc 3D + headless tất định, harness AI và CI).

Game 3D góc nhìn thứ ba **Đảo Đèn Lồng** xây dựng bằng **TypeScript + Three.js + Vite + Node.js (headless) + Vitest**, tương thích **macOS, Linux và Windows**.

---

## Cài đặt & chạy nhanh (≤ 3 lệnh)

Yêu cầu: **Node.js ≥ 20** (`node -v`).

```bash
npm install
npm run build
npm run dev
```

Mở URL hiển thị trên terminal (mặc định `http://localhost:5173`) để xem bản 3D.

---

## Chạy chế độ Headless & Kiểm chứng

```bash
# Chạy chế độ headless (sau khi build)
npm run headless -- --ticks 60

# Chạy toàn bộ unit test & headless test
npm test

# Chạy bộ kiểm chứng đầy đủ (secret scan, typecheck, build, test, determinism)
npm run verify
```

---

## Cấu trúc dự án

```text
src/
  core/              Logic game thuần TypeScript (0 import DOM/Three.js, tất định 100%)
  headless/          CLI chạy không giao diện theo Test Contract
  client/            Giao diện 3D Three.js + HUD đọc trạng thái từ src/core/
tests/               Unit test, scenario headless & kiểm tra hồi quy
scripts/             Script build headless, verify & tạo bằng chứng tự động
docs/
  notes/             Giả định (assumptions.md), nhật ký AI & token (ai-log.md), retro (retro.md)
  proof/             Bảng truy vết yêu cầu -> bằng chứng thật khớp từng tag
AGENTS.md            Hướng dẫn ngắn gọn cho AI agent (cập nhật qua từng phase)
.agents/skills/      Skill quy trình kiểm chứng (verify-phase)
.githooks/           Pre-commit hook chặn lộ .env và chặn commit khi test đỏ
.github/workflows/   GitHub Actions CI chạy kiểm chứng tự động mỗi lần push
CREDITS.md           Ghi nguồn thư viện, asset và công cụ AI
LICENSE              Giấy phép MIT
CHANGELOG.md         Lịch sử thay đổi thiết kế & phiên bản
```

---

## Tài liệu Lab gốc

- [GUIDE.md](GUIDE.md) · [CHECKPOINTS.md](CHECKPOINTS.md) · [SUBMISSION.md](SUBMISSION.md) · [RULES.md](RULES.md) · [RUBRIC.md](RUBRIC.md)
- Lab board: [Đảo Đèn Lồng Lab](https://claude.ai/artifact/Q1RYyv1dxjUczzCbd2ZnoW)
