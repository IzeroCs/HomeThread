# Project Brief — br-host

## Mục tiêu

Firmware cho **ESP32-S3** chạy vai trò **Thread Border Router (BR)**, giao tiếp với RCP ESP32-H2 qua UART. BR là **BR thật**: route IPv6, prefix delegation, kết nối backbone (Ethernet W5500, chỉ LAN) và quản lý qua **frame protocol trên TCP** (không USB/UART với PC).

## Phạm vi

- **Backhaul:** **Ethernet W5500 (SPI)** khi bật (chỉ LAN, không Wi‑Fi). BR có IP (IPv4 + IPv6 link-local/global) trên backbone; kênh quản lý BR↔dashboard chỉ qua **TCP** (frame protocol).
- **Không forward frame từ child lên backend** — child gửi register/update/ping trực tiếp tới backend qua IP; BR chỉ route và quản lý (state, dataset, Commissioner) qua frame với dashboard.
- **OpenThread stack:** chạy trên Host (ESP32-S3), RCP chỉ làm radio.

## Các thành phần chính

1. **OpenThread Border Router** — stack OT đầy đủ, border routing + prefix, Commissioner, Border Agent
2. **Frame protocol (communicate)** — binary frame qua **TCP** (BR listen port); dashboard kết nối BR_IP:port
3. **Backhaul** — Ethernet W5500 (SPI), chỉ LAN; IPv6 link-local trên ETHERNET_EVENT_CONNECTED
4. **LED Status** — WS2812 hiển thị OT device role
5. **Boot button** — long press 3s → factory reset

## Constraints

- ESP-IDF v5.5.x
- FreeRTOS task name tối đa 15 ký tự (`configMAX_TASK_NAME_LEN = 16`)
- Frame payload tối đa 2048 bytes
- NVS erase phải dùng raw partition erase (không dùng `nvs_flash_erase()` đơn thuần)
- ESP32-S3 không có EMAC — Ethernet qua SPI (W5500), không dùng LAN8720

## Tài liệu gốc

- **br-host:** `README.md`, `TODO.md` — tổng quan, hardware, cấu hình.
- **Hệ thống (namorix-thread/documents/):** Danh mục đầy đủ xem `documents/README.md`. Tài liệu liên quan BR:
  - `documents/protocol/usb_cdc_frame_structure.md` — frame protocol (CMD table, CRC8, error codes), **CMD_BR_HEALTH TLV §5.1**
  - `documents/protocol/table_data_format.md` — format Router/Child/Joiner Table
  - `documents/architecture/real_br_integration.md` — BR thật, tích hợp Dashboard + Thread-Node, keepalive/ACK, BR Health, SRP, troubleshooting
  - `documents/installation.md` — setup sysctl/route IPv6 cho backend Linux
  - `documents/coap/device_payload_spec.md` — CoAP endpoints (child gửi thẳng backend)
  - `documents/coap/backend_discovery_srp.md` — SRP/DNS-SD discovery backend từ node
