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
| **Thread Node** | `thread_node.c/.h` | Bootstrap: NVS → LED → btn → OT → joiner; khi enable_device_registry: device_registry_init(), thread_discovery_init(), tasks (discovery: **10s** khi chưa có backend, **60s** khi đã có; ping 10s). Log node Mesh-Local EID + RLOC16 trong on_joined_wrapper. App chỉ on_joined (entities + entity_coap_server). |
| **Status LED** | `status_led.c/.h` | WS2812 via RMT. 6 trạng thái: Boot/NotJoined/Detached/Child/Router/Leader |
| **Boot Button** | `boot_btn.c/.h` | Long press detection, gọi factory reset |
| **CoAP Server Manager** | `thread_coap.c/.h` | Idempotent start, resource registration với lock, response helper |
| **Device** (device/) | `device_registry.c/.h`, `device_coap.c/.h` | **device_registry**: build payload (device_model, entity_serialization), API register/ping/is_registered. **device_coap**: CoAP transport (POST /device/register, GET /device/ping, token 2B, timestamp → callback re-register). thread_node gọi register/ping khi discovery/ping task. |
| **Custom OT Config** | `openthread_custom_config.h` | Child timeout 60s, supervision 30s/60s, leader weight, CoAP API. **Không** define OPENTHREAD_CONFIG_DNS_CLIENT_ENABLE (ESP-IDF 5.5.3 dùng CONFIG_OPENTHREAD_DNS_CLIENT từ sdkconfig trong openthread-core-esp32x-ftd-config.h). |
| **Thread Discovery** | `thread_discovery.c/.h` | SRP/DNS-SD `_dashboard._udp`; cache NVS + cache_ttl_sec; static fallback. **Log backend IP**: chỉ thread_node log INFO ("Backend discovered" / "Backend endpoint updated") khi có IP lần đầu hoặc khi IP đổi; thread_discovery log cache/static/SRP ở LOGD. |

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
| Đích: Backend (từ discovery) | ✅ thread_node gọi device_registry_register(endpoint) với endpoint từ thread_discovery_get_endpoint(); trigger khi discovery thành công, endpoint đổi, hoặc ping timestamp đổi |
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
| `examples/light_on_off/` | ✅ **Buildable và functional** | Thread join + LED + button + entity model. **thread_node** chạy discovery (retry 10s khi chưa có backend, 60s khi có), ping 10s; register khi có/đổi endpoint hoặc ping timestamp đổi. Log backend IP 1 lần / khi đổi; log node Mesh-Local EID + RLOC16 khi join xong. **CONFIG_ESP_SYSTEM_EVENT_TASK_STACK_SIZE=4096** (tránh sys_evt stack overflow). CoAP control 5.01 (stub). |

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

### Issue 2.1: Backend restart → re-register (đã xử lý)

GET `/device/ping` mỗi 10s; backend reply 4-byte timestamp (LE). Nếu timestamp khác lần trước → callback → `trigger_register()`. Backend restart (timestamp đổi) sẽ trigger re-register mà không cần đổi IPv6/port.

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
| **0.9.0** | Register chỉ tới Backend; thread_discovery; device registry bật trong thread_node; trigger_register khi discovery/endpoint đổi |
| **0.9.1** | thread_node; thread_discovery; device/ + device_coap; GET /device/ping 10s, timestamp → re-register; CoAP token 2B; backend IP log 1 lần / khi đổi |
| **0.9.2 (hiện tại)** | Discovery retry **10s** khi chưa có backend (60s khi đã có); **CONFIG_ESP_SYSTEM_EVENT_TASK_STACK_SIZE=4096** (light_on_off, tránh sys_evt stack fault); log node **Mesh-Local EID + RLOC16** trong on_joined_wrapper; docs: backend echo token, register callback NULL, ping callback khi timestamp đổi |
| 1.0.0 (tiếp theo) | entity_coap_server implementation; CBOR switch/fan/climate/binary_sensor; main.c template; additional examples |
