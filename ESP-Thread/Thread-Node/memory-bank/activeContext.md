# Thread-Node — Active Context

## Focus hiện tại (2026-02-21)

Dự án đang ở giai đoạn **migration và hoàn thiện** sau khi lớp hạ tầng Thread (joiner, registry, LED, button) đã hoàn chỉnh. **Device register one-shot on ACK** đã implement: chỉ gửi khi Child/Router, chờ ACK (20s), gửi 1 lần rồi dừng; retry khi NACK/timeout; flag `device_registry_is_registered()`. Các công việc còn lại tập trung vào **Entity CoAP Server** và **CBOR serialization** cho các entity type chưa implement.

## Recent changes

- **Device register one-shot on ACK** (`thread_endpoint.c`, `device_registry.c`): Chỉ gửi `/device/register` khi role là Child hoặc Router; gửi xong chờ ACK/NACK; timeout 20s thì retry sau 2s. **Khi nhận ACK thì chỉ gửi 1 lần rồi dừng** cho đến khi có notify (role change hoặc sau này Leader yêu cầu re-register). Bỏ `REGISTRY_PERIODIC_MS`; tham số còn `REGISTRY_ACK_TIMEOUT_MS`, `REGISTRY_RETRY_DELAY_MS`. Leader check trong `device_registry_register()` — từ chối khi role là Leader.
- **Flag `device_registry_is_registered()`** (`device_registry.h/.c`): false lúc boot; lên true khi Leader đã ACK ít nhất một lần. TODO: sau này lắng nghe Leader yêu cầu gửi lại đăng ký (re-register).
- **Tài liệu ACK/NACK** (`docs/coap/border_router_coap_server.md`): Thêm mục "ACK / NACK — Phản hồi bắt buộc cho mọi message từ Node"; Leader phải luôn trả response (ACK hoặc NACK); bảng mã ACK (2.01, 2.04, 2.05) và NACK (4.xx, 5.xx). Cập nhật `docs/README.md`.
- **Device info numeric (Zigbee-style)** (`device_model.h`, `device_model.c`, `entity_serialization.c`, `entity_model_specification.md`, `entity_model_schema.md`): Chỉ giữ **string** cho manufacturer, model, device_name; **number** cho device_type (uint16), sw_version (uint32), hw_version (uint32) để giảm băng thông khi gửi register nhiều lần. device_type = Zigbee-style ID (DEVICE_TYPE_*); version = DEVICE_VERSION(maj,min,patch). Example `light_on_off` dùng numeric constants.

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
- ✅ Device registration lên Border Router
- ✅ Status LED phản ánh đúng OT role
- ✅ Boot button factory reset
- ✅ Entity model khởi tạo đúng
- ❌ Entity CoAP server (tất cả return 5.01 Not Implemented)

## Files quan trọng cần biết

| File | Trạng thái | Ghi chú |
|---|---|---|
| `components/thread/thread_endpoint.c` | ✅ Complete | Entry point chính |
| `components/thread/thread_joiner.c` | ✅ Complete | Joiner state machine |
| `components/thread/device_registry/device_registry.c` | ✅ Complete | CoAP POST /device/register; từ chối khi role Leader; callback ACK/NACK |
| `components/entity/coap_server/entity_coap_server.c` | ❌ Stub | Tất cả return 5.01 |
| `components/entity/serialization/entity_serialization.c` | ⚠️ Partial | Light+sensor OK, rest missing; device info encode device_type/sw/hw as uint |
| `components/entity/model/include/device_model.h` | ✅ Complete | device_info_t: strings (name, manufacturer, model) + numbers (device_type, sw_version, hw_version) |
| `main/main.c` | ❌ Stub | Migration pending |

## Các bước tiếp theo

1. **Implement entity_coap_server handlers** — đây là tính năng quan trọng nhất còn thiếu để device có thể nhận lệnh điều khiển từ Border Router

2. **Hoàn thiện CBOR serialization** cho switch, fan, climate, binary_sensor — cần thiết để device registry báo cáo đầy đủ entity data

3. **Tạo thêm examples** — hiện chỉ có `light_on_off`. Cần examples cho sensor, switch

4. **Quyết định và implement main/main.c** — nếu muốn Thread-Node root buildable như một template project

5. **TODO (xử lý sau):** Check khi node tự nhảy lên Leader — khi đó node đang ở partition tách riêng (BR vẫn Leader ở partition kia), nên BR **không gửi được** `/network/stop` sang. Cần xử lý khác: phát hiện role = Leader khi prefer_not_leader bật → trigger re-join / chờ partition merge / recovery, sẽ làm sau.

## Nguồn tham khảo cho migration

- `Documents/iot-entity-model/entity_model_specification.md` v1.3.0 — định nghĩa đầy đủ attribute set cho từng entity type
- `Documents/coap/border_router_coap_server.md` — format CoAP request/response expected bởi Border Router
- `components/entity/model/entity_model.h` — public API cho entity CRUD operations
