# IoT Entity Model Specification

> **Version:** 1.3.0 | **Platform:** ESP-IDF + OpenThread

Định nghĩa **hybrid entity model** cho IoT devices chạy ESP-IDF + OpenThread. Kết hợp sự đơn giản của ESPHome với cấu trúc của Matter protocol.

**Design Principles:** Simple · Flexible · Standardized · Extensible · Lightweight

---

## 1. Architecture

- **Entity Base** — common attributes
- **Entity Types** — light, sensor, switch, fan, climate, binary_sensor
- **Entity Registry** — type registration and management
- **Entity Storage** — polymorphic array of entity structs
- **Device Model** — separate serialization layer referencing Entity Model (not duplicating)

---

## 2. Entity Base Model

### `entity_base_t` Structure

All entity types embed `entity_base_t` at the beginning:

| Field | Type | Description |
|-------|------|-------------|
| `entity_id[16]` | char[] | Unique ID within device (`[a-zA-Z0-9_]+`, max 15 chars) |
| `name[32]` | char[] | Human-readable display name (max 31 chars) |
| `type` | enum | Entity type (ENTITY_TYPE_LIGHT, …) |
| `device_class[16]` | char[] | Sub-type (e.g., "temperature", "dimmable") |
| `available` | bool | Online/offline status |
| `last_update` | uint32_t | Unix timestamp (seconds) |

### Entity Types Enum

`ENTITY_TYPE_LIGHT` · `ENTITY_TYPE_SWITCH` · `ENTITY_TYPE_FAN` · `ENTITY_TYPE_SENSOR` · `ENTITY_TYPE_CLIMATE` · `ENTITY_TYPE_BINARY_SENSOR`

---

## 3. Entity Types

### Light (`entity_light_t`)

**Modes:** `ON_OFF` · `DIMMABLE` · `RGB` · `RGBW` · `CCT`

| Field | Type | Range / Notes |
|-------|------|---------------|
| state | bool | on/off |
| brightness | uint8_t | 0–100% |
| color_temp | uint16_t | 2700–6500K |
| rgb[3] | uint8_t | 0–255 |
| mode | enum | ON_OFF / DIMMABLE / RGB / RGBW / CCT |
| min/max_brightness | uint8_t | capability |
| min/max_color_temp | uint16_t | capability |
| effect[16] | char[] | |
| transition_time | uint16_t | ms |

### Switch (`entity_switch_t`)

**Types:** `TOGGLE` · `PUSH` · `MULTI_GANG`

| Field | Type | Notes |
|-------|------|-------|
| state | bool | |
| pressed | bool | |
| gang_states[4] | bool | |
| gang_count | uint8_t | 1–4 |
| type | enum | TOGGLE / PUSH / MULTI_GANG |
| momentary | bool | |
| interlock | bool | |

### Fan (`entity_fan_t`)

**Modes:** `OFF` · `LOW` · `MEDIUM` · `HIGH` · `AUTO`

| Field | Type | Notes |
|-------|------|-------|
| state | bool | |
| speed | uint8_t | 0–100% |
| mode | enum | |
| oscillation | bool | |
| direction | uint16_t | 0–360° |
| speed_levels | uint8_t | capability |
| timer_remaining | uint16_t | minutes |

### Sensor (`entity_sensor_t`)

**Classes:** TEMPERATURE · HUMIDITY · PRESSURE · CO2 · PM2.5 · PM10 · TVOC · ILLUMINANCE · BATTERY · POWER · ENERGY

| Field | Type | Notes |
|-------|------|-------|
| value | float | current reading |
| unit[8] | char[] | °C, %, ppm, … |
| sensor_class | enum | |
| min/max/avg_value | float | |
| accuracy | float | |
| update_interval | uint16_t | min 1 second |

### Climate (`entity_climate_t`)

**Modes:** `OFF` · `AUTO` · `COOL` · `HEAT` · `DRY` · `FAN_ONLY`  
**Fan Speed:** `AUTO` · `LOW` · `MEDIUM` · `HIGH`

| Field | Type | Notes |
|-------|------|-------|
| mode | enum | |
| current_temp | float | |
| target_temp | float | within min/max_temp |
| current_humidity | uint8_t | |
| fan_speed | enum | |
| swing | bool | |
| eco_mode / turbo_mode | bool | |
| min/max_temp | float | typical 16–30°C |

### Binary Sensor (`entity_binary_sensor_t`)

**Classes:** MOTION · DOOR · WINDOW · SMOKE · GAS · OCCUPANCY · TAMPER · WATER_LEAK

| Field | Type | Notes |
|-------|------|-------|
| state | bool | 0=clear, 1=detected |
| sensor_class | enum | |
| last_triggered | uint32_t | unix timestamp |
| trigger_count | uint32_t | |
| debounce_time | uint16_t | ms |

---

## 4. Entity Model API

### Core Functions

```c
entity_model_init();                            // Initialize
entity_register_type(type_id, type_enum);       // Register type
entity_add(entity_struct, type_enum);           // Add entity (struct pointer)
entity_get_struct(entity_id, type_out);         // Get struct pointer by ID
entity_get_count();                             // Total entity count
entity_get_by_index(index, type_out);           // Get by index
entity_remove(entity_id);                       // Remove
```

### Event System (Pointer-Based, ESP-IDF style)

```c
entity_subscribe(entity_struct, callback, ctx); // Subscribe by pointer
entity_subscribe_global(callback, ctx);          // Subscribe to all entities
entity_unsubscribe(callback);                    // Unsubscribe
entity_emit_event(entity_struct, event_type, attr_name, old_value, new_value);
```

