# Thread-Node — Progress

## Tổng quan trạng thái

**Giai đoạn**: Infrastructure hoàn chỉnh, đang hoàn thiện Entity Control layer

```
Infrastructure Layer     ████████████████████ 100%
Entity Model (data)      ████████████████░░░░  80%
CBOR Serialization       ████████████░░░░░░░░  60%
Entity Control (CoAP)    ████░░░░░░░░░░░░░░░░  20%
Examples                 ████████████░░░░░░░░  60%
```

## Đã hoàn chỉnh ✅

### Thread Infrastructure

| Component | File(s) | Mô tả |
|---|---|---|
| **Thread Joiner** | `thread_joiner.c/.h` | State machine hoàn chỉnh: existing dataset → reattach, no dataset → joiner start, retry logic (30s / 5s NotFound), factory reset |
| **Thread Endpoint** | `thread_endpoint.c/.h` | Bootstrap framework: NVS → LED → btn → OT → joiner → on_joined → registry |
| **Status LED** | `status_led.c/.h` | WS2812 via RMT. 6 trạng thái: Boot/NotJoined/Detached/Child/Router/Leader |
| **Boot Button** | `boot_btn.c/.h` | Long press detection, gọi factory reset |
| **CoAP Server Manager** | `thread_coap.c/.h` | Idempotent start, resource registration với lock, response helper |
| **Device Registry** | `device_registry.c/.h` | CoAP POST → `/device/register` tại Leader RLOC, retry mỗi 5s |
| **Network Stop** | `thread_network_stop.c/.h` | CoAP GET `/network/stop`, tạm dừng 120s nếu là Leader |
| **Custom OT Config** | `openthread_custom_config.h` | Child timeout 60s, supervision 30s/60s, leader weight |

### Entity Model (data structures)

| Component | File(s) | Mô tả |
|---|---|---|
| **Entity Model** | `entity_model.c/.h` | Type registry + entity CRUD (add, get, set, remove, describe, get_by_index) |
| **Device Model** | `device_model.c/.h` | Singleton device_model_t: device_info_t + entities + network info. Auto MAC-based ID |
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

### Examples

| Example | Trạng thái | Ghi chú |
|---|---|---|
| `examples/light_on_off/` | ✅ **Buildable và functional** | Thread join + LED + button + device registry + entity model. CoAP control không hoạt động (5.01) |

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

### Issue 1: entity_coap_server không functional

Tất cả CoAP control commands từ Border Router đều bị reject với `5.01 Not Implemented`. Đây là limitation lớn nhất của hiện tại.

### Issue 2: CMD_DATA forwarding chưa implement (phía Thread-Host)

Khi Thread-Node gửi CBOR lên `/device/register` tại Border Router, Border Router nhận được data nhưng **chưa forward** sang Dashboard via `CMD_DATA` frame. Đây là vấn đề phía `Thread-Host`, không phải Thread-Node.

**Trạng thái Thread-Host**: Đã nhận CBOR tại CoAP handler, queue và log, nhưng `CMD_DATA` send logic chưa được implement.

### Issue 3: Chỉ build từ examples/

Root `Thread-Node/` không buildable như một standalone project. Lập trình viên phải build từ `examples/light_on_off/` hoặc tự tạo project mới dùng components.

### Issue 4: entity_model_priv.h là internal

`entity_model_priv.h` expose internal types (`entity_entry_t`, `entity_type_registry_t`) — không nên include trực tiếp từ application code. Hiện không có enforcement, dễ bị misuse.

## Lịch sử phát triển

| Giai đoạn | Mô tả |
|---|---|
| v0.1 | Thread Joiner cơ bản, status LED, boot button |
| v0.2 | Device Registry (CoAP POST với CBOR) |
| v0.3 | Entity Model data structures (6 entity types) |
| v0.4 | CBOR serialization (light + sensor), device_model singleton |
| v0.5 | network/stop handler, /entities CoAP resource skeleton (stub) |
| v0.6 (hiện tại) | light_on_off example hoàn chỉnh, custom OT config |
| **v0.7 (tiếp theo)** | **entity_coap_server implementation** |
| v0.8 | CBOR cho switch/fan/climate/binary_sensor |
| v1.0 | main.c template, additional examples |
