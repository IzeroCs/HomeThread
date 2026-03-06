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
| **Thread Endpoint** | `thread_endpoint.c/.h` | Bootstrap framework: NVS → LED → btn → OT → joiner → on_joined; **enable_device_registry**: khi true chỉ gọi device_registry_init(); app gọi device_registry_register(endpoint) khi đã discovery backend (và khi endpoint đổi). Không registry task, không Leader. |
| **Status LED** | `status_led.c/.h` | WS2812 via RMT. 6 trạng thái: Boot/NotJoined/Detached/Child/Router/Leader |
| **Boot Button** | `boot_btn.c/.h` | Long press detection, gọi factory reset |
| **CoAP Server Manager** | `thread_coap.c/.h` | Idempotent start, resource registration với lock, response helper |
| **Device Registry** | `device_registry.c/.h` | CoAP POST → `/device/register` tại **Backend** (endpoint từ backend_discovery); gọi device_registry_register() sau khi discovery và khi endpoint đổi; mọi role Child/Router/Leader đều gửi được; chờ ACK (20s); one-shot sau ACK; retry 2s khi NACK/timeout; `device_registry_is_registered()` |
| **Custom OT Config** | `openthread_custom_config.h` | Child timeout 60s, supervision 30s/60s, leader weight, CoAP API. **Không** define OPENTHREAD_CONFIG_DNS_CLIENT_ENABLE (ESP-IDF 5.5.3 dùng CONFIG_OPENTHREAD_DNS_CLIENT từ sdkconfig trong openthread-core-esp32x-ftd-config.h). |
| **Backend Discovery** | `backend_discovery.c/.h` | SRP/DNS-SD browse `_dashboard._udp.default.svc.arpa`; mHostNameBuffer API; cache NVS + **cache_ttl_sec**; static fallback. Log: một dòng thân thiện khi NOT_FOUND (vd. "Backend not available yet (will retry in 60s)"); chi tiết (DNS timeout, SRP failed) ở LOGD. Example: task 60s gọi get_endpoint(..., false), cập nhật s_backend_ep khi endpoint đổi → trigger_register(). |

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
| Đích: Backend (từ discovery) | ✅ App gọi device_registry_register(endpoint) với endpoint từ backend_discovery_get_endpoint(); trigger khi discovery thành công và khi endpoint đổi |
| Mọi role đều gửi được | ✅ Child, Router, Leader đều có thể gửi đăng ký tới backend |
| Chờ ACK/NACK (callback) | ✅ on_registry_response + timeout 20s |
| Retry khi NACK/timeout | ✅ Delay 2s rồi gửi lại |

### Tài liệu

| Tài liệu | Trạng thái |
|---|---|
| ACK/NACK bắt buộc (Leader) | ✅ Mục trong `docs/coap/border_router_coap_server.md`; `docs/README.md` cập nhật |

### Examples

| Example | Trạng thái | Ghi chú |
|---|---|---|
| `examples/light_on_off/` | ✅ **Buildable và functional** | Thread join + LED + button + entity model + backend discovery SRP/DNS-SD. **Device registry bật**; trigger_register khi discovery và khi endpoint đổi. CoAP control không hoạt động (5.01). Discovery trả NotFound cho đến khi BR register _dashboard._udp qua SRP. |

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

Trước đây gửi register mỗi 5s không chờ response → tích tụ request → NoBufs. Đã xử lý bằng **device register ACK flow**: gửi tới Backend (sau discovery); chỉ gửi khi Child/Router, chờ ACK (20s); one-shot sau ACK; Backend phải trả ACK/NACK (tài liệu trong `border_router_coap_server.md`).

**NoBufs → partition / "nhảy Leader":** Khi message buffer cạn (nhiều CoAP confirmable cùng lúc), MLE/keep-alive có thể mất → topology thay đổi, mạng dễ partition → node có thể tự trở thành Leader (ref: OpenThread issue #4508). ACK flow giảm số request đồng thời nên test ổn định lâu, không còn nhảy.

**TODO (xử lý sau):** Thêm check: nếu node tự dưng chuyển lên Leader (do NoBufs → partition, node nằm ở partition tách riêng). Phát hiện role = Leader khi `prefer_not_leader` bật rồi trigger re-join / chờ partition merge / hoặc recovery logic, sẽ làm sau.

### Issue 1: entity_coap_server không functional

Tất cả CoAP control commands từ Border Router đều bị reject với `5.01 Not Implemented`. Đây là limitation lớn nhất của hiện tại.

### Issue 2: CMD_DATA forwarding chưa implement (phía Thread-Host)

Thread-Node gửi `/device/register` **trực tiếp tới Backend** (không qua BR). Backend (Dashboard-Thread) nhận CoAP và xử lý; không còn CMD_DATA từ BR cho device register.

### Issue 2.1: Backend restart không trigger re-register (hiện tại)

Nếu Backend khởi động lại nhưng **IPv6/port không đổi**, `backend_disc_refresh` sẽ không gọi lại `trigger_register()` → Node **không tự gửi lại** `/device/register`. (TODO: periodic re-register hoặc backend-side notify)

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
| 0.5.0 | /entities CoAP resource skeleton (stub) |
| 0.6.0 | light_on_off example hoàn chỉnh, custom OT config |
| 0.7.0 | **Device register ACK flow** (chỉ Child/Router, chờ ACK, retry); **ACK/NACK docs**; Leader check trong device_registry |
| 0.8.0 | **Device info numeric** (device_type, sw_version, hw_version = number; Zigbee-style; giảm băng thông register) |
| 0.8.1 | **Register one-shot on ACK** (gửi 1 lần rồi dừng; gửi lại khi notify); **device_registry_is_registered()**; bỏ REGISTRY_PERIODIC_MS |
| 0.8.2 | enable_device_registry; backend_discovery mHostNameBuffer; light_on_off device registry tắt; docs backend_discovery_srp.md |
| **0.9.0 (hiện tại)** | **Register chỉ tới Backend** (sau discovery); re-register khi backend IPv6/port đổi; bỏ Leader path; API device_registry_register(endpoint), device_registry_endpoint_t; backend discovery log cleanup (một dòng thân thiện, chi tiết LOGD); CMake entity dirs (entity/model, entity/serialization, entity/coap_server); light_on_off: device registry bật, trigger_register |
| 1.0.0 (tiếp theo) | entity_coap_server implementation; CBOR switch/fan/climate/binary_sensor; main.c template; additional examples |
