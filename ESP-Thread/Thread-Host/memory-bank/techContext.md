# Tech Context — Thread-Host

## Platform & SDK

- **SoC Host:** ESP32-S3 (dual-core Xtensa LX7, 160MHz)
- **SoC RCP:** ESP32-H2 (IEEE 802.15.4 radio)
- **SDK:** ESP-IDF v5.5.x (vd. `esp/v5.5.3/esp-idf`)
- **OpenThread:** bundled trong ESP-IDF `components/openthread`
- **Build system:** CMake + idf.py

## Hardware Pins

| Tín hiệu | GPIO | Ghi chú |
|-----------|------|---------|
| RCP SPI SCLK | GPIO4 | Host→RCP (default menuconfig) |
| RCP SPI MOSI | GPIO5 | Host→RCP |
| RCP SPI MISO | GPIO2 | RCP→Host |
| RCP SPI CS | GPIO3 | Chip select |
| RCP SPI IRQ | GPIO1 | Interrupt từ RCP (-1 = poll) |
| RCP RESET | GPIO7 | `br_rcp_ctrl_init` |
| RCP BOOT | GPIO8 | download mode |
| LED WS2812 | GPIO48 | onboard, hoặc GPIO5 external |
| BOOT button | GPIO0 | long press 3s = factory reset |
| Console UART TX | GPIO43 | UART0 |
| Console UART RX | GPIO44 | UART0 |

## Key Libraries & APIs

### OpenThread (ESP-IDF wrapper)
- `esp_openthread_get_instance()` — lấy OT instance
- `esp_openthread_lock_acquire/release(pdMS_TO_TICKS(N))` — **PHẢI dùng** khi gọi OT API từ task ngoài OT main task
- `esp_openthread_start()` — khởi động OT main loop (blocking)

### OT APIs thường dùng
- Thread: `otThreadGetDeviceRole`, `otThreadSetEnabled`, `otIp6SetEnabled`
- Dataset: `otDatasetGetActiveTlvs`, `otDatasetGetActive`, `otDatasetSetActive`
- Tables: `otThreadGetRouterInfo`, `otThreadGetChildInfoByIndex`
- Commissioner: `otCommissionerGetState`, `otCommissionerStart`, `otCommissionerAddJoiner`, `otCommissionerGetNextJoinerInfo`
- CoAP: BR hiện **không** dùng CoAP (server/client đã gỡ — Device Registry Phase 1, Leader Control Client 0.17.0). APIs tham khảo: `otCoapStart`, `otCoapAddResource`, `otCoapNewMessage`, …
- Network: `otThreadGetLeaderRloc`, `otThreadGetLeaderData`
- SRP server: `otSrpServerSetEnabled` (br_main sau border router init). SRP server chỉ listen trên Thread mesh, không trên backbone.
- SRP client: `otSrpClientEnableAutoStartMode`, `otSrpClientClearHostAndServices`, `otSrpClientSetHostName`, `otSrpClientSetHostAddresses`, `otSrpClientAddService`. Không gọi `otSrpClientStart(instance, NULL)` — crash (dereference). Dùng auto-start sau khi set host + address + add service.

### FreeRTOS
- `xTaskCreate` / `xQueueCreate` / `xQueueSend` / `xQueueReceive`
- `uxTaskGetStackHighWaterMark` — đo stack HWM
- `xTaskGetHandle(name)` — lấy handle theo tên (assert nếu tên > 15 ký tự)
- `vTaskDelay(pdMS_TO_TICKS(N))`

### ESP-IDF System
- `esp_restart()` — software reset
- `esp_timer_create/start_once` — one-shot deferred action
- `nvs_flash_init/deinit/erase` — NVS management
- `esp_partition_find_first/erase_range` — raw partition erase
- `esp_get_free_heap_size/esp_get_minimum_free_heap_size` — heap monitor
- `esp_log_level_set` — runtime log level

