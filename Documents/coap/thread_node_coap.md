# Thread-Node: Gửi dữ liệu lên Dashboard (CoAP + CBOR)

Tài liệu này dành cho **Thread-Node** (firmware thiết bị router/child/endpoint) khi cần gửi dữ liệu lên OpenThread Dashboard backend. Backend nhận qua **CoAP** (UDP 5683, IPv6), payload **CBOR**. Backend lưu device/entity/topology/state vào SQLite và có thể trả **restore state** trong response của register/entity để node áp dụng khi boot.

## Luồng tổng quan

```
Thread-Node  --[CoAP + CBOR, path /device/...]-->  Backend (Dashboard)
Backend       parse CBOR → device_info, device_entity, device_topology, device_entity_state.
              Response: 2.01/2.04 (và có thể kèm restore state trong body).
```

- **Thread-Node → Backend**: Gửi **GET** `/device/ping?mac=<eui64_hex>` (ví dụ mỗi 10s, hex 16 ký tự); **POST** `/device/register/info` (keys 0–6, key 0 = mac), **chờ thành công** (retry nếu fail); **chỉ khi register/info success** mới gửi **POST** `/device/register/entity` (key 0 = mac_address, key 1 = array entities). Các endpoint `/device/update/topology`, `/device/update/state` là tùy chọn; `/device/update/info`, `/device/update/entity` do backend/UI, node không gửi.
- **Backend**: Listen UDP 5683 trên IPv6 ([::]). Mọi response **echo CoAP token** (RFC 7252). **device_slug** hoàn toàn do backend/UI tạo — node **không gửi** và không cần biết slug.

## CoAP URI (Node đang dùng — align backend)

| Path | Method | Ý nghĩa |
|------|--------|---------|
| `/device/ping` | **GET** | Ping; backend trả **2.05 Content**, payload **4 byte** = timestamp uint32 LE. **Nên** gửi kèm query **?mac=&lt;eui64_hex&gt;** (16 ký tự hex) để backend cập nhật heartbeat (last_seen_at). Node so sánh timestamp; nếu khác → backend restart → gửi lại register/info + register/entity. |
| `/device/register/info` | POST | Đăng ký device info. Payload CBOR **keys 0–6** (key 0 = mac_address bắt buộc). Node **chờ** response 2.01/2.04; **nếu fail thì retry** (vd. 2s) đến khi thành công. Chỉ khi success mới gửi register/entity. |
| `/device/register/entity` | POST | Đăng ký danh sách entity. Payload: **key 0** = mac_address, **key 1** = array entities (ENTITY_KEYS 0–6: entity_id, name, type, device_class, unit, restore_mode, disabled). Chỉ gửi **sau khi** register/info đã thành công. Backend có thể trả **restore state** trong body CBOR (map key **10** = array restore). Response 2.01/2.04, echo token. |

**API mở rộng (tùy chọn):** `/device/update/info`, `/device/update/entity`, `/device/update/topology`, `/device/update/state` — xem border_router_coap_server.md.

## Slug (backend/UI only)

**device_slug** dùng cho URL/API/frontend. Node **không gửi** và **không cần biết** slug; backend tự generate từ mac_address (hoặc rule nội bộ). Mọi request từ node xác định device bằng **mac_address** (key 0).

## Payload CBOR

- **POST /device/register/info** — map **keys 0–6** (key 0 = mac_address bắt buộc, 1–6 = device_name, device_type, manufacturer, model, sw_version, hw_version).

- **POST /device/register/entity** — map **key 0** = mac_address (uint), **key 1** = array entity. Mỗi entity: ENTITY_KEYS 0–6 — entity_id(0), name(1), type(2), device_class(3), unit(4), restore_mode(5), **disabled(6)** (1 = không hiện trên dashboard). Không còn key 12/13; index tuần tự 0–6.

**restore_mode** (key 5 trong entity): 0 = RESTORE_DEFAULT_OFF, 1 = RESTORE_DEFAULT_ON, 2 = ALWAYS_OFF, 3 = ALWAYS_ON, 4 = DISABLED. **disabled** (key 6): 1 = entity không thêm lên dashboard. Backend dùng restore_mode khi node boot để quyết định gửi lại state đã lưu hay default ON/OFF trong response.

## Flow khi boot

