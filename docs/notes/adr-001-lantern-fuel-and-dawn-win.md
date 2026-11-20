# ADR-001: Chuyển mô hình Đèn Lồng sang Nhiên liệu nguyên (1/60) & Luật thắng Bình Minh (`dawn_survived`)

- **Ngày:** 2026-11-20 (Phase 3 — Ticket-03 "Đèn cạn dầu")
- **Trạng thái:** Accepted & Implemented (Contract v1.2)
- **Phạm vi ảnh hưởng:** `game.contract.json`, `src/core/types.ts`, `src/core/config.ts`, `src/core/maps.ts`, `src/core/validation.ts`, `src/core/simulation.ts`, `src/client/main.ts`, `tests/`

---

## 1. Bối cảnh (Context)

Ở Phase 1–2, Đèn Lồng Lớn chỉ có 2 trạng thái nhị phân (`lit: false | true`), một khi thắp sáng thì sáng mãi mãi và tạo vùng an toàn vĩnh viễn; khi đủ 100% đèn sáng thì Đêm kết thúc thắng ngay lập tức (`reason: "all_lit"`).
Kết quả playtest cho thấy người chơi thành thạo thắp hết đèn chỉ trong ~2 phút, làm mất cao trào cuối Đêm. **Ticket-03 (Change Request)** yêu cầu thay đổi luật cốt lõi sang **"giữ đảo sáng tới bình minh"**: đèn sáng bị hao nhiên liệu, đèn dưới 30 dầu mất vùng an toàn và bị Bóng Mực hút dầu, đèn hết dầu tắt và cần thắp lại, không còn thắng sớm, và phải duy trì `>= ceil(0.6 × tổng đèn)` đang sáng lúc bình minh.

---

## 2. Quyết định thiết kế (Decision)

### A. Biểu diễn nhiên liệu bằng số nguyên đơn vị `1/60` (`fuelSixtieths`)
- Thay vì lưu `fuel` dạng số thực IEEE-754 (dễ tích lũy sai số `100 - 60*(1/60) !== 99.0` hoặc lệch ngưỡng đúng `30.0`), mỗi đèn lưu trường nguyên `fuelSixtieths ∈ [0, 6000]` (với `100.0 fuel = 6000`).
- **Hao tự nhiên:** trừ chính xác `1` đơn vị mỗi tick (`1/60` fuel/tick = `1.0/s`).
- **Bóng Mực hút dầu (`drain`):** trừ chính xác `5` đơn vị mỗi tick (`5/60` fuel/tick = `5.0/s`), cộng dồn khi nhiều con cùng hút, phát `fuel_drain` mỗi `60` tick hút.
- **Châm dầu (`refuel`):** công thức `used = min(carried, Math.ceil((6000 - fuelSixtieths) / 600))` hoàn toàn là phép tính nguyên, không bao giờ lệch `+1` do sai số dấu phẩy động.
- **Làm tròn chỉ ở biên xuất JSONL:** `lit ? round1(fuelSixtieths / 60) : 0`.
- **Trạng thái lịch sử đèn:** thêm `everLit: boolean` (đèn đã từng sáng giảm chi phí thắp lại từ `10 → 5`) và `relitCount: number`.

### B. Tách khái niệm "đèn đang sáng" khỏi "đèn có vùng an toàn"
- Tách hàm thuần `hasActiveSafeZone(lantern)` = `lantern.lit && lantern.fuelSixtieths >= 30 * 60`.
- Đúng `fuel = 30.0` (`1800` đơn vị) **vẫn còn** vùng an toàn; `< 30.0` (`<= 1799`) **mất** vùng an toàn và trở thành mục tiêu ưu tiên cho Bóng Mực ở trạng thái `wander` chuyển sang `drain` khi vào `<= 2 m`.
- Khi đèn được châm dầu từ `< 30` lên `>= 30`, vùng an toàn kích hoạt lại ngay và đẩy mọi Bóng Mực trong `6 m` ra mép trong tối đa `30` tick (không gây sát thương trong lúc đẩy), đồng thời chuyển các con đang `drain` đèn đó về `wander`.

### C. Thay đổi luật thắng/thua ở Bước 11
- Loại bỏ nhánh thắng sớm `all_lit`: thắp đủ 5/6/7 đèn vẫn tiếp tục `state: "playing"` để người chơi giữ đèn tới hết giờ (240/270/300 s).
- Thứ tự ưu tiên cuối mỗi tick giữ bất biến an toàn:
  1. `flames <= 0` → `lost (no_flames)` (luôn ưu tiên nhất, kể cả đúng tick bình minh).
  2. `simTick >= duration * 60` → nếu `litCount >= ceil(0.6 * total)` thì `won (dawn_survived)` + thưởng mỗi đèn sáng `(50 + floor(fuel))` + `50 * flames` (bỏ thưởng thời gian); ngược lại `lost (dawn)`.

### D. Sức chứa tăng dần & Khả năng tiếp cận (Colorblind Mode)
- Thêm `player.successfulLights` (reset mỗi Đêm, không tính đèn đặt sẵn của scenario): `capacity = min(20, 10 + 2 * successfulLights)`.
- Trong `src/client/`: tách biệt đèn tắt/sáng không phụ thuộc màu (đèn tắt xẹp 20% theo trục Y + vết rách giấy; đèn yếu `< 30` nhấp nháy 1 Hz cùng thanh dầu 3D) và bổ sung cài đặt **"Bảng màu dễ phân biệt"** (Bóng Mực `#00B3FF`, cảnh báo `#FFFFFF` + `⚠`, lưu `localStorage`).

---

## 3. Hệ quả & Di trú Test (Consequences)

- **Ưu điểm:** Khử 100% sai số dấu phẩy động ở mốc tắt đèn (`fuel <= 0`) và mốc vùng an toàn (`fuel === 30`), bảo đảm tính tất định tuyệt đối trên Windows/macOS/Linux.
- **Thay đổi test cũ (có lý do, không skip âm thầm):**
  - Xóa `tests/scenarios/win-all-lit.{scenario,inputs}.json` vì luật thắng sớm `all_lit` đã bị Ticket-03 thay thế hoàn toàn; thay bằng `tests/scenarios/p3-dawn-survived.{scenario,inputs}.json` kiểm chứng cả "không thắng sớm" lẫn thắng `dawn_survived`.
  - Cập nhật assertion điểm trong `tests/simulation.unit.test.ts` theo công thức điểm mới (`+5`/đom đóm, `+100` thắp đầu, `+40` thắp lại, `+15` Bóng Mực đang `drain`, bỏ thưởng thời gian) và kiểm tra hậu choáng về `wander`.
  - Giữ nguyên toàn bộ test hồi quy Phase 1–2 không bị thay thế (di chuyển, nhảy, lướt, rơi/hồi sinh, Bùa Gió, Gió Lạc, Đảo Cau/Đảo Chuông, Gió mạnh, Tạm dừng, determinism & hiệu năng).
