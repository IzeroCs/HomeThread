# IoT Entity Model Specification

> **Version:** 1.3.0
> **Date:** February 18, 2026
> **Platform:** ESP-IDF + OpenThread
> **Last Updated:**
> - Migrated to struct-based approach with pointer-based event subscription (ESP-IDF style).
> - Device Model (reference-based) and backend payload format: register = full device model + entities; updates = partial with `device_id` + changed entities.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Entity Base Model](#entity-base-model)
4. [Entity Types](#entity-types)
5. [Entity Model API](#entity-model-api)
6. [Validation Rules](#validation-rules)
7. [Memory Management](#memory-management)
8. [Error Handling](#error-handling)
9. [Device Model and Entity Model](#device-model-and-entity-model)
10. [Backend Payloads (Register and Updates)](#backend-payloads-register-and-updates)
11. [Migration Guide: Struct-Based Entity Model](#migration-guide-struct-based-entity-model)

---

## Overview

Defines a **hybrid entity model** for IoT devices running on ESP-IDF with OpenThread. Combines the simplicity of ESPHome with the structure of Matter protocol.

**Design Principles:** Simple · Flexible · Standardized · Extensible · Lightweight

---

## Architecture

- **Entity Base** — common attributes
- **Entity Types** — light, sensor, switch, fan, climate, binary_sensor
- **Entity Registry** — type registration and management
- **Entity Storage** — polymorphic array of entity structs
- **Device Model** — separate serialization layer referencing Entity Model (not duplicating)

---

## Entity Base Model

### `entity_base_t` Structure

All entity types embed `entity_base_t` at the beginning:

| Field | Type | Description |
|-------|------|-------------|
| `entity_id[16]` | char[] | Unique ID within device (alphanumeric + underscore) |
| `name[32]` | char[] | Human-readable display name |
| `type` | enum | Entity type (ENTITY_TYPE_LIGHT, …) |
| `device_class[16]` | char[] | Sub-type (e.g., "temperature", "dimmable") |
| `available` | bool | Online/offline status |
| `last_update` | uint32_t | Unix timestamp (seconds) |

### Entity Types Enum

- `ENTITY_TYPE_LIGHT`
- `ENTITY_TYPE_SWITCH`
- `ENTITY_TYPE_FAN`
- `ENTITY_TYPE_SENSOR`
- `ENTITY_TYPE_CLIMATE`
- `ENTITY_TYPE_BINARY_SENSOR`

---

## Entity Types

### Light (`entity_light_t`)

**Modes:** `ON_OFF` · `DIMMABLE` · `RGB` · `RGBW` · `CCT`

**State fields:** `state` (bool), `brightness` (0–100%), `color_temp` (2700–6500K), `rgb[3]` (0–255)  
**Capability fields:** `mode`, `min/max_brightness`, `min/max_color_temp`, `effect[16]`, `transition_time`

---

### Switch (`entity_switch_t`)

**Types:** `TOGGLE` · `PUSH` · `MULTI_GANG`

**State fields:** `state` (bool), `pressed` (bool), `gang_states[4]`, `gang_count` (1–4)  
**Config:** `type`, `momentary`, `interlock`

---

### Fan (`entity_fan_t`)

**Modes:** `OFF` · `LOW` · `MEDIUM` · `HIGH` · `AUTO`

**State fields:** `state` (bool), `speed` (0–100%), `mode`, `oscillation` (bool), `direction` (0–360°)  
**Capabilities:** `speed_levels`, `supports_oscillation/direction/timer`, `timer_remaining` (minutes)

---

### Sensor (`entity_sensor_t`)

**Classes:** TEMPERATURE · HUMIDITY · PRESSURE · CO2 · PM2.5 · PM10 · TVOC · ILLUMINANCE · BATTERY · POWER · ENERGY

**Fields:** `value` (float), `unit[8]` (°C/%, …), `sensor_class`, `min/max/avg_value`, `accuracy`, `update_interval` (s)

---

### Climate (`entity_climate_t`)

**Modes:** `OFF` · `AUTO` · `COOL` · `HEAT` · `DRY` · `FAN_ONLY`  
**Fan Speed:** `AUTO` · `LOW` · `MEDIUM` · `HIGH`

**Fields:** `mode`, `current_temp`, `target_temp`, `current_humidity`, `fan_speed`, `swing`, `eco_mode`, `turbo_mode`  
**Capabilities:** `min/max_temp`, `supports_heat/cool/dry/swing`

---

### Binary Sensor (`entity_binary_sensor_t`)

**Classes:** MOTION · DOOR · WINDOW · SMOKE · GAS · OCCUPANCY · TAMPER · WATER_LEAK

**Fields:** `state` (bool), `sensor_class`, `last_triggered`, `trigger_count`, `debounce_time` (ms)

---

## Entity Model API

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

### Event System (Pointer-Based)

```c
entity_subscribe(entity_struct, callback, ctx); // Subscribe by pointer (ESP-IDF style)
entity_subscribe_global(callback, ctx);          // Subscribe to all entities
entity_unsubscribe(callback);                    // Unsubscribe
// Internal:
entity_emit_event(entity_struct, event_type, attr_name, old_value, new_value);
```

**Event types:** `STATE_CHANGED` · `ATTRIBUTE_CHANGED` · `AVAILABLE_CHANGED` · `ADDED` · `REMOVED`

### Storage Limits

- `MAX_ENTITIES` = 8 (configurable via Kconfig)
- `MAX_EVENT_CALLBACKS` = 8 (configurable via Kconfig)

---

## Validation Rules

| Field | Rule |
|-------|------|
| `entity_id` | Required, max 15 chars, `[a-zA-Z0-9_]+`, unique within device |
| `name` | Required, max 31 chars |
| `type` | Required, valid enum value |
| Light brightness | 0–100 |
| Light color_temp | 2700–6500K |
| Fan speed | 0–100 |
| Climate temp | Within min_temp/max_temp (typical 16–30°C) |
| Sensor update_interval | Min 1 second |

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

| Validation Code | Value | Description |
|-----------------|-------|-------------|
| `VALIDATION_OK` | 0 | Success |
| `VALIDATION_ERROR_INVALID_ID` | -1 | Invalid entity_id format |
| `VALIDATION_ERROR_INVALID_RANGE` | -2 | Out of range |
| `VALIDATION_ERROR_MISSING_FIELD` | -3 | Required field missing |
| `VALIDATION_ERROR_DUPLICATE_ID` | -4 | Duplicate entity_id |
| `VALIDATION_ERROR_BUFFER_TOO_SMALL` | -5 | Buffer too small |

---

## Memory Management

**Stack Allocation (Recommended):** Pre-allocate entity structs on stack, init fields, then call `entity_add()`. No heap fragmentation, predictable memory usage.

**Heap Allocation:** `malloc()` entities dynamically. Must free manually. Risk of fragmentation on embedded.

**Constraints:** ESP32 ~200–520KB RAM. Use fixed-size buffers for serialization.

---

## Error Handling

All functions return 0 on success, negative on error. Use ESP-IDF logging (`ESP_LOGE`, `ESP_LOGW`, …) for diagnostics.

**Patterns:** Validate input early → check buffer sizes → handle entity count overflow → validate value ranges.

---

## Device Model and Entity Model

### Relationship (Reference-Based)

- **Entity Model** = single source of truth for entities. Runs independently.
- **Device Model** = device-level metadata + network info + **references (pointers)** to Entity Model entities. No duplicate storage.
- **One device per node:** Entity Model singleton holds all entities for the local device.

### Device Model Contents

- **Device info:**  
  - **Strings** (for display / identification): `device_id`, `device_name`, `manufacturer`, `model`  
  - **Numbers** (Zigbee-style, save bandwidth when sending repeatedly): `device_type` (uint16), `sw_version` (uint32), `hw_version` (uint32), `mac_address` (uint64)  
  - `device_type`: Zigbee-style ID (e.g. `0x0100` = On/Off Light). See `device_model.h` for `DEVICE_TYPE_*`.  
  - Versions: `major << 16 | minor << 8 | patch` (e.g. 1.2.3 = `0x00010203`), macro `DEVICE_VERSION(maj, min, patch)`.
- **Network info:** `rloc16`, `ipv6_addr`, `role`
- **Entities:** Pointers to entity structs (not copies)

---

## Backend Payloads (Register and Updates)

### 1. Register (full payload)

Send full device model + all entities on first registration or re-register.

```json
{
  "device_id": "living-room-001",
  "device_name": "Living Room Hub",
  "network": { "rloc16": "0x7c01", "ipv6_addr": "...", "role": "child" },
  "entities": [
    { "entity_id": "light.0", "name": "Ceiling Light", "type": "light", ... },
    { "entity_id": "temp_sensor", "name": "Temperature", "type": "sensor", ... }
  ]
}
```

### 2. Updates (partial)

Send `device_id` + only changed entity/attribute data.

```json
{
  "device_id": "living-room-001",
  "updates": [
    { "entity_id": "light.0", "attr": "state", "value": "on" },
    { "entity_id": "light.0", "attr": "brightness", "value": 80 }
  ]
}
```

**Why `device_id` in updates:** `entity_id` is unique only within a device (e.g., two devices can both have `light.0`).

---

## Migration Guide: Struct-Based Entity Model

### Overview

| | Before (Callback-Based) | After (Struct-Based + Event-driven) |
|---|---|---|
| Storage | `void*` generic with callbacks | Typed entity structs (`entity_light_t`, …) |
| Type safety | Runtime checks | Compile-time struct type checking |
| Event subscription | ID-based string | **Pointer-based** (ESP-IDF style) |
| Access | Via get/set callbacks | **Direct struct access** |

### Key Design Decisions

1. ✅ **Pointer-based subscription:** `entity_subscribe(light, callback, ctx)` — uses pointer, not string
2. ✅ **Direct struct access:** API layer casts and writes directly: `light->state = true`
3. ✅ **Event system:** Array with NULL slots (`MAX_EVENT_CALLBACKS = 8`)
4. ✅ **Hybrid entity_id:** Auto-generate from name+type or user-provided
5. ✅ **Match by pointer:** O(1) vs O(n) string comparison

### New Flow

1. **Driver:** Create wrapper struct → fill entity struct → `entity_add()` → `entity_subscribe()` by pointer → init hardware
2. **Entity Model Core:** Store `void* → entity_light_t*`, manage event array with NULL slots
3. **API Layer:** Parse `entity_id` from URI → `entity_get_struct()` → cast + read/write → `entity_emit_event()`
4. **Driver callback:** Update hardware (GPIO, etc.) on event

### API Breaking Changes

| Function | Before | After |
|----------|--------|-------|
| `entity_register_type()` | `(type_id, get_cb, set_cb)` | `(type_id, type_enum)` |
| `entity_add()` | `(entity_id, type_id, name, instance_data)` | `(entity_struct, type_enum)` |
| `entity_get/set()` | Called callbacks | Read/write structs directly |

### Migration Checklist

**Phase 1 — Core:**
- [x] Update `entity_model_priv.h` ✅
- [x] Update `entity_model.c` ✅
- [x] Add `entity_get_struct()` helper ✅
- [ ] Implement pointer-based event system
- [ ] Implement callback management array

**Phase 2 — Drivers:**
- [x] Refactor driver wrapper struct ✅
- [x] Update driver `entity_add()` call ✅
- [ ] Implement auto-subscribe (pointer-based)
- [ ] Implement `entity_id` auto-generation

**Phase 3 — Components:**
- [ ] Update API layer (direct struct access + emit events)
- [ ] Update serialization (from structs)
- [ ] Update device registry

**Phase 4 — Device Model:**
- [ ] Implement Device Model Manager
- [ ] Reference-based entity pointers (no duplicate storage)
- [ ] Full register payload (device info + entity pointers)
- [ ] Partial update payload (device_id + changed entities)

---

## Tài liệu liên quan

- **[entity_model_schema.md](entity_model_schema.md)** — SQLite schema cho backend/border router.
- **[../coap/border_router_coap_server.md](../coap/border_router_coap_server.md)** — CoAP server đăng ký device.
