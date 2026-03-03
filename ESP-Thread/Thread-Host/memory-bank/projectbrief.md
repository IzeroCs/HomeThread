# Project Brief — Thread-Host

## Mục tiêu

Firmware cho **ESP32-S3** chạy vai trò **Thread Border Router (BR)**, giao tiếp với RCP ESP32-H2 qua UART. BR là **BR thật**: route IPv6, prefix delegation, kết nối backbone (Wi‑Fi hoặc Ethernet W5500) và quản lý qua **frame protocol trên TCP** (không USB/UART với PC).

## Phạm vi

- **Backhaul:** **Ethernet W5500 (SPI)** khi bật; Wi‑Fi fallback đã tắt trong code. BR có IP (IPv4 + IPv6 link-local/global) trên backbone; kênh quản lý BR↔dashboard chỉ qua **TCP** (frame protocol).
- **Không forward frame từ child lên backend** — child gửi register/update/ping trực tiếp tới backend qua IP; BR chỉ route và quản lý (state, dataset, Commissioner) qua frame với dashboard.
- **OpenThread stack:** chạy trên Host (ESP32-S3), RCP chỉ làm radio.

## Các thành phần chính

1. **OpenThread Border Router** — stack OT đầy đủ, border routing + prefix, Commissioner, Border Agent
2. **Frame protocol (communicate)** — binary frame qua **TCP** (BR listen port); dashboard kết nối BR_IP:port
3. **Backhaul** — Ethernet W5500 (SPI); IPv6 link-local trên ETHERNET_EVENT_CONNECTED; Wi‑Fi fallback tắt
4. **CoAP Leader Control** — BR gửi lệnh stop đến Leader khi cần
5. **LED Status** — WS2812 hiển thị OT device role
6. **Boot button** — long press 3s → factory reset

## Constraints

- ESP-IDF v5.5.x
- FreeRTOS task name tối đa 15 ký tự (`configMAX_TASK_NAME_LEN = 16`)
- Frame payload tối đa 2048 bytes
- NVS erase phải dùng raw partition erase (không dùng `nvs_flash_erase()` đơn thuần)
- ESP32-S3 không có EMAC — Ethernet qua SPI (W5500), không dùng LAN8720

## Tài liệu gốc

- `README.md` — tổng quan, hardware, cấu hình
- `TODO.md` — tính năng chưa làm
- `../../Documents/protocol/usb_cdc_frame_structure.md` — frame protocol spec
- `../../Documents/protocol/table_data_format.md` — format Router/Child/Joiner table
- `../../Documents/coap/leader_stop_command_coap.md` — CoAP leader stop spec
- `../../Documents/coap/border_router_coap_server.md` — CoAP (device registry chạy trên backend; child gửi thẳng backend)
