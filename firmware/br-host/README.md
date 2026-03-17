# Thread Border Router — ESP32-S3 (Host) + ESP32-H2 (RCP)

Project **Thread Border Router thật** chạy trên **ESP32-S3** (Host), giao tiếp với **ESP32-H2** (RCP) qua **SPI**. BR có **backhaul Ethernet W5500** (chỉ LAN), **border routing + prefix**, IPv6 trên backbone (link-local tạo khi Ethernet link up), kênh quản lý BR↔dashboard qua **TCP** (frame protocol).

## BR thật là gì?

- **Thread Border Router (BR)** nối mạng Thread (802.15.4) với backbone (Ethernet), cung cấp IPv6 routable, prefix delegation, service discovery…
- **Kiến trúc Host + RCP**: Host (ESP32-S3) chạy OpenThread + ứng dụng BR; RCP (ESP32-H2) làm radio. Giao tiếp Host–RCP qua **SPI** (RCP SPI slave).
- **Backhaul:** **Ethernet W5500 (SPI)** khi bật — chỉ LAN, không Wi‑Fi. IPv6 link-local được tạo khi Ethernet link up (ETHERNET_EVENT_CONNECTED). Kênh quản lý **chỉ qua TCP** (BR listen port; dashboard kết nối BR_IP:port).

## Phần cứng

| Vai trò | SoC    | Ghi chú |
|--------|--------|--------|
| **Host (BR)** | ESP32-S3 | Chạy firmware BR (project này) |
| **RCP**       | ESP32-H2 | Chạy firmware `ot_rcp` (project [rcp](../rcp)) |

### Nối dây (standalone)

#### Sơ đồ chân BR (ESP32-S3) → RCP (ESP32-H2)

Giao tiếp Host–RCP qua **SPI** (RCP SPI slave). Pin lấy từ menuconfig, mặc định:

| ESP32-S3 (BR) | Tín hiệu   | ESP32-H2 (RCP) | Ghi chú |
|---------------|------------|----------------|---------|
| GPIO4         | SCLK       | **GPIO0**      | SPI clock |
| GPIO5         | MOSI       | **GPIO3**      | Host → RCP |
| GPIO2         | MISO       | **GPIO1**      | RCP → Host |
| GPIO3         | CS         | **GPIO2**      | Chip select |
| GPIO1         | IRQ        | **GPIO4**      | Interrupt RCP→Host (-1 = poll) |
| GPIO7         | RST        | RST            | Reset RCP (br_rcp_ctrl) |
| GPIO8         | BOOT       | **GPIO9** / BOOT | Boot mode (download) |

- SPI host: 1 (SPI2). Clock mặc định 10 MHz (BR_RCP_SPI_CLOCK_MHZ).
- RCP firmware: `ot_rcp` với menu **RCP SPI (Host connection)** (project `rcp`).

#### Sơ đồ chân BR (ESP32-S3) → W5500

Backhaul Ethernet qua **SPI**. Pin lấy từ menuconfig, mặc định:

| ESP32-S3 (BR) | Tín hiệu | W5500  | Ghi chú |
|---------------|----------|--------|---------|
| GPIO12        | SCLK     | SCLK   | SPI2 clock (default 20 MHz) |
| GPIO11        | MOSI     | MOSI   | |
| GPIO13        | MISO     | MISO   | |
| GPIO10        | CS       | nSS    | Chip select |
| GPIO9         | INT      | INT    | Interrupt (-1 = polling) |
| GPIO6         | RST      | RST/NRESET | Reset (hold/release trong code) |

- SPI host: 2 (SPI2). GND chung BR–W5500–RCP.

**UART console/log (tùy chọn, để debug):**
- **ESP32-S3** (Host) — **PC/Serial adapter**:
  - **GPIO43 (S3 TX)** → **RX (PC)** (UART0 TX)
  - **GPIO44 (S3 RX)** ← **TX (PC)** (UART0 RX)
  - Hoặc GPIO17/18 tùy board
- Console/log mặc định qua UART0.

**Kênh frame (BR ↔ dashboard):** Transport **TCP** — BR listen port (mặc định 5000), dashboard kết nối BR_IP:port, gửi/nhận byte stream. Không dùng USB/UART.

