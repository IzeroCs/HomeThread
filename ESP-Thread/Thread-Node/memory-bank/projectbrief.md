# Thread-Node — Project Brief

## Tổng quan

Thread-Node là một **ESP-IDF component library framework** cho phép lập trình viên xây dựng các thiết bị IoT kết nối Thread mesh một cách nhanh chóng. Firmware chạy trên **ESP32-C6** hoặc **ESP32-H2** — hai chip có radio IEEE 802.15.4 tích hợp — và gia nhập mạng Thread qua **Thread Joiner protocol** sử dụng PSKd credential.

## Vị trí trong hệ thống HomeThread

```
[Dashboard-Thread]  ←── USB CDC frame ──→  [Thread-Host (ESP32-S3 BR)]
                                                        ↕  CoAP over Thread mesh
                                            [Thread-Node devices (ESP32-C6/H2)]
```

Thread-Node là **lớp thiết bị cuối** (End Device / Router Node) trong hệ thống:
- Kết nối vào Thread mesh thông qua Border Router (Thread-Host)
- Đăng ký thông tin thiết bị lên Border Router qua CoAP POST `/device/register`
- Nhận lệnh điều khiển từ Border Router qua CoAP PUT `/entities/{id}/{attr}`
- Hỗ trợ leader management qua CoAP GET `/network/stop`

## Mục tiêu cốt lõi

1. **Reusable framework**: Lập trình viên chỉ cần implement callback `on_joined()` — toàn bộ hạ tầng Thread (joining, registration, LED, button) được xử lý tự động bởi `thread_endpoint_start()`.

2. **Entity Model**: Hệ thống trừu tượng hóa thiết bị IoT theo chuẩn `entity_model_specification.md` v1.3.0 — hỗ trợ light, switch, fan, sensor, climate, binary_sensor. Mỗi entity được mô tả bằng C struct, serialize bằng CBOR, và truyền đi qua CoAP. Device info: manufacturer, model, device_name = string; device_type, sw_version, hw_version = number (Zigbee-style) để giảm băng thông khi gửi register nhiều lần.

3. **Thread mesh reliability**: Tự động retry khi join thất bại, factory reset qua boot button, status LED phản ánh trạng thái mạng, và cơ chế tránh tranh quyền Leader với Border Router.

## Phạm vi

### Bao gồm
- `components/thread/`: Thread joining, CoAP server/client, device registry, status LED, boot button, network stop
- `components/entity/`: Entity model, device model, CBOR serialization, entity CoAP server
- `examples/light_on_off/`: Example hoàn chỉnh duy nhất
- `openthread_custom_config.h`: Tùy chỉnh OpenThread timeout và CoAP

### Không bao gồm
- Radio driver (built-in trong ESP32-C6/H2)
- USB CDC frame protocol (chỉ Thread-Host mới dùng)
- Backend/Dashboard logic
- Border Router setup (thuộc Thread-Host)

## Ràng buộc kỹ thuật

| Ràng buộc | Chi tiết |
|---|---|
| Chip target | **ESP32-C6** hoặc **ESP32-H2** (enforce tại build time trong CMakeLists.txt) |
| Thread mode | **FTD** (Full Thread Device) — có thể là Child, Router, hoặc Leader |
| Commissioning | Chỉ dùng **Thread Joiner** protocol (PSKd) |
| Serialization | **CBOR** tự viết (RFC 7049), không dùng thư viện ngoài |
| SDK | **ESP-IDF** (FreeRTOS, NVS, RMT, GPIO, event loop) |
| Ngôn ngữ | **C** (C99) |

## Tài liệu tham chiếu

- `Documents/iot-entity-model/entity_model_specification.md` — Entity type system spec v1.3.0
- `docs/coap/border_router_coap_server.md` — CoAP device registry spec; **ACK/NACK bắt buộc** cho mọi message Node → Leader
- `Documents/coap/leader_stop_command_coap.md` — CoAP network stop spec
- `Documents/iot-entity-model/entity_model_schema.md` — SQLite schema (phía Dashboard)
