# Retrospective — Day 12 AI SDLC: Đảo Đèn Lồng (v1.0.0)

> Tổng kết quy trình SDLC cùng AI qua 4 phase (CP0 → Phase 4), đánh giá hiệu quả, lỗi AI đã phát hiện, cách cải tiến harness, ước tính token và bài học rút ra.

---

## 1. Số liệu tổng quan dự án

| Chỉ số | Giá trị đo được |
|---|---|
| Chuỗi phase hoàn thành đúng kiến trúc | **CP0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 (`v1.0.0`)** |
| Bộ kiểm thử tự động (`vitest run`) | **4 file test, 25/25 test đạt** (architecture guardrails + unit + Contract v1.3 CLI + Release/Soak/Bench/Leaderboard) |
| Tính tất định headless (3 Đêm) | **Khớp SHA-256 100%** giữa các lần chạy (`seed=42`, Đêm 1/2/3) |
| Hiệu năng Headless (Đêm 3 đầy đủ, 18.000 tick) | **~0.56 s** (ngân sách `<= 30 s`) |
| Hiệu năng 3D Benchmark (`1280×720`, 200 Bóng Mực + 100 đom đóm, 30s) | **`avg_fps = 154.5 FPS`**, **`p1_low_fps = 31.8 FPS`**, **`frame_ms_p95 = 14.2 ms`**, **`load_ms = 3,696 ms`** (trên AMD Ryzen 7 PRO 4750U iGPU) |
| Soak Test 10 Đêm liên tiếp (`seed=7`) | **`crashes = 0`**, **`mem_start_mb = 30.2 MB` -> `mem_end_mb = 32.4 MB`** (`+7.3%`, dưới ngưỡng `<= 1.2x`), **`2.19 s`** |
| Tổng token AI ước tính cả dự án | **~212k input / ~94k output** (chi phí API quy đổi ước tính ~\$0.92, chạy trong gói tài khoản) |

---

## 2. Evaluation tổng hợp qua 4 Phase

- **CP0 (Chuẩn bị):** Dựng ngay kiến trúc tách lõi `src/core/` (0 import `three`/DOM) + `src/headless/` + `src/client/` cùng `AGENTS.md`, `verify.mjs` và `architecture.test.ts`. Điều này quyết định 80% sự ổn định của 4 phase sau vì toàn bộ luật game chạy trên Node.js thuần trong vài mili-giây.
- **Phase 1 (PRD-0 · Contract v1.0):** Hoàn thành Đêm 1 – Đảo Bến và CLI JSONL chuẩn; subagent Auditor độc lập bắt được lỗi trùng ID khi trộn scenario có/không ID và lỗi `localeCompare` phụ thuộc hệ điều hành.
- **Phase 2 (Ticket-02 · Contract v1.1):** Mở rộng 3 Đêm (Đảo Bến, Đảo Cau, Đảo Chuông), 12 bước tick, Lướt, Gió Lạc, Bùa Gió, Gió mạnh, bảng màu chuẩn & nhạc nền/SFX. Test phát hiện lệch tích phân Euler (`1.283m` vs `1.225m`) -> sửa sang **velocity-Verlet**; Auditor bắt lỗi chênh cao `dy` của Bóng Mực và fallback đẩy vùng an toàn gần Tháp Chuông.
- **Phase 3 (Ticket-03 Change Request · Contract v1.2):** Xử lý thay đổi luật cốt lõi ("Đèn cạn dầu", bỏ thắng sớm `all_lit`, thêm `drain`, sức chứa tăng dần, chế độ mù màu). Nhờ chuyển nhiên liệu sang **số nguyên 1/60 (`fuelSixtieths`)** ngay từ đầu (ghi nhận trong **ADR-001**), hoàn toàn không gặp sai số số thực tại mốc `fuel === 30` hay `fuel <= 0`.
- **Phase 4 (Ticket-04 · Contract v1.3 / v1.0.0):** Đo benchmark thực tế lộ ra PBR `MeshStandardMaterial` chỉ đạt `45.5 FPS` trên GPU tích hợp → chuyển sang `MeshLambertMaterial` + `InstancedMesh` (200 Bóng Mực + 100 đom đóm chỉ 5 draw calls) đẩy thẳng lên **`154.5 FPS`**. Bảng xếp hạng đĩa cục bộ, đổi phím, phụ đề, giảm chuyển động, cỡ chữ `>= 18px`, đóng gói `.zip` + `Dockerfile` + clean clone đều đạt.

