# Progress — Thread-Host

_Cập nhật: 2026-03-10 (OT change detector + table snapshots; docs/logging)_

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
| 0.12.0 | 2026-03-03 | Ethernet IPv6: tạo link-local trên ETHERNET_EVENT_CONNECTED trong eth_w5500.c; br_main log backbone global/link-local IPv6 sau BR init; backhaul chỉ Ethernet (Wi‑Fi fallback tắt trong code). |
| 0.13.0 | 2026-03-03 | SRP server bật (br_custom_config.h + otSrpServerSetEnabled trong br_main); CMD_SRP_REGISTER (0x44) — backend đăng ký _dashboard._udp qua SRP client trên BR (hostname + AAAA + port); sdkconfig.defaults SRP client; log khi nhận đăng ký; fix crash otSrpClientStart(instance, NULL) (bỏ gọi, dùng auto-start). |
| 0.14.0 | 2026-03-03 | SRP: lease/key lease 60/120 (service struct + SetLeaseInterval/SetKeyLeaseInterval) để server chấp nhận update; SRP CLI: CONFIG_OPENTHREAD_HEADER_CUSTOM=y, path "include", file br_custom_config.h — lệnh `ot srp server host` / `ot srp server service` dùng để kiểm tra đăng ký. |
| 0.15.0 | 2026-03-03 | SRP hostname lifetime: buffer tĩnh `s_srp_hostname` thay vì stack; copy hostname vào đó trước `otSrpClientSetHostName` vì OT SRP client chỉ lưu con trỏ — tránh dangling pointer và mojibake/empty host khi DNS update bất đồng bộ. |
| 0.16.0 | 2026-03-03 | SRP IPv6 address lifetime: buffer tĩnh `s_srp_backend_addr` thay vì stack; copy 16 byte AAAA vào đó trước `otSrpClientSetHostAddresses` — tránh địa chỉ rác trên SRP server và discovery sai trên Thread-Node. |
| 0.17.0 | 2026-03-06 | Loại bỏ Leader Control Client (CoAP GET `/network/stop`) và toàn bộ docs liên quan. |
| 0.18.0 | 2026-03-06 | Ethernet init: chờ **IPv4** (DHCP) only; timeout 15s. Direct-connect: khi timeout + link up → BR static 192.168.4.1 (Kconfig BR_ETH_DIRECT_IP_*), thử dhcps_start (netif ETH không có dhcps → thường fail, PC set static 192.168.4.2). Backend route: accept_ra_rt_info_max_plen **per-interface** (vd. enp8s0), RS để BR phát RA sớm. |
| 0.19.0 | 2026-03-08 | W5500: init **chỉ** chờ IPv4 (DHCP), không chấp nhận chỉ IPv6; timeout default **25s** (BR_ETH_LINK_TIMEOUT_MS). **IPv4 timeout → esp_restart()** trong br_main. W5500 RST do code: hold (BR_ETH_RST_HOLD_MS, default 200ms) + release delay (BR_ETH_RST_RELEASE_MS); phy reset_gpio_num = -1. Bỏ INT diagnostic (counter/task). |
| 0.20.0 | 2026-03-10 | OpenThread change detector: `otSetStateChangedCallback()` → debounce → snapshot+diff (role/rloc/dataset + router/child/joiner tables) để giảm polling. Tách snapshot builders ra module dùng chung. Cập nhật docs/logging theo hành vi hiện tại. |

_(Ghi phiên bản theo Semantic Versioning MAJOR.MINOR.PATCH, không dùng tiền tố `v`. Nếu chỉ có major/minor thì PATCH = 0.)_

## Đã hoàn thành ✅

### Core Infrastructure
- [x] OpenThread Border Router với border routing + prefix delegation
- [x] RCP giao tiếp qua SPI (host SPI2; pins cấu hình trong menuconfig)
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
- [x] Frame RX/TX logging ở INFO: `id/cmd/len` cho mọi frame; byte stream TCP (`tcp rx/tx N bytes`) xem ở DEBUG tag `transport_tcp`

