# Progress — Thread-Host

_Cập nhật: 2026-02-27_

## Release history

| Version | Ngày | Mô tả |
|---------|------|--------|
| 0.1.0 | 2025-10 | BR boot, RCP UART (GPIO4/5, 460800), RCP control pins, OpenThread stack, dataset init on boot, Border Agent, Commissioner. |
| 0.2.0 | 2025-11 | Frame protocol (parser/serializer SOF–EOF), transport USB CDC, queue + dispatch, CMD_STATE, CMD_RESET, CMD_FACTORY, CMD_DATASET_ACTIVE, CMD_IP_ADDR, SET_* (PANID, channel, name, XPANID, key), state watchdog. |
| 0.5.0 | 2025-12 | CMD_ROUTER_TABLE, CMD_CHILD_TABLE, CMD_JOINER_TABLE, CMD_THREAD_START/STOP/VERSION, CMD_COMMISSIONER_JOINER. Stack monitor (stk_mon), br_config.h centralized. |
| 0.8.0 | 2026-01 | CoAP Leader Control Client (GET /network/stop), Device Registry Server (/device/register, update, ping). LED status WS2812, boot button (long press factory reset). Bug fixes: task name length, CMD_FACTORY NVS erase, leader_rloc lock. |
| 0.9.0 | 2026-02-21 | Log suppression (STATE, *_TABLE), Memory Bank + docs, symlink Documents. Các mục chưa làm: Device Registry→backend, CMD_SYS_HEALTH, auto-flash RCP, transport UART. |
| 0.10.0 | 2026-02-27 | Phase 1: Xóa Device Registry (CoAP server/handler) và CMD_DATA push/wait-ACK; frame protocol chỉ cho quản lý BR. Hướng BR thật (child gửi thẳng backend). |
| 0.11.0 | 2026-02-27 | Phase 2: Wi‑Fi STA backhaul, transport TCP (frame qua socket), bỏ USB/UART; border routing + prefix; Ethernet W5500 ưu tiên, Wi‑Fi fallback. |

_(Ghi phiên bản theo Semantic Versioning MAJOR.MINOR.PATCH, không dùng tiền tố `v`. Nếu chỉ có major/minor thì PATCH = 0.)_

## Đã hoàn thành ✅

### Core Infrastructure
- [x] OpenThread Border Router với border routing + prefix delegation
- [x] RCP giao tiếp qua UART1 (GPIO4/5, 460800 baud)
- [x] RCP control pins (RESET GPIO7, BOOT GPIO8) — tự reset RCP khi boot
- [x] Dataset init on boot — tạo dataset "ESP-BR-<MAC>" nếu chưa có
- [x] CLI console qua UART0 (OpenThread + system commands)
- [x] Border Agent enabled
- [x] Commissioner enabled

### Frame Protocol (communicate)
- [x] Parser/serializer frame (SOF/FrameID/CMD/LEN/DATA/CRC8/EOF)
- [x] Transport TCP only (BR listen port; dashboard kết nối BR_IP:port)
- [x] FreeRTOS queue (depth=16, timeout 500ms, warn >2s)
- [x] State watchdog (5 miss × 15s → esp_restart)
- [x] Log suppression cho noisy CMDs (STATE, *_TABLE và ACK): INFO không in; DEBUG in đầy đủ frame RX/TX + tcp rx/tx bytes

### CMD Handlers (tất cả đã implement)
- [x] CMD_STATE (0x12) — heartbeat + role
- [x] CMD_RESET (0x10) — ACK + graceful OT shutdown + restart sau 2s
- [x] CMD_FACTORY (0x11) — ACK + raw NVS erase + restart sau 2s
- [x] CMD_DATASET_ACTIVE (0x14) — TLV binary
- [x] CMD_IP_ADDR (0x13) — Leader RLOC 16 bytes + retry
- [x] CMD_ROUTER_TABLE (0x30) — count + entries
- [x] CMD_CHILD_TABLE (0x31) — count + entries
- [x] CMD_JOINER_TABLE (0x32) — count + variable entries
- [x] CMD_SET_PANID (0x20)
- [x] CMD_SET_CHANNEL (0x21)
- [x] CMD_SET_NETWORK_NAME (0x22)
- [x] CMD_SET_EXTENDED_PANID (0x23)
- [x] CMD_SET_NETWORK_KEY (0x24)
- [x] CMD_THREAD_START (0x40)
- [x] CMD_THREAD_STOP (0x41)
- [x] CMD_THREAD_VERSION (0x42)
- [x] CMD_COMMISSIONER_JOINER (0x43) — add joiner với EUI64/PSKd/timeout

### Hardware
- [x] LED Status WS2812 (GPIO48) — 5 trạng thái theo OT role
- [x] Boot button (GPIO0) — long press 3s → factory reset

### Backhaul
- [x] Wi‑Fi STA (Kconfig SSID/pass), DHCP; dùng làm backbone hoặc fallback
- [x] Ethernet W5500 (SPI) — ưu tiên khi bật; timeout thì fallback Wi‑Fi

### CoAP
- [x] Leader Control Client — task gửi GET /network/stop đến Leader mỗi khi cần
- [x] Device Registry — đã bỏ (Phase 1); child gửi thẳng backend qua IP

### Monitoring
- [x] Stack monitor task (stk_mon, 3072 bytes) — log HWM + heap mỗi 30s
- [x] Tên task và stack size tập trung tại `include/br_config.h`

### Documentation & Tooling
- [x] Memory Bank (6 core files)
- [x] Cursor rule (alwaysApply)
- [x] README.md và TODO.md cập nhật đầy đủ
- [x] Docs symlink từ project sang HomeThread/Documents/

## Chưa làm ❌

### Docs & triển khai ngoài Thread-Host
- [ ] Cập nhật/tạo doc Thread-Node và Dashboard-Thread (child gửi thẳng backend, backend listen IP)

### System Health Push
- [ ] `CMD_SYS_HEALTH` (TBD): gửi stack HWM + heap size cho backend
- [ ] Handler `communicate_command_handle_sys_health()` trong `communicate_command.c`

### Auto-flash RCP
- [ ] Partition `rcp_fw` (SPIFFS) để lưu firmware RCP
- [ ] Kiểm tra RCP có firmware chưa (ping qua UART)
- [ ] Flash RCP qua UART (esptool protocol hoặc `esp-serial-flasher`)
- [ ] Tích hợp vào `app_main` trước khi khởi động OT
- [ ] Kconfig option `CONFIG_AUTO_FLASH_RCP_ON_BOOT`

## Known Issues

| Issue | Trạng thái | Ghi chú |
|-------|-----------|---------|
| `main` task "used full" trong stack monitor | Bình thường | Task đã exit sau `app_main()`, `uxTaskGetStackHighWaterMark` trả 0 → hiển thị "full" |
| Leader CoAP response không được xử lý | Chưa fix | Leader cần implement GET /network/stop handler |

## Bug Fixes đã làm

| Bug | Fix |
|-----|-----|
| `assert failed: xTaskGetHandle` với tên > 15 ký tự | Rút ngắn tên task trong `br_config.h` |
| Stack overflow trong `stk_mon` task | Tăng `TASK_STACK_STK_MON` từ 1536 → 3072 |
| `CMD_FACTORY` không xóa được NVS | Đổi sang raw `esp_partition_erase_range`, bỏ `thread_graceful_shutdown` trước erase |
| `assert: esp_openthread_task_switching_lock_release` trong leader_rloc task | `send_coap_stop_command_once` tự quản lý lock; caller dùng `goto next_iteration` |
