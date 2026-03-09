# Thread-Node: Gửi dữ liệu lên Dashboard (CoAP + CBOR)

Tài liệu này dành cho **Thread-Node** (firmware thiết bị router/child/endpoint) khi cần gửi dữ liệu lên OpenThread Dashboard backend. Backend nhận qua **CoAP** (UDP 5683, IPv6), payload **CBOR**. Backend lưu device/entity/topology/state vào SQLite và có thể trả **restore state** trong response của register/entity để node áp dụng khi boot.

## Luồng tổng quan

```
Thread-Node  --[CoAP + CBOR, path /device/...]-->  Backend (Dashboard)
Backend       parse CBOR → device_info, device_entity, device_topology, device_entity_state.
              Response: 2.01/2.04 (và có thể kèm restore state trong body).
```

- **Thread-Node → Backend**: Gửi **GET** `/device/ping`; **POST** `/device/register/info` (device + network, keys 0–8, **bắt buộc mac_address key 7**); **POST** `/device/register/entity` (mac_address + key 9 = array entities); **POST** `/device/update/info`, `/device/update/entity`, `/device/update/topology`, `/device/update/state` khi cần.
- **Backend**: Listen UDP 5683 trên IPv6 ([::]). Mọi response **echo CoAP token** (RFC 7252). **device_slug** hoàn toàn do backend/UI tạo — node **không gửi** và không cần biết slug.

## CoAP URI mới (thay thế /device/register, /device/entities, /device/update)

| Path | Method | Ý nghĩa |
|------|--------|---------|
| `/device/ping` | **GET** | Ping; backend trả **2.05 Content**, payload **4 byte** = timestamp uint32 LE. Node so sánh; nếu khác → backend restart → gửi lại register/info + register/entity. |
| `/device/register/info` | POST | Đăng ký thông tin device (identity + static). Payload CBOR **keys 0–8**, **bắt buộc mac_address (key 7)**. Response 2.01/2.04, echo token. |
| `/device/register/entity` | POST | Đăng ký định nghĩa entity. Payload: **mac_address (key 7)** để xác định device, **key 9** = array entities. Backend merge entity, có thể trả **restore state** trong body **CBOR** (Content-Format application/cbor): map key **10** = array các map restore (mỗi map: 0=entity_id, 1=restore_mode, 2=state, 3=brightness, 4=mode, 5=rgb_json, 6=color_temp, 7=value_real, 8=has_saved_state). Response 2.01/2.04, echo token. |
| `/device/update/info` | POST | Cập nhật device_info (device_name, device_type, …). Payload có mac_address (key 7). |
| `/device/update/entity` | POST | Cập nhật định nghĩa entity (name, type, device_class, unit, …). Payload: mac_address + key 9 array entities. |
| `/device/update/topology` | POST | Cập nhật topology (rloc16, parent_rloc16, role). Payload: mac_address + key 8 network. |
| `/device/update/state` | POST | Cập nhật state entity (state, brightness, mode, …). Payload: mac_address + key 9 array entities (mỗi entity có entity_id + state fields). |

## Slug (backend/UI only)

**device_slug** dùng cho URL/API/frontend. Node **không gửi** và **không cần biết** slug; backend tự generate từ mac_address (hoặc rule nội bộ). Mọi request từ node xác định device bằng **mac_address** (key 7).

## Payload CBOR

- **POST /device/register/info** — map **keys 0–8** (không có key 9):
  - **0**: device_id (string, optional — backend không dùng để identify; slug do backend tạo).
  - **1**: device_name, **2**: device_type, **3**: manufacturer, **4**: model, **5**: sw_version, **6**: hw_version.
  - **7**: **mac_address** (uint, **bắt buộc**) — EUI-64, backend dùng làm identifier.
  - **8**: network (map: rloc16(0), role(1)=0|1|2, ipv6(2), parent(3) optional). Nếu có, backend ghi luôn topology.

- **POST /device/register/entity** — map:
  - **7**: mac_address (để backend resolve device).
  - **9**: array các entity map. Mỗi entity: entity_id(0), name(1), type(2), device_class(3), unit(12), **restore_mode(13)** (optional, 0–4), và các trường state nếu có (available, state, brightness, mode, …).

**restore_mode** (key 13 trong entity): 0 = RESTORE_DEFAULT_OFF, 1 = RESTORE_DEFAULT_ON, 2 = ALWAYS_OFF, 3 = ALWAYS_ON, 4 = DISABLED. Backend dùng khi node boot để quyết định gửi lại state đã lưu hay default ON/OFF trong response.

## Flow khi boot

1. Node gửi **POST /device/register/info** (mac_address + device_name, device_type, …; có thể kèm key 8 network).
2. Node gửi **POST /device/register/entity** (mac_address + key 9 = array entities, mỗi entity có thể có restore_mode).
3. Backend xử lý register/entity: merge entity, lookup state cũ. Nếu entity có **restore_mode** và có state đã lưu → đưa vào danh sách restore; không có state cũ → dùng default theo restore_mode (OFF/ON/không gửi).
4. Response của **POST /device/register/entity** có thể có body **CBOR** (Content-Format application/cbor): map với key **10** = mảng restore; mỗi phần tử là map với key 0=entity_id, 1=restore_mode, 2=state, 3=brightness, 4=mode, 5=rgb_json, 6=color_temp, 7=value_real, 8=has_saved_state (0/1). Node decode CBOR và áp dụng state (hoặc default) cho từng entity.

## update/topology và update/state

- **POST /device/update/topology**: Payload có **mac_address (key 7)** và **key 8** network (rloc16, role, parent). Backend lưu snapshot topology + append history.
- **POST /device/update/state**: Payload có **mac_address (key 7)** và **key 9** array entities (mỗi phần tử có entity_id + available, state, brightness, mode, rgb_json, color_temp, value_real). Backend lưu snapshot state + append history.

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
