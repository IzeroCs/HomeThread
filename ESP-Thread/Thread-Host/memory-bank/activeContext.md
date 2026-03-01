# Active Context — Thread-Host

_Cập nhật: 2026-02-27_

## Công việc hiện tại

Phase 2 (BR thật) đã xong: backhaul Wi‑Fi + Ethernet W5500 ưu tiên/fallback, transport TCP, border routing + prefix. Phase 2.7 docs (Memory Bank, README) đã cập nhật.

## Thay đổi gần đây

### CMD_COMMISSIONER_JOINER (0x43) — Vừa implement
- Handler trong `communicate_command.c`: parse EUI64(8) + PSKd_len(1) + PSKd(1–32) + Timeout(4 BE)
- Tự động start commissioner nếu chưa active, wait ACTIVE tối đa 1s (poll 200ms)
- EUI64 all-zero = wildcard → `NULL` vào `otCommissionerAddJoiner`
- Log EUI64 format `xx:xx:xx:xx:xx:xx:xx:xx` trước khi gọi OT

### Leader Control Client — Fix assert crash
- **Bug:** `esp_openthread_task_switching_lock_release` assert khi `send_coap_stop_command_once` gọi OT API mà không giữ lock
- **Fix:** `send_coap_stop_command_once` tự acquire/release lock bên trong; caller release trước khi gọi và dùng `goto next_iteration` để skip `lock_release()` bên dưới

### Phase 1 cleanup (BR thật) — Đã thực hiện
- Đã xóa Device Registry (CoAP server /device/register|update|ping) và CMD_DATA push/wait-ACK. BR không còn forward child→backend; chuyển hướng sang BR thật (child gửi thẳng backend qua IP). Frame protocol chỉ dùng cho quản lý BR (state, dataset, Commissioner…).

### Frame log suppression — Đã implement
- `CMD_STATE`, `CMD_ROUTER_TABLE`, `CMD_CHILD_TABLE`, `CMD_JOINER_TABLE` và ACK tương ứng không log ở **INFO** (reduce noise); log ở **DEBUG**.

### RX/TX logging — Đã bổ sung
- **Frame RX/TX** (communicate.c): CMD noisy và ACK tương ứng log bằng `ESP_LOGD`; các CMD khác log `ESP_LOGI`. Để xem mọi frame: set log level **DEBUG** cho tag `communicate`.
- **Transport TCP** (transport_tcp.c): Mỗi lần `recv`/`send` log `tcp rx N bytes` / `tcp tx N bytes` ở **DEBUG**. Set tag `transport_tcp` sang DEBUG để xem byte stream.
- Cách bật: menuconfig → Log output → Set log level for component `communicate`, `transport_tcp` = Debug; hoặc runtime `esp_log_level_set("communicate", ESP_LOG_DEBUG)` và tương tự cho `transport_tcp`.

### Memory Bank — Vừa tạo
- `.cursor/rules/thread-host-memory-bank.mdc` — entry point rule
- `memory-bank/` — 6 core files theo chuẩn Memory Bank

### Docs migration
- Tất cả docs đã chuyển sang `HomeThread/Documents/` với symlink `docs/` tại project root
- Tất cả link trong `README.md` và `TODO.md` đã cập nhật sang `../../Documents/...`

## Decisions đang active

- **Factory reset:** Dùng raw `esp_partition_erase_range` + KHÔNG stop OT trước (để tránh OT write-back dataset)
- **Frame transport:** Chỉ TCP (BR listen port); đã bỏ USB/UART cho kênh BR↔dashboard
- **Backhaul:** Ethernet W5500 ưu tiên (nếu bật), Wi‑Fi STA fallback
- **Stack monitor:** Task `stk_mon` 3072 bytes, log mỗi 30s; `main` task luôn hiện "used full" sau `app_main()` exit — bình thường

## Bước tiếp theo

1. **Docs Thread-Node / Dashboard-Thread:** Cập nhật hoặc tạo doc (child gửi thẳng backend qua IP, backend listen IP)
2. **CMD_SYS_HEALTH:** Handler gửi stack HWM + heap size cho backend monitor
3. **Auto-flash RCP:** Tính năng flash firmware RCP khi boot (xem TODO.md)

## Known Issues đang theo dõi

- `main` task hiện "used full" trong stack monitor — đây là artifact của task đã exit, không phải overflow
- Leader Control Client gửi `GET /network/stop` nhưng chưa biết Leader phía kia xử lý thế nào
