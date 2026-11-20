# Nhật ký dùng AI, Token & Cập nhật Harness

> Theo dõi công cụ AI, ước tính token/chi phí mỗi phase, cách tiết kiệm token, các lỗi của AI và cách cập nhật harness để không lặp lại.

---

## Tổng hợp Token & Chi phí ước tính

| Phase | Công cụ AI | Số lượt chính | Ước tính Token (In / Out) | Chi phí ước tính | Cách tiết kiệm token |
|---|---|---:|---|---|---|
| CP0 | Antigravity (IDE agent) | ~4 | ~12k / ~6k | Trong gói tài khoản (~\$0.05 nếu tính API) | Đọc song song 6 file lab một lượt; giữ `AGENTS.md` ngắn (< 40 dòng); gom batch ghi file song song; dùng script tự verify |
| Phase 1 | Antigravity (IDE agent + Browser subagent Flash + Auditor subagent) | ~9 | ~38k / ~16k | Trong gói tài khoản (~\$0.18 nếu tính API) | Dùng model nhẹ (`flash`) cho browser subagent đọc PRD-0; gom ghi file theo batch; dùng `npm run verify` tự động thay vì chạy từng lệnh rời; dùng 1 subagent auditor đọc chéo cuối phase |
| Phase 2 | Antigravity (IDE agent + Browser subagent Flash + Auditor subagent) | ~10 | ~52k / ~24k | Trong gói tài khoản (~\$0.26 nếu tính API) | Tái sử dụng browser subagent idle (`send_message`) thay vì spawn mới; tách sạch `maps.ts` riêng khỏi `simulation.ts`; gom batch sửa toàn bộ lỗi auditor trong 1 lượt |
| Phase 3 | *(cập nhật sau)* | | | | |
| Phase 4 | *(cập nhật sau)* | | | | |

---

## Nhật ký theo Phase

### Checkpoint 0 (Chuẩn bị)
- **Việc AI làm:** Đọc hiểu 6 file hướng dẫn lab, kiểm tra môi trường máy (`node v20.8.1`, `npm 10.2.4`, `python 3.11.0`, `git 2.42.0`), đề xuất stack TypeScript + Three.js + Node headless, dựng bộ khung CP0 (hello 3D, headless CLI, test, script `verify.mjs`, CI, pre-commit hook, tài liệu).
- **Lỗi AI / Điểm cần lưu ý:** Không bịa yêu cầu game khi chưa có PRD-0; chủ động dừng lại xác nhận dựng CP0 trước.
- **Cập nhật Harness:** Khởi tạo `AGENTS.md`, `.agents/skills/verify-phase/SKILL.md`, `.githooks/pre-commit`, `.github/workflows/ci.yml`.
- **Kiểm chứng:** Chạy thật `npm run verify -- --phase cp0` (7/7 test đạt, SHA-256 trùng khớp).

### Phase 1 — Evaluation & AI Error Log
- **Đánh giá yêu cầu:** Đạt toàn bộ 7/7 tiêu chí nghiệm thu P1-1..P1-7 (PRD-0 & Test Contract v1.0). Không ảnh hưởng kiến trúc tách lõi ở CP0.
- **Các lần AI sai & cách phát hiện:**
  1. **Lỗi off-by-one 1 tick ở thời lượng choáng (`stunTicks`):** Ban đầu đặt `stunTicks = 180` ở bước 6 rồi trừ ngay `1` ở bước 7 trong cùng tick, làm choáng thực tế chỉ còn 179 tick. *Phát hiện:* tự rà soát logic trước khi chạy test + sửa về trừ ở Bước 1 của `stepWorld`.
  2. **Lỗi đếm vòng lặp trong unit test `pulse_stun_s`:** Sau khi sửa đúng mô phỏng, vòng `for (let t = 3; t < stunTicks + 1; t++)` trong `tests/simulation.unit.test.ts` chạy dư 1 tick (đến tick 181 thay vì 180) khiến lần chạy `npm run verify -- --phase phase-1` đầu tiên báo **FAIL**. *Phát hiện:* chạy thật `npm run verify` (không tin "agent bảo xong") và đối chiếu chính xác `world.tick`.
  3. **Trùng ID thực thể khi trộn `scenario.motes` có ID và không ID + sinh ngẫu nhiên tiếp theo (`M1`/`S1`):** *Phát hiện:* do **subagent rà soát độc lập (`Phase 1 Contract Auditor`)** tìm thấy ở `src/core/simulation.ts` cùng với `localeCompare` có thể lệch theo locale hệ điều hành và sai số dấu phẩy động ở `Math.floor(timeLeftS)`. *Cách sửa:* viết hàm `allocateUniqueId` + `compareId` thuần mã ký tự + `Math.floor(timeLeftS + 1e-9)` và thêm regression test khóa chặt lỗi này.
