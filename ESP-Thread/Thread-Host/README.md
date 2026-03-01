# Thread Border Router — ESP32-S3 (Host) + ESP32-H2 (RCP)

Project **Thread Border Router thật** chạy trên **ESP32-S3** (Host), giao tiếp với **ESP32-H2** (RCP) qua UART. BR có **backhaul** (Wi‑Fi STA mặc định hoặc Ethernet W5500 ưu tiên), **border routing + prefix**, kênh quản lý BR↔dashboard qua **TCP** (frame protocol).

## BR thật là gì?

- **Thread Border Router (BR)** nối mạng Thread (802.15.4) với backbone (Ethernet/Wi‑Fi), cung cấp IPv6 routable, prefix delegation, service discovery…
- **Kiến trúc Host + RCP**: Host (ESP32-S3) chạy OpenThread + ứng dụng BR; RCP (ESP32-H2) làm radio. Giao tiếp Host–RCP qua **UART** (460800 baud).
- **Backhaul:** Wi‑Fi STA (Kconfig) hoặc **Ethernet W5500 (SPI)** ưu tiên — nếu cắm dây và link up thì dùng Ethernet, không thì fallback Wi‑Fi. Kênh quản lý **chỉ qua TCP** (BR listen port; dashboard kết nối BR_IP:port).

## Phần cứng

| Vai trò | SoC    | Ghi chú |
|--------|--------|--------|
| **Host (BR)** | ESP32-S3 | Chạy firmware BR (project này) |
| **RCP**       | ESP32-H2 | Chạy firmware `ot_rcp` (project [Thread-RCP](../Thread-RCP)) |

### Nối dây (standalone)

**UART communication (RCP):**
- **ESP32-S3** (Host) — **ESP32-H2** (RCP):
  - GND ↔ GND  
  - **GPIO5 (S3 TX)** → **RX (H2)**  
  - **GPIO4 (S3 RX)** ← **TX (H2)**  
- Cấu hình khuyến nghị cho S3: dùng **GPIO4 (RX)** và **GPIO5 (TX)** (tránh GPIO17/18 vì dòng driver khác, dễ lỗi timeout).

**UART console/log (tùy chọn, để debug):**
- **ESP32-S3** (Host) — **PC/Serial adapter**:
  - **GPIO43 (S3 TX)** → **RX (PC)** (UART0 TX)
  - **GPIO44 (S3 RX)** ← **TX (PC)** (UART0 RX)
  - Hoặc GPIO17/18 tùy board
- Console/log mặc định qua UART0, có thể kết nối với serial adapter để xem log.

**RESET và BOOT control (tùy chọn, để auto-flash RCP):**
- **ESP32-S3** (Host) — **ESP32-H2** (RCP):
  - **GPIO7 (S3)** → **RST (H2)** — Reset pin
  - **GPIO8 (S3)** → **GPIO9/BOOT (H2)** — Boot mode pin
- ESP32-S3 có thể control RESET/BOOT của RCP để đưa vào download mode khi cần flash firmware (xem [TODO.md](TODO.md)).
- Code đã sẵn sàng trong `br_rcp_ctrl.c`, tự động reset RCP khi boot.

**Kênh frame (BR ↔ dashboard):**
- Giao tiếp với dashboard theo cấu trúc khung: SOF 0xAA, Frame ID, CMD, LEN, DATA, CRC8, EOF 0x55 (xem [Documents/protocol/usb_cdc_frame_structure.md](../../Documents/protocol/usb_cdc_frame_structure.md)).
- **Transport TCP:** BR listen port (menuconfig, mặc định 5000); dashboard kết nối tới BR_IP:port để gửi/nhận frame. Không dùng USB/UART cho kênh này.

## Yêu cầu

- **ESP-IDF** v5.1.0 trở lên (khuyến nghị v5.5.x).

## Cấu hình project

### 1. Build firmware RCP (ESP32-H2)