1. Node gửi **POST /device/register/info** (keys 0–7). **Chờ** response thành công (2.01/2.04); **nếu fail thì retry** (vd. sau 2s) đến khi thành công.
2. **Khi register/info success** → Node gửi **POST /device/register/entity** (key 0 = mac_address, key 1 = array entities, mỗi entity ENTITY_KEYS 0–6: entity_id, name, type, device_class, unit, restore_mode, disabled).
3. Backend xử lý register/entity: merge entity, lookup state cũ. Nếu entity có **restore_mode** và có state đã lưu → đưa vào danh sách restore; không có state cũ → dùng default theo restore_mode (OFF/ON/không gửi).
4. Response của **POST /device/register/entity** có thể có body **CBOR** (Content-Format application/cbor): map key **10** = mảng restore; mỗi phần tử là map với key 0=entity_id, 1=restore_mode, 2=state, 3=brightness, 4=mode, 5=rgb_json, 6=color_temp, 7=value_real, 8=has_saved_state (0/1). Node decode CBOR và áp dụng state (hoặc default) cho từng entity.

## GET /device/ping — heartbeat và restart detection

- Gửi **GET /device/ping?mac=&lt;eui64_hex&gt;** định kỳ (vd. mỗi 10s). Backend cập nhật **last_seen_at** (heartbeat) cho thiết bị; response vẫn là 2.05 Content + 4 byte timestamp uint32 LE.
- Node lưu timestamp; nếu lần sau nhận **timestamp khác** → backend đã restart → gửi lại register/info + register/entity.

## update/topology và update/state

- **POST /device/update/topology**: Payload **role-based**. Key 0 = mac_address, 1 = rloc16, 2 = role (0=child, 1=router, 2=leader). **Child** gửi thêm keys 3,4,5 (parent_rloc16, parent_rssi, parent_lq). **Router/Leader** gửi key 6 = array TopologyNeighbor (mỗi item: rloc16, rssi?, lq_in?, lq_out?, is_child). Thread-Node khi role router/leader dùng `otThreadGetNextNeighborInfo` để build key 6. Backend parse theo role; lưu device_topology + device_topology_history; router/leader còn lưu device_topology_neighbor. Chi tiết: [device_payload_spec.md](device_payload_spec.md).
- **POST /device/update/state**: Payload **key 0** = mac_address, **key 1** = array state. Mỗi phần tử STATE_KEYS 0–6: entity_id, state, brightness, mode, rgb, color_temp, value (không còn available). Backend lưu snapshot state + append history.

## Lấy Backend IP/port (SRP/DNS-SD)

- **Ưu tiên:** Thread-Node **tự scan** service `_dashboard._udp` trên mạng Thread (qua SRP server của BR) để lấy IP và port backend.
- **Cách làm:** Browse `_dashboard._udp.default.svc.arpa` → chọn instance → đọc SRV → resolve AAAA → **IPv6 + port**.
- **Cache:** Lưu IP + port vào NVS; refresh khi CoAP fail hoặc định kỳ.
- **Fallback:** Nếu không thấy service → dùng cấu hình tĩnh (IP/port trong NVS hoặc commissioning).

Spec service: type `_dashboard._udp`, domain `default.svc.arpa`, port 5683. Chi tiết: [../architecture/real_br_integration.md](../architecture/real_br_integration.md).

## CoAP token (RFC 7252)

Node gửi request với token (vd. 2 byte). Backend **phải echo đúng token** trong response; nếu không, stack phía Node sẽ không match response và coi là timeout.

## Troubleshooting: ResponseTimeout

Khi node báo **ResponseTimeout**, thường là **response từ backend không tới được node** (routing/forwarding).

- Backend gửi response về **rsinfo** (source IP + port của request).
- Trên host backend: cần **route** tới prefix Thread qua BR. Kiểm tra: `ip -6 route get <node_ula>`.
- **Border Router:** BR phải **forward** packet từ backhaul vào Thread mesh (ESP32-S3 + RCP hoặc OTBR: forwarding, firewall).

Chi tiết: [../architecture/real_br_integration.md](../architecture/real_br_integration.md).

## Tài liệu liên quan

- Backend CoAP spec: [border_router_coap_server.md](border_router_coap_server.md)
- SRP/BR: [../architecture/real_br_integration.md](../architecture/real_br_integration.md)
