# Backend CoAP server — Device, Entity, Topology, State (RFC 7252)

Tài liệu mô tả các endpoint CoAP mà Backend cung cấp cho Thread-Node. Backend parse CBOR, lưu SQLite (device_info, device_topology, device_entity, device_entity_state và bảng history), và **luôn echo CoAP token** trong response (RFC 7252).

## Tổng quan endpoint

**Contract chính (Thread-Node dùng, align code backend):**

| Endpoint | Method | Payload CBOR | Hành vi Backend | Response |
|----------|--------|--------------|-----------------|----------|
| `/device/ping` | GET | — | Trả 4 byte timestamp (server start) | 2.05 Content, echo token |
| `/device/register/info` | POST | Map keys **0–6** (key 0 = mac_address bắt buộc; 1–6 = device_name, device_type, manufacturer, model, sw_version, hw_version). | Upsert device_info (key = mac_address), generate slug nếu NULL, soft-delete entity/state cũ của device. Node **chờ** response thành công mới gửi register/entity; nếu fail Node retry. | 2.01 Created / 2.04 Changed, echo token |
| `/device/register/entity` | POST | **key 0** mac_address, **key 1** array entities (ENTITY_KEYS 0–6: entity_id, name, type, device_class, unit, restore_mode, disabled) | Resolve device; upsert device_entity (name_raw luôn ghi đè, name user chỉ set lần đầu/API); restore state; có thể trả body **CBOR** (map key **10** = array restore) | 2.01/2.04, echo token, optional body |

**API mở rộng:**

| Endpoint | Method | Payload CBOR | Hành vi Backend | Response |
|----------|--------|--------------|-----------------|----------|
| `/device/update/info` | POST | mac_address + device fields | Update device_info theo mac_address | 2.04, echo token |
| `/device/update/entity` | POST | key 0 mac_address + key 1 array entities | Update device_entity (name, type, device_class, unit, attributes_json, disabled) — dùng bởi backend/UI, node không gửi. | 2.04, echo token |
| `/device/update/topology` | POST | Payload role-based: key 0,1,2 chung; child có 3,4,5 (parent_*); router/leader có 6 (neighbors array) | Upsert device_topology + history; replace device_topology_neighbor cho device | 2.04, echo token |
| `/device/update/state` | POST | key 0 mac_address + key 1 array (STATE_KEYS 0–6: entity_id, state, brightness, mode, rgb, color_temp, value; không có available) | Insert device_entity_state_history; upsert device_entity_state | 2.04, echo token |

**Slug:** device_slug là concern của backend + UI. Node không gửi slug; backend generate (vd. từ mac_address) và dùng cho URL/API/frontend.

**Topology payload (update/topology):** Role-based. Key 0 = mac_address, 1 = rloc16, 2 = role. Child gửi 3,4,5 (parent_rloc16, parent_rssi, parent_lq). Router/Leader gửi key 6 = array TopologyNeighbor. Backend lưu device_topology, device_topology_history, device_topology_neighbor (router/leader). Xem device_payload_spec.md.

## Schema 6 bảng

| Bảng | Vai trò |
|------|---------|
| device_info | Thông tin tĩnh + identity (mac_address TEXT UNIQUE, device_slug, device_name, …) |
| device_topology | Snapshot topology realtime (device_id FK, rloc16, parent_rloc16, role, rssi, link_quality); UNIQUE(device_id) |
| device_topology_neighbor | Neighbor list (router/leader only): device_id FK, neighbor_rloc16, rssi, lq_in, lq_out, is_child; UNIQUE(device_id, neighbor_rloc16) |
| device_topology_history | Lịch sử topology (rloc16, parent_rloc16, role, rssi, link_quality, recorded_at) |
| device_entity | Định nghĩa entity (device_id FK, entity_id, name, type, device_class, unit, restore_mode, **disabled**, deleted_at); UNIQUE(device_id, entity_id) |
| device_entity_state | Snapshot state realtime (entity_id FK, state, brightness, mode, rgb_json, color_temp, value_real, deleted_at); UNIQUE(entity_id). Không còn cột available. |
| device_entity_state_history | Lịch sử state (recorded_at) |

