# Tech Context — Thread-Host

## Platform & SDK

- **SoC Host:** ESP32-S3 (dual-core Xtensa LX7, 160MHz)
- **SoC RCP:** ESP32-H2 (IEEE 802.15.4 radio)
- **SDK:** ESP-IDF v5.5.x (`esp/v5.5.2/esp-idf`)
- **OpenThread:** bundled trong ESP-IDF `components/openthread`
- **Build system:** CMake + idf.py

## Hardware Pins

| Tín hiệu | GPIO | Ghi chú |
|-----------|------|---------|
| UART RX (Host←RCP TX) | GPIO4 | `CONFIG_PIN_TO_RCP_TX` |
| UART TX (Host→RCP RX) | GPIO5 | `CONFIG_PIN_TO_RCP_RX` |
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
- CoAP: `otCoapStart`, `otCoapAddResource`, `otCoapNewMessage`, `otCoapSendRequest`, `otCoapMessageInit`, `otCoapMessageAppendUriPathOptions`
- Network: `otThreadGetLeaderRloc`, `otThreadGetLeaderData`

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
- **Wi‑Fi STA:** `backhaul/wifi_sta.c` — kết nối AP (Kconfig SSID/pass), DHCP, `wifi_sta_get_netif()` cho backbone.
- **Ethernet W5500 (SPI):** `backhaul/eth_w5500.c` — ưu tiên khi bật; timeout thì fallback Wi‑Fi. ESP32-S3 không có EMAC (không dùng LAN8720).
- **Kênh BR↔dashboard:** Chỉ **TCP** (frame protocol trên socket); không USB/UART.

### Logging (frame RX/TX)
- Mặc định **INFO**: chỉ in frame RX/TX cho CMD không noisy (GET_DATASET, SET_*, COMMISSIONER_JOINER, …); CMD_STATE và *_TABLE không in.
- Để xem **mọi frame RX/TX** và **byte stream TCP** (tcp rx/tx N bytes): set log level **DEBUG** cho tag `communicate` và `transport_tcp` (menuconfig hoặc `esp_log_level_set`).

## Cấu hình quan trọng (sdkconfig / sdkconfig.defaults)

- `CONFIG_OPENTHREAD_ENABLED=y`
- `CONFIG_OPENTHREAD_BORDER_ROUTER=y`
- `CONFIG_OPENTHREAD_COMMISSIONER=y`
- `CONFIG_OPENTHREAD_BORDER_AGENT=y`
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
│   │   ├── wifi_sta.c               ← Wi‑Fi STA, DHCP, wifi_sta_get_netif()
│   │   └── eth_w5500.c              ← Ethernet W5500 (SPI), ưu tiên, fallback Wi‑Fi
│   ├── communicate/
│   │   ├── communicate.c            ← frame parser/builder, log suppression
│   │   ├── communicate_command.c    ← tất cả CMD handlers
│   │   ├── communicate_queue.c      ← FreeRTOS queue + dispatch
│   │   ├── communicate_task.c       ← state watchdog + IP retry
│   │   └── transport_tcp.c          ← TCP transport (BR listen, dashboard qua IP)
│   ├── coap_controller/
│   │   └── leader_control_client.c  ← CoAP GET /network/stop
│   └── hardware/
│       ├── led_status.c             ← WS2812 RMT
│       └── boot_btn.c               ← GPIO0 poll
├── include/
│   ├── br_config.h                  ← TASK_NAME_*, TASK_STACK_* (centralized)
│   ├── backhaul/wifi_sta.h, eth_w5500.h
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
