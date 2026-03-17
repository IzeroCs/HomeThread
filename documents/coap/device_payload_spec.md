# CoAP Device Payload Spec — Namorix Thread

> **File canonical** cho toàn bộ giao tiếp Thread-Node ↔ Backend: CoAP endpoints, CBOR payload keys, DB schema, và flow đăng ký.  
> Transport: CoAP UDP 5683 `[::]` (udp6). Content-Format: CBOR (application/cbor). Backend **luôn echo CoAP token** (RFC 7252).

---

## 1. CoAP Endpoints

### 1.1 Contract chính (Thread-Node sử dụng)

| Method | Path | Payload | Mô tả |
|--------|------|---------|-------|
| GET | `/device/ping` | query `?mac=<eui64_hex>` (16 ký tự hex) | Backend trả 2.05 Content, body 4 byte timestamp uint32 LE. Node so sánh timestamp; đổi → backend restart → gửi lại register. Có `mac` hợp lệ → cập nhật `last_seen_at`. |
| POST | `/device/register/info` | device_info (keys 0–6, key 0 = mac) | Upsert `device_info`, soft-delete entity/state cũ. Node **chờ** 2.01/2.04, retry nếu fail. |
| POST | `/device/register/entity` | key 0 (mac) + key 1 (array entity, ENTITY_KEYS 0–6) | Upsert `device_entity`; có thể trả body CBOR key 10 = array restore. Chỉ gửi **sau khi** register/info thành công. |
| POST | `/device/update/topology` | DeviceTopologyPayload (role-based) | Upsert `device_topology` + history + neighbor. Node gửi định kỳ sau khi đã register. |
| POST | `/device/update/state` | key 0 (mac) + key 1 (array state, STATE_KEYS 0–6) | Upsert `device_entity_state` + append history. Node gửi định kỳ. |

### 1.2 API mở rộng (Backend/UI only — node không gửi)

| Method | Path | Payload |
|--------|------|---------|
| POST | `/device/update/info` | device_info keys 0–6 |
| POST | `/device/update/entity` | key 0 (mac) + key 1 (array entity, ENTITY_KEYS 0–6) |

---

## 2. CBOR Payload Keys

### 2.1 device_info (register/info, update/info) — keys 0–6

Key 0 = `mac_address` **bắt buộc**. Topology gửi riêng qua `/device/update/topology`.

| Key | Tên | Kiểu | Ghi chú |
|-----|-----|------|---------|
| **0** | **mac_address** | bstr(8) | IEEE EUI-64 của giao diện IEEE 802.15.4 (Thread), 8 bytes big-endian. Lấy từ `esp_read_mac(..., ESP_MAC_IEEE802154)`. **Không đổi khi factory reset.** Backend lưu 16-char hex (lowercase). |
| 1 | device_name | string | Tên thiết bị; backend dùng để generate slug. |
| 2 | device_type | number | Loại thiết bị (Zigbee-style uint16). |
| 3 | manufacturer | string | |
| 4 | model | string | |
| 5 | sw_version | number | uint32: `major<<16 | minor<<8 | patch` |
| 6 | hw_version | number | uint32 |

### 2.2 device_topology (update/topology) — role-based

**Key chung (mọi role):**

| Key | Tên | Kiểu | Ghi chú |
|-----|-----|------|---------|
| **0** | mac_address | bstr(8) | EUI-64, bắt buộc. |
| 1 | rloc16 | number | RLOC16 Thread. |
| 2 | role | number | 0 = child, 1 = router, 2 = leader. |

**Fields theo role:**

| Role | Keys thêm |
|------|-----------|
| child (0) | 3 = parent_rloc16, 4 = parent_rssi (dBm), 5 = parent_lq (0–255) |
| router (1) / leader (2) | 6 = array **TopologyNeighbor** |

**TopologyNeighbor** (mỗi phần tử của key 6):

| Key | Tên | Kiểu | Ghi chú |
|-----|-----|------|---------|
| 0 | rloc16 | number | Bắt buộc. |
| 1 | rssi | number | dBm. Optional nếu N/A. |
| 2 | link_quality_in | number | Optional. |
| 3 | link_quality_out | number | Optional. |
| 4 | is_child | boolean | true = neighbor là child. |

> **Nguồn dữ liệu firmware:** Child dùng `otThreadGetParentInfo`. Router/Leader dùng `otThreadGetNextNeighborInfo` (duyệt toàn bộ neighbor; router xa chỉ có LQ, không có RSSI).

### 2.3 entity (register/entity, update/entity) — ENTITY_KEYS 0–6

Request body: **key 0** = mac_address (bstr(8)), **key 1** = array entity.

| Key | Tên | Kiểu | Ghi chú |
|-----|-----|------|---------|
| 0 | entity_id | string | Bắt buộc. ID entity (`light.0`, `sensor.1`, …). |
| 1 | name | string | Tên hiển thị. |
| 2 | type | number | Loại entity (enum `entity_type_t`). |
| 3 | device_class | number | Sub-type. |
| 4 | unit | string | Đơn vị (sensor). |
| 5 | restore_mode | number | 0=DEFAULT_OFF, 1=DEFAULT_ON, 2=ALWAYS_OFF, 3=ALWAYS_ON, 4=DISABLED. |
| 6 | disabled | number | 1 = không hiện trên dashboard. |

**Response register/entity:** Backend có thể trả body CBOR **key 10** = array restore. Mỗi item: `entity_id(0)`, `restore_mode(1)`, `state(2)`, `brightness(3)`, `mode(4)`, `rgb_json(5)`, `color_temp(6)`, `value_real(7)`, `has_saved_state(8)`.

