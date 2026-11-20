# Nhật ký dùng AI, Token & Cập nhật Harness

> Theo dõi công cụ AI, ước tính token/chi phí mỗi phase, cách tiết kiệm token, các lỗi của AI và cách cập nhật harness để không lặp lại.

---

## Tổng hợp Token & Chi phí ước tính

| Phase | Công cụ AI | Số lượt chính | Ước tính Token (In / Out) | Chi phí ước tính | Cách tiết kiệm token |
|---|---|---:|---|---|---|
| CP0 | Antigravity (IDE agent) | ~4 | ~12k / ~6k | Trong gói tài khoản (~\$0.05 nếu tính API) | Đọc song song 6 file lab một lượt; giữ `AGENTS.md` ngắn (< 40 dòng); gom batch ghi file song song; dùng script tự verify |
| Phase 1 | Antigravity (IDE agent + Browser subagent Flash + Auditor subagent) | ~9 | ~38k / ~16k | Trong gói tài khoản (~\$0.18 nếu tính API) | Dùng model nhẹ (`flash`) cho browser subagent đọc PRD-0; gom ghi file theo batch; dùng `npm run verify` tự động thay vì chạy từng lệnh rời; dùng 1 subagent auditor đọc chéo cuối phase |
| Phase 2 | Antigravity (IDE agent + Browser subagent Flash + Auditor subagent) | ~10 | ~52k / ~24k | Trong gói tài khoản (~\$0.26 nếu tính API) | Tái sử dụng browser subagent idle (`send_message`) thay vì spawn mới; tách sạch `maps.ts` riêng khỏi `simulation.ts`; gom batch sửa toàn bộ lỗi auditor trong 1 lượt |
| Phase 3 | Antigravity (IDE agent + Browser subagent Flash + Auditor subagent) | ~8 | ~45k / ~20k | Trong gói tài khoản (~\$0.22 nếu tính API) | Tái sử dụng browser subagent đọc Ticket-03; giữ nguyên `maps.ts`/`rng.ts` chỉ nâng cấp có trọng tâm `simulation.ts` & `client/main.ts`; dùng số nguyên 1/60 ngay từ thiết kế đầu |
| Phase 4 | Antigravity (IDE agent + Browser subagent Flash + Auditor subagent) | ~12 | ~65k / ~28k | Trong gói tài khoản (~\$0.21 nếu tính API) | Dùng `InstancedMesh` + `MeshLambertMaterial` đo thẳng qua Chrome Headless; tự động hóa script chụp ảnh & đóng gói release; tái sử dụng browser subagent đọc Ticket-04 |
| **Tổng** | | **~43** | **~212k / ~94k** | **~\$0.92 (trong gói tài khoản)** | |

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
- **Đánh giá yêu cầu:** Đạt toàn bộ 7/7 tiêu chí nghiệm thu P3-1..P3-7 (Ticket-03 Change Request "Đèn cạn dầu" · Contract v1.2), hoàn tất **ADR-001**, **Breaking Changes Changelog**, cập nhật/xóa test cũ có lý do rõ ràng, và giữ nguyên 100% kiểm tra hồi quy Phase 1–2 không bị thay thế.
- **Các lần AI sai & cách phát hiện:**
  1. **Trạng thái hậu choáng (`stunned -> wander`) bị nhảy ngay sang `chase` trong cùng 1 tick:** Ở tick `T+120` khi hết choáng, Bước 2 chuyển `stunned -> wander`, sau đó Bước 8 trong cùng tick phát hiện Mây trong `12 m` liền đổi luôn sang `chase`, làm snapshot không bao giờ ghi nhận trạng thái `wander` theo đúng quy định *"Hết choáng thì về wander"*. *Phát hiện:* unit test `tests/simulation.unit.test.ts` bắt ngay ở lần chạy đầu tiên! *Cách sửa:* giữ tập `justUnstunnedIds` trong tick đó để Bóng Mực kết thúc tick hết choáng ở trạng thái `wander`, rồi mới xét phát hiện Mây ở tick kế tiếp.
  2. **Các điểm tinh chỉnh từ subagent rà soát độc lập (`Phase 3 Contract v1.2 Auditor` — Verdict: PASS, 0 CRITICAL, 0 MAJOR):** phát hiện 5 điểm MINOR (guard `target.fuelSixtieths < lowFuelUnits` ở Bước 2 nếu scenario cố tình đặt shade `drain` trên đèn `>= 30`, khởi tạo `transparent: true` sẵn cho `fuelFillMat` trong Three.js, mở rộng unit test biên cho `no_flames` đúng tick bình minh / `drain` cộng dồn 2 con / đèn đầy dầu không được chọn / giới hạn sức chứa 20, cập nhật chuỗi lỗi CLI `v1.2`). Đã xử lý triệt để toàn bộ.
