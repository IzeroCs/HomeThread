# Thread-Node — Progress

## Tổng quan trạng thái

**Giai đoạn**: Infrastructure + Device register ACK flow hoàn chỉnh, đang hoàn thiện Entity Control layer

```
Infrastructure Layer     ████████████████████ 100%
Entity Model (data)      ████████████████░░░░  80%
CBOR Serialization       ████████████░░░░░░░░  60%
Entity Control (CoAP)    ████░░░░░░░░░░░░░░░░  20%
Examples                 █████████████░░░░░░░  70%
```

## Đã hoàn chỉnh ✅

### Thread Infrastructure

| Component | File(s) | Mô tả |
|---|---|---|
| **Thread Joiner** | `thread_joiner.c/.h` | State machine hoàn chỉnh: existing dataset → reattach, no dataset → joiner start, retry logic (30s / 5s NotFound), factory reset |
| **Thread Endpoint** | `thread_endpoint.c/.h` | Bootstrap framework: NVS → LED → btn → OT → joiner → on_joined; **enable_device_registry** (bool) tắt/bật CoAP device register (registry task + device_registry_init) |
| **Status LED** | `status_led.c/.h` | WS2812 via RMT. 6 trạng thái: Boot/NotJoined/Detached/Child/Router/Leader |
| **Boot Button** | `boot_btn.c/.h` | Long press detection, gọi factory reset |
| **CoAP Server Manager** | `thread_coap.c/.h` | Idempotent start, resource registration với lock, response helper |
| **Device Registry** | `device_registry.c/.h` | CoAP POST → `/device/register` tại Leader RLOC; chỉ gửi khi Child/Router; chờ ACK (20s); **one-shot** (dừng sau ACK, gửi lại khi notify); retry 2s khi NACK/timeout; `device_registry_is_registered()`; từ chối khi role Leader |
| **Network Stop** | `thread_network_stop.c/.h` | CoAP GET `/network/stop`, tạm dừng 120s nếu là Leader |
| **Custom OT Config** | `openthread_custom_config.h` | Child timeout 60s, supervision 30s/60s, leader weight, CoAP API. **Không** define OPENTHREAD_CONFIG_DNS_CLIENT_ENABLE (ESP-IDF 5.5.3 dùng CONFIG_OPENTHREAD_DNS_CLIENT từ sdkconfig trong openthread-core-esp32x-ftd-config.h). |
| **Backend Discovery** | `backend_discovery.c/.h` | SRP/DNS-SD browse `_dashboard._udp.default.svc.arpa` (otDnsClientBrowse + GetServiceInfo/GetHostAddress); `otDnsServiceInfo` dùng mHostNameBuffer/mHostNameBufferSize (ESP-IDF 5.5.3); cache NVS + static fallback. Phụ thuộc BR đăng ký service qua SRP (lease/key-lease) thì discovery mới trả kết quả. |

### Entity Model (data structures)

| Component | File(s) | Mô tả |
|---|---|---|
| **Entity Model** | `entity_model.c/.h` | Type registry + entity CRUD (add, get, set, remove, describe, get_by_index) |
| **Device Model** | `device_model.c/.h` | Singleton device_model_t: device_info_t (strings: name, manufacturer, model; numbers: device_type uint16, sw_version/hw_version uint32) + entities + network info. Auto MAC-based ID; device_type → prefix cho device_id |
| **entity_light_t** | `entity_light.h` | state, brightness, color_temp, rgb[3], mode (ON_OFF/DIMMABLE/RGB/RGBW/CCT), effects |
| **entity_switch_t** | `entity_switch.h` | Struct định nghĩa (data) |
| **entity_fan_t** | `entity_fan.h` | Struct định nghĩa (data) |
| **entity_sensor_t** | `entity_sensor.h` | float value, unit, sensor_class, min/max/avg, accuracy, update_interval |
| **entity_climate_t** | `entity_climate.h` | Struct định nghĩa (data) |
| **entity_binary_sensor_t** | `entity_binary_sensor.h` | Struct định nghĩa (data) |

### CBOR Serialization (partial)

