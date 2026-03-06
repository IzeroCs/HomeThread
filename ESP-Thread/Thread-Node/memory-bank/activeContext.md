# Thread-Node — Active Context

## Focus hiện tại (2026-03-04)

Dự án đang ở giai đoạn **migration và hoàn thiện** sau khi lớp hạ tầng Thread (joiner, registry, LED, button) đã hoàn chỉnh. **Device register** gửi **chỉ tới Backend** (sau khi discovery); re-register khi backend endpoint (IPv6/port) thay đổi; one-shot on ACK (mọi role Child/Router/Leader đều gửi được; chờ ACK 20s, gửi 1 lần rồi dừng; retry khi NACK/timeout); flag `device_registry_is_registered()`. Các công việc còn lại tập trung vào **Entity CoAP Server** và **CBOR serialization** cho các entity type chưa implement.

## Recent changes

- **Device register chỉ tới Backend** (`device_registry.c/.h`, `thread_endpoint.c`, `light_on_off/main.c`): CoAP POST `/device/register` gửi tới **Backend** (endpoint từ `backend_discovery_get_endpoint()`), không còn gửi tới Leader RLOC. API: `device_registry_register(endpoint, callback, ctx)` với `device_registry_endpoint_t`; `device_registry_init()` gọi trong thread_endpoint khi `enable_device_registry` (không có registry task, không Leader RLOC). App gọi `device_registry_register()` **sau khi** discovery thành công và khi refresh task (60s) phát hiện endpoint đổi.
- **Trigger register** (`light_on_off/main.c`): `trigger_register()` khi (1) lần đầu discovery backend thành công, (2) task `backend_disc_refresh` mỗi 60s thấy addr/port đổi → cập nhật `s_backend_ep` và gửi lại register.
- **Backend discovery log cleanup** (`backend_discovery.c`, `light_on_off/main.c`): Khi discovery không tìm thấy backend: một dòng thân thiện (vd. "Backend not available yet (will retry in 60s)"); chi tiết (DNS timeout, SRP failed, "Initial backend discovery failed") ở LOGD.
- **Flag `device_registry_is_registered()`** (`device_registry.h/.c`): false lúc boot; lên true khi Backend đã ACK (2.01/2.04/2.05) ít nhất một lần. **Hiện tại** chỉ gửi lại register khi app gọi lại `device_registry_register()` (thường do endpoint đổi hoặc node reboot/join lại); **backend restart nhưng giữ nguyên IPv6/port sẽ không tự trigger re-register**. (TODO: periodic re-register hoặc backend-side notify)
- **Tài liệu ACK/NACK** (`docs/coap/border_router_coap_server.md`): Backend nhận `/device/register` phải trả ACK/NACK; bảng mã ACK (2.01, 2.04, 2.05) và NACK (4.xx, 5.xx).
- **Device info numeric (Zigbee-style)** (`device_model.h`, `device_model.c`, `entity_serialization.c`): device_type, sw_version, hw_version = number; strings cho manufacturer, model, device_name.
- **Backend discovery: cache TTL + re-discovery định kỳ** (`backend_discovery.c`, `light_on_off/main.c`): `cache_ttl_sec`; task 60s gọi get_endpoint(..., false), cập nhật s_backend_ep khi endpoint đổi → trigger_register(). Chi tiết: `docs/coap/backend_discovery_srp.md`.
- **Backend discovery via SRP/DNS-SD** (`backend_discovery/`): Browse `_dashboard._udp.default.svc.arpa`; mHostNameBuffer API (ESP-IDF 5.5.3); CONFIG_OPENTHREAD_DNS_CLIENT=y; discovery trả NotFound cho đến khi BR đăng ký service qua SRP.
- **Device registry tùy chọn** (`thread_endpoint.h`, `thread_endpoint.c`): `enable_device_registry` (bool): khi true chỉ gọi `device_registry_init()`; app tự gọi `device_registry_register(endpoint, ...)` khi đã có endpoint từ backend discovery.

## Công việc đang pending

### 1. Migration entity_coap_server sang struct-based approach

**File**: `components/entity/coap_server/entity_coap_server.c`

**Tình trạng**: Tất cả CoAP handler đang return `5.01 Not Implemented`:
- `GET /entities` — Liệt kê entities (stub)
- `GET /entities/{id}` — Mô tả entity cụ thể (stub)
- `PUT /entities/{id}/{attr}` — Điều khiển entity (stub)

**Ghi chú trong code**: File có nhiều TODO chú thích `MIGRATION_TO_STRUCT_BASED.md`, cho thấy có kế hoạch tài liệu hóa migration approach.