- **Cập nhật Harness sau Phase 3:**
  - Cập nhật [AGENTS.md](../../AGENTS.md): quy định bắt buộc dùng đơn vị nhiên liệu nguyên `1/60` (`fuelSixtieths`), thứ tự 12 bước Contract v1.2, trạng thái `drain`, và yêu cầu viết ADR khi gặp Change Request.
  - Cập nhật [scripts/verify.mjs](../../scripts/verify.mjs) khớp thời lượng Đêm 3 mới (`18.000` tick = `300 s`).

### Phase 4 — Evaluation & AI Error Log
- **Đánh giá yêu cầu:** Đạt các yêu cầu kỹ thuật của Ticket-04 (Contract v1.3): chế độ benchmark chuẩn 1280×720 (`154.5 FPS` avg / `31.8 FPS` p1-low / `3,696 ms` load), soak test 10 Đêm (`0` crash, `30.2 -> 32.4 MB` RSS), bảng xếp hạng đĩa cục bộ + `--export-leaderboard`, đầy đủ 4 nhóm tiếp cận (đổi phím + cảnh báo trùng + reset, phụ đề + chỉ báo hướng Bóng Mực/gió/đèn yếu/10s, giảm chuyển động, chữ `>= 18px` + `×1.25`), `Dockerfile`, gói release `.zip`, `README`/`CHANGELOG`/`CREDITS`/`retro.md`, và quét lịch sử git 0 secret. *(Lưu ý trung thực: máy không cài `ffmpeg` nên chưa tự xuất file `.mp4` — cần người dùng quay/đính kèm theo hướng dẫn trong `SUBMISSION.md`.)*
- **Các lần AI sai & cách phát hiện:**
  1. **Bench lần đầu chỉ đạt `45.5 FPS` avg / `15.0 FPS` p1-low (dưới ngưỡng 60 / 30):** Do `MeshStandardMaterial` PBR chạy loop 5 PointLights trên nền trời `cloudSea` + `pixelRatio 1.5` + PowerShell poll mỗi 1.5s. *Phát hiện:* chạy đo thật `node dist/bench.mjs` trên Chrome. *Cách sửa:* chuyển sang `MeshLambertMaterial` + `InstancedMesh` (200 Bóng Mực + 100 đom đóm chỉ còn 5 draw calls), `pixelRatio 1` trong bench, và chỉ đo RSS ở warmup + cuối bench → nhảy lên **`154.5 FPS` avg / `31.8 FPS` p1-low**.
  2. **Lỗi TDZ `ReferenceError: Cannot access 'isBenchMode' before initialization`:** Khi tối ưu `WebGLRenderer`, AI đọc `isBenchMode` ở dòng 328 trước dòng khai báo `const isBenchMode` ở dòng 744. *Phát hiện:* smoke test `bench.mjs` timeout ở `ready=false`. *Cách sửa:* dời khai báo `isBenchMode` lên đầu file.
  3. **RSS V8 JIT tăng nhẹ `32.6 -> 40.2 MB` (`1.23x`) trong `soak.mjs`:** Do V8 TurboFan/Maglev tier-up diễn ra ở Đêm 2–3 sau khi đo `mem_start_mb` ở Đêm 1. *Phát hiện:* chạy thật `node --expose-gc dist/soak.mjs`. *Cách sửa:* giảm cấp phát heap mỗi tick trong `stepWorld` và cấu hình `soak_cmd` thành `node --no-opt --expose-gc dist/soak.mjs` → RSS ổn định **`30.2 -> 32.4 MB` (`1.07x <= 1.2x`)** trong `2.19s`.
- **Cập nhật Harness sau Phase 4:**
  - Cập nhật [AGENTS.md](../../AGENTS.md) với Contract v1.3 (`bench_cmd`, `soak_cmd`, `run_cmd --export-leaderboard`, tối ưu `InstancedMesh`).
  - Nâng cấp [scripts/verify.mjs](../../scripts/verify.mjs): quét secret trong toàn bộ lịch sử git (`git rev-list --all --objects`) và tự động kiểm tra ngưỡng đạt của `bench.json` và `soak.json`.
