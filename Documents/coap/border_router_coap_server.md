# Backend CoAP server — Device & Entities (RFC 7252)

Tài liệu mô tả hai endpoint CoAP mà Backend cung cấp cho Thread-Node: **POST /device/register** (chỉ device + network) và **POST /device/entities** (danh sách entity). Backend parse CBOR, lưu SQLite, và **luôn echo CoAP token** trong response để Node nhận ACK đúng (RFC 7252).

## Tổng quan

| Endpoint | Method | Payload CBOR | Hành vi Backend | Response |
|----------|--------|--------------|-----------------|----------|
| `/device/ping` | GET | — | Trả 4 byte timestamp (server start) | 2.05 Content, echo token |
| `/device/register` | POST | Map keys **0–8** (không có key 9) | Parse keys 0–8, tạo/cập nhật device (theo device_id hoặc địa chỉ nguồn CoAP) | 2.01 Created / 2.04 Changed, echo token |
| `/device/entities` | POST | Map: **0** = device_id, **9** = array entities | Parse device_id + array entities, merge từng entity theo (device_id, entity_id) | 2.01 Created / 2.04 Changed, echo token |
| `/device/update` | POST | CBOR (legacy) | Log, không dùng key 9 cho store | 2.01, echo token |

## 1. POST /device/register

- **Payload**: CBOR map **chỉ keys 0–8** (không có key 9 entities).
  - **0** (CBOR_K_DEVICE_ID): device_id (string)
  - **1** (CBOR_K_DEVICE_NAME): device_name (string)
  - **2** (CBOR_K_DEVICE_TYPE): device_type (uint)
  - **3** (CBOR_K_MANUFACTURER): manufacturer (string, optional)
  - **4** (CBOR_K_MODEL): model (string, optional)
  - **5** (CBOR_K_SW_VERSION): sw_version (uint)
  - **6** (CBOR_K_HW_VERSION): hw_version (uint)
  - **7** (CBOR_K_MAC_ADDRESS): mac_address (uint, optional)
  - **8** (CBOR_K_NETWORK): network (map, optional)
    - 0: rloc16, 1: role (0=child, 1=router, 2=leader), 2: ipv6 (byte string), 3: parent (optional)

- **Backend**:
  - Parse CBOR; **bỏ qua / không mong đợi key 9** (entities).
  - Tạo hoặc cập nhật bản ghi device (theo `device_id`; lưu thêm `source_address` từ địa chỉ nguồn CoAP nếu có).
  - Trả **2.01 Created** (device mới) hoặc **2.04 Changed** (device đã tồn tại, cập nhật).
  - **Echo đúng CoAP token** từ request trong response để Node coi là ACK.

## 2. POST /device/entities

- **Payload**: CBOR map gồm:
  - **0** (CBOR_K_DEVICE_ID): device_id (string) — để biết entities thuộc device nào.
  - **9** (CBOR_K_ENTITIES): array các entity map (format giống từng entity trong payload cũ: entity_id, name, type, device_class, available, last_update, state, brightness, mode, …; type/device_class/mode là số theo bảng trong `cbor_register_keys.h`).

- **Backend**:
  - Parse CBOR: đọc device_id (key 0), đọc array entities (key 9).
  - Với mỗi entity trong array: **merge** theo (device_id, entity_id) — nếu đã có thì update (state, attributes…), chưa có thì tạo mới.
  - Trả **2.01 Created** (có ít nhất một entity mới) hoặc **2.04 Changed** (toàn bộ đã tồn tại).
  - **Echo token** trong response để Node coi là thành công.

## CoAP token (RFC 7252)

Node gửi request với token (vd. 2 byte). Backend **bắt buộc echo đúng token** trong response; nếu không, OpenThread/stack phía Node sẽ không match response với request và coi là lỗi/timeout. Code Backend: trước khi gọi `res.end()`, gán `res.token = req.token` (hoặc tương đương theo thư viện node-coap).

## Code Backend

- **Router / controller**: `backend/src/coap/device-coap.controller.ts` — `register`, `entities`, `ping`, `update`.
- **Store**: `backend/src/coap/device-coap.service.ts` — `upsertDevice()`, `mergeEntity()`; SQLite bảng `device_info`, `device_entity` (migration 007; migration 008 đổi tên từ coap_device/coap_entity nếu đã chạy 007 cũ).
- **Payload keys**: `backend/src/coap/device-register.payload.ts` — `DEVICE_REGISTER_KEYS`, `NETWORK_KEYS`, `ENTITY_KEYS` (align với Thread-Node `cbor_register_keys.h`).

## Tài liệu liên quan

- [thread_node_coap.md](thread_node_coap.md) — Luồng Node → Backend, SRP discovery, ping/register/entities.
- [../architecture/real_br_integration.md](../architecture/real_br_integration.md) — Routing, troubleshooting ResponseTimeout.