### 2.4 state (update/state) — STATE_KEYS 0–6

Request body: **key 0** = mac_address (bstr(8)), **key 1** = array state.

| Key | Tên | Kiểu |
|-----|-----|------|
| 0 | entity_id | string (bắt buộc) |
| 1 | state | number / boolean |
| 2 | brightness | number |
| 3 | mode | number |
| 4 | rgb | array/object |
| 5 | color_temp | number |
| 6 | value | number |

---

## 3. Database Schema (8 bảng)

| Bảng | Vai trò |
|------|---------|
| `device_info` | Thông tin tĩnh + identity (mac_address TEXT UNIQUE, device_slug, device_name, is_border_router, …) |
| `device_topology` | Snapshot topology realtime; UNIQUE(device_id) |
| `device_topology_neighbor` | Neighbor list (router/leader only): UNIQUE(device_id, neighbor_rloc16) |
| `device_topology_history` | Lịch sử topology (rloc16, parent_rloc16, role, rssi, lq, recorded_at) |
| `device_entity` | Định nghĩa entity (device_id FK, entity_id, name, type, device_class, unit, restore_mode, disabled, deleted_at); UNIQUE(device_id, entity_id) |
| `device_entity_state` | Snapshot state realtime; UNIQUE(entity_id). Không có cột `available`. |
| `device_entity_state_history` | Lịch sử state (recorded_at) |
| `device_health_br` | **1 row per device** (UNIQUE device_id), upsert mỗi lần poll/notify. Điền qua frame `CMD_BR_HEALTH` (TCP), không qua CoAP. |

**Soft delete:** Khi node gửi `register/info`, backend soft-delete toàn bộ entity/state cũ của device (`deleted_at = CURRENT_TIMESTAMP`). Khi `register/entity`, entity upsert set `deleted_at = NULL`.

**device_slug:** Concern của backend + UI. Node không gửi slug; backend tự generate (vd. từ mac_address).

---

## 4. Flow đăng ký (Thread-Node)

```
Boot
 │
 ├─ GET /device/ping?mac=... ──────────────────────────────────┐
 │   timestamp đổi so với lần trước?                           │
 │   Có → bắt đầu register                                     │
 │   Không → bỏ qua (chỉ heartbeat)                            │
 │                                                             ↓
 ├─ POST /device/register/info (keys 0–6)
 │   ↳ Retry mỗi 2s cho đến khi nhận 2.01/2.04
 │
 ├─ POST /device/register/entity (key 0=mac, key 1=array)
 │   ↳ Chỉ gửi sau khi register/info success
 │   ↳ Decode body CBOR key 10 → áp dụng restore state
 │
 └─ Loop định kỳ:
     ├─ GET /device/ping?mac=...   (mỗi 10s — heartbeat + restart detection)
     ├─ POST /device/update/topology  (role-based)
     └─ POST /device/update/state     (array state entities)
```

---

## 5. Response Status

| Code | Ý nghĩa |
|------|---------|
| 2.01 Created | Resource mới tạo (vd. device/entity mới). |
| 2.04 Changed | Cập nhật thành công. |
| 2.05 Content | GET /device/ping (body 4 byte timestamp). |
| 4.xx / 5.03 | Lỗi client / server. |

Lỗi parse CBOR → backend trả 2.01 empty body (không crash node).

---

## 6. Code Backend (TypeScript)

- **Status constants:** `backend/src/coap/coap.type.ts` — `CoapStatus` (CREATED, CHANGED, CONTENT, NOT_FOUND, SERVER_ERROR).
- **Response helper:** `backend/src/coap/coap.response.ts` — `sendCoapResponse(req, res, status, body?, contentFormat?)`: echo token, gán status, gọi `res.end()`.
- **Controller:** `backend/src/coap/device-coap.controller.ts` — `ping`, `registerInfo`, `registerEntity`, `updateInfo`, `updateEntity`, `updateTopology`, `updateState`. Dùng `parseCborOrRespond(req, res)`: parse CBOR hoặc trả 2.01 rỗng nếu payload null/invalid.
- **Service:** `backend/src/coap/device-coap.service.ts` — `upsertDeviceInfo`, `upsertTopology` (parse theo role, key 6 neighbors), `mergeEntity`, `upsertEntityState`.
- **Payload keys:** `backend/src/coap/device/device.payload.ts` — `PAYLOAD_KEY_MAC (0)`, `PAYLOAD_KEY_ARRAY (1)`, `DEVICE_INFO_KEYS`, `TOPOLOGY_KEYS`, `TOPOLOGY_NEIGHBOR_KEYS`, `ENTITY_KEYS`, `STATE_KEYS`.
- **CBOR:** `backend/src/cbor/cbor.decoder.ts` (decode request), `backend/src/cbor/cbor.encoder.ts` (encode restore response) — không dùng thư viện ngoài, RFC 7049.

---

## 7. Tài liệu liên quan

| Tài liệu | Nội dung |
|----------|----------|
| [backend_discovery_srp.md](backend_discovery_srp.md) | SRP/DNS-SD discovery, OpenThread DNS client, cách BR đăng ký service |
| [../architecture/real_br_integration.md](../architecture/real_br_integration.md) | Kiến trúc BR, routing, troubleshooting ResponseTimeout |
| [../protocol/usb_cdc_frame_structure.md](../protocol/usb_cdc_frame_structure.md) | Frame protocol, CMD_BR_HEALTH TLV |
