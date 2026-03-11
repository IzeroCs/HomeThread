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
- Đăng ký thông tin thiết bị lên **Backend** qua CoAP POST `/device/register/info` và `/device/register/entity` (địa chỉ Backend lấy từ thread_discovery, SRP/DNS-SD `_dashboard._udp`). Spec: `Documents/coap/device_payload_spec.md`.
- Nhận lệnh điều khiển từ Border Router qua CoAP PUT `/entities/{id}/{attr}`

## Mục tiêu cốt lõi

1. **Reusable framework**: Lập trình viên chỉ cần implement callback `on_joined()` — toàn bộ hạ tầng Thread (joining, registration, LED, button) được xử lý tự động bởi `thread_node_start()`.

2. **Entity Model**: Hệ thống trừu tượng hóa thiết bị IoT theo chuẩn `entity_model_specification.md` v1.3.0 — hỗ trợ light, switch, fan, sensor, climate, binary_sensor. Mỗi entity được mô tả bằng C struct, serialize bằng CBOR, và truyền đi qua CoAP. Device info: manufacturer, model, device_name = string; device_type, sw_version, hw_version = number (Zigbee-style) để giảm băng thông khi gửi register nhiều lần.

3. **Thread mesh reliability**: Tự động retry khi join thất bại, factory reset qua boot button, status LED phản ánh trạng thái mạng, và cơ chế tránh tranh quyền Leader với Border Router.

## Phạm vi

### Bao gồm
- `components/thread/`: Thread joining (`thread_node`, `thread_joiner`), CoAP server (`thread_coap`), backend discovery (`thread_discovery`), device layer (`device/`: device_registry + device_coap), status LED, boot button
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

- `Documents/README.md` — Danh mục tài liệu HomeThread (architecture, protocol, coap, entity-model, installation, websocket).
- `Documents/coap/device_payload_spec.md` — **Spec chính CoAP:** endpoints /device/ping, register/info, register/entity, update/topology, update/state; CBOR keys (device_info 0–6, key 0 = mac bstr(8) EUI-64 802.15.4); topology role-based; DB 8 bảng; flow đăng ký. Echo token, ACK/NACK.
- `Documents/iot-entity-model/entity_model_specification.md` — Entity type system spec v1.3.0.
- `Documents/coap/backend_discovery_srp.md` — SRP/DNS-SD discovery backend từ Node.