### Backhaul
- **Ethernet W5500 (SPI):** `backhaul/eth_w5500.c` — backbone khi `CONFIG_BR_ETH_W5500_ENABLE=y`. Backhaul chỉ LAN. Init **chỉ** chờ **IPv4** (DHCP); timeout CONFIG_BR_ETH_LINK_TIMEOUT_MS (default **25s**). Nếu timeout: `br_main.c` gọi `esp_restart()`. W5500 RST: code reset trước init (hold BR_ETH_RST_HOLD_MS, release delay BR_ETH_RST_RELEASE_MS); `phy_config.reset_gpio_num = -1`. IPv6 link-local: `esp_netif_create_ip6_linklocal(netif)` trong ETHERNET_EVENT_CONNECTED. ESP32-S3 không có EMAC.
- **br_main:** Sau border router init, log backbone IPv6 (tag `br_main`).
- **Kênh BR↔dashboard:** Chỉ TCP (frame protocol); không USB/UART.

### Docs
- `docs/installation.md`: sysctl nhận route IPv6 (RA/RIO) + add route tay cho backend Linux.

#### Backbone IPv4-only vs IPv6
- Mạng LAN nhà hiện tại chỉ cấp **IPv4** (router không cấp IPv6 từ ISP). Điều này **không cản trở** BR làm Border Router cho Thread:
  - BR vẫn có IPv4 trên backbone (DHCP hoặc static) để Dashboard/backend kết nối `BR_IP:port`.
  - BR vẫn bật border routing + prefix cho Thread; child có IPv6 trong prefix BR quảng bá.
- Khi backbone **không có router IPv6** gửi RA, OpenThread có thể log:
  - `Failed to send ND6 message`, `RsSender: Failed to send RS 1/3: Failed`
  - `Failed to remove backbone multicast listener`
  Các log này phản ánh việc BR không nhận/cập nhật cấu hình IPv6 từ backbone, nhưng không nhất thiết phá vỡ luồng BR↔Dashboard (IPv4/TCP) hay Thread nội bộ.

#### Backend kết nối thế nào khi LAN chỉ IPv4
- **Model ưu tiên:** Backend (PC/server) bật **IPv6 local** (link-local hoặc ULA) trên interface nối với BR, ngay cả khi ISP/router không hỗ trợ IPv6. Khi đó:
  - Child (IPv6 trong prefix Thread) ↔ Backend (IPv6 local) đi qua BR theo đúng mô hình “BR thật” (BR chỉ route, không proxy app-layer).
  - Border router chỉ cần route giữa prefix Thread và prefix/IPv6 local của backend, không cần IPv6 uplink.
- **Model thay thế (chưa implement):**
  - **Proxy trên BR:** Child gửi CoAP/HTTP tới BR; BR forward payload sang backend qua IPv4 rồi trả response lại cho child.
  - **NAT64:** BR (hoặc gateway khác) dịch IPv6 (child) ↔ IPv4 (backend), cho phép backend thuần IPv4. Đây là hướng mở rộng, chưa có trong Thread-Host hiện tại.

#### Route backend → Node (reply CoAP)
- Backend cần route: prefix Thread **via** BR (link-local). BR gửi RA với RIO; để kernel cài route từ RIO: **per-interface** `sysctl net.ipv6.conf.<iface>.accept_ra_rt_info_max_plen=128` (vd. enp8s0). Không dùng `net.ipv6.conf.all.*` — all chỉ là mặc định, không áp dụng ngược cho interface đã có. Hoặc add tay: `ip -6 route add <prefix>::/64 via <BR_fe80::> dev <iface>`. BR phát RA theo chu kỳ hoặc khi nhận RS; backend có thể gửi **Router Solicitation** (vd. `rdisc6 -1 <iface>`) để nhận RA sớm. Chi tiết: activeContext.md, Documents/architecture/real_br_integration.md. **Docker:** `network_mode: host`; default BR 192.168.31.3. Add route trong container cần `--cap-add=NET_ADMIN`.

