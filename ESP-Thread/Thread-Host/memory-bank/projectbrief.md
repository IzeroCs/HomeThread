# Project Brief — Thread-Host

## Mục tiêu

Firmware cho **ESP32-S3** chạy vai trò **Thread Border Router (BR)**, giao tiếp với RCP ESP32-H2 qua UART. BR kết nối mạng Thread (802.15.4) với hệ thống backend/Node qua **USB CDC frame protocol**.

## Phạm vi

- **Không dùng WiFi/BLE** — chỉ UART (Host–RCP) và USB CDC (Host–Backend)
- **Backhaul:** Ethernet (nếu cần kết nối mạng ngoài)
- **OpenThread stack:** chạy trên Host (ESP32-S3), RCP chỉ làm radio

## Các thành phần chính

1. **OpenThread Border Router** — stack OT đầy đủ, Commissioner enabled, Border Agent enabled
2. **Frame protocol (communicate)** — binary frame qua USB CDC, backend pull/ESP push
3. **CoAP Leader Control** — BR gửi lệnh stop đến Leader khi cần
4. **CoAP Device Registry** — nhận đăng ký từ child devices qua CoAP
5. **LED Status** — WS2812 hiển thị OT device role
6. **Boot button** — long press 3s → factory reset

## Constraints

- ESP-IDF v5.5.x
- FreeRTOS task name tối đa 15 ký tự (`configMAX_TASK_NAME_LEN = 16`)
- Frame payload tối đa 2048 bytes
- NVS erase phải dùng raw partition erase (không dùng `nvs_flash_erase()` đơn thuần)

## Tài liệu gốc

- `README.md` — tổng quan, hardware, cấu hình
- `TODO.md` — tính năng chưa làm
- `../../Documents/protocol/usb_cdc_frame_structure.md` — frame protocol spec
- `../../Documents/protocol/table_data_format.md` — format Router/Child/Joiner table
- `../../Documents/coap/leader_stop_command_coap.md` — CoAP leader stop spec
- `../../Documents/coap/border_router_coap_server.md` — CoAP device registry spec