| Entity type | Trạng thái |
|---|---|
| `entity_light_t` | ✅ **Hoàn chỉnh** |
| `entity_sensor_t` | ✅ **Hoàn chỉnh** |
| `entity_switch_t` | ❌ Chưa có |
| `entity_fan_t` | ❌ Chưa có |
| `entity_climate_t` | ❌ Chưa có |
| `entity_binary_sensor_t` | ❌ Chưa có |

### Device register ACK flow

| Mục | Trạng thái |
|---|---|
| Chỉ gửi khi Child/Router | ✅ Implement trong `registry_task` và `device_registry_register()` |
| Chờ ACK/NACK (callback) | ✅ `on_registry_response` + task notify; timeout 20s |
| Retry khi NACK/timeout | ✅ Delay 2s rồi gửi lại |
| Leader không gửi | ✅ `device_registry_register()` return `ESP_ERR_INVALID_STATE` khi role Leader |

### Tài liệu

| Tài liệu | Trạng thái |
|---|---|
| ACK/NACK bắt buộc (Leader) | ✅ Mục trong `docs/coap/border_router_coap_server.md`; `docs/README.md` cập nhật |

### Examples

| Example | Trạng thái | Ghi chú |
|---|---|---|
| `examples/light_on_off/` | ✅ **Buildable và functional** | Thread join + LED + button + entity model + backend discovery SRP/DNS-SD. **Device registry tắt** (enable_device_registry=false). CoAP control không hoạt động (5.01). Discovery trả NotFound cho đến khi BR register _dashboard._udp qua SRP. |

## Còn lại ❌

### 1. Entity CoAP Server (ưu tiên cao)

**File**: `components/entity/coap_server/entity_coap_server.c`

Tất cả handlers đang return `5.01 Not Implemented`:

```
GET  /entities              → Liệt kê tất cả entities (stub)
GET  /entities/{id}         → Mô tả entity theo ID (stub)
PUT  /entities/{id}/{attr}  → Set attribute của entity (stub)
POST /entities/{id}/{attr}  → Set attribute của entity (stub)
```

**Impact**: Thiết bị không thể nhận lệnh điều khiển từ Border Router / Dashboard.

### 2. CBOR serialization cho 4 entity type còn thiếu

**File**: `components/entity/serialization/entity_serialization.c`

Cần implement encoder cho:
- `entity_switch_t` (on/off state, lock)
- `entity_fan_t` (speed_pct, oscillating, preset_mode)
- `entity_climate_t` (current_temp, target_temp, hvac_mode, humidity)
- `entity_binary_sensor_t` (is_on, sensor_class)

**Impact**: Các entity type này không được gửi trong device registration payload.

### 3. main/main.c

**File**: `main/main.c`

Hiện là stub — root project không buildable. Cần quyết định approach:
- Template app tối thiểu
- Hoặc giữ nguyên stub, dùng examples là entry point chính

### 4. Examples bổ sung

Chỉ có `light_on_off`. Thiếu:
- `examples/sensor/` — temperature/humidity sensor example
- `examples/switch/` — relay switch example

## Known Issues / Constraints

### Issue 0: NoBufs (đã giảm thiểu)

Trước đây gửi register mỗi 5s không chờ response → tích tụ request → NoBufs. Đã xử lý bằng **device register ACK flow**: chỉ gửi khi Child/Router, chờ ACK (20s); **one-shot** (gửi 1 lần khi ACK, dừng cho đến khi notify); Leader phải trả ACK/NACK (tài liệu trong `border_router_coap_server.md`).