### Logging (frame RX/TX)
- Mặc định **INFO**: in **mọi frame RX/TX** và hexdump **header/payload/tail**.
- Để xem thêm **byte stream TCP** (tcp rx/tx N bytes): set log level **DEBUG** cho tag `transport_tcp` (menuconfig hoặc `esp_log_level_set`).

## Cấu hình quan trọng (sdkconfig / sdkconfig.defaults)

- `CONFIG_OPENTHREAD_ENABLED=y`
- `CONFIG_OPENTHREAD_BORDER_ROUTER=y`
- `CONFIG_OPENTHREAD_COMMISSIONER=y`
- `CONFIG_OPENTHREAD_BORDER_AGENT=y`
- `CONFIG_OPENTHREAD_SRP_CLIENT=y`, `CONFIG_OPENTHREAD_SRP_CLIENT_MAX_SERVICES=5` — CMD_SRP_REGISTER
- **SRP CLI (ot srp server / ot srp client):** `CONFIG_OPENTHREAD_HEADER_CUSTOM=y`, `CONFIG_OPENTHREAD_CUSTOM_HEADER_PATH="include"`, `CONFIG_OPENTHREAD_CUSTOM_HEADER_FILE_NAME="br_custom_config.h"` — nếu không bật thì lệnh `srp server` / `srp client` sẽ "Unrecognized command". Custom header nằm tại `include/br_custom_config.h` (SRP server enable + CoAP API, v.v.). Kiểm tra đăng ký: **`ot srp server host`**, **`ot srp server service`**.
- `CONFIG_OPENTHREAD_LOG_LEVEL_WARN` — giảm noise OT log
- `CONFIG_ESP_MAIN_TASK_STACK_SIZE` — stack của `app_main` task
- UART baud: 460800 (Host–RCP runtime), 115200 (download mode)

## Partition Table (partitions.csv)

```
nvs        | data | nvs    | 0x9000  | 0x6000
otadata    | data | ota    | 0xf000  | 0x2000
phy_init   | data | phy    | 0x11000 | 0x1000
ota_0      | app  | ota_0  | 0x20000 | 0x200000
ota_1      | app  | ota_1  | 0x220000| 0x200000
web_storage| data | 0x82   | 0x420000| 0x32000
```

## File Structure quan trọng

```
Thread-Host/
├── main/
│   ├── br_main.c                    ← app_main, backhaul chọn backbone, stack_monitor_task
│   ├── backhaul/
│   │   └── eth_w5500.c              ← Ethernet W5500 (SPI), backhaul LAN
│   ├── communicate/
│   │   ├── communicate.c            ← frame parser/builder, log suppression
│   │   ├── communicate_command.c    ← tất cả CMD handlers
│   │   ├── communicate_queue.c      ← FreeRTOS queue + dispatch
│   │   ├── communicate_task.c       ← state watchdog + IP retry
│   │   └── transport_tcp.c          ← TCP transport (BR listen, dashboard qua IP)
│   └── hardware/
│       ├── led_status.c             ← WS2812 RMT
│       └── boot_btn.c               ← GPIO0 poll
├── include/
│   ├── br_config.h                  ← TASK_NAME_*, TASK_STACK_* (centralized)
│   ├── br_custom_config.h           ← OpenThread custom config (SRP server, CoAP API, …); cần HEADER_CUSTOM=y + path "include"
│   ├── backhaul/eth_w5500.h
│   └── communicate/communicate.h   ← CMD defines, frame API
├── memory-bank/                     ← Memory Bank files
├── .cursor/rules/                   ← Cursor rules
├── docs -> ../../Documents/         ← Symlink đến HomeThread/Documents/
├── README.md
└── TODO.md
```

## Build & Flash

```bash
. /home/izerocs/esp/v5.5.2/esp-idf/export.sh
idf.py set-target esp32s3
idf.py build
idf.py -p /dev/ttyUSB0 flash monitor
# Flash baud: 921600 (set trong sdkconfig.defaults)
```
