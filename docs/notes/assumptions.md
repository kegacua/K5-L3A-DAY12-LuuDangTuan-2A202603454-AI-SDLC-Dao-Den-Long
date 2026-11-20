# Giả định, Tiêu chí nghiệm thu & Thay đổi thiết kế

> Ghi lại rõ các yêu cầu bắt buộc, giả định cho chỗ mơ hồ, tiêu chí nghiệm thu kiểm chứng được, và mọi thay đổi thiết kế qua từng phase.

---

## Checkpoint 0 — Chuẩn bị môi trường

### Mục tiêu & Tiêu chí nghiệm thu
- **CP0-1 (Đa nền tảng & ≤ 3 lệnh):** Clone sạch trên macOS/Linux/Windows có Node.js 20+, chạy `npm install`, `npm run build`, `npm run headless` (hoặc `npm run dev`) thành công.
- **CP0-2 (Tách lõi & tính tất định):** `src/core/` không import `three`/DOM; chạy headless 2 lần với cùng đầu vào cho ra SHA-256 giống hệt nhau.
- **CP0-3 (3D Hello):** `npm run build:web` build thành công ứng dụng Three.js 3D.
- **CP0-4 (Harness & Bảo mật):** Có `AGENTS.md`, skill `verify-phase`, git pre-commit hook, GitHub Actions CI, `.gitignore` chặn `.env`/key.

### Giả định kỹ thuật
- Chọn **Node.js 20+ / TypeScript / Three.js / Vite / Vitest** vì chạy đồng nhất trên Windows và macOS/Linux, không cần biên dịch native C++/OpenGL, headless chạy nhanh cho benchmark và dễ đóng gói bản phát hành web tĩnh + CLI.

---

## Phase 1 — PRD-0 & Test Contract v1.0

### Tiêu chí nghiệm thu kiểm chứng được
- **P1-1 (`game.contract.json`):** Khai báo đúng schema v1.0 ở gốc repo; `src/core/config.ts` import trực tiếp `game.contract.json` để đảm bảo thông số code và contract không bao giờ lệch nhau (được kiểm tra tự động bởi `tests/architecture.test.ts`).
- **P1-2 (Di chuyển, xoay camera & nhảy):** Di chuyển theo đúng công thức xoay `cam_yaw_deg` (`x' = x·cosθ + z·sinθ`, `z' = −x·sinθ + z·cosθ`), chuẩn hóa vector `> 1`, vận tốc `6.0 m/s`; nhảy theo cạnh lên `false -> true` với trọng lực và hạ cánh tại `y = 0`.
- **P1-3 (Đom đóm & nạp đèn):** Tự nhặt đom đóm trong `pickup_radius = 1.8 m` (mặt phẳng XZ) khi `carried < 5`, phát `mote_picked`, cộng `+10`. Nhấn `interact` (`false -> true`) trong `interact_radius = 3.0 m` nạp vào đèn chưa sáng gần nhất, phát `deposit`; đủ `3` phát `lantern_lit`, cộng `+100`. Đủ 5/5 đèn -> `won` (`all_lit`) + thưởng thời gian & ngọn lửa.
- **P1-4 (Bóng Mực, vùng an toàn & Tỏa sáng):** Bóng Mực đuổi Mây với `shade_speed = 4.2 m/s`, **không bao giờ vào trong `safe_radius = 6.0 m`** của đèn đã sáng (`lit: true`). Tỏa sáng (`pulse` cạnh lên) tốn `1` đom đóm, hồi `1.5 s`, làm choáng (`stunned`) `3.0 s` và đẩy lùi `6.0 m` mọi Bóng Mực trong `8.0 m`, phát `pulse` và cộng `+25` mỗi con.
- **P1-5 (Sát thương & Thua):** Chạm Bóng Mực (không bị choáng) trong `shade_hit_radius = 1.2 m` khi hết `invuln_s = 2.0 s` làm mất `1` ngọn lửa, rơi `Math.round(carried * 0.5)` đom đóm, phát `player_hit`. Về `0` lửa -> `lost` (`no_flames`). Hết `time_left_s` -> `lost` (`dawn`).
- **P1-6 (Headless CLI & tính tất định):** Đúng toàn bộ cờ CLI (`--seed`, `--night`, `--scenario`, `--inputs`, `--ticks`, `--out`, `--snapshot-every`), mã thoát `0` / `2` (sai định dạng file) / `1` (lỗi khác), tọa độ làm tròn 3 chữ số thập phân, 2 lần chạy cùng seed khớp SHA-256 100%.
- **P1-7 (Trải nghiệm 3D & chơi lại):** Đảo Bến tròn có 5 Đèn Lồng Lớn, Mây đội nón lá treo đèn lồng nhỏ, đảo sáng dần theo số đèn đã thắp, HUD đủ thông tin và nút/phím `R` chơi lại sau khi thắng/thua.

### Giả định cho các chỗ mơ hồ trong PRD-0
1. **Kích thước đảo & ranh giới (`fall_enabled: false`):** Đảo Bến có bán kính mặc định `60 m` (5 đèn đặt đều ở bán kính `25 m`, `L1` tại `[0, 0, 25]`). Mây bị giữ trong đảo nên không có rơi khỏi đảo (`fall_enabled: false`). Khi chạy scenario đặt thực thể xa hơn `35 m`, bán kính logic tự mở rộng thành `maxDist + 25` để không làm méo kịch bản kiểm thử.
2. **Làm tròn đom đóm đánh rơi (`hit_drop_ratio: 0.5`):** Dùng `Math.round(carried * hit_drop_ratio)` (`0->0, 1->1, 2->1, 3->2, 4->2, 5->3`). Đom đóm bị rơi bị mất khỏi túi (không tự sinh thêm entity mới trên đảo) để giữ `motes_active` hoàn toàn dự đoán được khi `random_motes: false`.
3. **Vùng an toàn `safe_radius`:** Chỉ áp dụng cho các Đèn Lồng Lớn **đã được thắp sáng (`lit: true`)**. Khi một đèn vừa được thắp sáng, mọi Bóng Mực đang ở trong `safe_radius` bị đẩy ngay ra mép ngoài (`safe_radius + 0.05 m`).
4. **Thưởng thời gian khi thắng:** Tính theo số giây nguyên còn lại `Math.floor(time_left_s) * per_second_left` để điểm số luôn là số nguyên sạch.
5. **Sinh ngẫu nhiên (khi `random_motes` / `random_shades` là `true`):** Khởi tạo `15` đom đóm (tối đa `18`, hồi mỗi `3 s`) và `2` Bóng Mực (tối đa `4`, sinh thêm mỗi `15 s` cách Mây tối thiểu `16 m` và ngoài vùng an toàn đèn sáng), dùng PRNG Mulberry32 thuần tất định theo `--seed`.
6. **Gỡ bỏ test CP0 hello cũ:** Các file `src/core/hello.ts`, `tests/core.hello.test.ts`, `tests/headless.smoke.test.ts` của bước chuẩn bị CP0 đã được thay thế hoàn toàn bởi mô phỏng Phase 1 thật (`src/core/simulation.ts`) và bộ 18 test (`tests/architecture.test.ts`, `tests/simulation.unit.test.ts`, `tests/headless.contract.test.ts`).

---

## Phase 2 (Ticket-02)
*(Chờ phát hành đề Phase 2)*

## Phase 3 (Ticket-03)
*(Chờ phát hành đề Phase 3)*

## Phase 4 (Ticket-04)
*(Chờ phát hành đề Phase 4)*
