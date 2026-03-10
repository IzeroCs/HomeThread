# Thread-Node — Node-side register flow and payloads

Tài liệu mô tả luồng đăng ký thiết bị từ Node tới Backend và định dạng CBOR payload. Backend contract chi tiết: repo root `Documents/coap/border_router_coap_server.md`.

## Hai request đăng ký

Node gửi **hai** request CoAP **liên tiếp** tới Backend (địa chỉ lấy từ thread_discovery):

1. **POST /device/register/info** — Chỉ thông tin thiết bị (device info). Payload CBOR map keys **0–6** (key 0 = mac_address bắt buộc).
2. **POST /device/register/entity** — Chỉ sau khi register/info nhận ACK (2.01/2.04/2.05). Payload: **key 0** (mac_address) + **key 1** (array entities).

Nếu register/info thất bại (NACK hoặc timeout), node retry sau 2s; không gửi register/entity cho đến khi register/info thành công.

## Serialization

- **register/info**: map keys 0–6 (key 0 = mac_address, 1 = device_name, 2 = device_type, 3 = manufacturer, 4 = model, 5 = sw_version, 6 = hw_version).
- **register/entity**: map **key 0** = mac_address, **key 1** = array of entity maps. Mỗi entity map **ENTITY_KEYS 0–6** (xem bảng dưới).

### Entity map keys (mỗi item trong array key 1) — ENTITY_KEYS 0–6

| Key | Tên            | Mô tả |
|-----|----------------|-------|
| 0   | entity_id      | Text string |
| 1   | name           | Text string |
| 2   | type           | Uint (entity_type_t) |
| 3   | device_class   | Uint |
| 4   | unit           | Text string (sensor) |
| 5   | restore_mode   | Uint (default 0; backend dùng cho mergeEntity) |
| 6   | disabled       | Uint (1 = không hiện entity trên dashboard) |

State payload (update/state): **key 0** = mac, **key 1** = array. Mỗi item **STATE_KEYS 0–6**: entity_id(0), state(1), brightness(2), mode(3), rgb(4), color_temp(5), value(6). Không có available.

Định nghĩa key: `components/entity/serialization/include/cbor_register_keys.h` (CBOR_K_ENT_*).

## Transport

- **device_coap** (components/device/): CoAP client; token 2 byte; lock khi gọi OpenThread.
- Backend phải echo đúng CoAP token trong response (RFC 7252).
- Ping: GET /device/ping mỗi 10s; response 4-byte timestamp (LE). Timestamp đổi → node gửi lại register (rồi entities).
