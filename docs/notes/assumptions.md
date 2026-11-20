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

## Phase 2 — Ticket-02 "Ba hòn đảo" (Contract v1.1)

### Thay đổi yêu cầu từ Phase 1 → Phase 2 (có lý do cập nhật test cũ)
- **Chuẩn hóa hằng số (`game.contract.json` v1.1):** Ticket-02 thay thế các giá trị tự chọn ở Phase 1 bằng bộ số chuẩn (`carry_capacity: 10`, `lantern_cost: 10`, `pickup_radius: 1.0`, `interact_radius: 2.0`, `pulse_cost: 3`, `pulse_radius: 5.0` 3D, `pulse_stun_s: 2.0`, `pulse_push_m: 4.0` trong 15 tick, `pulse_cooldown_s: 3.0`, `invuln_s: 1.5`, `shade_speed: 4.0/4.5`, `shade_hit_radius: 1.0`, `fall_enabled: true`).
- **Thay đổi cách tính điểm & rơi đom đóm:** Điểm `+10` chuyển từ `mote_picked` sang `deposit` (`+10` mỗi đom đóm nạp); `per_stun` đổi từ `25` → `5`; đánh rơi đổi từ `Math.round` sang `Math.floor(carried / 2)` rơi ra vành `1.5–2.5 m` (TTL 480 tick, nhặt lại từ tick sau). Toàn bộ test hồi quy Phase 1 (`tests/simulation.unit.test.ts`, `tests/scenarios/win-all-lit.*`, `tests/scenarios/pulse-safe-zone.*`) đã được cập nhật đúng theo số chuẩn mới, giữ nguyên kiểm tra logic lõi.
- **Đảo Bến R=40 m & Đảo Chuông điểm xuất phát:** Đêm 1 cố định bán kính `40 m` (bỏ mở rộng bán kính tự động của Phase 1 vì `fall_enabled: true`). Đêm 3 có Tháp Chuông (r ≤ 2) và Tầng 2 ở tâm `(0, 0, 0)`, nên mặc định điểm xuất phát Đêm 3 đặt tại `[0, 0, -10]` (Tầng 0 mở, phía nam Tầng 2) khi scenario không chỉ định `player.pos`.
- **Sự kiện `night_start`:** Phát một lần ở `sim_tick === 1` (`tick >= 1`) để tuân thủ tuyệt đối quy ước "dựng scenario tick 0 không phát sự kiện" và mọi sự kiện xảy ra ở bước `k` mang `tick = k + 1`.

### Acceptance Criteria (bao gồm từng mục ở Phần 1, 2, 3 & 4)
- **P2-1 (Contract v1.1 & Số chuẩn):** `game.contract.json` bản `1.1` khớp 100% hằng số Phần 1 + thêm `dash_*`, `night2_duration_s`, `night3_duration_s`; được khóa cứng bằng `tests/architecture.test.ts`.
- **P2-2 (Thứ tự 12 bước & Tạm dừng):** Nhấn `pause` (`Esc`/`P`) đóng băng `sim_tick`, `time_left_s`, hồi chiêu, TTL, spawn và ghi `state: "paused"`, phát `paused`/`resumed` đúng thứ tự bước 1.
- **P2-3 (Lướt — Dash):** Nhấn `Shift` (`dash` `false -> true`) lướt `14 m/s` trong `12` tick (`0.2 s`), hồi `90` tick (`1.5 s` từ lúc bắt đầu), giữ độ cao khi lướt trên không, không bất tử, phát `dash {}`.
- **P2-4 (Rơi khỏi đảo & Hồi sinh):** Khi `Y < -10`, bỏ qua bất tử, trừ `1` Ngọn Lửa, mất toàn bộ đom đóm, phát `player_hit {by:"fall", flames, dropped:0, lost}` đúng 1 lần; chờ `60` tick rồi hồi sinh tại điểm xuất phát với `90` tick bất tử (nếu về `0` lửa thì thua ngay `no_flames`).
- **P2-5 (Đom đóm rơi & Vùng an toàn):** Bị Bóng Mực đánh rơi `floor(carried/2)` đom đóm (`kind: "dropped"`, TTL `480` tick, nhặt lại từ tick sau) ra vành `1.5–2.5 m`; Bóng Mực ở trong vùng `6 m` khi đèn vừa thắp bị đẩy ra trong `<= 30` tick và không gây sát thương trong lúc đó.
- **P2-6 (Bản đồ 3 Đêm — Đảo Bến, Đảo Cau, Đảo Chuông):**
  - Đêm 1: R=40, 5 đèn, 24 điểm đom đóm, 12 điểm Bóng Mực (2 lúc tick 300, mỗi 480 tick, tối đa 6).
  - Đêm 2: 2 đảo R=28 tại `(0,0)` & `(70,0)`, cầu tre `x∈[26,44], z∈[-2,2]`, 2 bục nhảy `(20,0,18)` & `(50,0,-18)` phóng sang đảo kia, 6 đèn, 1 Bùa Gió `C1(35,0,0)`.
  - Đêm 3: R=45, 3 tầng (`Y=0/3/6`), vách đứng không leo được, 2 dốc rộng 3m ở `30°/150°` (`r=30→24`), bục nhảy `(0,3,13)` đáp Tầng 2, Tháp Chuông R=2 H=8, 7 đèn, 2 Bùa Gió `C1/C2`, Gió mạnh chu kỳ 30s (báo trước 2s, thổi 5s đẩy `2 m/s`).