**NoBufs → partition / "nhảy Leader":** Khi message buffer cạn (nhiều CoAP confirmable cùng lúc), MLE/keep-alive có thể mất → topology thay đổi, mạng dễ partition → node có thể tự trở thành Leader (ref: OpenThread issue #4508). ACK flow giảm số request đồng thời nên test ổn định lâu, không còn nhảy.

**TODO (xử lý sau):** Thêm check: nếu node tự dưng chuyển lên Leader (do NoBufs → partition, node nằm ở partition tách riêng nên thành Leader của partition đó). Lúc này BR vẫn là Leader ở partition kia, nên BR **không thể** gửi `/network/stop` sang (không cùng partition). Cần xử lý khác — vd. phát hiện role = Leader khi `prefer_not_leader` bật rồi trigger re-join / chờ partition merge / hoặc recovery logic, sẽ làm sau.

### Issue 1: entity_coap_server không functional

Tất cả CoAP control commands từ Border Router đều bị reject với `5.01 Not Implemented`. Đây là limitation lớn nhất của hiện tại.

### Issue 2: CMD_DATA forwarding chưa implement (phía Thread-Host)

Khi Thread-Node gửi CBOR lên `/device/register` tại Border Router, Border Router nhận được data nhưng **chưa forward** sang Dashboard via `CMD_DATA` frame. Đây là vấn đề phía `Thread-Host`, không phải Thread-Node.

**Trạng thái Thread-Host**: Đã nhận CBOR tại CoAP handler, queue và log, nhưng `CMD_DATA` send logic chưa được implement.

### Issue 3: Chỉ build từ examples/

Root `Thread-Node/` không buildable như một standalone project. Lập trình viên phải build từ `examples/light_on_off/` hoặc tự tạo project mới dùng components.

### Issue 4: entity_model_priv.h là internal

`entity_model_priv.h` expose internal types (`entity_entry_t`, `entity_type_registry_t`) — không nên include trực tiếp từ application code. Hiện không có enforcement, dễ bị misuse.

### Issue 5: Backend discovery (SRP) trả NotFound cho đến khi BR đăng ký service

Discovery browse `_dashboard._udp.default.svc.arpa` qua OpenThread DNS client; query đi qua Thread mesh tới BR. Node nhận NotFound/Timeout khi:
- BR chưa đăng ký service `_dashboard._udp` qua SRP client (otSrpClient*), hoặc
- SRP server trên BR từ chối (vd. lease/key-lease không đúng, ProcessAdditionalSection/SIG(0)).

OpenThread core **không** forward `*.default.svc.arpa` ra upstream (dnssd_server.cpp ShouldForwardToUpstream). Sửa phía BR: đảm bảo SRP client gửi lease/key-lease đúng (otSrpClientSetLeaseInterval, SetKeyLeaseInterval; key lease ≥ lease), và SRP server chấp nhận đăng ký. Xem `docs/coap/backend_discovery_srp.md`.

## Lịch sử phát triển

| Giai đoạn | Mô tả |
|---|---|
| 0.1.0 | Thread Joiner cơ bản, status LED, boot button |
| 0.2.0 | Device Registry (CoAP POST với CBOR) |
| 0.3.0 | Entity Model data structures (6 entity types) |
| 0.4.0 | CBOR serialization (light + sensor), device_model singleton |
| 0.5.0 | network/stop handler, /entities CoAP resource skeleton (stub) |
| 0.6.0 | light_on_off example hoàn chỉnh, custom OT config |
| 0.7.0 | **Device register ACK flow** (chỉ Child/Router, chờ ACK, retry); **ACK/NACK docs**; Leader check trong device_registry |
| 0.8.0 | **Device info numeric** (device_type, sw_version, hw_version = number; Zigbee-style; giảm băng thông register) |
| 0.8.1 | **Register one-shot on ACK** (gửi 1 lần rồi dừng; gửi lại khi notify); **device_registry_is_registered()**; bỏ REGISTRY_PERIODIC_MS |
| 0.8.2 (hiện tại) | **enable_device_registry** (tùy chọn tắt CoAP device register); **backend_discovery** otDnsServiceInfo mHostNameBuffer (ESP-IDF 5.5.3); bỏ OPENTHREAD_CONFIG_DNS_CLIENT_ENABLE khỏi openthread_custom_config.h; light_on_off: device registry tắt; docs backend_discovery_srp.md |
| **0.9.0 (tiếp theo)** | **entity_coap_server implementation** |
| 1.0.0 | CBOR cho switch/fan/climate/binary_sensor; main.c template; additional examples |