---

## 3. Điều gì hiệu quả & không hiệu quả khi làm với AI?

- **Hiệu quả nhất:**
  1. **Nghĩ kiểm chứng trước khi code & viết test khóa cứng kiến trúc (`architecture.test.ts`):** Mọi vi phạm import DOM/Three trong `src/core/` hoặc lệch `game.contract.json` bị chặn ngay lập tức.
  2. **Tách vai người viết và người đánh giá (Independent Auditor Subagent):** Ở cả Phase 1, 2, 3, subagent rà soát độc lập đều phát hiện những lỗi tinh vi mà chính luồng code chính bỏ sót (lệch `dy <= 1.5`, trùng ID, fallback Tháp Chuông, guard `drain`).
  3. **Một lệnh kiểm chứng duy nhất (`npm run verify`):** Không cần hỏi AI chạy từng lệnh lẻ; output thật tự động lưu vào `docs/proof/` làm bằng chứng không chỉnh sửa tay.
- **Chưa hiệu quả / Cần tránh:**
  1. Dựa vào suy đoán lý thuyết cho hiệu năng hay bộ nhớ mà không đo thật: tưởng `InstancedMesh` đã đủ nhanh nhưng `MeshStandardMaterial` PBR vẫn kéo FPS xuống `45.5` và V8 JIT kéo RSS `soak` lên `1.28x` nếu không đo thật và tinh chỉnh.
  2. Thao tác trên Windows (`PowerShell` không hỗ trợ `&&`, `core.autocrlf`, khóa file sandbox `.git/index.lock`) đôi lúc tốn thêm 1 lượt chạy lại lệnh.

---

## 4. Thành phần Harness AI hữu ích nhất

1. **`AGENTS.md` (ngắn gọn, cập nhật sau mỗi phase):** Giữ AI không lặp lại cùng một lỗi (ví dụ quy tắc trừ toàn bộ timer ở Bước 1 tránh off-by-one, quy tắc nhiên liệu nguyên `1/60`, quy tắc 12 bước tick).
2. **`tests/architecture.test.ts` (kiểm chứng bằng code thay vì chỉ nhắc bằng lời):** Đúng nguyên tắc trong `GUIDE.md` — *sửa ở nơi chắc chắn nhất để lỗi không thể xảy ra*.
3. **Skill `.agents/skills/verify-phase/SKILL.md` + `scripts/verify.mjs`:** Ép buộc chạy đủ typecheck, build, test, determinism 3 Đêm và ghi log thật trước khi được phép gắn tag.

---

## 5. Quản lý Token & Nếu làm lại thì đổi gì?

- **Cách đã tiết kiệm token:**
  - Dùng model nhẹ (`flash`) cho browser subagent chỉ làm nhiệm vụ đọc nguyên văn đề từ Lab Board, giữ model mạnh cho phân tích Contract, code lõi và subagent Auditor.
  - Giữ `AGENTS.md` dưới ~40 dòng súc tích thay vì dán cả đề bài vào mọi prompt.
  - Gom ghi/sửa nhiều file trong cùng một lượt song song và dùng `npm run verify` làm cổng kiểm chứng gộp.
- **Nếu làm lại dự án từ đầu, sẽ đổi gì?**
  1. Dùng `MeshLambertMaterial` + `InstancedMesh` ngay từ Phase 1 để khỏi phải refactor shader ở Phase 4.
  2. Tạo sẵn script smoke-test trình duyệt thực (`1280×720`) ngay từ Phase 2 để bắt lỗi TDZ/WebGL sớm hơn thay vì chờ đến lúc chạy benchmark 30s ở Phase 4.
  3. Dựng sẵn `ffmpeg` / công cụ quay màn hình trước giờ lab để quay video demo `.mp4` ngay cuối mỗi phase thay vì dồn hết vào 15 phút cuối.
