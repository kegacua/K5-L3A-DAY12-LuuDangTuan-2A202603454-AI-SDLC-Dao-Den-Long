# Đảo Đèn Lồng — Ba Hòn Đảo (Day 12 AI SDLC · Phase 2)

> **Video demo:** *(Sẽ cập nhật link video `.mp4` dưới 5 phút tại Release `v1.0.0` ở Phase 4)*
> **Trạng thái hiện tại:** Phase 2 — Ticket-02 ("Ba hòn đảo") · Test Contract v1.1.

Game 3D góc nhìn thứ ba **Đảo Đèn Lồng**: theo chân **Mây** vượt qua chuỗi 3 Đêm trên ba hòn đảo (**Đêm 1: Đảo Bến**, **Đêm 2: Đảo Cau**, **Đêm 3: Đảo Chuông**), gom đom đóm thắp sáng toàn bộ Đèn Lồng Lớn, dùng **Lướt**, **Tỏa Sáng**, **Bùa Gió** và **bục nhảy** để đối phó **Bóng Mực**, **Gió Lạc** và **Gió mạnh**. Chạy tốt trên **macOS, Linux và Windows**.

---

## Cài đặt & chạy nhanh (≤ 3 lệnh)

Yêu cầu: **Node.js ≥ 20**.

```bash
npm ci
npm run build
npm run dev
```

Mở URL hiển thị trên terminal (mặc định `http://localhost:5173`) để vào Menu chính và chơi chuỗi 3 Đêm.

---

## Điều khiển trong game

| Phím | Chức năng |
|---|---|
| `W` `A` `S` `D` / Phím mũi tên | Di chuyển Mây (`6.0 m/s`, `7.2 m/s` khi có Bùa Gió; điều khiển đầy đủ trên không) |
| `Space` | Nhảy (`7.0 m/s`, trọng lực `-20 m/s²`, chỉ nhảy khi chạm đất) |
| `Shift` | **Lướt (Dash)** — `14 m/s` trong `0.2 s`, hồi `1.5 s` (`0 s` khi có Bùa Gió); giữ độ cao trên không |
| `E` | Nạp đom đóm vào Đèn Lồng Lớn chưa sáng gần nhất (bán kính `2.0 m`, cần `10` đom đóm/đèn) |
| `F` hoặc `Q` | **Tỏa Sáng** — tốn `3` đom đóm, bán kính 3D `5.0 m`, hồi `3.0 s`; choáng Bóng Mực `120` tick & đẩy `4 m`; đẩy Gió Lạc & làm rơi đom đóm bị cướp |
| `Esc` hoặc `P` | Tạm dừng / Tiếp tục (đóng băng hoàn toàn logic game) |
| Kéo chuột hoặc `J` / `L` | Xoay camera 3D (chỉnh độ nhạy chuột & âm lượng trong Cài đặt, tự lưu qua `localStorage`) |

---

## Cách tính điểm (chuẩn hóa Ticket-02)

Khớp 100% với [game.contract.json](game.contract.json) (Contract v1.1):
- **Mỗi đom đóm nạp vào Đèn Lồng Lớn:** `+10` điểm
- **Thắp sáng 1 Đèn Lồng Lớn (đủ 10 đom đóm):** `+100` điểm
- **Mỗi Bóng Mực trúng Tỏa Sáng (kể cả đang choáng):** `+5` điểm
- **Thưởng khi thắng Đêm:** `+ floor(giây còn lại) × 2 + 50 × Ngọn Lửa còn lại`
- **Tổng điểm hành trình:** tổng điểm các Đêm đã thắng (hiển thị tại màn hình Bình Minh sau Đêm 3).

---

## Chạy chế độ Headless (Test Contract v1.1) & Kiểm chứng

```bash
# Chạy headless cho Đêm 1, 2 hoặc 3
node dist/headless.mjs --seed 42 --night 1 --ticks 600 --out night1.jsonl --snapshot-every 10
node dist/headless.mjs --seed 42 --night 2 --ticks 600 --out night2.jsonl
node dist/headless.mjs --seed 2026 --night 3 --ticks 21600 --out night3.jsonl

# Chạy toàn bộ unit test, Phase 1 regression & Phase 2 scenario tests
npm test

# Chạy cổng kiểm chứng đầy đủ (typecheck, build, test, determinism 3 Đêm & benchmark 21.600 tick <= 30s)
npm run verify -- --phase phase-2
```

---

## Sáng tạo của tôi (không ảnh hưởng Headless / Test Contract)

Mọi bổ sung sáng tạo chỉ nằm trong lớp hiển thị/âm thanh `src/client/` (bị cách ly hoàn toàn khỏi `src/core/` bởi `tests/architecture.test.ts`):
1. **Nhạc nền ngũ cung & hiệu ứng âm thanh thủ tục (`src/client/audio.ts`):** nhạc nền đêm ngũ cung tổng hợp bằng Web Audio API + đủ 10+ hiệu ứng âm thanh (nhặt, nạp, thắp đèn, tỏa sáng, nhảy, lướt, bùa, bị đánh, Bóng Mực xuất hiện, Gió Lạc cướp, cảnh báo gió, đếm ngược 10 giây cuối, thắng/thua).
2. **Màn hình cốt truyện Ông Đăng & chỉ báo trực quan:** lời dặn của Ông Đăng trước mỗi hòn đảo, lá vàng bay theo hướng gió báo trước 2 giây trên Đảo Chuông, và đồng hồ FPS trực tiếp trên HUD.

---

## Tài liệu, Bằng chứng & Harness AI

- **Khai báo Contract v1.1:** [game.contract.json](game.contract.json)
- **Bằng chứng & truy vết:** [docs/proof/README.md](docs/proof/README.md) · [docs/proof/phase-2-verify.log](docs/proof/phase-2-verify.log)
- **Spec, Giả định & Nhật ký AI/Token:** [docs/notes/assumptions.md](docs/notes/assumptions.md) · [docs/notes/ai-log.md](docs/notes/ai-log.md) · [docs/notes/retro.md](docs/notes/retro.md)
- **Harness AI:** [AGENTS.md](AGENTS.md) · [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md) · [.githooks/pre-commit](.githooks/pre-commit) · [.github/workflows/ci.yml](.github/workflows/ci.yml)
- **Bản quyền & Thay đổi:** [LICENSE](LICENSE) · [CREDITS.md](CREDITS.md) · [CHANGELOG.md](CHANGELOG.md)