**Cần làm**:
- Implement `GET /entities` để gọi `entity_get_by_index()` lặp qua tất cả entities
- Implement `GET /entities/{id}` để gọi `entity_describe(id)`
- Implement `PUT /entities/{id}/{attr}` để parse request body và gọi `entity_set(id, attr, value)`
- Tất cả handlers cần dùng `thread_coap_send_response()` của shared CoAP manager

### 2. CBOR serialization còn thiếu

**File**: `components/entity/serialization/entity_serialization.c`

**Đã implement**: `entity_light_t`, `entity_sensor_t`

**Còn thiếu** (hiện là stub/không có):
- `entity_switch_t` — switch state
- `entity_fan_t` — fan speed, oscillation
- `entity_climate_t` — temperature, humidity, mode, setpoint
- `entity_binary_sensor_t` — binary state

### 3. main/main.c migration

**File**: `main/main.c`

**Tình trạng**: Là stub không functional. Root project `Thread-Node/` hiện không build được — chỉ `examples/light_on_off/` build được.

**Cần quyết định**: Có cần một "default" main.c không, hay Thread-Node luôn được dùng qua examples?

## Quyết định kiến trúc đang open

### entity_coap_server attribute parsing

CoAP PUT `/entities/{id}/{attr}` cần parse `{attr}` từ URI path và `value` từ request payload. Chưa có quyết định về format của payload:
- Option A: CBOR payload (nhất quán với device registry)
- Option B: Plain text (đơn giản hơn cho debugging)
- Option C: JSON (dễ test với curl)

### Liên kết với Thread-Host (CMD_DATA forwarding)

Phía Thread-Host chưa implement việc forward CBOR data từ `/device/register` lên Dashboard qua `CMD_DATA` frame. Thread-Node đã gửi đúng format, nhưng data chưa đến được Dashboard. Đây là vấn đề phía Thread-Host, không phải Thread-Node.

## Trạng thái example light_on_off

`examples/light_on_off/` là **hoàn chỉnh và buildable**:
- ✅ Thread joining và re-joining
- ✅ Status LED phản ánh đúng OT role
- ✅ Boot button factory reset
- ✅ Entity model khởi tạo đúng
- ✅ Backend discovery SRP/DNS-SD (scan `_dashboard._udp.default.svc.arpa`, cache NVS, retry nền); discovery trả NotFound cho đến khi BR đăng ký service qua SRP thành công
- ✅ Device registration **bật**; `trigger_register()` sau discovery và khi backend endpoint đổi
- ❌ Entity CoAP server (tất cả return 5.01 Not Implemented)

## Files quan trọng cần biết

| File | Trạng thái | Ghi chú |
|---|---|---|
| `components/thread/thread_endpoint.c` | ✅ Complete | Entry point; enable_device_registry (tùy chọn device register) |
| `components/thread/backend_discovery/backend_discovery.c` | ✅ Complete | SRP/DNS-SD browse _dashboard._udp; mHostNameBuffer API; phụ thuộc BR SRP |
| `components/thread/thread_joiner.c` | ✅ Complete | Joiner state machine |
| `components/thread/device_registry/device_registry.c` | ✅ Complete | CoAP POST /device/register **tới Backend** (endpoint từ backend_discovery); callback ACK/NACK; mọi role (Child/Router/Leader) đều gửi được |
| `components/entity/coap_server/entity_coap_server.c` | ❌ Stub | Tất cả return 5.01 |
| `components/entity/serialization/entity_serialization.c` | ⚠️ Partial | Light+sensor OK, rest missing; device info encode device_type/sw/hw as uint |
| `components/entity/model/include/device_model.h` | ✅ Complete | device_info_t: strings (name, manufacturer, model) + numbers (device_type, sw_version, hw_version) |
| `main/main.c` | ❌ Stub | Migration pending |

## Các bước tiếp theo

1. **Implement entity_coap_server handlers** — đây là tính năng quan trọng nhất còn thiếu để device có thể nhận lệnh điều khiển từ Border Router

2. **Hoàn thiện CBOR serialization** cho switch, fan, climate, binary_sensor — cần thiết để device registry báo cáo đầy đủ entity data

3. **Tạo thêm examples** — hiện chỉ có `light_on_off`. Cần examples cho sensor, switch

4. **Quyết định và implement main/main.c** — nếu muốn Thread-Node root buildable như một template project

5. **TODO (xử lý sau):** Check khi node tự nhảy lên Leader — khi đó node đang ở partition tách riêng. Phát hiện role = Leader khi prefer_not_leader bật → trigger re-join / chờ partition merge / recovery, sẽ làm sau.

## Nguồn tham khảo cho migration

- `Documents/iot-entity-model/entity_model_specification.md` v1.3.0 — định nghĩa đầy đủ attribute set cho từng entity type
- `Documents/coap/border_router_coap_server.md` — format CoAP request/response expected bởi Border Router
- `components/entity/model/entity_model.h` — public API cho entity CRUD operations
