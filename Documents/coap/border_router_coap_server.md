# Backend CoAP server — Device, Entity, Topology, State (RFC 7252)

Tài liệu mô tả các endpoint CoAP mà Backend cung cấp cho Thread-Node. Backend parse CBOR, lưu SQLite (device_info, device_topology, device_entity, device_entity_state và bảng history), và **luôn echo CoAP token** trong response (RFC 7252).

## Tổng quan endpoint

**Contract chính (Thread-Node dùng):**

| Endpoint | Method | Payload CBOR | Hành vi Backend | Response |
|----------|--------|--------------|-----------------|----------|
| `/device/ping` | GET | — | Trả 4 byte timestamp (server start) | 2.05 Content, echo token |
| `/device/register` | POST | Map keys **0–8** (device + network, key 8 = topology) | Upsert device_info, ghi topology nếu có key 8. Node **chờ** response thành công mới gửi entities; nếu fail Node retry register. | 2.01 Created / 2.04 Changed, echo token |
| `/device/entities` | POST | **key 0** = device_id (string), **key 9** = array entities | Resolve device theo device_id; upsert device_entity; có thể trả body **CBOR** (Content-Format application/cbor): map key **10** = array restore (mỗi item map: 0=entity_id, 1=restore_mode, 2=state, 3=brightness, 4=mode, 5=rgb_json, 6=color_temp, 7=value_real, 8=has_saved_state) | 2.01/2.04, echo token, optional body |

**API mở rộng / legacy (backend có thể hỗ trợ thêm):**

| Endpoint | Method | Payload CBOR | Hành vi Backend | Response |
|----------|--------|--------------|-----------------|----------|
| `/device/register/info` | POST | Map keys **0–8**, **bắt buộc key 7 mac_address** | Upsert device_info (key = mac_address), generate slug nếu NULL, soft-delete entity/state cũ của device | 2.01 Created / 2.04 Changed, echo token |
| `/device/register/entity` | POST | **key 7** mac_address, **key 9** array entities | Resolve device; upsert device_entity; restore state; có thể trả body key **10** = restore | 2.01/2.04, echo token, optional body |
| `/device/update/info` | POST | mac_address + device fields | Update device_info theo mac_address | 2.04, echo token |
| `/device/update/entity` | POST | mac_address + key 9 array entities | Update device_entity (name, type, device_class, unit, attributes_json) | 2.04, echo token |
| `/device/update/topology` | POST | mac_address + key 8 network | Insert device_topology_history; upsert device_topology (rloc16, parent_rloc16, role, rssi, link_quality) | 2.04, echo token |
| `/device/update/state` | POST | mac_address + key 9 array entities (entity_id + state fields) | Insert device_entity_state_history; upsert device_entity_state | 2.04, echo token |

**Slug:** device_slug là concern của backend + UI. Node không gửi slug; backend generate (vd. từ mac_address) và dùng cho URL/API/frontend.

**Network map (key 8):** Sub-keys: 0 = rloc16, 1 = role, 2 = ipv6, 3 = parent, **4 = rssi** (dBm, integer), **5 = link_quality** (0–255, integer). Tùy chọn; backend lưu vào device_topology và device_topology_history.

## Schema 6 bảng

| Bảng | Vai trò |
|------|---------|
| device_info | Thông tin tĩnh + identity (mac_address TEXT UNIQUE, device_slug, device_name, …) |
| device_topology | Snapshot topology realtime (device_id FK, rloc16, parent_rloc16, role, **rssi**, **link_quality**); UNIQUE(device_id) |
| device_topology_history | Lịch sử topology (rloc16, parent_rloc16, role, rssi, link_quality, recorded_at) |
| device_entity | Định nghĩa entity (device_id FK, entity_id, name, type, device_class, unit, restore_mode, deleted_at); UNIQUE(device_id, entity_id) |
| device_entity_state | Snapshot state realtime (entity_id FK, available, state, brightness, mode, rgb_json, color_temp, value_real, deleted_at); UNIQUE(entity_id) |
| device_entity_state_history | Lịch sử state (recorded_at) |

