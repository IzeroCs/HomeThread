# Active Context — Thread-Host

_Cập nhật: 2026-02-21_

## Công việc hiện tại

Vừa hoàn thành việc thiết lập Memory Bank và stabilize các tính năng core.

## Thay đổi gần đây

### CMD_COMMISSIONER_JOINER (0x43) — Vừa implement
- Handler trong `communicate_command.c`: parse EUI64(8) + PSKd_len(1) + PSKd(1–32) + Timeout(4 BE)
- Tự động start commissioner nếu chưa active, wait ACTIVE tối đa 1s (poll 200ms)
- EUI64 all-zero = wildcard → `NULL` vào `otCommissionerAddJoiner`
- Log EUI64 format `xx:xx:xx:xx:xx:xx:xx:xx` trước khi gọi OT

### Leader Control Client — Fix assert crash
- **Bug:** `esp_openthread_task_switching_lock_release` assert khi `send_coap_stop_command_once` gọi OT API mà không giữ lock
- **Fix:** `send_coap_stop_command_once` tự acquire/release lock bên trong; caller release trước khi gọi và dùng `goto next_iteration` để skip `lock_release()` bên dưới

### Device Registry Server — Đã khởi động
- `device_registry_server_init()` đã được gọi trong `app_main` (sau `leader_control_client_init`)
- CoAP server `/device/register`, `/device/update`, `/device/ping` đang chạy

### Frame log suppression — Đã implement
- `CMD_STATE`, `CMD_ROUTER_TABLE`, `CMD_CHILD_TABLE`, `CMD_JOINER_TABLE` và ACK tương ứng không được log (reduce noise)

### Memory Bank — Vừa tạo
- `.cursor/rules/thread-host-memory-bank.mdc` — entry point rule
- `memory-bank/` — 6 core files theo chuẩn Memory Bank

### Docs migration
- Tất cả docs đã chuyển sang `HomeThread/Documents/` với symlink `docs/` tại project root
- Tất cả link trong `README.md` và `TODO.md` đã cập nhật sang `../../Documents/...`

## Decisions đang active

- **Factory reset:** Dùng raw `esp_partition_erase_range` + KHÔNG stop OT trước (để tránh OT write-back dataset)
- **Frame transport:** USB CDC mặc định; UART sẽ làm sau
- **Stack monitor:** Task `stk_mon` 3072 bytes, log mỗi 30s; `main` task luôn hiện "used full" sau `app_main()` exit — bình thường, không phải lỗi

## Bước tiếp theo

1. **Device Registry → forward lên backend:** Implement gửi payload từ CoAP (`/device/register|update|ping`) lên backend qua `CMD_DATA` frame
2. **CoAP response:** Gửi CoAP ACK/CHANGED về cho child device sau khi enqueue thành công
3. **CMD_SYS_HEALTH:** Handler gửi stack HWM + heap size cho backend monitor
4. **Auto-flash RCP:** Tính năng flash firmware RCP khi boot (xem TODO.md chi tiết)
5. **Transport UART:** Phát triển tiếp frame trên UART (đã có transport_uart.c)

## Known Issues đang theo dõi

- `main` task hiện "used full" trong stack monitor — đây là artifact của task đã exit, không phải overflow
- Leader Control Client gửi `GET /network/stop` nhưng chưa biết Leader phía kia xử lý thế nào