**Soft delete:** Khi node gửi register/info, backend soft-delete toàn bộ entity và state cũ của device (deleted_at = CURRENT_TIMESTAMP). Khi register/entity, entity upsert set deleted_at = NULL.

**restore_mode** (device_entity): 0 = RESTORE_DEFAULT_OFF, 1 = RESTORE_DEFAULT_ON, 2 = ALWAYS_OFF, 3 = ALWAYS_ON, 4 = DISABLED. Khi node boot, backend query entity + state; nếu có state đã lưu (và deleted_at NULL) thì gửi state đó trong response restore; không thì theo restore_mode gửi OFF/ON hoặc không gửi (DISABLED).

## Flow register/info → register/entity (Node đang dùng)

1. **POST /device/register/info** (keys 0–6, key 0 = mac): Node gửi device info only. Backend upsert device_info (key = mac_address). Node **chờ** response thành công (2.01/2.04); nếu fail thì **retry** (vd. sau 2s) đến khi thành công.
2. **Chỉ khi register/info đã success**, Node mới gửi **POST /device/register/entity** (key 0 = mac_address, key 1 = array entities, ENTITY_KEYS 0–6). Backend resolve device theo mac; upsert device_entity (entity có disabled key 6); có thể trả body CBOR map key **10** = array restore. Node decode CBOR và áp dụng state/default cho từng entity.

## CoAP token (RFC 7252)

Node gửi request với token. Backend **bắt buộc echo đúng token** trong response; nếu không, Node sẽ không match response và báo timeout.

## Code Backend

- **Status constants**: `backend/src/coap/coap.type.ts` — `CoapStatus` (CREATED, CHANGED, CONTENT, NOT_FOUND, SERVER_ERROR); dùng thay chuỗi "2.01", "2.04", v.v. Router dùng NOT_FOUND, SERVER_ERROR cho 4.04/5.00.
- **Response helper**: `backend/src/coap/coap.response.ts` — `echoCoapToken(req, res)`, `sendCoapResponse(req, res, status, body?, contentFormat?)`: echo token, gán status, tùy chọn Content-Format và body, rồi `res.end()`. Mọi response từ controller đều đi qua `sendCoapResponse`.
- **Controller**: `backend/src/coap/device-coap.controller.ts` — `ping`, `registerInfo`, `registerEntity`, `updateInfo`, `updateEntity`, `updateTopology`, `updateState` (paths /device/ping, /device/register/info, /device/register/entity, /device/update/info, /device/update/entity, /device/update/topology, /device/update/state). Dùng `parseCborOrRespond(req, res)` cho handler cần “parse CBOR hoặc trả 2.01 rỗng”: nếu payload null/invalid thì gửi 2.01 và return null; handler chỉ cần một dòng lấy parsed, nếu null return, rồi logic và một lần `sendCoapResponse` ở cuối.
- **Service**: `backend/src/coap/device-coap.service.ts` — `upsertDeviceInfo`, `updateDeviceInfo`, `upsertTopology` (parse theo role, key 6 neighbors), `mergeEntity`, `updateEntityDefinition`, `upsertEntityState`; SQLite qua repo; bảng device_info, device_topology, device_topology_neighbor, device_topology_history, device_entity, device_entity_state, device_entity_state_history.
- **Payload keys**: `backend/src/coap/device/device.payload.ts` — PAYLOAD_KEY_MAC (0), PAYLOAD_KEY_ARRAY (1), DEVICE_INFO_KEYS (0–6), TOPOLOGY_KEYS (0–6 role-based), TOPOLOGY_NEIGHBOR_KEYS (0–4), ENTITY_KEYS (0–6, key 6 = disabled), STATE_KEYS (0–6).
- **CBOR**: `backend/src/cbor/cbor.decoder.ts` (decode request payload), `backend/src/cbor/cbor.encoder.ts` (encode restore response); không dùng thư viện ngoài, format RFC 7049.

## Tài liệu liên quan

- [thread_node_coap.md](thread_node_coap.md) — Luồng Node → Backend, SRP discovery, boot flow, restore.
- [../architecture/real_br_integration.md](../architecture/real_br_integration.md) — Routing, troubleshooting ResponseTimeout.
