# CoAP Device Payload Spec — Thread-Node

Tài liệu mô tả cấu trúc payload CBOR cho CoAP **/device/** giữa Thread-Node (client) và Dashboard-Thread backend (server). Backend decode map keys dạng string `"0"`, `"1"`, … (JSON-safe); Thread-Node gửi CBOR với integer keys.

**Base:** CoAP server listen UDP 5683 `[::]` (udp6). Content-Format request/response: CBOR (application/cbor khi có body).

---

## Endpoints và payload

**Contract chính (Node đang dùng — align backend):**

| Method | Path | Payload | Mô tả |
|--------|------|---------|--------|
| GET | /device/ping | — | Backend trả 2.05 Content, body 4 byte timestamp uint32 LE. Node so sánh timestamp; đổi thì gửi lại register. |
| POST | /device/register/info | **device_info** (keys 0–6, key 0 = mac) | Đăng ký thông tin thiết bị. Node **chờ** response thành công (retry nếu fail) rồi mới gửi register/entity. |
| POST | /device/register/entity | **key 0** (mac_address) + **key 1** (array entity) | Đăng ký danh sách entity. Chỉ gửi **sau khi** register/info thành công. Backend có thể trả body CBOR key 10 = restore. |

**API mở rộng:**

| Method | Path | Payload | Mô tả |
|--------|------|---------|--------|
| POST | /device/update/topology | **DeviceTopologyPayload** (key 0 = mac, 1–6 = rloc16, role, ipv6, parent, rssi, link_quality) | Node gửi định kỳ. Cập nhật topology 1 thiết bị. |
| POST | /device/update/state | **key 0** (mac) + **key 1** (array state, STATE_KEYS 0–6) | Node gửi định kỳ. Cập nhật state từng entity. |
| POST | /device/update/info | **device_info** (keys 0–6, key 0 = mac) | Backend/UI only; node không gửi. |
| POST | /device/update/entity | **key 0** (mac) + **key 1** (array entity, ENTITY_KEYS 0–6) | Backend/UI only; node không gửi. |

---

## 1. Payload device_info (register/info, update/info)

**Chỉ** dùng keys 0–6. **Key 0 = mac_address** (xác thực thiết bị, bắt buộc). Topology **không** gửi kèm; gửi riêng qua POST /device/update/topology.

| Key | Tên | Kiểu | Ghi chú |
|-----|-----|------|--------|
| **0** | **mac_address** | number | **Bắt buộc.** EUI-64 (số); backend chuyển sang 16-char hex. |
| 1 | device_name | string | Tên thiết bị (backend dùng để generate slug). |
| 2 | device_type | number | Loại thiết bị. |
| 3 | manufacturer | string | |
| 4 | model | string | |
| 5 | sw_version | number | |
| 6 | hw_version | number | |

---

## 2. Payload device_topology (update/topology)

Request body (DeviceTopologyPayload): một map, **key 0** = mac_address (bắt buộc), **key 1–6** = topology 1 thiết bị:

| Key | Tên | Kiểu | Ghi chú |
|-----|-----|------|--------|
| **0** | **mac_address** | number | **Bắt buộc.** EUI-64. |
| 1 | rloc16 | number | RLOC16 Thread. |
| 2 | role | number | 0 = child, 1 = router, 2 = leader. |
| 3 | ipv6 | bytes | IPv6 (Uint8Array/bytes). |
| 4 | parent | number | RLOC16 parent. |
| 5 | rssi | number | RSSI (dBm). |
| 6 | link_quality | number | 0–255. |

---

## 3. Payload entity (register/entity)

**POST /device/register/entity** (contract chính): Request body map **key 0** = mac_address (uint, EUI-64), **key 1** = array (định nghĩa entity). Mỗi phần tử trong array 1 là map (định nghĩa entity) — **ENTITY_KEYS** (index 0–6):

| Key | Tên | Kiểu | Ghi chú |
|-----|-----|------|--------|
| 0 | entity_id | string | Bắt buộc. ID entity (light.0, sensor.1, …). |
| 1 | name | string | Tên hiển thị. |
| 2 | type | number | Loại entity. |
| 3 | device_class | number | Device class. |
| 4 | unit | string | Đơn vị (nếu có). |
| 5 | restore_mode | number | Chế độ restore khi boot. |
| 6 | disabled | number | 1 = không thêm entity lên dashboard; 0 hoặc bỏ qua = hiện bình thường. |

Các key khác có thể gửi thêm; backend lưu dạng attributes_json nếu cần.

**Response register/entity:** Backend có thể trả body CBOR với **key 10** = array restore (mỗi item: entity_id, restore_mode, state, brightness, …) để Node áp dụng state đã lưu khi boot.

---

## 4. Payload state (update/state)

Request body: **key 0** (mac_address) + **key 1** (array). Mỗi phần tử trong array 1 là map (state một entity) — **STATE_KEYS** (index 0–6):

| Key | Tên | Kiểu | Ghi chú |
|-----|-----|------|--------|
| 0 | entity_id | string | Bắt buộc. ID entity. |
| 1 | state | number / boolean | Trạng thái on/off. |
| 2 | brightness | number | Độ sáng. |
| 3 | mode | number | Chế độ. |
| 4 | rgb | array/object | Màu RGB. |
| 5 | color_temp | number | Nhiệt độ màu. |
| 6 | value | number | Giá trị (sensor, …). |

---

## Flow khuyến nghị (Thread-Node)

1. **GET /device/ping** — lấy timestamp; nếu khác lần trước → bắt đầu register.
2. **POST /device/register/info** (keys 0–6, key 0 = mac) — gửi device info only. **Retry** đến khi backend trả 2.01/2.04 (không gửi register/entity cho đến khi register/info thành công).
3. **Chỉ khi register/info success** → **POST /device/register/entity** (key 0 = mac, key 1 = array entity). Nhận restore (key 10) nếu backend trả.
4. **POST /device/update/topology** (key 0 = mac, 1–6 = topology) và **POST /device/update/state** (key 0 = mac, key 1 = array state) — node gửi định kỳ sau khi đã register. **update/info** và **update/entity** chỉ dùng từ backend/UI, node không gửi.

---

## Response status

- **2.01 Created** — resource mới (vd. register/info tạo device, register/entity tạo entity).
- **2.04 Changed** — cập nhật thành công.
- **2.05 Content** — GET /device/ping (body 4 byte timestamp).
- Backend echo token request (RFC 7252). Lỗi parse CBOR → 2.01 empty body.

---

## Tài liệu liên quan

- **Backend:** `backend/src/coap/device/device.payload.ts` — PAYLOAD_KEY_MAC (0), PAYLOAD_KEY_ARRAY (1), TOPOLOGY_KEYS (0–6), ENTITY_KEYS (0–6, key 6 = disabled), STATE_KEYS (0–6; không còn available); DeviceInfoPayload, DeviceTopologyPayload, DeviceEntityPayload/DeviceEntityItem, DeviceStatePayload/DeviceStateItem.
- **thread_node_coap.md** — flow tổng thể, SRP discovery, troubleshooting.
- **border_router_coap_server.md** — spec backend (endpoints, 6 bảng DB, CoapStatus, sendCoapResponse).