Firmware RCP nằm trong ESP-IDF:

```bash
cd $IDF_PATH/examples/openthread/ot_rcp
idf.py set-target esp32h2
idf.py build
```

Flash RCP vào board H2 riêng. Hiện tại BR không tự động flash RCP (xem [TODO.md](TODO.md) cho tính năng auto-flash RCP khi boot).

### 2. Build Border Router (ESP32-S3)

```bash
cd /path/to/Thread-Host
. $IDF_PATH/export.sh
idf.py set-target esp32s3
idf.py build
```

- **sdkconfig.defaults** đã cấu hình:
  - Target ESP32-S3, OpenThread BR, RCP qua UART
  - UART 460800, pin **GPIO4 (RX)** / **GPIO5 (TX)** cho Host–RCP
  - Console/Log qua **UART0**
  - Flash baud rate **921600**
  - RCP control pins: GPIO7 (RESET), GPIO8 (BOOT)
- **Backhaul:** `idf.py menuconfig` → **ESP Thread Border Router** — bật **Wi‑Fi STA** (mặc định, SSID/pass), hoặc **Ethernet W5500** (ưu tiên, SPI pins). Cả hai bật thì Ethernet thử trước, timeout thì Wi‑Fi.

### 3. Flash và chạy

Flash BR lên ESP32-S3:

```bash
idf.py -p /dev/ttyUSB0 flash monitor
```

**Lưu ý**: Flash baud rate đã được set thành 921600 trong `sdkconfig.defaults` để tăng tốc độ upload. Nếu gặp lỗi kết nối, có thể giảm xuống 460800 hoặc dùng flag `-b`:
```bash
idf.py -p /dev/ttyUSB0 -b 460800 flash monitor
```

## Cấu trúc project

```
Thread-Host/
├── main/
│   ├── br_main.c                    # Entry point (app_main)
│   ├── br_launch.c                  # Launch OpenThread BR
│   ├── br_console.c                 # CLI console (OpenThread + system commands)
│   ├── br_rcp_ctrl.c                # Control RESET/BOOT pins của RCP
│   ├── br_custom_config.h           # OpenThread custom config (CoAP API enabled)
│   ├── hardware/
│   │   └── led_status.c             # LED status indicator (WS2812)
│   ├── coap_controller/
│   │   └── leader_control_client.c      # CoAP client để gửi lệnh stop đến Leader
│   ├── backhaul/
│   │   ├── wifi_sta.c                  # Wi‑Fi STA, DHCP, backbone netif
│   │   └── eth_w5500.c                 # Ethernet W5500 (SPI), ưu tiên / fallback Wi‑Fi
│   ├── communicate/
│   │   ├── communicate.c               # Parse/serialize frame, gọi transport
│   │   ├── communicate_task.c          # RX callback + state watchdog (backend pull định kỳ)
│   │   ├── communicate_queue.c         # Queue frame, process task gọi handler; timeout gửi, log khi chờ lâu
│   │   ├── communicate_command.c      # Handler CMD STATE, DATASET_ACTIVE, IP_ADDR, SET_*, ROUTER/CHILD/JOINER_TABLE, THREAD_START/STOP/VERSION
│   │   └── transport_tcp.c             # Transport TCP (BR listen, dashboard kết nối qua IP)
│   ├── include/
│   │   ├── br_config.h              # UART config, pin definitions
│   │   ├── br_launch.h
│   │   ├── br_console.h
│   │   └── br_rcp_ctrl.h
│   ├── CMakeLists.txt
│   ├── Kconfig.projbuild            # Menuconfig options
│   └── idf_component.yml            # Component dependencies
├── include/
│   ├── hardware/
│   │   └── led_status.h             # LED status header
│   ├── communicate/
│   │   ├── communicate.h            # Communicate API, CMD defines
│   │   ├── communicate_config.h     # COMMUNICATE_FRAME_MAX_DATA_LEN
│   │   ├── communicate_task.h       # communicate_task_start(), mark_state_received, mark_ip_response_pending
│   │   ├── communicate_queue.h      # communicate_queue_init(), post
│   │   ├── communicate_command.h    # Command handler API
│   │   └── transport_tcp.h          # Transport TCP API
│   └── coap_controller/
│       └── leader_control_client.h      # Leader control client header
├── components/
│   └── cmd_system/                  # System console commands (version, restart, free, heap...)
├── docs -> ../../Documents/         # Symlink → HomeThread/Documents/
├── partitions.csv                   # Partition table
├── sdkconfig.defaults              # Default config
├── CMakeLists.txt                  # Root CMake
├── TODO.md                         # Tính năng sẽ làm sau
└── README.md
```