**Cấu trúc frame (sơ bộ):** Mỗi khung: **SOF** `0xAA` | **Frame ID** (1B) | **CMD** (1B) | **LEN** (2B big-endian) | **DATA** (LEN bytes) | **CRC8** (CRC-8/MAXIM trên [FrameID, CMD, LEN, DATA]) | **EOF** `0x55`. Dashboard gửi Pull (CMD_STATE, CMD_DATASET_ACTIVE, CMD_IP_ADDR, SET_*, CMD_ROUTER_TABLE, …); BR trả CMD_ACK (+ data) hoặc CMD_NACK. Chi tiết CMD và format bảng: [docs/protocol/usb_cdc_frame_structure.md](docs/protocol/usb_cdc_frame_structure.md), [docs/protocol/table_data_format.md](docs/protocol/table_data_format.md).

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
cd /path/to/firmware/br-host
. $IDF_PATH/export.sh
idf.py set-target esp32s3
idf.py build
```

- **sdkconfig.defaults** đã cấu hình:
  - Target ESP32-S3, OpenThread BR, RCP qua **SPI** (SCLK=4, MOSI=5, MISO=2, CS=3, IRQ=1)
  - Console/Log qua **UART0**
  - Flash baud rate **921600**
  - RCP control pins: GPIO7 (RESET), GPIO8 (BOOT). W5500: SPI2 (SCLK=12, MOSI=11, MISO=13, CS=10, INT=9, RST=6)
- **Backhaul:** `idf.py menuconfig` → **ESP Thread Border Router** — bật **Ethernet W5500** (SPI pins). Backhaul chỉ LAN. Init **chỉ** chờ IPv4 (DHCP), timeout 25s (BR_ETH_LINK_TIMEOUT_MS); nếu timeout thì BR restart. RST W5500: hold/release cấu hình (BR_ETH_RST_HOLD_MS, BR_ETH_RST_RELEASE_MS). Cắm trực tiếp BR–PC: static BR 192.168.4.1, PC 192.168.4.2. Backend route: xem [real_br_integration.md](docs/architecture/real_br_integration.md) (accept_ra_rt_info_max_plen per-interface, RS).

### 3. Flash và chạy

Flash BR lên ESP32-S3:

```bash
idf.py -p /dev/ttyUSB0 flash monitor
```

**Lưu ý**: Flash baud rate đã được set thành 921600 trong `sdkconfig.defaults` để tăng tốc độ upload. Nếu gặp lỗi kết nối, có thể giảm xuống 460800 hoặc dùng flag `-b`:
```bash
idf.py -p /dev/ttyUSB0 -b 460800 flash monitor
```

### 4. Debug: log frame RX/TX

BR hiện log **mọi frame RX/TX ở mức INFO** (dạng `id/cmd/len`). Nếu cần xem thêm **byte stream TCP** (`tcp rx/tx N bytes`) thì set log level **DEBUG** cho component `transport_tcp` (menuconfig → Component config → Log output).

## Cấu trúc project

```
Thread-Host/
├── main/
│   ├── br_main.c                    # Entry point (app_main)
│   ├── br_launch.c                  # Launch OpenThread BR
│   ├── br_console.c                 # CLI console (OpenThread + system commands)
│   ├── br_rcp_ctrl.c                # Control RESET/BOOT pins của RCP
│   ├── br_custom_config.h           # OpenThread custom config (CoAP API enabled)
│   ├── openthread/
│   │   ├── dataset_init.c           # Dataset init on boot
│   │   ├── ot_change_detector.c     # OT state changed callback → debounce → snapshot diff
│   │   └── ot_table_snapshot.c      # Serialize router/child/joiner tables to snapshot buffers
│   ├── hardware/
│   │   └── led_status.c             # LED status indicator (WS2812)
│   ├── backhaul/
│   │   └── eth_w5500.c                 # Ethernet W5500 (SPI), backhaul LAN
│   ├── communicate/
│   │   ├── communicate.c               # Parse/serialize frame, gọi transport
│   │   ├── communicate_task.c          # RX callback + state watchdog (backend pull định kỳ)
│   │   ├── communicate_queue.c         # Queue frame, process task gọi handler; timeout gửi, log khi chờ lâu
│   │   ├── communicate_command.c       # Handler CMD STATE, DATASET_ACTIVE, IP_ADDR, SET_*, ROUTER/CHILD/JOINER_TABLE, THREAD_START/STOP/VERSION, RESET/FACTORY, COMMISSIONER_JOINER, SRP_REGISTER
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
│   ├── openthread/
│   │   ├── ot_change_detector.h     # OT change detector API
│   │   └── ot_table_snapshot.h      # Snapshot builder API
│   ├── hardware/
│   │   └── led_status.h             # LED status header
│   ├── communicate/
│   │   ├── communicate.h            # Communicate API, CMD defines
│   │   ├── communicate_config.h     # COMMUNICATE_FRAME_MAX_DATA_LEN
│   │   ├── communicate_task.h       # communicate_task_start(), mark_state_received, mark_ip_response_pending
│   │   ├── communicate_queue.h      # communicate_queue_init(), post
│   │   ├── communicate_command.h    # Command handler API
│   │   └── transport_tcp.h          # Transport TCP API
├── components/
│   └── cmd_system/                  # System console commands (version, restart, free, heap...)
├── docs -> ../../documents/         # Symlink → namorix-thread/documents/
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
- **OpenThread**: Border Router, RCP qua **SPI** (Host = SPI2: SCLK=4, MOSI=5, MISO=2, CS=3, IRQ=1), **không WiFi/BLE**
  - Border Agent: Enabled
  - Commissioner: Enabled