- **P2-7 (Gió Lạc — Drifters):** Xuất hiện Đêm 2 & 3 (tối đa 2, tick `1200, 2400, ...`); `idle (2m/s)` → `chase (7m/s)` khi `carried >= 5` & `dist <= 15m`; chạm `XZ <= 1.2m` cướp `min(3, carried)` bỏ qua bất tử & vùng an toàn (`drifter_steal`), chạy `flee` 240 tick rồi `removed`; bị Tỏa Sáng lúc `chase` → `flee`, lúc `flee` đang mang đồ → rơi hết đom đóm (`drifter_drop`) và biến mất sau 120 tick.
- **P2-8 (Bùa Gió — Charms):** Nhặt theo luật đom đóm (`charm_picked`), hiệu lực `600` tick (làm mới khi nhặt lại): tốc độ `7.2 m/s`, hồi Lướt `0s` (bỏ qua bấm khi đang lướt), xuất hiện lại sau `2700` tick.
- **P2-9 (Chuỗi 3 Đêm, Tạm dừng & Cài đặt):** Menu chính → Giới thiệu Đêm (tên đảo + lời Ông Đăng) → Chơi → Kết quả → Đêm tiếp theo → Màn hình Bình Minh tổng điểm 3 Đêm; Menu Tạm dừng (`Esc`/`P`); Cài đặt âm lượng & độ nhạy chuột lưu qua `localStorage`.
- **P2-10 (Âm thanh, Bảng màu chuẩn & HUD đầy đủ):** Nhạc nền đêm + đủ SFX (nhặt, thắp đèn, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10s cuối); bảng màu Hex khớp bảng chuẩn Ticket-02; cường độ ánh sáng môi trường `0.15 + 0.55 × (lit/total)`; HUD đầy đủ (Ngọn Lửa, đồng hồ đỏ nhấp nháy `<= 30s`, đèn `k/n` + điểm, thanh 10 ô đom đóm, hồi chiêu Lướt & Tỏa Sáng, nhắc `"E — Nạp ánh sáng (x/10)"`, mũi tên chỉ đèn ngoài màn hình).
- **P2-11 (Hiệu năng Headless & 3D):** Full Đêm 3 (`21.600` tick) xong trong `<= 30s` (thực đo `~0.6s`); renderer tối ưu chia sẻ geometry/material đom đóm và giới hạn pixelRatio `<= 1.5` để đạt `>= 30 FPS` ở 1280×720.

## Phase 3 — Ticket-03 Change Request "Đèn cạn dầu" (Contract v1.2)

> Xem quyết định kiến trúc chi tiết tại [adr-001-lantern-fuel-and-dawn-win.md](adr-001-lantern-fuel-and-dawn-win.md) và danh sách Breaking Changes tại [CHANGELOG.md](../../CHANGELOG.md).

