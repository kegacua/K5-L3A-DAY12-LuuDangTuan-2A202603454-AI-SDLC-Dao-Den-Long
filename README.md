# Đảo Đèn Lồng — Ba Hòn Đảo (Day 12 AI SDLC · Phase 3)

> **Video demo:** *(Sẽ cập nhật link video `.mp4` dưới 5 phút tại Release `v1.0.0` ở Phase 4)*
> **Trạng thái hiện tại:** Phase 3 — Ticket-03 Change Request ("Đèn cạn dầu") · Test Contract **v1.2**.

Game 3D góc nhìn thứ ba **Đảo Đèn Lồng**: điều khiển **Mây** vượt qua 3 Đêm (**Đảo Bến**, **Đảo Cau**, **Đảo Chuông**), thắp sáng & **châm dầu giữ đèn sáng tới bình minh**, ngăn **Bóng Mực hút dầu**, đối phó **Gió Lạc** và **Gió mạnh**. Chạy tốt trên **macOS, Linux và Windows**.

---

## Cài đặt & chạy nhanh (≤ 3 lệnh)

Yêu cầu: **Node.js ≥ 20**.

```bash
npm ci
npm run build
npm run dev
```

Mở URL hiển thị trên terminal (mặc định `http://localhost:5173`) để vào Menu chính.

---

## Điều khiển & Luật mới (Ticket-03 · Contract v1.2)

| Phím | Chức năng |
|---|---|
| `W` `A` `S` `D` / Phím mũi tên | Di chuyển Mây (`6.0 m/s`, `7.2 m/s` khi có Bùa Gió; điều khiển đầy đủ trên không) |
| `Space` | Nhảy (`7.0 m/s`, trọng lực `-20 m/s²`) |
| `Shift` | **Lướt (Dash)** — `14 m/s` trong `0.2 s`, hồi `1.5 s` (`0 s` khi có Bùa Gió) |
| `E` | **Tương tác Đèn Lồng:** nạp thắp mới (`10` đom đóm), thắp lại đèn đã tắt (`5` đom đóm), hoặc **châm dầu** đèn đang sáng (`+10` dầu/đom đóm) |
| `F` hoặc `Q` | **Tỏa Sáng** — tốn `3` đom đóm, bán kính 3D `5.0 m`, hồi `3.0 s` (`+5` điểm/Bóng Mực, **`+15`** nếu đang hút dầu `drain`) |
| `Esc` hoặc `P` | Tạm dừng / Tiếp tục (đóng băng toàn bộ thời gian, nhiên liệu đèn, hồi chiêu & sinh thực thể) |
| Kéo chuột hoặc `J` / `L` | Xoay camera 3D |

- **Luật thắng mới ("Giữ đảo sáng tới bình minh"):** Thời lượng Đêm 1/2/3 là `240 / 270 / 300 s`. Thắp hết đèn **không** thắng sớm — Mây phải sống sót tới hết giờ với tối thiểu `ceil(0.6 × tổng đèn)` đang sáng (**3/5** Đêm 1, **4/6** Đêm 2, **5/7** Đêm 3).
- **Nhiên liệu đèn & Bóng Mực hút dầu:** Đèn sáng hao `1.0` dầu/giây (bắt đầu ở `100`). Dưới `30` dầu, đèn nhấp nháy `1 Hz`, **mất vùng an toàn**, và Bóng Mực `wander` sẽ tiến vào hút `5` dầu/giây (`drain`). Hết dầu đèn tắt (`lantern_out`) và chỉ cần `5` đom đóm để thắp lại.
- **Sức chứa tăng dần:** `10 + 2 × số lần thắp thành công` (tối đa `20`), hiển thị động trên HUD.
- **Chế độ mù màu ("Bảng màu dễ phân biệt"):** Bật trong **Cài đặt** (lưu `localStorage`): mắt/viền Bóng Mực đổi sang `#00B3FF`, cảnh báo UI sang `#FFFFFF` kèm `⚠`, đèn tắt luôn có hình dáng xẹp 20% + vết rách giấy phân biệt không cần màu.

---

## Cách tính điểm (Ticket-03 · Contract v1.2)

- **Mỗi đom đóm nạp vào đèn (thắp mới / thắp lại / châm dầu):** `+5` điểm
- **Thắp đèn lần đầu:** `+100` điểm · **Thắp lại:** `+40` điểm
- **Tỏa Sáng trúng Bóng Mực:** `+5` điểm/con (**`+15`** nếu ngay trước đó đang `drain`)
- **Thưởng bình minh (khi thắng `dawn_survived`):** `+50 + floor(fuel)` cho mỗi đèn đang sáng + `+50` cho mỗi Ngọn Lửa còn lại *(bỏ thưởng thời gian)*.

---

## Chạy chế độ Headless (Test Contract v1.2) & Kiểm chứng

```bash
node dist/headless.mjs --seed 42 --night 1 --ticks 600 --out night1.jsonl --snapshot-every 10
npm test
npm run verify -- --phase phase-3
```

---

## Tài liệu, ADR, Bằng chứng & Harness AI

- **Khai báo Contract v1.2:** [game.contract.json](game.contract.json)
- **ADR Quyết định thiết kế Phase 3:** [docs/notes/adr-001-lantern-fuel-and-dawn-win.md](docs/notes/adr-001-lantern-fuel-and-dawn-win.md)
- **Breaking Changes & Lịch sử:** [CHANGELOG.md](CHANGELOG.md)
- **Bằng chứng & truy vết:** [docs/proof/README.md](docs/proof/README.md) · [docs/proof/phase-3-verify.log](docs/proof/phase-3-verify.log)
- **Spec, Giả định & Nhật ký AI/Token:** [docs/notes/assumptions.md](docs/notes/assumptions.md) · [docs/notes/ai-log.md](docs/notes/ai-log.md) · [docs/notes/retro.md](docs/notes/retro.md)
- **Harness AI:** [AGENTS.md](AGENTS.md) · [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md) · [.githooks/pre-commit](.githooks/pre-commit) · [.github/workflows/ci.yml](.github/workflows/ci.yml)
