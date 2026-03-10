# CoAP Device Payload Spec — Thread-Node

Tài liệu mô tả cấu trúc payload CBOR cho CoAP **/device/** giữa Thread-Node (client) và Dashboard-Thread backend (server). Backend decode map keys dạng string `"0"`, `"1"`, … (JSON-safe); Thread-Node gửi CBOR với integer keys.

**Base:** CoAP server listen UDP 5683 `[::]` (udp6). Content-Format request/response: CBOR (application/cbor khi có body).

---

## Endpoints và payload

| Method | Path | Payload | Mô tả |
|--------|------|---------|--------|
| GET | /device/ping | — | Backend trả 2.05 Content, body 4 byte timestamp uint32 LE. Node so sánh timestamp; đổi thì gửi lại register. |
| POST | /device/register/info | **device_info** (keys 0–7) | Đăng ký thông tin thiết bị. **Chỉ** keys 0–7; không gửi topology (key 8) ở đây. |
| POST | /device/update/info | **device_info** (keys 0–7) | Cập nhật thông tin thiết bị. |
| POST | /device/update/topology | **mac (7) + key 8** (topology) | Cập nhật topology (rloc16, role, rssi, link_quality, …). Gửi **riêng** sau register/info. |
| POST | /device/register/entity | **mac (7) + key 9** (array entity) | Đăng ký danh sách entity (định nghĩa). Backend có thể trả body CBOR key 10 = restore. |
| POST | /device/update/entity | **mac (7) + key 9** (array entity) | Cập nhật định nghĩa entity. |
| POST | /device/update/state | **mac (7) + key 9** (array state) | Cập nhật state từng entity (on/off, brightness, …). |

---

## 1. Payload device_info (register/info, update/info)

**Chỉ** dùng keys 0–7. Topology **không** gửi kèm; gửi riêng qua POST /device/update/topology.

| Key | Tên | Kiểu | Ghi chú |
|-----|-----|------|--------|
| 0 | device_id | string | Optional; update/info có thể dùng cho slug. |
| 1 | device_name | string | Tên thiết bị (backend dùng để generate slug). |
| 2 | device_type | number | Loại thiết bị. |
| 3 | manufacturer | string | |
| 4 | model | string | |
| 5 | sw_version | number | |
| 6 | hw_version | number | |
| **7** | **mac_address** | number | **Bắt buộc.** EUI-64 (số); backend chuyển sang 16-char hex. |

---

## 2. Payload device_topology (update/topology)

Request body: map với **key 7** (mac_address) + **key 8** (object topology). Key 8 là map con với sub-keys:

| Key (trong object 8) | Tên | Kiểu | Ghi chú |
|----------------------|-----|------|--------|
| 0 | rloc16 | number | RLOC16 Thread. |
| 1 | role | number | 0 = child, 1 = router, 2 = leader. |
| 2 | ipv6 | bytes | IPv6 (Uint8Array/bytes). |
| 3 | parent | number | RLOC16 parent. |
| 4 | rssi | number | RSSI (dBm). |
| 5 | link_quality | number | 0–255. |

---

## 3. Payload entity (register/entity, update/entity)

Request body: **key 7** (mac_address) + **key 9** (array). Mỗi phần tử trong array 9 là map (định nghĩa entity):

| Key | Tên | Kiểu | Ghi chú |
|-----|-----|------|--------|
| 0 | entity_id | string | Bắt buộc. ID entity (light.0, sensor.1, …). |
| 1 | name | string | Tên hiển thị. |
| 2 | type | number | Loại entity. |
| 3 | device_class | number | Device class. |
| 12 | unit | string | Đơn vị (nếu có). |
| 13 | restore_mode | number | Chế độ restore khi boot. |

Các key khác (4–11, …) có thể gửi thêm; backend lưu dạng attributes_json nếu cần.

**Response register/entity:** Backend có thể trả body CBOR với **key 10** = array restore (mỗi item: entity_id, restore_mode, state, brightness, …) để Node áp dụng state đã lưu khi boot.

---

## 4. Payload state (update/state)

Request body: **key 7** (mac_address) + **key 9** (array). Mỗi phần tử trong array 9 là map (state một entity):

| Key | Tên | Kiểu | Ghi chú |
|-----|-----|------|--------|
| 0 | entity_id | string | Bắt buộc. ID entity. |
| 4 | available | number | 0/1. |
| 6 | state | number / boolean | Trạng thái on/off. |
| 7 | brightness | number | Độ sáng. |
| 8 | mode | number | Chế độ. |
| 9 | rgb | array/object | Màu RGB. |
| 10 | color_temp | number | Nhiệt độ màu. |
| 11 | value | number | Giá trị (sensor, …). |

---

## Flow khuyến nghị (Thread-Node)

1. **GET /device/ping** — lấy timestamp; nếu khác lần trước → bắt đầu register.
2. **POST /device/register/info** — gửi **chỉ** payload device_info (keys 0–7). Không gửi key 8 (topology) ở đây.
3. **POST /device/update/topology** — gửi mac (7) + key 8 (object topology) khi có dữ liệu rloc16/role/rssi/link_quality.
4. **POST /device/register/entity** — gửi mac (7) + key 9 (array entity definition). Nhận restore (key 10) nếu backend trả.
5. Sau đó: **POST /device/update/state** khi state entity thay đổi; **POST /device/update/info** hoặc **update/entity** khi cập nhật thông tin/định nghĩa.

---

## Response status

- **2.01 Created** — resource mới (vd. register/info tạo device, register/entity tạo entity).
- **2.04 Changed** — cập nhật thành công.
- **2.05 Content** — GET /device/ping (body 4 byte timestamp).
- Backend echo token request (RFC 7252). Lỗi parse CBOR → 2.01 empty body.

---

## Tài liệu liên quan

- **Backend:** `backend/src/coap/device/device.payload.ts` — constants và types (DEVICE_INFO_KEYS, TOPOLOGY_KEY, TOPOLOGY_KEYS, ENTITIES_KEY; DeviceInfoPayload, DeviceTopologyPayload, DeviceEntityPayload, DeviceStatePayload).
- **thread_node_coap.md** — flow tổng thể, SRP discovery, troubleshooting.
- **border_router_coap_server.md** — spec backend (endpoints, 6 bảng DB, CoapStatus, sendCoapResponse).