**Event types:** `STATE_CHANGED` · `ATTRIBUTE_CHANGED` · `AVAILABLE_CHANGED` · `ADDED` · `REMOVED`

### Storage Limits

- `MAX_ENTITIES` = 8 (Kconfig)
- `MAX_EVENT_CALLBACKS` = 8 (Kconfig)

---

## 5. Validation Rules

| Field | Rule |
|-------|------|
| `entity_id` | Required, max 15 chars, `[a-zA-Z0-9_]+`, unique within device |
| `name` | Required, max 31 chars |
| Light brightness | 0–100 |
| Light color_temp | 2700–6500K |
| Fan speed | 0–100 |
| Climate temp | Within min_temp/max_temp |
| Sensor update_interval | ≥ 1 second |

### Error Codes

| Code | Value | Description |
|------|-------|-------------|
| `ENTITY_OK` | 0 | Success |
| `ENTITY_ERROR_INVALID_PARAM` | -1 | Invalid parameter |
| `ENTITY_ERROR_NOT_FOUND` | -2 | Entity not found |
| `ENTITY_ERROR_BUFFER_TOO_SMALL` | -3 | Buffer too small |
| `ENTITY_ERROR_TYPE_MISMATCH` | -4 | Type mismatch |
| `ENTITY_ERROR_READ_ONLY` | -5 | Read-only attribute |
| `ENTITY_ERROR_WRITE_FAILED` | -6 | Write failed |
| `ENTITY_ERROR_OUT_OF_MEMORY` | -7 | OOM |
| `ENTITY_ERROR_VALIDATION_FAILED` | -8 | Validation failed |

| Validation Code | Value |
|-----------------|-------|
| `VALIDATION_OK` | 0 |
| `VALIDATION_ERROR_INVALID_ID` | -1 |
| `VALIDATION_ERROR_INVALID_RANGE` | -2 |
| `VALIDATION_ERROR_MISSING_FIELD` | -3 |
| `VALIDATION_ERROR_DUPLICATE_ID` | -4 |
| `VALIDATION_ERROR_BUFFER_TOO_SMALL` | -5 |

---

## 6. Memory Management

**Stack Allocation (Recommended):** Pre-allocate entity structs on stack, init fields, call `entity_add()`. No heap fragmentation, predictable usage.

**Heap Allocation:** `malloc()` entities dynamically. Must free manually. Risk of fragmentation on embedded (~200–520KB RAM on ESP32).

---

## 7. Device Model

### Relationship (Reference-Based)

- **Entity Model** = single source of truth for entities. Runs independently (singleton per node).
- **Device Model** = device metadata + network info + **pointers** to Entity Model entities. No duplicate storage.

### Device Model Contents

**Device info:**
- Strings: `device_id`, `device_name`, `manufacturer`, `model`
- Numbers: `device_type` (uint16, Zigbee-style e.g. `0x0100`), `sw_version` (uint32: `major<<16|minor<<8|patch`), `hw_version` (uint32), `mac_address` (uint64)
- Macro: `DEVICE_VERSION(maj, min, patch)`

**Network info:** `rloc16`, `ipv6_addr`, `role`

**Entities:** Pointers to entity structs (not copies)

---

## 8. Backend Payload (CBOR)

Node gửi CBOR với integer keys tới Backend. Spec đầy đủ (keys, flow, DB schema): **[../coap/device_payload_spec.md](../coap/device_payload_spec.md)**.

---

## 9. Migration Guide: Struct-Based Entity Model

### Before vs After

| | Before (Callback-Based) | After (Struct-Based + Event-driven) |
|---|---|---|
| Storage | `void*` generic với callbacks | Typed entity structs (`entity_light_t`, …) |
| Type safety | Runtime checks | Compile-time struct type checking |
| Event subscription | ID-based string | **Pointer-based** (ESP-IDF style) |
| Access | Via get/set callbacks | **Direct struct access** |

### New Flow

1. **Driver:** Create wrapper struct → fill entity struct → `entity_add()` → `entity_subscribe()` by pointer → init hardware.
2. **Entity Model Core:** Store `void* → entity_light_t*`, manage event array with NULL slots.
3. **API Layer:** Parse `entity_id` from URI → `entity_get_struct()` → cast + read/write → `entity_emit_event()`.
4. **Driver callback:** Update hardware (GPIO, etc.) on event.

### API Breaking Changes

| Function | Before | After |
|----------|--------|-------|
| `entity_register_type()` | `(type_id, get_cb, set_cb)` | `(type_id, type_enum)` |
| `entity_add()` | `(entity_id, type_id, name, instance_data)` | `(entity_struct, type_enum)` |
| `entity_get/set()` | Called callbacks | Read/write structs directly |

### Migration Status

**Phase 1 — Core:**
- [x] Update `entity_model_priv.h`
- [x] Update `entity_model.c`
- [x] Add `entity_get_struct()` helper
- [ ] Implement pointer-based event system
- [ ] Implement callback management array

**Phase 2 — Drivers:**
- [x] Refactor driver wrapper struct
- [x] Update driver `entity_add()` call
- [ ] Implement auto-subscribe (pointer-based)
- [ ] Implement `entity_id` auto-generation

**Phase 3 — Components:**
- [ ] Update API layer (direct struct access + emit events)
- [ ] Update serialization (from structs)
- [ ] Update device registry

**Phase 4 — Device Model:**
- [ ] Implement Device Model Manager
- [ ] Reference-based entity pointers
- [ ] Full register + partial update payload

---

## 10. Tài liệu liên quan

| Tài liệu | Nội dung |
|----------|----------|
| [../coap/device_payload_spec.md](../coap/device_payload_spec.md) | CoAP endpoints, CBOR payload keys, DB schema |