### Test cũ bị thay thế & Lý do cập nhật/xóa (không skip âm thầm)
- **Xóa `tests/scenarios/win-all-lit.{scenario,inputs}.json`:** Luật cũ "thắng ngay lập tức (`all_lit`) khi thắp đủ đèn" đã bị Ticket-03 Mục 3 **[THAY THẾ]** hoàn toàn bằng luật sống sót tới bình minh (`dawn_survived`). Thay bằng `tests/scenarios/p3-dawn-survived.{scenario,inputs}.json` kiểm tra đồng thời không thắng sớm khi thắp đủ 5 đèn và thắng `dawn_survived` đúng tick bình minh.
- **Cập nhật assertion điểm & hậu choáng trong `tests/simulation.unit.test.ts`:** Điểm đổi sang công thức Ticket-03 Mục 5 (`+5`/mote nạp, `+100` thắp mới, `+40` thắp lại, `+15` Bóng Mực đang `drain`, thưởng bình minh, bỏ thưởng thời gian), và Bóng Mực hết choáng chuyển về `wander` theo Ticket-03 Mục 2.
- **Cập nhật thời lượng benchmark Đêm 3:** Đêm 3 chuyển từ `360 s` (21.600 tick) xuống `300 s` (18.000 tick), vẫn nằm gọn dưới ngân sách `<= 30 s`.

### Acceptance Criteria Phase 3 (P3-1 .. P3-7)
- **P3-1 (Nhiên liệu đèn nguyên 1/60, châm dầu & thắp lại):** Đèn sáng bắt đầu `100.0`, hao `1/60` mỗi tick; châm dầu `used = min(carried, ceil((100-fuel)/10))` phát `refuel`, đèn đầy không được chọn; hết dầu tắt (`lantern_out`, `deposited=0`, `ever_lit=true`), thắp lại tốn `5` (`lantern_lit {relight:true}`, `relit_count++`).
- **P3-2 (Bóng Mực hút dầu `drain` & mất vùng an toàn):** Đèn `fuel < 30` mất vùng an toàn (đúng `30.0` vẫn còn); Bóng Mực `wander` chọn đèn yếu gần nhất (`id` nhỏ hơn nếu bằng nhau), vào `<= 2m` chuyển `drain` hút `5/60` mỗi tick (cộng dồn), phát `fuel_drain` mỗi `60` tick; chuyển `chase` khi Mây vào `<= 6m`, `stunned` khi trúng Tỏa Sáng (`+15` điểm), về `wander` khi hết choáng/đèn tắt/châm lên `>= 30`/xa `> 2m`.
- **P3-3 (Luật thắng bình minh `dawn_survived`):** Đêm 1/2/3 = `240/270/300 s`; thắp đủ đèn không kết thúc sớm; cuối tick ưu tiên `flames <= 0` → `no_flames`, rồi hết giờ: `lit >= ceil(0.6*N)` → `dawn_survived`, ngược lại `dawn`.
- **P3-4 (Sức chứa tăng dần):** `capacity = min(20, 10 + 2 * successful_lights)` (không tính đèn đặt sẵn scenario), hiện trên snapshot `player.capacity` & HUD `đang mang / sức chứa`.
- **P3-5 (Điểm mới v1.2):** `+5` mỗi đom đóm nạp/châm dầu, `+100` thắp đầu, `+40` thắp lại, `+5` Tỏa Sáng thường / `+15` đang `drain`, thắng bình minh `+50 + floor(fuel)` mỗi đèn sáng + `+50` mỗi Ngọn Lửa, bỏ thưởng thời gian.
- **P3-6 (Chế độ mù màu & hiển thị nhiên liệu):** Cài đặt "Bảng màu dễ phân biệt" lưu `localStorage` (`#00B3FF` cho Bóng Mực, `#FFFFFF` + `⚠` cho cảnh báo UI); đèn tắt xẹp 20% + vết rách giấy phân biệt không cần màu; đèn sáng có thanh dầu 3D & nhấp nháy `1 Hz` khi `< 30`.
- **P3-7 (Contract v1.2 & Hồi quy Phase 1–2):** `game.contract.json` v1.2 khớp 100% mã nguồn; toàn bộ test hồi quy Phase 1–2 không bị thay thế đều đạt; ADR & Breaking Changes đầy đủ.

## Phase 4 (Ticket-04)
*(Chờ phát hành đề Phase 4)*
