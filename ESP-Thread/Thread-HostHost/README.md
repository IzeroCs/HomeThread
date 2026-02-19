# Thread Border Router — ESP32-S3 (Host) + ESP32-H2 (RCP) qua UART

Project cấu hình **Basic Thread Border Router** chạy trên **ESP32-S3** (Host), giao tiếp với **ESP32-H2** (RCP) **chỉ qua UART**. Không dùng WiFi hay BLE trên BR.

## Basic Thread Border Router là gì?

- **Thread Border Router (BR)** là thiết bị nối mạng Thread (802.15.4) với mạng backbone (Ethernet/Wi‑Fi), cung cấp IPv6, NAT64, service discovery, multicast…
- **Kiến trúc Host + RCP**: Host (ESP32-S3) chạy stack OpenThread + ứng dụng BR; RCP (ESP32-H2) chỉ làm radio 802.15.4. Hai chip giao tiếp qua **UART** (mặc định 460800 baud) hoặc SPI.
- Trong project này: **chỉ dùng UART** giữa Host và RCP, **không bật WiFi/BLE**; backhaul dùng **Ethernet** (ví dụ W5500) nếu cần kết nối mạng.

## Phần cứng

| Vai trò | SoC    | Ghi chú |
|--------|--------|--------|
| **Host (BR)** | ESP32-S3 | Chạy firmware BR (project này) |
| **RCP**       | ESP32-H2 | Chạy firmware `ot_rcp` (project [Thread-RCP](../Thread-RCP)) |

### Nối dây (standalone)

**UART communication:**
- **ESP32-S3** (Host) — **ESP32-H2** (RCP):
  - GND ↔ GND  
  - **GPIO5 (S3 TX)** → **RX (H2)**  
  - **GPIO4 (S3 RX)** ← **TX (H2)**  
- Cấu hình khuyến nghị cho S3: dùng **GPIO4 (RX)** và **GPIO5 (TX)** (tránh GPIO17/18 vì dòng driver khác, dễ lỗi timeout).

**RESET và BOOT control (tùy chọn, để auto-flash RCP):**
- **ESP32-S3** (Host) — **ESP32-H2** (RCP):
  - **GPIO7 (S3)** → **RST (H2)** — Reset pin
  - **GPIO8 (S3)** → **GPIO9/BOOT (H2)** — Boot mode pin
- ESP32-S3 có thể control RESET/BOOT của RCP để đưa vào download mode khi cần flash firmware (xem [TODO.md](TODO.md)).

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
cd /path/to/Thread-HostHost
. $IDF_PATH/export.sh
idf.py set-target esp32s3
idf.py build
```

- **sdkconfig.defaults** đã cấu hình: target ESP32-S3, OpenThread BR, RCP qua UART, **không WiFi**, UART 460800, pin **GPIO4 (RX)** / **GPIO5 (TX)** cho Host–RCP.
- Nếu dùng board khác hoặc pin khác: `idf.py menuconfig` → mục **ESP Thread Border Router Example** để đổi pin.

### 3. Flash và chạy

Flash BR lên ESP32-S3:

```bash
idf.py -p /dev/ttyUSB0 flash monitor
```

## Cấu trúc project

```
Thread-HostHost/
├── main/
│   ├── br_main.c          # Entry point (app_main)
│   ├── br_launch.c        # Launch OpenThread BR
│   ├── br_console.c       # CLI console (OpenThread + system commands)
│   ├── br_rcp_ctrl.c       # Control RESET/BOOT pins của RCP
│   ├── include/
│   │   ├── br_config.h    # UART config, pin definitions
│   │   ├── br_launch.h
│   │   ├── br_console.h
│   │   └── br_rcp_ctrl.h
│   ├── CMakeLists.txt
│   ├── Kconfig.projbuild  # Menuconfig options
│   └── idf_component.yml  # Component dependencies
├── components/
│   └── cmd_system/        # System console commands (version, restart, free, heap...)
├── partitions.csv         # Partition table
├── sdkconfig.defaults    # Default config
├── CMakeLists.txt        # Root CMake
├── TODO.md               # Tính năng sẽ làm sau
└── README.md
```

### Components

- **esp_ot_cli_extension**: OpenThread CLI extension commands (từ ESP Component Registry).
- **cmd_system**: System console commands (version, restart, free, heap, tasks, log_level) — từ ESP-IDF console example.

## Cấu hình đã set (tóm tắt)

- **Target**: ESP32-S3  
- **OpenThread**: Border Router, RCP qua **UART** (460800), **không WiFi/BLE**  
- **UART Host–RCP**: GPIO4 (RX), GPIO5 (TX) trên ESP32-S3  
- **RCP Control pins**: GPIO7 (RESET), GPIO8 (BOOT) trên ESP32-S3 (tùy chọn)  
- **Partition**: custom (ota, nvs, web_storage) theo `partitions.csv`  
- **RCP**: ESP32-H2, firmware từ `$IDF_PATH/examples/openthread/ot_rcp`
- **Console/Log**: USB CDC (hoặc USB Serial JTAG/UART tùy config)

## Tính năng

- ✅ Thread Border Router cơ bản (không WiFi/BLE)
- ✅ CLI console với OpenThread commands + system commands
- ✅ RCP qua UART (460800 baud)
- ❌ Auto-flash RCP khi boot (xem [TODO.md](TODO.md))
- ❌ RCP update/firmware management (đã loại bỏ)

## Tài liệu tham khảo

- [ESP Thread Border Router — Build and Run](https://docs.espressif.com/projects/esp-thread-br/en/latest/dev-guide/build_and_run.html)  
- [OpenThread Border Router](https://openthread.io/guides/border-router)
- [ESP-IDF Programming Guide](https://docs.espressif.com/projects/esp-idf/en/latest/esp32s3/)
