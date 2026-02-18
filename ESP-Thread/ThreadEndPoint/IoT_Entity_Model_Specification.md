# IoT Entity Model Specification

> **Version:** 1.3.0  
> **Date:** February 18, 2026  
> **Platform:** ESP-IDF + OpenThread  
> **Last Updated:** 
> - Migrated to struct-based approach with pointer-based event subscription (ESP-IDF style). See [Migration Guide](#migration-guide-struct-based-entity-model) section for details.
> - Device Model (reference-based) and backend payload format: register = full device model + entities; updates = partial with `device_id` + changed entities. See [Device Model and Entity Model](#device-model-and-entity-model) and [Backend Payloads](#backend-payloads-register-and-updates).

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Entity Base Model](#entity-base-model)
4. [Entity Types](#entity-types)
   - [Light](#light)
   - [Switch](#switch)
   - [Fan](#fan)
   - [Sensor](#sensor)
   - [Climate (Air Conditioner)](#climate-air-conditioner)
   - [Binary Sensor](#binary-sensor)
5. [Entity Model API](#entity-model-api)
6. [Validation Rules](#validation-rules)
7. [Memory Management](#memory-management)
8. [Error Handling](#error-handling)
9. [Model Structure Details](#model-structure-details)
10. [Device Model and Entity Model](#device-model-and-entity-model)
11. [Backend Payloads (Register and Updates)](#backend-payloads-register-and-updates)
12. [Migration Guide: Struct-Based Entity Model](#migration-guide-struct-based-entity-model)

---

## Overview

This specification defines a **hybrid entity model** for IoT devices running on ESP-IDF with OpenThread networking. The model combines the simplicity of ESPHome with the structure of Matter protocol.

### Design Principles

- **Simple**: Easy to understand and implement
- **Flexible**: Devices can have multiple entity types
- **Standardized**: Each entity type has a clear structure
- **Extensible**: Easy to add new entity types
- **Lightweight**: Suitable for embedded systems

---

## Architecture

Entity Model consists of:
- Entity Base (common attributes)
- Entity Types (light, sensor, switch, fan, climate, binary_sensor)
- Entity Registry (type registration and management)
- Entity Storage (polymorphic array of entity structs)

Device Model is a separate layer used for serialization and backend communication. It references the Entity Model (see [Device Model and Entity Model](#device-model-and-entity-model)).

---

## Entity Base Model

Common attributes shared by all entity types.

### Entity Types Enum

- `ENTITY_TYPE_LIGHT` - Light control entity
- `ENTITY_TYPE_SWITCH` - Switch/button entity
- `ENTITY_TYPE_FAN` - Fan control entity
- `ENTITY_TYPE_SENSOR` - Sensor entity
- `ENTITY_TYPE_CLIMATE` - Climate control entity (air conditioner/heater)
- `ENTITY_TYPE_BINARY_SENSOR` - Binary sensor entity

### Base Structure

All entity types inherit from `entity_base_t` which contains:
- `entity_id[16]` - Unique ID within device (alphanumeric + underscore)
- `name[32]` - Human-readable name
- `type` - Entity type enum
- `device_class[16]` - Sub-type (e.g., "temperature", "motion", "dimmable")
- `available` - Online/offline status (bool)
- `last_update` - Last update timestamp (Unix time, seconds since epoch)

---

## Entity Types

### Light

Light control entity with support for on/off, dimming, and color control.

#### Light Modes

- `LIGHT_MODE_ON_OFF` - Simple on/off only
- `LIGHT_MODE_DIMMABLE` - Brightness control
- `LIGHT_MODE_RGB` - RGB color
- `LIGHT_MODE_RGBW` - RGB + White
- `LIGHT_MODE_CCT` - Color temperature (warm/cool white)

#### Structure

The `entity_light_t` structure contains:
- Base fields (inherited from `entity_base_t`)
- State: `state` (bool), `brightness` (uint8_t, 0-100%), `color_temp` (uint16_t, 2700-6500K), `rgb[3]` (uint8_t, 0-255)
- Capabilities: `mode` (light_mode_t), `min_brightness`, `max_brightness`, `min_color_temp`, `max_color_temp`
- Effects: `effect[16]`, `transition_time` (uint8_t, seconds)

#### Control Commands

- Turn on with brightness: Set `state` to true and `brightness` to desired value (0-100)
- Set RGB color: Set `state` to true and `rgb` array to [R, G, B] values (0-255 each)
- Set color temperature: Set `state` to true and `color_temp` to desired value (2700-6500K)

---

### Switch

Physical switch or button control entity.

#### Switch Types

- `SWITCH_TYPE_TOGGLE` - Toggle on/off switch
- `SWITCH_TYPE_PUSH` - Momentary push button
- `SWITCH_TYPE_MULTI_GANG` - Multi-gang switch (2-gang, 3-gang, etc.)

#### Structure

The `entity_switch_t` structure contains:
- Base fields (inherited from `entity_base_t`)
- State: `state` (bool, for toggle), `pressed` (bool, for push button), `gang_states[4]` (uint8_t), `gang_count` (uint8_t, 1-4)
- Config: `type` (switch_type_t), `momentary` (bool), `interlock` (bool)

---

### Fan

Fan control entity with speed and oscillation control.

#### Fan Modes

- `FAN_MODE_OFF` - Off
- `FAN_MODE_LOW` - Low speed
- `FAN_MODE_MEDIUM` - Medium speed
- `FAN_MODE_HIGH` - High speed
- `FAN_MODE_AUTO` - Auto mode

#### Structure

The `entity_fan_t` structure contains:
- Base fields (inherited from `entity_base_t`)
- State: `state` (bool), `speed` (uint8_t, 0-100% or 0-5 levels), `mode` (fan_mode_t), `oscillation` (bool), `direction` (int16_t, 0-360°)
- Capabilities: `speed_levels` (uint8_t), `supports_oscillation`, `supports_direction`, `supports_timer`, `timer_remaining` (uint16_t, minutes)

---

### Sensor

Environmental sensor entity for analog measurements.

#### Sensor Classes

- `SENSOR_CLASS_TEMPERATURE` - Temperature sensor
- `SENSOR_CLASS_HUMIDITY` - Humidity sensor
- `SENSOR_CLASS_PRESSURE` - Pressure sensor
- `SENSOR_CLASS_CO2` - CO2 sensor
- `SENSOR_CLASS_PM25` - PM2.5 sensor
- `SENSOR_CLASS_PM10` - PM10 sensor
- `SENSOR_CLASS_TVOC` - TVOC sensor
- `SENSOR_CLASS_ILLUMINANCE` - Illuminance sensor
- `SENSOR_CLASS_BATTERY` - Battery level sensor
- `SENSOR_CLASS_POWER` - Power sensor
- `SENSOR_CLASS_ENERGY` - Energy sensor

#### Structure

The `entity_sensor_t` structure contains:
- Base fields (inherited from `entity_base_t`)
- Value: `value` (float), `unit[8]` (e.g., "°C", "%", "ppm", "lux", "W", "kWh"), `sensor_class` (sensor_class_t)
- Statistics: `min_value`, `max_value`, `avg_value` (float, optional)
- Config: `accuracy` (float), `update_interval` (uint16_t, seconds)

---

### Climate (Air Conditioner)

Climate control entity for air conditioners and heaters.

#### Climate Modes

- `CLIMATE_MODE_OFF` - Off
- `CLIMATE_MODE_AUTO` - Auto mode
- `CLIMATE_MODE_COOL` - Cooling mode
- `CLIMATE_MODE_HEAT` - Heating mode
- `CLIMATE_MODE_DRY` - Dehumidification mode
- `CLIMATE_MODE_FAN_ONLY` - Fan only mode

#### Fan Speed

- `FAN_SPEED_AUTO` - Auto speed
- `FAN_SPEED_LOW` - Low speed
- `FAN_SPEED_MEDIUM` - Medium speed
- `FAN_SPEED_HIGH` - High speed

#### Structure

The `entity_climate_t` structure contains:
- Base fields (inherited from `entity_base_t`)
- Current state: `mode` (climate_mode_t), `current_temp` (float, °C), `target_temp` (float, °C), `current_humidity` (uint8_t, %)
- Control: `fan_speed` (climate_fan_speed_t), `swing` (bool), `eco_mode` (bool), `turbo_mode` (bool)
- Capabilities: `min_temp`, `max_temp` (float), `supports_heat`, `supports_cool`, `supports_dry`, `supports_swing` (bool)

---

### Binary Sensor

Binary sensor entity for on/off, true/false, detected/clear states.

#### Binary Sensor Classes

- `BINARY_SENSOR_MOTION` - Motion sensor
- `BINARY_SENSOR_DOOR` - Door sensor
- `BINARY_SENSOR_WINDOW` - Window sensor
- `BINARY_SENSOR_SMOKE` - Smoke sensor
- `BINARY_SENSOR_GAS` - Gas sensor
- `BINARY_SENSOR_OCCUPANCY` - Occupancy sensor
- `BINARY_SENSOR_TAMPER` - Tamper sensor
- `BINARY_SENSOR_WATER_LEAK` - Water leak sensor

#### Structure

The `entity_binary_sensor_t` structure contains:
- Base fields (inherited from `entity_base_t`)
- State: `state` (bool), `sensor_class` (binary_sensor_class_t)
- Metadata: `last_triggered` (uint32_t, timestamp), `trigger_count` (uint16_t), `debounce_time` (uint16_t, ms)

---

## Validation Rules

### Entity Validation

- **entity_id**: 
  - Required, max 15 characters
  - Format: alphanumeric, underscore only (`[a-zA-Z0-9_]+`)
  - Must be unique within device
  - Examples: `"light_1"`, `"temp_sensor"`, `"switch_0"`

- **name**: 
  - Required, max 31 characters
  - Human-readable display name

- **type**: 
  - Required, must match one of: `"light"`, `"switch"`, `"fan"`, `"sensor"`, `"climate"`, `"binary_sensor"`

### Value Range Validation

- **Light**:
  - `brightness`: 0-100 (percentage)
  - `color_temp`: 2700-6500 (Kelvin)
  - `rgb[]`: 0-255 per channel

- **Fan**:
  - `speed`: 0-100 (percentage) or 0-N levels
  - `direction`: 0-360 (degrees)

- **Climate**:
  - `current_temp`, `target_temp`: Must be within `min_temp` and `max_temp` range
  - Typical range: 16.0-30.0°C

- **Sensor**:
  - `value`: Float, must be within reasonable range for sensor class
  - `update_interval`: Minimum 1 second

### Error Codes

- `VALIDATION_OK` (0) - Success
- `VALIDATION_ERROR_INVALID_ID` (-1) - Invalid entity ID format
- `VALIDATION_ERROR_INVALID_RANGE` (-2) - Value out of valid range
- `VALIDATION_ERROR_MISSING_FIELD` (-3) - Required field missing
- `VALIDATION_ERROR_DUPLICATE_ID` (-4) - Duplicate entity ID
- `VALIDATION_ERROR_BUFFER_TOO_SMALL` (-5) - Buffer too small

### Known Limitations / Future Work

#### Length Validation for Device and Entity Names

**Status:** Pending implementation

Currently, the system does not enforce strict length validation for:
- **Device names** (`device_name`, `device_type`, `manufacturer`, `model`, etc.)
- **Entity names** (`name` field in `entity_base_t`)

While the struct definitions specify maximum lengths (e.g., `device_name[32]`, `name[32]`), runtime validation to prevent truncation or buffer overflows is not yet implemented. The current implementation relies on:
- Compiler warnings for format truncation (suppressed with `#pragma GCC diagnostic` where safe truncation is guaranteed)
- Manual truncation in `device_model_generate_device_id()` and similar functions

**Planned Implementation:**
- Add validation functions to check and truncate device info fields (`device_name`, `device_type`, `manufacturer`, `model`, `sw_version`, `hw_version`) before storing
- Add validation functions to check and truncate entity `name` field before storing
- Return appropriate error codes when input exceeds maximum length
- Provide helper functions for safe string copying with automatic truncation

**Impact:**
- Low priority: Current implementation handles truncation safely in critical paths (e.g., `device_id` generation)
- Medium priority: User-provided strings may be silently truncated if they exceed buffer sizes
- Recommendation: Validate input lengths in application code until runtime validation is implemented

---

## Entity Model API

### Core Functions

**Initialization:**
- `entity_model_init()` - Initialize the entity model

**Type registration:**
- `entity_register_type(type_id, type_enum)` - Register an entity type

**Entity management:**
- `entity_add(entity_struct, type_enum)` - Add an entity to the model
- `entity_get_struct(entity_id, type_out)` - Get entity struct pointer by ID
- `entity_get_count()` - Get total number of entities
- `entity_get_by_index(index, type_out)` - Get entity by index
- `entity_remove(entity_id)` - Remove an entity from the model

**Attribute access:**
- `entity_describe(buf, buf_len)` - Get entity description
- `entity_get(entity_id, attr, value_buf, value_buf_len)` - Get attribute value
- `entity_set(entity_id, attr, value)` - Set attribute value

**Event system:**
- `entity_subscribe(entity_struct, callback, ctx)` - Subscribe to entity events
- `entity_subscribe_global(callback, ctx)` - Subscribe to all entity events
- `entity_unsubscribe(callback)` - Unsubscribe from events

### Entity Storage

Entities are stored in a polymorphic array:
- `MAX_ENTITIES` - Maximum number of entities (default: 8, configurable via Kconfig)
- Internal storage: `s_entities[MAX_ENTITIES]` (void* pointers), `s_entity_types[MAX_ENTITIES]` (type enum), `s_entity_count` (size_t)

**Notes:**
- **MAX_ENTITIES**: Fixed at compile time (default: 8). Configurable via Kconfig.
- **Polymorphic storage**: Use `void*` pointers with parallel type array for type safety.
- **Memory allocation**: Entities can be allocated on stack or heap (see Memory Management section).

---

## Memory Management

### Allocation Strategies

#### Strategy 1: Stack Allocation (Recommended for Embedded)

Pre-allocate entities on stack before adding to the entity model.

**Pros**: 
- No heap fragmentation
- Predictable memory usage
- Faster allocation

**Cons**: 
- Fixed size at compile time
- Entities must exist for device lifetime

#### Strategy 2: Heap Allocation

Allocate entities dynamically on heap using `malloc()`.

**Pros**: 
- Dynamic allocation
- Can free when not needed

**Cons**: 
- Risk of heap fragmentation
- Must free manually to avoid leaks

### Cleanup Functions

Free all heap-allocated entities in device model before destroying device_model_t or on shutdown.

### Memory Constraints

- **ESP32**: Limited RAM (typically 200-520KB)
- **Recommendation**: Use stack allocation for entities when possible
- **Serialization buffers**: Use fixed-size buffers for serialization
- **Maximum device size**: Consider limiting total payload size

---

## Error Handling

### Error Return Codes

All functions should return:
- `0` on success
- Negative value on error

**Error codes:**
- `ENTITY_OK` (0) - Success
- `ENTITY_ERROR_INVALID_PARAM` (-1) - Invalid parameter
- `ENTITY_ERROR_NOT_FOUND` (-2) - Entity not found
- `ENTITY_ERROR_BUFFER_TOO_SMALL` (-3) - Buffer too small
- `ENTITY_ERROR_TYPE_MISMATCH` (-4) - Type mismatch
- `ENTITY_ERROR_READ_ONLY` (-5) - Attribute is read-only
- `ENTITY_ERROR_WRITE_FAILED` (-6) - Write operation failed
- `ENTITY_ERROR_OUT_OF_MEMORY` (-7) - Out of memory
- `ENTITY_ERROR_VALIDATION_FAILED` (-8) - Validation failed

### Error Handling Patterns

#### Pattern 1: Validate Input Early

Validate all inputs at the beginning of functions before processing.

#### Pattern 2: Check Buffer Sizes

Always check buffer sizes before writing to prevent buffer overflows.

#### Pattern 3: Handle Entity Count Overflow

Check if entity count has reached MAX_ENTITIES before adding new entities.

#### Pattern 4: Validate Value Ranges

Validate value ranges and clamp values to valid ranges when necessary.

### Error Logging

Use ESP-IDF logging macros (`ESP_LOGE`, `ESP_LOGW`, `ESP_LOGI`, `ESP_LOGD`) for error reporting and debugging.

---

## Model Structure Details

> **Note:** This section provides detailed structural information about the entity model. For migration instructions, see [Migration Guide](#migration-guide-struct-based-entity-model).

### Entity Model Architecture

The Entity Model Core manages entities in a polymorphic array:
- `entities[MAX_ENTITIES]` - Array of void* pointers to entity structs
- `entity_types[MAX_ENTITIES]` - Parallel array of entity type enums
- `entity_count` - Current number of entities

Each entity struct contains:
- `entity_base_t` base structure at the beginning
- Entity-specific fields (state, attributes, capabilities)

### Event System

The Event System manages callbacks:
- `event_callbacks[MAX_EVENT_CALLBACKS]` - Array of event callbacks
- `callback_count` - Current number of active callbacks

### Entity Base Model (`entity_base_t`)

**Base structure** inherited by all entity types:
- `entity_id[16]` - Unique ID within device (e.g., "light_1")
- `name[32]` - Human-readable name (e.g., "Living Room Light")
- `type` - Entity type enum (ENTITY_TYPE_LIGHT, etc.)
- `device_class[16]` - Sub-type (e.g., "dimmable", "temperature")
- `available` - Online/offline status (bool)
- `last_update` - Unix timestamp (seconds)

**Entity Types Enum:**
- `ENTITY_TYPE_LIGHT` - Light control entity
- `ENTITY_TYPE_SWITCH` - Switch/button entity
- `ENTITY_TYPE_FAN` - Fan control entity
- `ENTITY_TYPE_SENSOR` - Sensor entity
- `ENTITY_TYPE_CLIMATE` - Climate control entity
- `ENTITY_TYPE_BINARY_SENSOR` - Binary sensor entity

### Entity Storage

Entities are stored internally in the entity model:
- `MAX_ENTITIES` - Fixed at compile time (default: 8), configurable via Kconfig
- Polymorphic entities: Use `void*` with parallel type array for type safety
- Memory: Entities can be allocated on stack or heap by drivers

### Memory Layout

#### Stack Allocation (Recommended)

Pre-allocate entities on stack, initialize fields, then register with entity model using `entity_add()`.

#### Heap Allocation

Allocate entities on heap using `malloc()`, initialize, then register with entity model.

### Validation Rules Summary

#### Entity
- `entity_id`: Required, max 15 chars, `[a-zA-Z0-9_.]+`, unique within device
  - Can be user-provided or auto-generated from `name` + `type`
  - Format: `{type}_{sanitized_name}` or `{type}.{index}`
  - Stable (does not change when `name` changes)
- `name`: Required, max 31 chars, human-readable
  - Can be changed anytime (does not affect `entity_id`)
- `type`: Required, must be valid entity type enum

#### Value Ranges
- Light brightness: 0-100
- Light color_temp: 2700-6500K
- Fan speed: 0-100 or 0-N levels
- Climate temp: Within min_temp/max_temp range
- Sensor update_interval: Minimum 1 second

### Key Points

1. **Entity Model Core**: Manages entities in a polymorphic array
2. **Polymorphic Entities**: Use `void*` with parallel type array for type safety
3. **Base Model**: All entities inherit `entity_base_t`
4. **6 Entity Types**: Light, Switch, Fan, Sensor, Climate, Binary Sensor
5. **Fixed Size**: MAX_ENTITIES = 8 (configurable via Kconfig)
6. **Validation**: Input validation at all levels
7. **Memory**: Stack allocation recommended for embedded systems
8. **Event System**: Pointer-based subscription (ESP-IDF style) - see [Migration Guide](#migration-guide-struct-based-entity-model)
9. **Entity ID**: Auto-generated from name+type (hybrid approach) or user-provided

---

## Device Model and Entity Model

### Relationship: Reference-Based (Option 1)

- **Entity Model** is the single source of truth for entities. It runs independently; no Device Model is required to use it (e.g. local get/set, CoAP on device).
- **Device Model** holds device-level metadata and network info, and **references** entities in the Entity Model (pointers), rather than duplicating entity storage.
- One device per node: the Entity Model singleton holds all entities for that local device. Ownership is implicit.

### Why This Design

- **Entity Model** can be used alone for local control and in-app logic.
- **Device Model** is used when serializing for the backend (register, updates). It is built from device info + pointers to Entity Model entities.
- No duplicate entity data; backend still knows which entities belong to which device because payloads always carry `device_id` together with entity data (see [Backend Payloads](#backend-payloads-register-and-updates)).

### Device Model Contents

- **Device info**: `device_id`, `device_name`, `device_type`, `manufacturer`, `model`, `sw_version`, `hw_version`, `mac_address`
- **Network info**: `rloc16`, `ipv6_addr`, `role`
- **Entities**: Pointers to entity structs in the Entity Model (not a separate copy)

### Backend and Entity Ownership

- When serializing (e.g. CBOR), the payload is one object: `device_id` (and other device/network fields) plus an `entities` array.
- The backend therefore always receives “this device_id has these entities”; no need for `device_id` inside each entity. For **partial updates**, the payload still includes `device_id` so the backend can map updates to the correct device.

---

## Backend Payloads (Register and Updates)

Payloads to the backend (e.g. CoAP to Border Router / Leader) use the following conventions.

### 1. Register (first-time or re-register)

Send the **full device model** and **all entities** in one payload (e.g. CBOR).

- **Include:** `device_id`, device info (name, type, manufacturer, model, versions, mac), network (rloc16, ipv6_addr, role, parent), and the full **entities** array (all entities of this device).
- **Purpose:** Backend creates or updates the device record and knows the complete list of entities for that `device_id`.
- **Example shape:**  
  `{ "device_id": "...", "device_name": "...", "network": { ... }, "entities": [ { ... }, { ... } ] }`

### 2. Updates (state or attribute changes)

Send **partial payloads** with **device_id** and only **changed** entity/attribute data.

- **Include:** `device_id` (required so the backend can map the update to the correct device) and a list of updates, e.g. `entity_id`, `attr`, `value` (and optionally `last_update`).
- **Purpose:** Minimize bandwidth; backend applies changes to the already-registered device and its entities.
- **Example shape:**  
  `{ "device_id": "...", "updates": [ { "entity_id": "light.0", "attr": "state", "value": "on" }, ... ] }`

### Why `device_id` in Updates

- `entity_id` is unique only **within** a device (e.g. two devices can both have `light.0`).
- Including `device_id` in every update ensures the backend can always resolve which device (and thus which entity) is being updated.

---

## Migration Guide: Struct-Based Entity Model

> **Note:** This section describes the migration from callback-based to struct-based entity model. The current implementation uses struct-based approach with pointer-based event subscription.

### Overview

#### Current (Callback-Based):
- Entity model uses callbacks to get/set attributes
- `instance_data` is `void*` generic
- Flexible but not type-safe
- Difficult to serialize directly

#### Target (Struct-Based + Event-driven):
- Entity model stores structs directly (`entity_light_t`, `entity_sensor_t`, etc.)
- Type-safe with struct definitions
- Easy to serialize directly to binary/JSON
- Matches specification in `IoT_Entity_Model_Specification.md`
- **Event system:** Pointer-based subscription (ESP-IDF style)
- **Direct access:** API layer sets directly into struct, emits event
- **Auto-subscribe:** Driver automatically subscribes when adding entity (ESPHome style)

### Key Design Decisions:

1. ✅ **Pointer-based Subscription:** `entity_subscribe(light, callback, ctx)` - uses pointer, not entity_id string
2. ✅ **Direct Struct Access:** API layer casts and sets directly: `light->state = true`
3. ✅ **Event System:** Array with NULL slots (MAX_EVENT_CALLBACKS = 8)
4. ✅ **Hybrid Entity ID:** Auto-generate from name or user-provided
5. ✅ **Match by Pointer:** Event subscribers match by pointer comparison (fast, type-safe)

### New Architecture

#### Flow (Struct-based + Event-driven):

1. **Driver Layer**: Creates wrapper with entity struct, fills all fields, calls `entity_add()`, then `entity_subscribe()` with pointer (ESP-IDF style)

2. **Entity Model Core**: Stores void* → entity_light_t*, reads/writes directly from structs, manages event system with array and NULL slots, matches subscribers by pointer

3. **API Layer**: Parses entity_id from URI (string), gets struct pointer via `entity_get_struct()`, accesses struct directly (e.g., `light->state = true`), emits events with pointer

4. **Event System**: Dispatches events to subscribers, matches subscribers by pointer, calls driver callbacks

5. **Driver Callbacks**: Updates hardware (e.g., GPIO, sensors)

### Event System Design

**Approach: Pointer-based Subscription (ESP-IDF style)**

We use pointer-based subscription instead of ID-based for the following reasons:
- ✅ **Type-safe**: Compiler checks types
- ✅ **Fast**: O(1) pointer comparison vs O(n) string comparison
- ✅ **ESP-IDF style**: Matches ESP-IDF handle pattern
- ✅ **Driver-friendly**: Driver already has pointer to entity struct
- ✅ **No string overhead**: No need to store/compare entity_id strings for events

**Note:** The old callback-based approach used ID-based subscription (`entity_subscribe_entity_events("light.0", callback)`), but we've migrated to pointer-based (`entity_subscribe(light, callback, ctx)`) for better performance and type safety.

### Migration Steps

#### **Step 1: Update Entity Model Core**

**Change `entity_model_priv.h`:**
- Before: Entity struct with string pointers and callback-based type
- After: Entity struct with `entity_base_t` base structure and type enum

**Change `entity_register_type()`:**
- Before: Takes type_id, get_cb, set_cb callbacks
- After: Takes type_id and type_enum only

**Change `entity_add()`:**
- Before: Takes entity_id, type_id, name, instance_data
- After: Takes entity_struct pointer and type_enum
- entity_struct must have entity_base_t base at the beginning
- Validate: check base.entity_id, base.name, base.type == type_enum

#### **Step 2: Event System with Pointer-based Subscription**

**Event Types:**
- `ENTITY_EVENT_STATE_CHANGED` - State attribute changed
- `ENTITY_EVENT_ATTRIBUTE_CHANGED` - Any attribute changed
- `ENTITY_EVENT_AVAILABLE_CHANGED` - Available status changed
- `ENTITY_EVENT_ADDED` - Entity added
- `ENTITY_EVENT_REMOVED` - Entity removed

**Event Data Structure:**
- `entity_id` - For API/logging (optional)
- `event_type` - Event type enum
- `attr_name` - Attribute name (e.g., "state", "brightness")
- `old_value` - Pointer to old value (optional)
- `new_value` - Pointer to new value (optional)
- `entity_struct` - Pointer to entity struct

**Callback Management (Array with NULL slots):**
- `MAX_EVENT_CALLBACKS` - Maximum callbacks (default: 8, configurable via Kconfig)
- Array of subscriber structures with callback, context, entity_struct filter, and active flag

**API:**
- `entity_subscribe(entity_struct, callback, ctx)` - Subscribe by pointer (ESP-IDF style)
- `entity_subscribe_global(callback, ctx)` - Subscribe to all entities
- `entity_unsubscribe(callback)` - Unsubscribe
- `entity_emit_event(entity_struct, event_type, attr_name, old_value, new_value)` - Emit event (internal)

#### **Step 3: Update Driver Layer**

**Example Pattern:**
- Create wrapper struct to store GPIO info and entity struct
- Fill entity struct with all required fields
- Register type (no callbacks needed)
- Add entity to model using `entity_add()`
- Auto-subscribe with pointer (ESPHome style)
- Setup hardware (GPIO, etc.)
- Implement event callback to update hardware when entity state changes

#### **Step 4: Update API Layer**

**Direct struct access:**
- Parse entity_id from URI (string)
- Get struct pointer via `entity_get_struct(entity_id)`
- Cast and read/write directly from struct based on type enum
- Emit events with pointer when state changes

#### **Step 5: Device Model (reference-based)**

- Implement Device Model Manager: singleton holding device info + network info; entities are references (pointers) to Entity Model, not copied.
- Serialization (register): build payload from Device Model (device_id, device info, network) + all entities from Entity Model.
- Serialization (updates): build partial payload with device_id + list of changed entity/attr/value.
- Device registry: when registering, fill device model from Device Model Manager + entity list from Entity Model, then serialize to CBOR and POST.

### Migration Checklist

#### Phase 1: Core Model
- [x] Update `entity_model_priv.h` - Update struct definitions ✅
- [x] Update `entity_model.c` - Remove callbacks, add struct-based get/set ✅
- [x] Add helper functions (`entity_get_struct`, etc.) ✅
- [ ] Implement event system (pointer-based subscription)
- [ ] Implement callback management (array with NULL slots)
- [ ] Test core functionality

#### Phase 2: Drivers
- [x] Refactor driver code - Create wrapper struct ✅
- [x] Update driver add function - Create entity struct ✅
- [ ] Implement auto-subscribe pattern (pointer-based)
- [ ] Implement entity_id auto-generation (hybrid approach)
- [ ] Test driver control with event system

#### Phase 3: Components
- [ ] Update API layer - Direct struct access + emit events
- [ ] Update serialization - Serialize from structs
- [ ] Update device registry - Use entity model
- [ ] Test serialization
- [ ] Test event system integration

#### Phase 4: Device Model
- [ ] Implement Device Model Manager (init, get/set device info, update network info)
- [ ] Device Model references Entity Model entities (pointers, no duplicate storage)
- [ ] Serialization: register payload uses device_id + device info from Device Model (no hardcode)
- [ ] Serialization: partial updates include device_id + changed entities only
- [ ] Device registry: build/serialize full device model (device info + entity pointers) for CoAP POST
- [ ] Test register flow and update flow with backend

### Breaking Changes

#### API Changes:

1. **`entity_register_type()`**
   - **Before:** `entity_register_type(type_id, get_cb, set_cb)`
   - **After:** `entity_register_type(type_id, type_enum)`
   - **Impact:** All drivers must be updated

2. **`entity_add()`**
   - **Before:** `entity_add(entity_id, type_id, name, instance_data)`
   - **After:** `entity_add(entity_struct, type_enum)`
   - **Impact:** All drivers must be updated

3. **`entity_get()` / `entity_set()`**
   - **Before:** Called callbacks
   - **After:** Read/write directly from structs
   - **Impact:** Internal change, API remains the same

### Benefits after Migration

1. **Type Safety:** Compiler checks types, no runtime checks needed
2. **Performance:** Direct read/write, no callback overhead
3. **Serialization:** Easy to serialize, no conversion needed
4. **Spec Compliance:** Matches specification
5. **Maintainability:** Code is clearer, easier to debug
6. **ESP-IDF Style:** Pointer-based subscription matches ESP-IDF handle pattern
7. **ESPHome Style:** Auto-subscribe when adding entity, no manual subscribe needed
8. **Event-driven:** Decoupled architecture with event system
9. **Flexible:** Hybrid entity_id generation (auto or manual)

### Tips & Best Practices

1. **Incremental Migration:**
   - Migrate one driver at a time
   - Test after each step

2. **Wrapper Pattern:**
   - Use wrapper struct to store driver-specific data
   - Place `entity_light_t` at the beginning of wrapper for easy casting

3. **Event System:**
   - Subscribe by pointer (ESP-IDF style), don't use entity_id string
   - Auto-subscribe when adding entity (ESPHome style)
   - Event match by pointer comparison (fast, type-safe)

4. **Entity ID:**
   - Hybrid approach: user-provided or auto-generate from name
   - entity_id is stable (doesn't change), name can be changed
   - entity_id used for API (paths), pointer used for events

5. **Callback Management:**
   - Array with NULL slots (simple, embedded-friendly)
   - MAX_EVENT_CALLBACKS = 8 (enough for 5-6 entities with 1-2 callbacks each)
   - Unsubscribe by marking inactive (no need to shift array)

### FAQ

**Q: Why subscribe by pointer instead of entity_id string?**  
A: Matches ESP-IDF handle pattern, type-safe, no string comparison needed, driver already has pointer.

**Q: Does event system have a limit on number of callbacks?**  
A: Yes, MAX_EVENT_CALLBACKS = 8 (configurable). Enough for 5-6 entities with 1-2 callbacks each + 2-3 global callbacks.

**Q: Can entity_id be auto-generated?**  
A: Yes, hybrid approach: user can provide or let it auto-generate from name + type. entity_id is stable (doesn't change), name can be changed.

**Q: Does API layer still use entity_id string?**  
A: Yes, entity_id is used for API paths (`/entities/light.0/state`). But after getting struct pointer, all operations use pointer.

---

## Summary

This entity model provides:

- ✅ **Simplicity**: Easy to understand and implement
- ✅ **Flexibility**: Devices can have multiple entity types
- ✅ **Standardization**: Each entity type has a clear structure
- ✅ **Extensibility**: Easy to add new entity types
- ✅ **Type Safety**: Struct-based approach with compile-time type checking
- ✅ **Lightweight**: Suitable for resource-constrained embedded systems
- ✅ **Event-Driven**: Pointer-based event subscription system (ESP-IDF style)

### Recommended Use Cases

- **Light**: Ceiling lights, table lamps, LED strips
- **Switch**: Wall switches, buttons, multi-gang panels
- **Fan**: Ceiling fans, desk fans, exhaust fans
- **Sensor**: Temperature, humidity, air quality, power monitoring
- **Climate**: Air conditioners, heaters, thermostats
- **Binary Sensor**: Motion, door/window, smoke, gas leak detection