- **Cập nhật Harness sau Phase 1:**
  - Cập nhật [AGENTS.md](../../AGENTS.md): thêm quy tắc *Single source of truth* (`game.contract.json` -> `src/core/config.ts`) và quy tắc trừ toàn bộ timer ở Bước 1 của `stepWorld`.
  - Nâng cấp [tests/architecture.test.ts](../../tests/architecture.test.ts) để kiểm tra tự động đồng bộ 1-1 giữa `game.contract.json` và `DEFAULT_TUNING`.
  - Nâng cấp [scripts/verify.mjs](../../scripts/verify.mjs) để tự kiểm tra tính tất định SHA-256 trên CLI Test Contract v1.0 (`--seed 42 --night 1 --ticks 600`) và scenario thắng (`win-all-lit`).

### Phase 2 — Evaluation & AI Error Log
- **Đánh giá yêu cầu:** Đạt toàn bộ 11/11 tiêu chí nghiệm thu P2-1..P2-11 (Ticket-02 "Ba hòn đảo" & Contract v1.1), giữ nguyên 100% kiểm tra hồi quy Phase 1 với bộ số chuẩn mới, và vượt xa ngưỡng hiệu năng (`~0.6s` cho 21.600 tick Đêm 3 so với trần `30s`).
- **Các lần AI sai & cách phát hiện:**
  1. **Lệch đỉnh nhảy Euler (`1.283m` thay vì `1.225m`) & TS2367 trong `runHeadlessSimulation`:** *Phát hiện:* lần chạy `npm run verify -- --phase phase-2` đầu tiên báo `FAIL`. *Cách sửa:* chuyển tích phân trục Y sang **velocity-Verlet** (`y += vy*dt - 0.5*g*dt^2`) cho đỉnh nhảy & quỹ đạo bục nhảy chính xác theo giải tích, sửa thu hẹp kiểu TS sau `stepWorld`.
  2. **Lỗi giả định sai trong test TTL 480 tick:** Test quên tách Bóng Mực sau khi kiểm tra lần đánh đầu khiến Mây bị đánh chết ở tick 181 trước khi đom đóm rơi hết hạn 480 tick. *Phát hiện:* `vitest run` bắt ngay lỗi thật.
  3. **Kiểm tra chênh cao `dy` khi Bóng Mực đánh quá rộng (cho phép lệch tới `2.5m` thay vì `1.5m`) & fallback đẩy vùng an toàn có thể đưa Bóng Mực vào Tháp Chuông/biển mây:** *Phát hiện:* **subagent rà soát độc lập (`Phase 2 Contract v1.1 Auditor`)** chỉ ra ở `src/core/simulation.ts` cùng với 4 điểm nhỏ khác (dead code `getNightSpawnPos`, hardcoded `/ 2` thay vì `tuning.hit_drop_ratio`, bước recoil 59 vs 60 tick, thứ tự phát `pulse` trước `drifter_drop`). *Cách sửa:* sửa triệt để toàn bộ 7 phát hiện và thêm regression test khóa chặt kiểm tra `dy <= 1.5`.
- **Cập nhật Harness sau Phase 2:**
  - Cập nhật [AGENTS.md](../../AGENTS.md): khóa thứ tự 12 bước tick, tích phân velocity-Verlet, tên 5 trạng thái chuẩn của Bóng Mực và ngưỡng 21.600 tick `<= 30s`.
  - Nâng cấp [.agents/skills/verify-phase/SKILL.md](../../.agents/skills/verify-phase/SKILL.md) và [scripts/verify.mjs](../../scripts/verify.mjs): tự kiểm tra tính tất định SHA-256 cho cả **3 Đêm (1, 2, 3)** và đo benchmark Đêm 3 đầy đủ `21.600` tick.

### Phase 3 — Evaluation & AI Error Log
*(Cập nhật cuối Phase 3)*

### Phase 4 — Evaluation & AI Error Log
*(Cập nhật cuối Phase 4)*