### Components

- **esp_ot_cli_extension**: OpenThread CLI extension commands (từ ESP Component Registry).
- **cmd_system**: System console commands (version, restart, free, heap, tasks, log_level) — từ ESP-IDF console example.

## Cấu hình đã set (tóm tắt)

- **Target**: ESP32-S3  
- **OpenThread**: Border Router, RCP qua **UART** (460800), **không WiFi/BLE**
  - Border Agent: Enabled
  - Commissioner: Enabled
- **UART Host–RCP**: GPIO4 (RX), GPIO5 (TX) trên ESP32-S3 (UART1)  
- **RCP Control pins**: GPIO7 (RESET), GPIO8 (BOOT) trên ESP32-S3 (tùy chọn, để auto-flash RCP)
- **LED Status**: GPIO48 (onboard WS2812) hoặc GPIO5 (external WS2812), config qua menuconfig
- **Console/Log**: **UART0** (GPIO43/44 trên ESP32-S3 DevKit, hoặc GPIO17/18 tùy board)
- **Kênh frame**: **TCP** (BR listen port, mặc định 5000; dashboard kết nối BR_IP:port).
- **Flash baud rate**: 921600 (có thể giảm xuống nếu gặp lỗi kết nối)
- **Partition**: custom (ota, nvs, web_storage) theo `partitions.csv`  
- **RCP**: ESP32-H2, firmware từ `$IDF_PATH/examples/openthread/ot_rcp`
- **CoAP**: Enabled (API và Ping Sender) qua `br_custom_config.h`

## Tính năng

- ✅ Thread Border Router cơ bản (không WiFi/BLE)
- ✅ CLI console với OpenThread commands + system commands (qua UART0)
- ✅ RCP qua UART (460800 baud, UART1)
- ✅ RCP control (RESET/BOOT pins) - GPIO7/GPIO8 để control RCP
- ✅ Border Agent enabled (cho external commissioning)
- ✅ Commissioner enabled (cho internal commissioning)
- ✅ Log level tối ưu (OPENTHREAD log level = INFO để giảm noise)
- ✅ Flash baud rate 921600 (tăng tốc độ upload)
- ✅ **LED Status Indicator (WS2812)** - Hiển thị trạng thái Thread qua RGB LED
  - Disabled: đỏ nhấp nháy
  - Detached: xanh dương nhấp nháy
  - Leader: xanh lá tĩnh
  - Router: tím tĩnh
  - Child: xanh dương tĩnh
  - GPIO mặc định: 48 (onboard LED) hoặc 5 (external LED), có thể config qua menuconfig
- ✅ **Leader Control Client (CoAP)** - Tự động gửi lệnh stop đến Leader khi cần
  - Gửi **GET `/network/stop`** (CONFIRMABLE, port 5683) đến Leader RLOC; không payload
  - Gửi khi: first time, Leader RLOC16 thay đổi, retry on failure, hoặc retry timeout (sau 2 phút nếu Leader vẫn còn)
  - Task chạy suốt vòng đời, check mỗi 5 giây; timeout response 5 giây
  - Lock quản lý đúng: acquire/release bên trong `send_coap_stop_command_once`; caller release trước khi gọi
  - Chi tiết format, flow, leader election timing: xem [Documents/coap/leader_stop_command_coap.md](../../Documents/coap/leader_stop_command_coap.md)
