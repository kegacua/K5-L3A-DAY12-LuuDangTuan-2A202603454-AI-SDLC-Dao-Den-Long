# Changelog

## [Unreleased]

## [phase-3] — Ticket-03 Change Request "Đèn cạn dầu" (Contract v1.2)

### Breaking Changes (Thay đổi phá vỡ tương thích so với Contract v1.1 / Phase 2)
- **`contract_version` nâng lên `"1.2"`**; bổ sung khóa tuning `fuel_max: 100`, `fuel_decay_per_s: 1.0`, `fuel_per_mote: 10`, `relight_cost: 5`, `win_ratio: 0.6`, `drain_per_s: 5`, `low_fuel_threshold: 30`, `capacity_max: 20`.
- **Thời lượng Đêm rút ngắn:** Đêm 1/2/3 đổi từ `300/330/360 s` → **`240/270/300 s`**.
- **Luật thắng thay thế hoàn toàn:** Bỏ thắng sớm `all_lit` khi thắp hết đèn; chuyển sang thắng khi sống sót tới bình minh với số đèn sáng `>= ceil(0.6 × tổng đèn)` (`reason: "dawn_survived"`).
- **Công thức điểm thay thế hoàn toàn:** `+5` mỗi đom đóm nạp/châm dầu (trước là `+10`), `+100` thắp lần đầu, `+40` thắp lại, `+5` Tỏa Sáng Bóng Mực thường / **`+15`** nếu đang `drain`, bình minh thưởng `+50 + floor(fuel)` mỗi đèn sáng + `+50` mỗi Ngọn Lửa, **bỏ thưởng thời gian (`per_second_left: 0`)**.
- **Nhiên liệu đèn & Tương tác đèn sáng:** Đèn sáng hao `1.0/s` (lưu nguyên `1/60`), hết dầu tắt (`lantern_out`, `deposited = 0`, `ever_lit = true`), thắp lại chỉ tốn `5` đom đóm; tương tác đèn đang sáng chưa đầy dầu sẽ châm dầu (`refuel`).
- **Vùng an toàn & Trạng thái Bóng Mực `drain`:** Đèn `fuel < 30` mất vùng an toàn; Bóng Mực `wander` ưu tiên tìm đèn sáng `< 30` dầu để hút `5/s` (`state: "drain"`, phát `fuel_drain` mỗi 60 tick); hết choáng luôn về `wander`.
- **Schema Snapshot/Event/Scenario v1.2:** Snapshot đèn thêm `fuel` (1 chữ số thập phân), `ever_lit`, `relit_count`; `player` thêm `capacity`; `lantern_lit` thêm `relight: true|false`; sự kiện mới `refuel`, `lantern_out`, `fuel_drain`; `game_over.reason` dùng `dawn_survived` thay `all_lit`.

### Tính năng mới & Cải tiến
- **Sức chứa tăng dần:** `capacity = min(20, 10 + 2 * successful_lights)` hiển thị động trên HUD (`đang mang / sức chứa`).
- **Chế độ mù màu ("Bảng màu dễ phân biệt"):** Lưu trong `localStorage`; đổi mắt/viền Bóng Mực sang `#00B3FF`, cảnh báo UI sang `#FFFFFF` kèm `⚠`; đèn tắt xẹp 20% + vết rách giấy (phân biệt không cần màu); đèn đang sáng có thanh dầu 3D và nhấp nháy 1 Hz khi `fuel < 30`.
- **Tài liệu & Di trú test:** Thêm [docs/notes/adr-001-lantern-fuel-and-dawn-win.md](docs/notes/adr-001-lantern-fuel-and-dawn-win.md); xóa bộ scenario `win-all-lit.*` đã bị luật mới thay thế và thay bằng 3 bộ scenario Phase 3 (`p3-dawn-survived`, `p3-fuel-refuel-relight`, `p3-shade-drain-pulse`).

## [phase-2] — Ticket-02 "Ba hòn đảo" (Contract v1.1)
- Nâng cấp `game.contract.json` lên Contract v1.1, bản đồ 3 Đêm (Đảo Bến, Đảo Cau, Đảo Chuông), Lướt, rơi khỏi đảo & hồi sinh, Gió Lạc, Bùa Gió, Gió mạnh, Tạm dừng/Tiếp tục, chuỗi 3 Đêm, bảng màu chuẩn & nhạc nền/SFX.

## [phase-1] — Đêm 1: Đảo Bến (PRD-0 & Test Contract v1.0)
- Triển khai lõi mô phỏng 60Hz tất định, CLI headless Contract v1.0, game 3D Đảo Bến, 19 test tự động và đánh giá chéo độc lập.

## [CP0] — Chuẩn bị môi trường & bộ khung AI SDLC
- Khởi tạo stack `TypeScript + Three.js + Vite + Node headless + Vitest`, AI Harness, pre-commit hook và GitHub Actions CI.