**Soft delete:** Khi node gửi register/info, backend soft-delete toàn bộ entity và state cũ của device (deleted_at = CURRENT_TIMESTAMP). Khi register/entity, entity upsert set deleted_at = NULL.

**restore_mode** (device_entity): 0 = RESTORE_DEFAULT_OFF, 1 = RESTORE_DEFAULT_ON, 2 = ALWAYS_OFF, 3 = ALWAYS_ON, 4 = DISABLED. Khi node boot, backend query entity + state; nếu có state đã lưu (và deleted_at NULL) thì gửi state đó trong response restore; không thì theo restore_mode gửi OFF/ON hoặc không gửi (DISABLED).

## Flow register → entities (Node đang dùng)

1. **POST /device/register** (keys 0–8): Node gửi device + network (key 8 = topology). Backend upsert device_info, ghi topology nếu có key 8. Node **chờ** response thành công (2.01/2.04); nếu fail thì **retry** register (vd. sau 2s) đến khi thành công.
2. **Chỉ khi register đã success**, Node mới gửi **POST /device/entities** (key 0 = device_id, key 9 = array entities). Backend resolve device theo device_id; upsert device_entity; có thể trả body **CBOR** (Content-Format application/cbor): map key **10** = array restore. Node decode CBOR và áp dụng state/default cho từng entity.

## CoAP token (RFC 7252)

Node gửi request với token. Backend **bắt buộc echo đúng token** trong response; nếu không, Node sẽ không match response và báo timeout.

## Code Backend

- **Status constants**: `backend/src/coap/coap.type.ts` — `CoapStatus` (CREATED, CHANGED, CONTENT, NOT_FOUND, SERVER_ERROR); dùng thay chuỗi "2.01", "2.04", v.v. Router dùng NOT_FOUND, SERVER_ERROR cho 4.04/5.00.
- **Response helper**: `backend/src/coap/coap.response.ts` — `echoCoapToken(req, res)`, `sendCoapResponse(req, res, status, body?, contentFormat?)`: echo token, gán status, tùy chọn Content-Format và body, rồi `res.end()`. Mọi response từ controller đều đi qua `sendCoapResponse`.
- **Controller**: `backend/src/coap/device-coap.controller.ts` — `ping`, `registerInfo`, `registerEntity`, `updateInfo`, `updateEntity`, `updateTopology`, `updateState` (paths /device/ping, /device/register/info, /device/register/entity, /device/update/info, /device/update/entity, /device/update/topology, /device/update/state). Dùng `parseCborOrRespond(req, res)` cho handler cần “parse CBOR hoặc trả 2.01 rỗng”: nếu payload null/invalid thì gửi 2.01 và return null; handler chỉ cần một dòng lấy parsed, nếu null return, rồi logic và một lần `sendCoapResponse` ở cuối.
- **Service**: `backend/src/coap/device-coap.service.ts` — `upsertDeviceInfo`, `updateDeviceInfo`, `upsertTopology`, `mergeEntity`, `updateEntityDefinition`, `upsertEntityState`; SQLite qua `@database/database.db`; bảng device_info, device_topology, device_topology_history, device_entity, device_entity_state, device_entity_state_history (migration 009).
- **Payload keys**: `backend/src/coap/device-register.payload.ts` — `DEVICE_REGISTER_KEYS`, `NETWORK_KEYS`, `ENTITY_KEYS` (align Thread-Node `cbor_register_keys.h`); entity key 13 = RESTORE_MODE.
- **CBOR**: `backend/src/cbor/cbor.decoder.ts` (decode request payload), `backend/src/cbor/cbor.encoder.ts` (encode restore response); không dùng thư viện ngoài, format RFC 7049.

## Tài liệu liên quan

- [thread_node_coap.md](thread_node_coap.md) — Luồng Node → Backend, SRP discovery, boot flow, restore.
- [../architecture/real_br_integration.md](../architecture/real_br_integration.md) — Routing, troubleshooting ResponseTimeout.
