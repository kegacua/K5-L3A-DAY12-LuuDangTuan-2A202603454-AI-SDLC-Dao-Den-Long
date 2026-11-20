# Đảo Đèn Lồng — Day 12 AI SDLC (Phase 1)

> **Video demo:** *(Sẽ cập nhật link video `.mp4` dưới 5 phút tại Release `v1.0.0` ở Phase 4)*
> **Trạng thái hiện tại:** Phase 1 — Đêm 1: Đảo Bến (PRD-0 & Test Contract v1.0).

Game 3D góc nhìn thứ ba **Đảo Đèn Lồng**: điều khiển **Mây** (đội nón lá có treo đèn lồng nhỏ) gom đom đóm, thắp sáng 5 Đèn Lồng Lớn trên **Đảo Bến**, dùng **Tỏa sáng** xua **Bóng Mực** và bảo vệ ngọn lửa của mình trước khi hết đêm. Chạy được trên **macOS, Linux và Windows**.

---

## Cài đặt & chạy nhanh (≤ 3 lệnh)

Yêu cầu: **Node.js ≥ 20**.

```bash
npm ci
npm run build
npm run dev
```

Mở URL hiển thị trên terminal (mặc định `http://localhost:5173`) để chơi ngay.

---

## Điều khiển trong game

| Phím | Chức năng |
|---|---|
| `W` `A` `S` `D` / Phím mũi tên | Di chuyển Mây theo hướng camera |
| `Space` | Nhảy |
| `E` | Nạp đom đóm vào Đèn Lồng Lớn gần nhất (trong bán kính `3.0 m`) |
| `F` hoặc `Q` | Tỏa sáng xua & làm choáng Bóng Mực (tốn `1` đom đóm, bán kính `8.0 m`, hồi `1.5 s`) |
| Kéo chuột hoặc `J` / `L` | Xoay camera 3D quanh Mây |
| `M` | Bật/tắt âm thanh |
| `R` | Chơi lại Đêm 1 ngay lập tức |

---

## Cách tính điểm

Thông số khớp 100% với [game.contract.json](game.contract.json):
- **Nhặt 1 đom đóm:** `+10` điểm (`per_mote`)
- **Thắp sáng 1 Đèn Lồng Lớn (cần 3 đom đóm):** `+100` điểm (`per_lantern`)
- **Tỏa sáng làm choáng 1 Bóng Mực:** `+25` điểm / Bóng Mực (`per_stun`)
- **Thưởng khi thắng (thắp đủ 5/5 đèn):**
  - `+2` điểm cho mỗi giây còn lại nguyên (`Math.floor(time_left_s) * per_second_left`)
  - `+50` điểm cho mỗi ngọn lửa còn lại (`flames * per_flame_left`)

> **Lưu ý về `fall_enabled`:** Đặt `false` trong [game.contract.json](game.contract.json) — rìa Đảo Bến có ranh giới mây giữ Mây không rơi khỏi đảo, nên sự kiện `player_hit` với `"by": "fall"` không xảy ra.

---

## Chạy chế độ Headless (Test Contract v1.0) & Kiểm chứng

```bash
# Chạy headless chuẩn Test Contract v1.0
node dist/headless.mjs --seed 42 --night 1 --ticks 600 --out out.jsonl --snapshot-every 10

# Chạy kèm scenario & inputs mẫu
node dist/headless.mjs --seed 42 --night 1 \
  --scenario tests/scenarios/win-all-lit.scenario.json \
  --inputs tests/scenarios/win-all-lit.inputs.json \
  --ticks 300 --out win.jsonl

# Chạy toàn bộ unit test & contract test
npm test

# Chạy cổng kiểm chứng đầy đủ + kiểm tra tính tất định SHA-256
npm run verify -- --phase phase-1
```

---

## Sáng tạo của tôi (không ảnh hưởng Headless / Test Contract)

Toàn bộ phần mở rộng sáng tạo chỉ nằm ở lớp hiển thị & âm thanh `src/client/` (hoàn toàn không được import vào `src/core/` và `src/headless/`):
1. **Âm thanh cổ tích tổng hợp bằng Web Audio API (`src/client/audio.ts`):** tiếng chuông gió nâng cao dần khi nhặt đom đóm, hợp âm ấm khi thắp sáng Đèn Lồng Lớn, tiếng sóng ánh sáng khi tỏa sáng — không cần tải file âm thanh ngoài, bật/tắt bằng phím `M`.
2. **Hiệu ứng biển mây trôi & tia lửa đèn lồng (`src/client/main.ts`):** biển mây xoay nhẹ dưới chân Đảo Bến, cột ánh sáng định hướng mờ cho các đèn chưa thắp, vòng vàng đánh dấu vùng an toàn (`safe_radius = 6 m`) quanh đèn đã thắp, và tàn lửa vàng bay lên trời mỗi khi một Đèn Lồng Lớn được thắp sáng.
3. **Bằng chứng không phá lõi:** [tests/architecture.test.ts](tests/architecture.test.ts) tự động chặn mọi import `three`/DOM trong `src/core/`, và [docs/proof/phase-1-verify.log](docs/proof/phase-1-verify.log) xác nhận toàn bộ 18 test & kiểm tra tính tất định SHA-256 đều đạt.

---

## Tài liệu, Bằng chứng & Harness AI

- **Khai báo Contract:** [game.contract.json](game.contract.json)
- **Bằng chứng & truy vết:** [docs/proof/README.md](docs/proof/README.md) · [docs/proof/phase-1-verify.log](docs/proof/phase-1-verify.log)
- **Giả định & Nhật ký AI/Token:** [docs/notes/assumptions.md](docs/notes/assumptions.md) · [docs/notes/ai-log.md](docs/notes/ai-log.md) · [docs/notes/retro.md](docs/notes/retro.md)
- **Harness AI:** [AGENTS.md](AGENTS.md) · [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md) · [.githooks/pre-commit](.githooks/pre-commit) · [.github/workflows/ci.yml](.github/workflows/ci.yml)
- **Bản quyền & Thay đổi:** [LICENSE](LICENSE) · [CREDITS.md](CREDITS.md) · [CHANGELOG.md](CHANGELOG.md)
- **Tài liệu Lab gốc:** [GUIDE.md](GUIDE.md) · [CHECKPOINTS.md](CHECKPOINTS.md) · [SUBMISSION.md](SUBMISSION.md) · [RULES.md](RULES.md) · [RUBRIC.md](RUBRIC.md)