- **RCP Control pins**: GPIO7 (RESET), GPIO8 (BOOT) trên ESP32-S3 (tùy chọn, để auto-flash RCP)
- **W5500 (backhaul)**: SPI2 — SCLK=12, MOSI=11, MISO=13, CS=10, INT=9, RST=6 (menuconfig)
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
- ✅ RCP qua SPI (Host SPI2: SCLK=4, MOSI=5, MISO=2, CS=3, IRQ=1)
- ✅ RCP control (RESET/BOOT pins) — GPIO7/GPIO8
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
- **Device Registry:** Đã bỏ (Phase 1). BR chuyển sang mô hình BR thật: child gửi register/update/ping **trực tiếp tới backend** (CoAP/HTTP tới IP backend); BR chỉ quản lý (state, dataset, Commissioner) qua frame protocol với backend — xem plan Real BR migration.
- ✅ **Communicate (frame protocol)** — Khung và CMD theo cấu trúc frame (mục Kênh frame) trên. **communicate_task**: queue + state watchdog (5 miss × 15s → restart). Handlers: STATE, DATASET_ACTIVE, IP_ADDR, SET_*, ROUTER/CHILD/JOINER_TABLE, THREAD_START/STOP/VERSION, RESET, FACTORY, COMMISSIONER_JOINER, SRP_REGISTER. Chi tiết: [docs/protocol/usb_cdc_frame_structure.md](docs/protocol/usb_cdc_frame_structure.md), [docs/protocol/table_data_format.md](docs/protocol/table_data_format.md). Stack monitor: `stk_mon` log HWM + heap mỗi 30s.
- ❌ **Auto-flash RCP khi boot** — xem [TODO.md](TODO.md)
- ❌ RCP update/firmware management (đã loại bỏ)
- ✅ **Xử lý CMD** — Như mục Communicate; BR trả ACK (+ data) hoặc NACK. SRP_REGISTER (0x44): backend đăng ký _dashboard._udp.
- ✅ **SRP (Service Registration Protocol)** — SRP server bật trên BR (listen Thread mesh); backend đăng ký service `_dashboard._udp` qua **CMD_SRP_REGISTER** (frame TCP, không UDP BR:53535). BR dùng SRP client đăng ký host + service lên SRP server; child discovery `_dashboard._udp` qua SRP/DNS. Hostname và địa chỉ IPv6 backend được lưu trong buffer tĩnh (`s_srp_hostname`, `s_srp_backend_addr`) vì OpenThread SRP client chỉ giữ con trỏ — tránh mojibake/empty host và địa chỉ rác khi DNS update bất đồng bộ. Cần `CONFIG_OPENTHREAD_HEADER_CUSTOM=y` và path `include` để lệnh **`ot srp server host`** / **`ot srp server service`** có sẵn trên serial CLI (kiểm tra host/service đã đăng ký).
- ❌ **Push system health** — Gửi stack HWM + heap size cho backend/Node để monitor từ xa; xem [TODO.md](TODO.md).

## Tài liệu tham khảo

- **Frame & bảng:** [docs/protocol/usb_cdc_frame_structure.md](docs/protocol/usb_cdc_frame_structure.md) (cấu trúc khung, bảng CMD), [docs/protocol/table_data_format.md](docs/protocol/table_data_format.md) (Router/Child/Joiner table).
- **Tích hợp BR:** [docs/architecture/real_br_integration.md](docs/architecture/real_br_integration.md) (Dashboard TCP, child→backend).
- **Backend checklist (frame TCP):** [docs/architecture/backend_br_frame_requirements.md](docs/architecture/backend_br_frame_requirements.md)

### Tài liệu chính thức

- [ESP Thread Border Router — Build and Run](https://docs.espressif.com/projects/esp-thread-br/en/latest/dev-guide/build_and_run.html)  
- [OpenThread Border Router](https://openthread.io/guides/border-router)
- [ESP-IDF Programming Guide](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/)
