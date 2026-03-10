# Thread-Node — Node-side register flow and payloads

Tài liệu mô tả luồng đăng ký thiết bị từ Node tới Backend và định dạng CBOR payload. Backend contract chi tiết: repo root `Documents/coap/border_router_coap_server.md`.

## Hai request đăng ký

Node gửi **hai** request CoAP **liên tiếp** tới Backend (địa chỉ lấy từ thread_discovery):

1. **POST /device/register/info** — Chỉ thông tin thiết bị (device info). Payload CBOR map keys **0–7**.
2. **POST /device/register/entity** — Chỉ sau khi register/info nhận ACK (2.01/2.04/2.05). Payload: **mac_address (key 7)** + **entities array (key 9)**.

Nếu register/info thất bại (NACK hoặc timeout), node retry sau 2s; không gửi register/entity cho đến khi register/info thành công.

## Serialization

- **register/info**: `entity_serialize_register_info_cbor(buffer, size)` → map keys 0–7 (device_id, device_name, device_type, manufacturer, model, sw_version, hw_version, mac_address). Không có network hay entities.
- **register/entity**: `entity_serialize_entities_cbor(buffer, size)` → map với key 7 (mac_address, byte string) và key 9 (array of entity maps). Mỗi entity map gồm keys 0–13 (xem bảng dưới).

### Entity map keys (mỗi item trong array key 9)

| Key | Tên            | Mô tả |
|-----|----------------|-------|
| 0   | entity_id      | Text string |
| 1   | name           | Text string |
| 2   | type           | Uint (entity_type_t: 0=light, 1=switch, 2=fan, 3=sensor, 4=climate, 5=binary_sensor) |
| 3   | device_class   | Uint (light: mode; sensor: sensor_class; …) |
| 4   | available      | Bool |
| 5   | last_update    | Uint (Unix time) |
| 6   | state          | Bool (light/switch) |
| 7   | brightness     | Uint (light) |
| 8   | mode           | Uint (light: light_mode_t) |
| 9   | rgb            | Array of 3 uint (light, khi mode RGB/RGBW) |
| 10  | color_temp     | Uint (light, khi mode CCT) |
| 11  | value          | Float (sensor) |
| 12  | unit           | Text string (sensor) |
| 13  | restore_mode   | Uint (default 0; backend dùng cho mergeEntity) |

Định nghĩa key: `components/entity/serialization/include/cbor_register_keys.h` (CBOR_K_ENT_*).

## Transport

- **device_coap** (components/device/): CoAP client; token 2 byte; lock khi gọi OpenThread.
- Backend phải echo đúng CoAP token trong response (RFC 7252).
- Ping: GET /device/ping mỗi 10s; response 4-byte timestamp (LE). Timestamp đổi → node gửi lại register (rồi entities).