- **Device Registry:** Đã bỏ (Phase 1). BR chuyển sang mô hình BR thật: child gửi register/update/ping **trực tiếp tới backend** (CoAP/HTTP tới IP backend); BR chỉ quản lý (state, dataset, Commissioner) qua frame protocol với backend — xem plan Real BR migration.
- ✅ **Communicate (frame protocol)** — Parse/serialize khung SOF/Frame ID/CMD/LEN/DATA/CRC8/EOF; **transport TCP** (BR listen, dashboard kết nối qua IP). **communicate_task**: init + queue (timeout 500 ms, log khi chờ &gt; 2 s) + state watchdog. **Handlers:** CMD_STATE, DATASET_ACTIVE, IP_ADDR (ACK + data), SET_PANID/CHANNEL/NETWORK_NAME/EXTENDED_PANID/NETWORK_KEY, ROUTER/CHILD/JOINER_TABLE (ACK + table data), THREAD_START, THREAD_STOP, THREAD_VERSION (ACK + version string), CMD_RESET (ACK + restart sau 2s), CMD_FACTORY (ACK + NVS erase + restart sau 2s); xem [Documents/protocol/usb_cdc_frame_structure.md](../../Documents/protocol/usb_cdc_frame_structure.md) và [Documents/protocol/table_data_format.md](../../Documents/protocol/table_data_format.md). **Stack & heap monitor:** task `stk_mon` log mỗi 30 s — stack high water mark của tất cả task + heap free/min_free; tên task và stack size tập trung tại `include/br_config.h` (`TASK_NAME_*`, `TASK_STACK_*`).
- ❌ **Auto-flash RCP khi boot** — xem [TODO.md](TODO.md)
- ❌ RCP update/firmware management (đã loại bỏ)
- ✅ **Xử lý CMD** — STATE, DATASET_ACTIVE, IP_ADDR, SET_* (PANID, CHANNEL, NETWORK_NAME, EXTENDED_PANID, NETWORK_KEY), ROUTER/CHILD/JOINER_TABLE, THREAD_START, THREAD_STOP, THREAD_VERSION, RESET, FACTORY, COMMISSIONER_JOINER; BR trả ACK (+ data khi có) hoặc NACK; xem [Documents/protocol/usb_cdc_frame_structure.md](../../Documents/protocol/usb_cdc_frame_structure.md) và [Documents/protocol/table_data_format.md](../../Documents/protocol/table_data_format.md).
- ❌ **Push system health** — Gửi stack HWM + heap size cho backend/Node để monitor từ xa; xem [TODO.md](TODO.md).

## Tài liệu tham khảo

### Tài liệu (HomeThread/Documents/)

- **[Documents/protocol/usb_cdc_frame_structure.md](../../Documents/protocol/usb_cdc_frame_structure.md)** — Cấu trúc khung USB CDC (SOF, Frame ID, CMD, LEN, DATA, CRC8, EOF); bảng CMD.
- **[Documents/protocol/table_data_format.md](../../Documents/protocol/table_data_format.md)** — Format dữ liệu Router Table, Child Table, Joiner Table.
- **[Documents/coap/leader_stop_command_coap.md](../../Documents/coap/leader_stop_command_coap.md)** — CoAP Stop Command / Leader Control.
- **[Documents/coap/border_router_coap_server.md](../../Documents/coap/border_router_coap_server.md)** — CoAP server BR (device registry).

### Tài liệu chính thức

- [ESP Thread Border Router — Build and Run](https://docs.espressif.com/projects/esp-thread-br/en/latest/dev-guide/build_and_run.html)  
- [OpenThread Border Router](https://openthread.io/guides/border-router)
- [ESP-IDF Programming Guide](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/)