### OpenThread change detection
- [x] `ot_change_detector`: hook `otSetStateChangedCallback()` → debounce (arm-once) → build snapshot (role/rloc/dataset + tables) → diff → `changed_mask` (chưa notify backend)
- [x] `ot_table_snapshot`: serialize router/child/joiner tables ra buffer snapshot (dùng chung với handlers)

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
- [x] Ethernet W5500 (SPI) — backbone khi bật; init **chỉ** chờ IPv4 (DHCP), timeout 25s default; IPv4 timeout → esp_restart(); IPv6 link-local trên ETHERNET_EVENT_CONNECTED
- [x] W5500 RST: hold + release delay (Kconfig BR_ETH_RST_HOLD_MS / BR_ETH_RST_RELEASE_MS); reset trong code, driver không reset (phy reset_gpio_num = -1)
- [x] Direct-connect (BR–PC cable): timeout → restart hoặc static 192.168.4.1 (Kconfig); PC static 192.168.4.2
- [x] Backhaul chỉ LAN — Wi‑Fi đã gỡ; chỉ Ethernet W5500

### CoAP
- [x] Device Registry — đã bỏ (Phase 1); child gửi thẳng backend qua IP
- [x] Leader Control Client (GET `/network/stop`) — đã gỡ (0.17.0); BR không còn CoAP client

### Monitoring
- [x] Stack monitor task (stk_mon, 3072 bytes) — log HWM + heap mỗi 30s
- [x] Tên task và stack size tập trung tại `include/br_config.h`

### Documentation & Tooling
- [x] Memory Bank (6 core files)
- [x] Cursor rule (alwaysApply)
- [x] README.md và TODO.md cập nhật đầy đủ
- [x] Docs symlink từ project sang HomeThread/Documents/
- [x] Docs: Backend reply→Node (route prefix Thread qua BR); Dashboard-Thread Docker (network host, default BR IP) — real_br_integration.md + Memory Bank

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
| BR log `ipaddr response no ACK` 1–2 lần khi boot/reconnect | Dashboard-Thread | Dashboard đã reply ACK cho IP_ADDR trong `CommandManager.handle()`; 1–2 lần retry thường do timing/reconnect. Nếu spam liên tục thì kiểm tra TCP ổn định và log `Failed to send reply ACK`. |

_(SRP server Refused đã xử lý trong 0.14.0 — lease/key lease 60/120.)_

## Bug Fixes đã làm

| Bug | Fix |
|-----|-----|
| `assert failed: xTaskGetHandle` với tên > 15 ký tự | Rút ngắn tên task trong `br_config.h` |
| Stack overflow trong `stk_mon` task | Tăng `TASK_STACK_STK_MON` từ 1536 → 3072 |
| `CMD_FACTORY` không xóa được NVS | Đổi sang raw `esp_partition_erase_range`, bỏ `thread_graceful_shutdown` trước erase |
| `assert: esp_openthread_task_switching_lock_release` (Leader Control) | Code path đã gỡ trong 0.17.0 (Leader Control Client removed). Trước đây: lock management trong send_coap_stop_command_once. |
| LoadProhibited khi gọi `otSrpClientStart(instance, NULL)` | OpenThread dereference server addr; bỏ gọi Start, chỉ dùng SRP client auto-start sau set host+address+add service |
| SRP CLI "Unrecognized command" | Bật CONFIG_OPENTHREAD_HEADER_CUSTOM=y và CONFIG_OPENTHREAD_CUSTOM_HEADER_PATH="include" (sdkconfig) để OpenThread include br_custom_config.h → lệnh srp server/srp client được biên dịch; fullclean + build + flash |
| SRP hostname mojibake / host rỗng khi đăng ký qua CMD_SRP_REGISTER | OT SRP client không copy hostname, chỉ lưu con trỏ; buffer stack thành dangling sau khi handler return. Fix: buffer tĩnh `s_srp_hostname`, copy hostname vào đó rồi gọi `otSrpClientSetHostName(instance, s_srp_hostname)` (0.15.0) |
| SRP địa chỉ IPv6 sai (SRP server / Thread-Node discovery) | OT SRP client không copy địa chỉ; stack `otIp6Address` → dangling. Fix: buffer tĩnh `s_srp_backend_addr`, copy 16 byte payload rồi gọi `otSrpClientSetHostAddresses(instance, &s_srp_backend_addr, 1)` (0.16.0) |
