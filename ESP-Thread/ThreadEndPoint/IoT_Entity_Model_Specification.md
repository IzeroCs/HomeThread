# IoT Entity Model Specification

> **Version:** 1.2.0  
> **Date:** February 18, 2026  
> **Platform:** ESP-IDF + OpenThread  
> **Last Updated:** Changed recommendation to binary format (CBOR) for CoAP payloads. Backend converts CBOR to JSON for display.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Device Info](#device-info)
4. [Entity Base Model](#entity-base-model)
5. [Entity Types](#entity-types)
   - [Light](#light)
   - [Switch](#switch)
   - [Fan](#fan)
   - [Sensor](#sensor)
   - [Climate (Air Conditioner)](#climate-air-conditioner)
   - [Binary Sensor](#binary-sensor)
6. [Complete Device Model](#complete-device-model)
7. [Validation Rules](#validation-rules)
8. [Memory Management](#memory-management)
9. [Error Handling](#error-handling)
10. [Binary Serialization (CBOR)](#binary-serialization-cbor)
11. [JSON Serialization (Legacy)](#json-serialization-legacy-debugging)
12. [CoAP API Design](#coap-api-design)
13. [CoAP Payload Format Recommendations](#coap-payload-format-recommendations)
14. [Code Implementation](#code-implementation)
14. [Security Considerations](#security-considerations)
15. [Examples](#examples)

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

```
Device (physical node)
  ├─ Device Info (metadata)
  ├─ Entities[] (list of functional entities)
  │   ├─ Entity 1 (light, sensor, switch...)
  │   ├─ Entity 2
  │   └─ ...
  └─ Network Info (Thread/IPv6)
```

---

## Device Info

Basic device metadata that identifies and describes the device.

### C Structure

```c
typedef struct {
    char device_id[16];        // Unique identifier: "living-room-001"
    char device_name[32];      // Human-readable: "Living Room Controller"
    char device_type[16];      // Type: "light_controller", "sensor_hub"
    char manufacturer[32];     // Manufacturer name: "MyCompany"
    char model[32];            // Model number: "LC-100"
    char sw_version[16];       // Software version: "1.2.3"
    char hw_version[16];       // Hardware version: "v2.0"
    uint64_t mac_address;      // IEEE EUI-64 address (8 bytes)
} device_info_t;
```

### JSON Example

```json
{
  "device_id": "living-room-001",
  "device_name": "Living Room Controller",
  "device_type": "light_controller",
  "manufacturer": "MyCompany",
  "model": "LC-100",
  "sw_version": "1.2.3",
  "hw_version": "v2.0",
  "mac_address": "0x1234567890ABCDEF"  // Hex string representation of uint64_t
}
```

---

## Entity Base Model

Common attributes shared by all entity types.

### Entity Types Enum

```c
typedef enum {
    ENTITY_TYPE_LIGHT = 0,
    ENTITY_TYPE_SWITCH,
    ENTITY_TYPE_FAN,
    ENTITY_TYPE_SENSOR,
    ENTITY_TYPE_CLIMATE,       // Air conditioner/heater
    ENTITY_TYPE_BINARY_SENSOR
} entity_type_t;
```

### Base Structure

```c
typedef struct {
    char entity_id[16];        // Unique ID within device: "light_1" (alphanumeric + underscore)
    char name[32];             // Human-readable: "Living Room Light"
    entity_type_t type;        // Entity type enum
    char device_class[16];     // Sub-type: "temperature", "motion", "dimmable"
    bool available;            // Online/offline status
    uint32_t last_update;      // Last update timestamp (Unix time, seconds since epoch)
} entity_base_t;
```

---

## Entity Types

### Light

Light control entity with support for on/off, dimming, and color control.

#### Light Modes

```c
typedef enum {
    LIGHT_MODE_ON_OFF = 0,     // Simple on/off only
    LIGHT_MODE_DIMMABLE,       // Brightness control
    LIGHT_MODE_RGB,            // RGB color
    LIGHT_MODE_RGBW,           // RGB + White
    LIGHT_MODE_CCT             // Color temperature (warm/cool white)
} light_mode_t;
```

#### Structure

```c
typedef struct {
    entity_base_t base;        // Inherited base
    
    // State
    bool state;                // on/off
    uint8_t brightness;        // 0-100%
    uint16_t color_temp;       // 2700-6500K (if supported)
    uint8_t rgb[3];            // R, G, B (0-255)
    
    // Capabilities
    light_mode_t mode;         // Light type
    uint8_t min_brightness;    // 1-100
    uint8_t max_brightness;    // 1-100
    uint16_t min_color_temp;   // 2700K
    uint16_t max_color_temp;   // 6500K
    
    // Effects (optional)
    char effect[16];           // "none", "blink", "rainbow"
    uint8_t transition_time;   // Transition time (seconds)
} entity_light_t;
```

#### JSON Example

```json
{
  "entity_id": "light_1",
  "name": "Living Room Light",
  "type": "light",
  "device_class": "dimmable",
  "available": true,
  "state": true,
  "brightness": 80,
  "mode": "dimmable",
  "min_brightness": 1,
  "max_brightness": 100,
  "transition_time": 2
}
```

#### Control Commands

```json
// Turn on with brightness
{
  "state": true,
  "brightness": 75
}

// Set RGB color
{
  "state": true,
  "rgb": [255, 128, 0]
}

// Set color temperature
{
  "state": true,
  "color_temp": 3000
}
```

---

### Switch

Physical switch or button control entity.

#### Switch Types

```c
typedef enum {
    SWITCH_TYPE_TOGGLE = 0,    // Toggle on/off switch
    SWITCH_TYPE_PUSH,          // Momentary push button
    SWITCH_TYPE_MULTI_GANG     // Multi-gang switch (2-gang, 3-gang, etc.)
} switch_type_t;
```

#### Structure

```c
typedef struct {
    entity_base_t base;
    
    // State
    bool state;                // on/off (for toggle)
    bool pressed;              // true when pressed (for push button)
    uint8_t gang_states[4];    // State of each gang (multi-gang)
    uint8_t gang_count;        // Number of gangs (1-4)
    
    // Config
    switch_type_t type;
    bool momentary;            // true = push button
    bool interlock;            // true = only one gang ON at a time
} entity_switch_t;
```

#### JSON Example

```json
{
  "entity_id": "switch_1",
  "name": "Wall Switch 3-Gang",
  "type": "switch",
  "device_class": "multi_gang",
  "available": true,
  "gang_count": 3,
  "gang_states": [1, 0, 1],
  "interlock": false
}
```

---

### Fan

Fan control entity with speed and oscillation control.

#### Fan Modes

```c
typedef enum {
    FAN_MODE_OFF = 0,
    FAN_MODE_LOW,
    FAN_MODE_MEDIUM,
    FAN_MODE_HIGH,
    FAN_MODE_AUTO
} fan_mode_t;
```

#### Structure

```c
typedef struct {
    entity_base_t base;
    
    // State
    bool state;                // on/off
    uint8_t speed;             // 0-100% or 0-5 levels
    fan_mode_t mode;           // Low/Medium/High/Auto
    bool oscillation;          // Oscillation on/off
    int16_t direction;         // 0-360° (if supported)
    
    // Capabilities
    uint8_t speed_levels;      // 3, 5, or 100 (continuous)
    bool supports_oscillation;
    bool supports_direction;
    bool supports_timer;
    uint16_t timer_remaining;  // Minutes remaining
} entity_fan_t;
```

#### JSON Example

```json
{
  "entity_id": "fan_1",
  "name": "Ceiling Fan",
  "type": "fan",
  "available": true,
  "state": true,
  "speed": 60,
  "mode": "medium",
  "oscillation": true,
  "speed_levels": 5,
  "supports_oscillation": true
}
```

---

### Sensor

Environmental sensor entity for analog measurements.

#### Sensor Classes

```c
typedef enum {
    SENSOR_CLASS_TEMPERATURE = 0,
    SENSOR_CLASS_HUMIDITY,
    SENSOR_CLASS_PRESSURE,
    SENSOR_CLASS_CO2,
    SENSOR_CLASS_PM25,
    SENSOR_CLASS_PM10,
    SENSOR_CLASS_TVOC,
    SENSOR_CLASS_ILLUMINANCE,
    SENSOR_CLASS_BATTERY,
    SENSOR_CLASS_POWER,
    SENSOR_CLASS_ENERGY
} sensor_class_t;
```

#### Structure

```c
typedef struct {
    entity_base_t base;
    
    // Value
    float value;               // Current value
    char unit[8];              // "°C", "%", "ppm", "lux", "W", "kWh"
    sensor_class_t sensor_class;
    
    // Statistics (optional)
    float min_value;           // Min value in last 24h
    float max_value;           // Max value in last 24h
    float avg_value;           // Average value
    
    // Config
    float accuracy;            // ±0.5°C
    uint16_t update_interval;  // Update interval in seconds
} entity_sensor_t;
```

#### JSON Examples

**Temperature Sensor:**
```json
{
  "entity_id": "temp_1",
  "name": "Living Room Temperature",
  "type": "sensor",
  "device_class": "temperature",
  "available": true,
  "value": 25.3,
  "unit": "°C",
  "accuracy": 0.5,
  "update_interval": 30
}
```

**PM2.5 Sensor:**
```json
{
  "entity_id": "pm25_1",
  "name": "Air Quality PM2.5",
  "type": "sensor",
  "device_class": "pm25",
  "available": true,
  "value": 12.5,
  "unit": "µg/m³",
  "min_value": 8.0,
  "max_value": 35.0,
  "avg_value": 15.2
}
```

---

### Climate (Air Conditioner)

Climate control entity for air conditioners and heaters.

#### Climate Modes

```c
typedef enum {
    CLIMATE_MODE_OFF = 0,
    CLIMATE_MODE_AUTO,
    CLIMATE_MODE_COOL,
    CLIMATE_MODE_HEAT,
    CLIMATE_MODE_DRY,
    CLIMATE_MODE_FAN_ONLY
} climate_mode_t;

typedef enum {
    FAN_SPEED_AUTO = 0,
    FAN_SPEED_LOW,
    FAN_SPEED_MEDIUM,
    FAN_SPEED_HIGH
} climate_fan_speed_t;
```

#### Structure

```c
typedef struct {
    entity_base_t base;
    
    // Current state
    climate_mode_t mode;
    float current_temp;        // Current temperature (°C)
    float target_temp;         // Target temperature (°C)
    uint8_t current_humidity;  // Current humidity (%)
    
    // Control
    climate_fan_speed_t fan_speed;
    bool swing;                // Swing mode (louver)
    bool eco_mode;             // Eco/energy saving mode
    bool turbo_mode;           // Turbo/powerful mode
    
    // Capabilities
    float min_temp;            // Min temperature (16°C)
    float max_temp;            // Max temperature (30°C)
    bool supports_heat;
    bool supports_cool;
    bool supports_dry;
    bool supports_swing;
} entity_climate_t;
```

#### JSON Example

```json
{
  "entity_id": "ac_1",
  "name": "Living Room AC",
  "type": "climate",
  "available": true,
  "mode": "cool",
  "current_temp": 28.5,
  "target_temp": 24.0,
  "current_humidity": 65,
  "fan_speed": "medium",
  "swing": true,
  "eco_mode": false,
  "turbo_mode": false,
  "min_temp": 16.0,
  "max_temp": 30.0,
  "supports_cool": true,
  "supports_heat": true,
  "supports_dry": true
}
```

---

### Binary Sensor

Binary sensor entity for on/off, true/false, detected/clear states.

#### Binary Sensor Classes

```c
typedef enum {
    BINARY_SENSOR_MOTION = 0,
    BINARY_SENSOR_DOOR,
    BINARY_SENSOR_WINDOW,
    BINARY_SENSOR_SMOKE,
    BINARY_SENSOR_GAS,
    BINARY_SENSOR_OCCUPANCY,
    BINARY_SENSOR_TAMPER,
    BINARY_SENSOR_WATER_LEAK
} binary_sensor_class_t;
```

#### Structure

```c
typedef struct {
    entity_base_t base;
    
    // State
    bool state;                // true/false, on/off, detected/clear
    binary_sensor_class_t sensor_class;
    
    // Metadata
    uint32_t last_triggered;   // Last trigger timestamp
    uint16_t trigger_count;    // Trigger count in last 24h
    uint16_t debounce_time;    // Debounce time in ms
} entity_binary_sensor_t;
```

#### JSON Examples

**Motion Sensor:**
```json
{
  "entity_id": "motion_1",
  "name": "Living Room Motion",
  "type": "binary_sensor",
  "device_class": "motion",
  "available": true,
  "state": true,
  "last_triggered": 1708329600,
  "trigger_count": 15
}
```

**Door Sensor:**
```json
{
  "entity_id": "door_1",
  "name": "Front Door",
  "type": "binary_sensor",
  "device_class": "door",
  "available": true,
  "state": false,
  "last_triggered": 1708329200
}
```

---

## Validation Rules

### Device Info Validation

- **device_id**: 
  - Required, max 15 characters
  - Format: alphanumeric, hyphen, underscore only (`[a-zA-Z0-9_-]+`)
  - Must be unique within the network
  - Examples: `"living-room-001"`, `"bedroom_light_01"`

- **device_name**: 
  - Required, max 31 characters
  - Human-readable string, any printable characters

- **device_type**: 
  - Required, max 15 characters
  - Common values: `"light_controller"`, `"sensor_hub"`, `"switch_controller"`, `"climate_controller"`, `"multi_sensor"`

- **mac_address**: 
  - Required, 8-byte IEEE EUI-64 address
  - JSON format: hex string `"0x..."` (16 hex digits)

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

```c
typedef enum {
    VALIDATION_OK = 0,
    VALIDATION_ERROR_INVALID_ID = -1,
    VALIDATION_ERROR_INVALID_RANGE = -2,
    VALIDATION_ERROR_MISSING_FIELD = -3,
    VALIDATION_ERROR_DUPLICATE_ID = -4,
    VALIDATION_ERROR_BUFFER_TOO_SMALL = -5
} validation_result_t;
```

---

## Complete Device Model

### Structure

```c
#define MAX_ENTITIES 8

typedef struct {
    device_info_t info;
    
    // Entities (polymorphic array)
    void *entities[MAX_ENTITIES];  // Pointers to entity_light_t, entity_sensor_t, etc.
    entity_type_t entity_types[MAX_ENTITIES];
    uint8_t entity_count;
    
    // Network info
    uint8_t ipv6_addr[16];     // Thread IPv6 address
    uint16_t rloc16;           // Thread RLOC16
    uint8_t role;              // Leader/Router/Child
} device_model_t;
```

### Notes

- **MAX_ENTITIES**: Fixed at compile time (default: 8). Adjust based on device capabilities.
- **Polymorphic entities**: Use `void*` pointers with type array for type safety.
- **Memory allocation**: Entities can be allocated on stack or heap (see Memory Management section).

---

## Memory Management

### Allocation Strategies

#### Strategy 1: Stack Allocation (Recommended for Embedded)

```c
// Pre-allocate entities on stack
entity_light_t light1;
entity_sensor_t temp1;

// Initialize
strcpy(light1.base.entity_id, "light_1");
light1.base.type = ENTITY_TYPE_LIGHT;
// ... set other fields

// Add to device model
device.entities[0] = &light1;
device.entity_types[0] = ENTITY_TYPE_LIGHT;
```

**Pros**: 
- No heap fragmentation
- Predictable memory usage
- Faster allocation

**Cons**: 
- Fixed size at compile time
- Entities must exist for device lifetime

#### Strategy 2: Heap Allocation

```c
// Allocate on heap
entity_light_t *light = malloc(sizeof(entity_light_t));
if (!light) {
    // Handle error
    return -1;
}

// Initialize
memset(light, 0, sizeof(entity_light_t));
strcpy(light->base.entity_id, "light_1");
// ... set other fields

// Add to device model
device.entities[0] = light;
device.entity_types[0] = ENTITY_TYPE_LIGHT;
```

**Pros**: 
- Dynamic allocation
- Can free when not needed

**Cons**: 
- Risk of heap fragmentation
- Must free manually to avoid leaks

### Cleanup Functions

```c
/**
 * Free all heap-allocated entities in device model.
 * Call this before destroying device_model_t or on shutdown.
 */
void device_model_cleanup(device_model_t *device) {
    if (!device) return;
    
    for (int i = 0; i < device->entity_count; i++) {
        if (device->entities[i]) {
            free(device->entities[i]);
            device->entities[i] = NULL;
        }
    }
    device->entity_count = 0;
}

/**
 * Free JSON string returned by serialize_device().
 */
void free_device_json(char *json_str) {
    if (json_str) {
        free(json_str);  // cJSON_Print allocates with malloc
    }
}
```

### Memory Constraints

- **ESP32**: Limited RAM (typically 200-520KB)
- **Recommendation**: Use stack allocation for entities when possible
- **JSON buffers**: Use fixed-size buffers or streaming serialization for large devices
- **Maximum device size**: Consider limiting total JSON size to < 4KB for CoAP packets

---

## Error Handling

### Error Return Codes

All functions should return:
- `0` on success
- Negative value on error (see error codes below)

```c
typedef enum {
    ENTITY_OK = 0,
    ENTITY_ERROR_INVALID_PARAM = -1,
    ENTITY_ERROR_NOT_FOUND = -2,
    ENTITY_ERROR_BUFFER_TOO_SMALL = -3,
    ENTITY_ERROR_TYPE_MISMATCH = -4,
    ENTITY_ERROR_READ_ONLY = -5,
    ENTITY_ERROR_WRITE_FAILED = -6,
    ENTITY_ERROR_OUT_OF_MEMORY = -7,
    ENTIDY_ERROR_VALIDATION_FAILED = -8
} entity_result_t;
```

### Error Handling Patterns

#### Pattern 1: Validate Input Early

```c
int entity_set(const char *entity_id, const char *attr, const char *value, 
               device_model_t *device) {
    // Validate inputs
    if (!entity_id || !attr || !value || !device) {
        return ENTITY_ERROR_INVALID_PARAM;
    }
    
    if (strlen(entity_id) >= 16) {
        return ENTITY_ERROR_INVALID_PARAM;
    }
    
    // Find entity
    entity_t *entity = find_entity(entity_id, device);
    if (!entity) {
        return ENTITY_ERROR_NOT_FOUND;
    }
    
    // Continue with operation...
    return ENTITY_OK;
}
```

#### Pattern 2: Check Buffer Sizes

```c
int entity_describe(char *buf, size_t buf_len, device_model_t *device) {
    if (!buf || buf_len == 0 || !device) {
        return ENTITY_ERROR_INVALID_PARAM;
    }
    
    size_t required = estimate_description_size(device);
    if (required > buf_len) {
        return ENTITY_ERROR_BUFFER_TOO_SMALL;
    }
    
    // Safe to write...
    return ENTITY_OK;
}
```

#### Pattern 3: Handle Entity Count Overflow

```c
int device_add_entity(device_model_t *device, void *entity, entity_type_t type) {
    if (!device || !entity) {
        return ENTITY_ERROR_INVALID_PARAM;
    }
    
    if (device->entity_count >= MAX_ENTITIES) {
        ESP_LOGE(TAG, "Cannot add entity: maximum %d entities reached", MAX_ENTITIES);
        return ENTITY_ERROR_BUFFER_TOO_SMALL;
    }
    
    device->entities[device->entity_count] = entity;
    device->entity_types[device->entity_count] = type;
    device->entity_count++;
    
    return ENTITY_OK;
}
```

#### Pattern 4: Validate Value Ranges

```c
int light_set_brightness(entity_light_t *light, uint8_t brightness) {
    if (!light) {
        return ENTITY_ERROR_INVALID_PARAM;
    }
    
    if (brightness > 100) {
        ESP_LOGW(TAG, "Brightness %d clamped to 100", brightness);
        brightness = 100;
    }
    
    if (brightness < light->min_brightness) {
        brightness = light->min_brightness;
    }
    
    if (brightness > light->max_brightness) {
        brightness = light->max_brightness;
    }
    
    light->brightness = brightness;
    return ENTITY_OK;
}
```

### Error Logging

Use ESP-IDF logging macros:

```c
#include "esp_log.h"

static const char *TAG = "entity_model";

// In functions:
ESP_LOGE(TAG, "Failed to add entity: %s", error_message);
ESP_LOGW(TAG, "Brightness value %d out of range, clamping", value);
ESP_LOGI(TAG, "Entity %s added successfully", entity_id);
ESP_LOGD(TAG, "Serializing device with %d entities", device->entity_count);
```

---

## Binary Serialization (CBOR)

### Overview

**CBOR (Concise Binary Object Representation)** is the recommended format for CoAP payloads:
- **RFC 7049** standard
- **30-50% smaller** than JSON
- **Faster parsing** (binary format)
- **Backend converts** to JSON for display/API

### CBOR Library Integration

#### Option 1: TinyCBOR (Recommended)

**Add to `idf_component.yml`:**
```yaml
dependencies:
  tinycbor:
    git: https://github.com/intel/tinycbor.git
    version: "^0.6.0"
```

**Or manual integration:**
```bash
cd components/
git clone https://github.com/intel/tinycbor.git
```

**CMakeLists.txt:**
```cmake
idf_component_register(
    SRCS "entity_cbor.c"
    INCLUDE_DIRS "include"
    REQUIRES tinycbor
)
```

### CBOR Serialization Implementation

See [Code Implementation](#code-implementation) section for complete CBOR serialization code.

---

## JSON Serialization (Legacy / Debugging)

### Complete Device Example

A device with 1 light, 1 temperature sensor, and 1 motion sensor:

```json
{
  "device_id": "living-room-001",
  "device_name": "Living Room Controller",
  "device_type": "multi_sensor",
  "manufacturer": "MyCompany",
  "model": "MS-100",
  "sw_version": "1.0.0",
  "hw_version": "v2.0",
  "mac_address": "0x1234567890ABCDEF",
  
  "network": {
    "ipv6_addr": "fd00::1234:5678:90ab:cdef",
    "rloc16": "0x2800",
    "role": "router"
  },
  
  "entities": [
    {
      "entity_id": "light_1",
      "name": "Ceiling Light",
      "type": "light",
      "device_class": "dimmable",
      "available": true,
      "state": true,
      "brightness": 75,
      "mode": "dimmable",
      "transition_time": 2
    },
    {
      "entity_id": "temp_1",
      "name": "Room Temperature",
      "type": "sensor",
      "device_class": "temperature",
      "available": true,
      "value": 25.3,
      "unit": "°C",
      "update_interval": 30
    },
    {
      "entity_id": "motion_1",
      "name": "Room Motion",
      "type": "binary_sensor",
      "device_class": "motion",
      "available": true,
      "state": false,
      "last_triggered": 1708329600
    }
  ]
}
```

---

## CoAP API Design

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Child registers device for the first time |
| GET | `/device/{id}` | Get complete device model |
| GET | `/device/{id}/entity/{entity_id}` | Get specific entity |
| POST | `/device/{id}/entity/{entity_id}/set` | Control entity |
| POST | `/device/{id}/update` | Child pushes state update |

### Request/Response Examples

#### Register Device

**Request:**
```http
POST /register
Content-Type: application/json

{
  "device_id": "living-room-001",
  "device_name": "Living Room Controller",
  "entities": [...]
}
```

**Response:**
```json
{
  "status": "registered",
  "device_id": "living-room-001"
}
```

#### Control Entity

**Request:**
```http
POST /device/living-room-001/entity/light_1/set
Content-Type: application/json

{
  "state": true,
  "brightness": 80
}
```

**Response:**
```json
{
  "status": "ok",
  "entity_id": "light_1",
  "state": true,
  "brightness": 80
}
```

#### State Update

**Request:**
```http
POST /device/living-room-001/update
Content-Type: application/json

{
  "updates": [
    {
      "entity_id": "temp_1",
      "value": 25.5
    },
    {
      "entity_id": "motion_1",
      "state": true
    }
  ]
}
```

---

## CoAP Payload Format Recommendations

### Overview

CoAP payload format choice depends on:
- **Payload size constraints** (Thread MTU ~ 1280 bytes)
- **Parsing complexity** on embedded devices
- **Memory usage** (RAM constraints on ESP32)
- **Interoperability** with backend systems

### Format Options Comparison

#### Option 1: Text Format (Simple Key-Value)

**Format:**
```
rloc16=0x7c01
ml_eid=fd00:db8:a0:0:xxxx:xxxx:xxxx:xxxx
parent=0x1001
entity_id=light.0 type=on_off_light name=LED
entity_id=sensor.0 type=temperature_sensor name=Temp
```

**Content-Type:** `text/plain` (CoAP option 12 = 0)

**Pros:**
- ✅ **Minimal parsing** - Simple string operations
- ✅ **Small footprint** - No JSON library needed
- ✅ **Low memory** - Can parse incrementally
- ✅ **Fast** - Minimal CPU overhead
- ✅ **Human-readable** - Easy to debug

**Cons:**
- ❌ **Limited structure** - Hard to represent nested data
- ❌ **No type safety** - Values are strings only
- ❌ **Manual parsing** - Error-prone string parsing
- ❌ **Not standard** - Custom format

**Use Case:** 
- Simple device registration with basic entity list
- Small payloads (< 200 bytes)
- Minimal entity information

**Example Size:** ~150 bytes for 3 entities

---

#### Option 2: JSON Format (Structured)

**Format:**
```json
{
  "device_id": "living-room-001",
  "rloc16": "0x7c01",
  "ml_eid": "fd00:db8:a0:0:xxxx:xxxx:xxxx:xxxx",
  "entities": [
    {
      "entity_id": "light.0",
      "type": "on_off_light",
      "name": "LED"
    }
  ]
}
```

**Content-Type:** `application/json` (CoAP option 12 = 50)

**Pros:**
- ✅ **Structured data** - Nested objects and arrays
- ✅ **Type support** - Numbers, booleans, strings
- ✅ **Standard format** - Widely supported
- ✅ **Easy integration** - Backend systems expect JSON
- ✅ **Extensible** - Easy to add fields

**Cons:**
- ❌ **Library overhead** - Need cJSON library (~10-15KB)
- ❌ **Parsing complexity** - More CPU intensive
- ❌ **Memory usage** - Full parse into memory
- ❌ **Larger size** - More verbose than text

**Use Case:**
- Full device model with complete entity details
- Integration with REST APIs / cloud services
- Complex nested structures

**Example Size:** ~300-500 bytes for 3 entities (uncompressed)

---

#### Option 3: CBOR Format (Binary)

**Format:** Binary encoding (RFC 7049)

**Content-Type:** `application/cbor` (CoAP option 12 = 60)

**Pros:**
- ✅ **Smallest size** - 30-50% smaller than JSON
- ✅ **Fast parsing** - Binary format
- ✅ **Type preservation** - Numbers stay as numbers
- ✅ **Standard** - RFC 7049

**Cons:**
- ❌ **Not human-readable** - Requires tools to decode
- ❌ **Library needed** - CBOR library (~5-8KB)
- ❌ **Less common** - Fewer tools support it
- ❌ **Debugging harder** - Can't read raw packets

**Use Case:**
- Bandwidth-constrained networks
- Large payloads (> 500 bytes)
- High-frequency updates

**Example Size:** ~200-350 bytes for 3 entities

---

### Recommendation Matrix

| Use Case | Recommended Format | Reason |
|----------|-------------------|--------|
| **Device Registration** | **CBOR (Binary)** | Compact, fast, backend converts to JSON |
| **Entity State Updates** | **CBOR (Binary)** | Small payloads, frequent updates |
| **Frequent Updates** (>10/sec) | **CBOR (Binary)** | Smallest size, fastest parsing |
| **Backend Integration** | **CBOR → JSON** | Backend converts binary to JSON for display |

---

### Recommended Approach: Binary Format (CBOR)

**Rationale:**
- ✅ **Payload size**: 30-50% smaller than JSON
- ✅ **Parsing speed**: Binary format is faster to parse
- ✅ **Memory efficient**: Less RAM usage on embedded devices
- ✅ **Backend conversion**: Backend converts CBOR → JSON for display/API
- ✅ **Standard format**: RFC 7049, well-supported libraries
- ✅ **No human readability needed**: Backend handles conversion

**Architecture:**
```
ESP Device (Endpoint)
  └─ Serialize to CBOR (binary)
     └─ CoAP POST (binary payload)
        └─ Border Router / Backend
           └─ Parse CBOR → Convert to JSON
              └─ REST API / Dashboard (JSON)
```

#### 1. Device Registration → **CBOR** (Binary)

**When:** Initial registration, full device model
**Why:** Compact binary format, backend converts to JSON
**Size:** ~200-350 bytes (vs 400-500 bytes JSON)

```c
// Content-Format: application/cbor (60)
otCoapMessageAppendContentFormatOption(message, OT_COAP_OPTION_CONTENT_FORMAT_APPLICATION_CBOR);

uint8_t cbor_buffer[512];
size_t cbor_len = serialize_device_cbor(&device, cbor_buffer, sizeof(cbor_buffer));
otMessageAppend(message, cbor_buffer, cbor_len);
```

#### 2. State Updates → **CBOR** (Binary)

**When:** Periodic state updates, entity changes
**Why:** Smallest payload size for frequent updates
**Size:** ~80-150 bytes (vs 150-250 bytes JSON)

```c
// Partial update in CBOR
uint8_t update_buffer[256];
size_t update_len = serialize_updates_cbor(updates, update_buffer, sizeof(update_buffer));
otMessageAppend(message, update_buffer, update_len);
```

#### 3. Simple Queries → **Text** (Optional, for UDP)

**When:** Simple get/set commands via UDP (direct control)
**Why:** Minimal overhead for simple operations
**Size:** Very small (< 100 bytes)

```
get light.0 state
set light.0 brightness 80
```

---

### Implementation Guidelines

#### CBOR Format (Recommended - Binary)

**Library Options for ESP-IDF:**

1. **TinyCBOR** (Recommended)
   - Lightweight (~5-8KB)
   - Pure C implementation
   - ESP-IDF component: `idf_component.yml` or manual integration
   - GitHub: https://github.com/intel/tinycbor

2. **cbor-c** (Alternative)
   - Similar size
   - Well-maintained
   - GitHub: https://github.com/PJK/libcbor

**Content-Format Option:**
```c
// Set Content-Format option for CBOR
otCoapMessageAppendContentFormatOption(
    message, 
    OT_COAP_OPTION_CONTENT_FORMAT_APPLICATION_CBOR  // 60
);
```

**CBOR Serialization Example:**

```c
#include "cbor.h"  // TinyCBOR

int serialize_device_cbor(device_model_t *device, uint8_t *buffer, size_t buffer_size) {
    CborEncoder encoder, map_encoder, entities_array;
    CborError err;
    
    cbor_encoder_init(&encoder, buffer, buffer_size, 0);
    
    // Start main map
    err = cbor_encoder_create_map(&encoder, &map_encoder, CborIndefiniteLength);
    if (err != CborNoError) return -1;
    
    // Device info
    cbor_encode_text_stringz(&map_encoder, "device_id");
    cbor_encode_text_stringz(&map_encoder, device->info.device_id);
    
    cbor_encode_text_stringz(&map_encoder, "device_name");
    cbor_encode_text_stringz(&map_encoder, device->info.device_name);
    
    cbor_encode_text_stringz(&map_encoder, "mac_address");
    cbor_encode_uint(&map_encoder, device->info.mac_address);
    
    // Entities array
    cbor_encode_text_stringz(&map_encoder, "entities");
    err = cbor_encoder_create_array(&map_encoder, &entities_array, device->entity_count);
    if (err != CborNoError) return -1;
    
    for (int i = 0; i < device->entity_count; i++) {
        CborEncoder entity_map;
        err = cbor_encoder_create_map(&entities_array, &entity_map, CborIndefiniteLength);
        if (err != CborNoError) continue;
        
        switch (device->entity_types[i]) {
            case ENTITY_TYPE_LIGHT: {
                entity_light_t *light = (entity_light_t *)device->entities[i];
                
                cbor_encode_text_stringz(&entity_map, "entity_id");
                cbor_encode_text_stringz(&entity_map, light->base.entity_id);
                
                cbor_encode_text_stringz(&entity_map, "type");
                cbor_encode_text_stringz(&entity_map, "light");
                
                cbor_encode_text_stringz(&entity_map, "state");
                cbor_encode_boolean(&entity_map, light->state);
                
                cbor_encode_text_stringz(&entity_map, "brightness");
                cbor_encode_uint(&entity_map, light->brightness);
                
                break;
            }
            case ENTITY_TYPE_SENSOR: {
                entity_sensor_t *sensor = (entity_sensor_t *)device->entities[i];
                
                cbor_encode_text_stringz(&entity_map, "entity_id");
                cbor_encode_text_stringz(&entity_map, sensor->base.entity_id);
                
                cbor_encode_text_stringz(&entity_map, "type");
                cbor_encode_text_stringz(&entity_map, "sensor");
                
                cbor_encode_text_stringz(&entity_map, "value");
                cbor_encode_float(&entity_map, sensor->value);
                
                break;
            }
            // Add other entity types...
        }
        
        cbor_encoder_close_container(&entities_array, &entity_map);
    }
    
    cbor_encoder_close_container(&map_encoder, &entities_array);
    cbor_encoder_close_container(&encoder, &map_encoder);
    
    return cbor_encoder_get_buffer_size(&encoder, buffer);
}
```

**CBOR Parsing (Backend Side):**

Backend can use any CBOR library (Python `cbor2`, Node.js `cbor`, Go `fxamacker/cbor`, etc.):

```python
# Python backend example
import cbor2

def parse_device_cbor(cbor_data):
    device = cbor2.loads(cbor_data)
    # Convert to JSON for API
    json_data = {
        "device_id": device[b"device_id"].decode(),
        "device_name": device[b"device_name"].decode(),
        "entities": [
            {
                "entity_id": e[b"entity_id"].decode(),
                "type": e[b"type"].decode(),
                "state": e.get(b"state", False)
            }
            for e in device[b"entities"]
        ]
    }
    return json_data
```

**Size Comparison Example:**

For a device with 3 entities (light, temp sensor, motion sensor):

| Format | Size | Savings vs JSON |
|--------|------|----------------|
| JSON   | ~450 bytes | - |
| CBOR   | ~280 bytes | **38% smaller** |
| Text   | ~200 bytes | 56% smaller (but limited) |

---

#### JSON Format (Legacy / Debugging Only)

**Note:** JSON format is kept for debugging and development. Production should use CBOR.

**Content-Format Option:**
```c
// Set Content-Format option
otCoapMessageAppendContentFormatOption(
    message, 
    OT_COAP_OPTION_CONTENT_FORMAT_APPLICATION_JSON  // 50
);
```

**Payload Generation:**
```c
// Use serialize_device() function (see JSON Serialization section)
char *json_payload = serialize_device(device);
if (!json_payload) {
    return ESP_FAIL;
}

size_t payload_len = strlen(json_payload);
otMessageAppend(message, json_payload, payload_len);

// Free after sending (or use stack buffer)
free(json_payload);
```

**Payload Parsing (Server Side):**
```c
// Read Content-Format option
uint16_t content_format = 0;
otCoapOptionIterator iterator;
otCoapOptionIteratorInit(&iterator, message);
while (otCoapOptionIteratorGetNextOption(&iterator) == OT_ERROR_NONE) {
    if (iterator.mOption->mNumber == OT_COAP_OPTION_CONTENT_FORMAT) {
        otMessageRead(message, iterator.mOption->mValue, 
                     &content_format, sizeof(content_format));
        break;
    }
}

// Parse based on format
if (content_format == OT_COAP_OPTION_CONTENT_FORMAT_APPLICATION_JSON) {
    // Parse JSON using cJSON
    uint16_t payload_len = otMessageGetLength(message) - otMessageGetOffset(message);
    char *payload = malloc(payload_len + 1);
    otMessageRead(message, otMessageGetOffset(message), payload, payload_len);
    payload[payload_len] = '\0';
    
    device_model_t *device = parse_device_json(payload);
    free(payload);
}
```

#### Text Format (For Simple Operations)

**Content-Format Option:**
```c
otCoapMessageAppendContentFormatOption(
    message,
    OT_COAP_OPTION_CONTENT_FORMAT_TEXT_PLAIN  // 0
);
```

**Payload Format:**
```
device_id=living-room-001
rloc16=0x7c01
entity_id=light.0 type=light name=LED state=on brightness=80
entity_id=sensor.0 type=sensor name=Temp value=25.3 unit=°C
```

**Parsing:**
```c
// Simple line-by-line parsing
char *line = strtok(payload, "\n");
while (line) {
    if (strncmp(line, "entity_id=", 10) == 0) {
        // Parse entity line
        char entity_id[16], type[16], name[32];
        sscanf(line, "entity_id=%15s type=%15s name=%31s", entity_id, type, name);
    }
    line = strtok(NULL, "\n");
}
```

---

### Size Considerations

**CoAP Packet Structure:**
- **CoAP Header:** 4 bytes
- **Token:** 0-8 bytes (typically 0-2 bytes)
- **Options:** ~20-50 bytes (URI path, Content-Format, etc.)
- **Payload Marker:** 1 byte
- **Available for Payload:** ~1200-1250 bytes (Thread MTU 1280)

**Payload Size Estimates:**

| Format | 1 Entity | 3 Entities | 8 Entities |
|--------|----------|------------|-------------|
| Text   | ~80 bytes | ~200 bytes | ~500 bytes |
| JSON   | ~150 bytes | ~400 bytes | ~1000 bytes |
| CBOR   | ~100 bytes | ~280 bytes | ~700 bytes |

**Recommendation:** 
- ✅ Use **CBOR (Binary)** for all CoAP operations
- ✅ Backend converts CBOR → JSON for display/API
- ✅ Size savings: 30-50% smaller than JSON
- ✅ Faster parsing on both device and backend

---

### Content-Format Option Values

```c
// Common CoAP Content-Format values
#define OT_COAP_OPTION_CONTENT_FORMAT_TEXT_PLAIN           0
#define OT_COAP_OPTION_CONTENT_FORMAT_APPLICATION_JSON     50
#define OT_COAP_OPTION_CONTENT_FORMAT_APPLICATION_CBOR     60
#define OT_COAP_OPTION_CONTENT_FORMAT_APPLICATION_CBOR_SEQ 61
```

---

## Code Implementation

### CBOR Binary Serialization (Recommended)

Complete implementation using TinyCBOR library:

```c
#include "cbor.h"
#include "esp_log.h"

static const char *TAG = "entity_cbor";

/**
 * Serialize device model to CBOR binary format.
 * Returns number of bytes written, or -1 on error.
 */
int serialize_device_cbor(device_model_t *device, uint8_t *buffer, size_t buffer_size) {
    if (!device || !buffer || buffer_size == 0) {
        ESP_LOGE(TAG, "Invalid parameters");
        return -1;
    }
    
    CborEncoder encoder, map_encoder, entities_array, network_map;
    CborError err;
    
    cbor_encoder_init(&encoder, buffer, buffer_size, 0);
    
    // Start main map (indefinite length for flexibility)
    err = cbor_encoder_create_map(&encoder, &map_encoder, CborIndefiniteLength);
    if (err != CborNoError) {
        ESP_LOGE(TAG, "Failed to create map: %d", err);
        return -1;
    }
    
    // Device info fields
    cbor_encode_text_stringz(&map_encoder, "device_id");
    cbor_encode_text_stringz(&map_encoder, device->info.device_id);
    
    cbor_encode_text_stringz(&map_encoder, "device_name");
    cbor_encode_text_stringz(&map_encoder, device->info.device_name);
    
    cbor_encode_text_stringz(&map_encoder, "device_type");
    cbor_encode_text_stringz(&map_encoder, device->info.device_type);
    
    cbor_encode_text_stringz(&map_encoder, "manufacturer");
    cbor_encode_text_stringz(&map_encoder, device->info.manufacturer);
    
    cbor_encode_text_stringz(&map_encoder, "model");
    cbor_encode_text_stringz(&map_encoder, device->info.model);
    
    cbor_encode_text_stringz(&map_encoder, "sw_version");
    cbor_encode_text_stringz(&map_encoder, device->info.sw_version);
    
    cbor_encode_text_stringz(&map_encoder, "hw_version");
    cbor_encode_text_stringz(&map_encoder, device->info.hw_version);
    
    cbor_encode_text_stringz(&map_encoder, "mac_address");
    cbor_encode_uint(&map_encoder, device->info.mac_address);
    
    // Network info (nested map)
    cbor_encode_text_stringz(&map_encoder, "network");
    err = cbor_encoder_create_map(&map_encoder, &network_map, 3);
    if (err != CborNoError) {
        ESP_LOGE(TAG, "Failed to create network map");
        return -1;
    }
    
    cbor_encode_text_stringz(&network_map, "rloc16");
    cbor_encode_uint(&network_map, device->rloc16);
    
    cbor_encode_text_stringz(&network_map, "role");
    const char *role_str = (device->role == 1) ? "leader" : 
                          (device->role == 2) ? "router" : "child";
    cbor_encode_text_stringz(&network_map, role_str);
    
    // IPv6 address as byte array
    cbor_encode_text_stringz(&network_map, "ipv6_addr");
    cbor_encode_byte_string(&network_map, device->ipv6_addr, 16);
    
    cbor_encoder_close_container(&map_encoder, &network_map);
    
    // Entities array
    cbor_encode_text_stringz(&map_encoder, "entities");
    err = cbor_encoder_create_array(&map_encoder, &entities_array, device->entity_count);
    if (err != CborNoError) {
        ESP_LOGE(TAG, "Failed to create entities array");
        return -1;
    }
    
    for (int i = 0; i < device->entity_count; i++) {
        if (!device->entities[i]) continue;
        
        CborEncoder entity_map;
        err = cbor_encoder_create_map(&entities_array, &entity_map, CborIndefiniteLength);
        if (err != CborNoError) continue;
        
        switch (device->entity_types[i]) {
            case ENTITY_TYPE_LIGHT: {
                entity_light_t *light = (entity_light_t *)device->entities[i];
                
                cbor_encode_text_stringz(&entity_map, "entity_id");
                cbor_encode_text_stringz(&entity_map, light->base.entity_id);
                
                cbor_encode_text_stringz(&entity_map, "name");
                cbor_encode_text_stringz(&entity_map, light->base.name);
                
                cbor_encode_text_stringz(&entity_map, "type");
                cbor_encode_text_stringz(&entity_map, "light");
                
                cbor_encode_text_stringz(&entity_map, "device_class");
                cbor_encode_text_stringz(&entity_map, light->base.device_class);
                
                cbor_encode_text_stringz(&entity_map, "available");
                cbor_encode_boolean(&entity_map, light->base.available);
                
                cbor_encode_text_stringz(&entity_map, "last_update");
                cbor_encode_uint(&entity_map, light->base.last_update);
                
                cbor_encode_text_stringz(&entity_map, "state");
                cbor_encode_boolean(&entity_map, light->state);
                
                cbor_encode_text_stringz(&entity_map, "brightness");
                cbor_encode_uint(&entity_map, light->brightness);
                
                cbor_encode_text_stringz(&entity_map, "mode");
                const char *mode_str = "on_off";
                switch (light->mode) {
                    case LIGHT_MODE_DIMMABLE: mode_str = "dimmable"; break;
                    case LIGHT_MODE_RGB: mode_str = "rgb"; break;
                    case LIGHT_MODE_RGBW: mode_str = "rgbw"; break;
                    case LIGHT_MODE_CCT: mode_str = "cct"; break;
                }
                cbor_encode_text_stringz(&entity_map, mode_str);
                
                if (light->mode == LIGHT_MODE_RGB || light->mode == LIGHT_MODE_RGBW) {
                    cbor_encode_text_stringz(&entity_map, "rgb");
                    cbor_encoder_create_array(&entity_map, &rgb_array, 3);
                    cbor_encode_uint(&rgb_array, light->rgb[0]);
                    cbor_encode_uint(&rgb_array, light->rgb[1]);
                    cbor_encode_uint(&rgb_array, light->rgb[2]);
                    cbor_encoder_close_container(&entity_map, &rgb_array);
                }
                
                if (light->mode == LIGHT_MODE_CCT) {
                    cbor_encode_text_stringz(&entity_map, "color_temp");
                    cbor_encode_uint(&entity_map, light->color_temp);
                }
                
                break;
            }
            
            case ENTITY_TYPE_SENSOR: {
                entity_sensor_t *sensor = (entity_sensor_t *)device->entities[i];
                
                cbor_encode_text_stringz(&entity_map, "entity_id");
                cbor_encode_text_stringz(&entity_map, sensor->base.entity_id);
                
                cbor_encode_text_stringz(&entity_map, "name");
                cbor_encode_text_stringz(&entity_map, sensor->base.name);
                
                cbor_encode_text_stringz(&entity_map, "type");
                cbor_encode_text_stringz(&entity_map, "sensor");
                
                cbor_encode_text_stringz(&entity_map, "device_class");
                cbor_encode_text_stringz(&entity_map, sensor->base.device_class);
                
                cbor_encode_text_stringz(&entity_map, "available");
                cbor_encode_boolean(&entity_map, sensor->base.available);
                
                cbor_encode_text_stringz(&entity_map, "value");
                cbor_encode_float(&entity_map, sensor->value);
                
                cbor_encode_text_stringz(&entity_map, "unit");
                cbor_encode_text_stringz(&entity_map, sensor->unit);
                
                break;
            }
            
            // Add other entity types (switch, fan, climate, binary_sensor)...
        }
        
        cbor_encoder_close_container(&entities_array, &entity_map);
    }
    
    cbor_encoder_close_container(&map_encoder, &entities_array);
    cbor_encoder_close_container(&encoder, &map_encoder);
    
    size_t encoded_size = cbor_encoder_get_buffer_size(&encoder, buffer);
    ESP_LOGI(TAG, "CBOR encoded %d bytes", encoded_size);
    
    return encoded_size;
}

/**
 * Serialize partial updates (only changed fields) to CBOR.
 * More efficient for frequent state updates.
 */
int serialize_updates_cbor(entity_update_t *updates, int count, 
                           uint8_t *buffer, size_t buffer_size) {
    CborEncoder encoder, array_encoder;
    cbor_encoder_init(&encoder, buffer, buffer_size, 0);
    
    cbor_encoder_create_array(&encoder, &array_encoder, count);
    
    for (int i = 0; i < count; i++) {
        CborEncoder update_map;
        cbor_encoder_create_map(&array_encoder, &update_map, CborIndefiniteLength);
        
        cbor_encode_text_stringz(&update_map, "entity_id");
        cbor_encode_text_stringz(&update_map, updates[i].entity_id);
        
        // Add changed fields only
        if (updates[i].has_state) {
            cbor_encode_text_stringz(&update_map, "state");
            cbor_encode_boolean(&update_map, updates[i].state);
        }
        
        if (updates[i].has_value) {
            cbor_encode_text_stringz(&update_map, "value");
            cbor_encode_float(&update_map, updates[i].value);
        }
        
        cbor_encoder_close_container(&array_encoder, &update_map);
    }
    
    cbor_encoder_close_container(&encoder, &array_encoder);
    
    return cbor_encoder_get_buffer_size(&encoder, buffer);
}
```

**Usage in CoAP:**

```c
#include "openthread/coap.h"

void send_device_registration(device_model_t *device) {
    otInstance *instance = esp_openthread_get_instance();
    otMessage *message = otCoapNewMessage(instance, NULL);
    
    if (!message) return;
    
    otCoapMessageInit(message, OT_COAP_TYPE_CONFIRMABLE, OT_COAP_CODE_POST);
    
    // Add URI path
    otCoapMessageAppendUriPathOptions(message, "devices");
    otCoapMessageAppendUriPathOptions(message, "register");
    
    // Set Content-Format: application/cbor (60)
    otCoapMessageAppendContentFormatOption(message, 60);
    
    // Serialize to CBOR
    uint8_t cbor_buffer[512];
    int cbor_len = serialize_device_cbor(device, cbor_buffer, sizeof(cbor_buffer));
    
    if (cbor_len > 0) {
        otCoapMessageSetPayloadMarker(message);
        otMessageAppend(message, cbor_buffer, cbor_len);
        
        // Send to Leader (RLOC 0x0000)
        otMessageInfo message_info;
        memset(&message_info, 0, sizeof(message_info));
        message_info.mPeerAddr.mFields.m16[0] = 0x0000; // Leader RLOC
        
        otCoapSendRequest(instance, message, &message_info, NULL, NULL);
    }
}
```

---

### Creating a Device Model

Example with error handling and validation:

```c
#include "esp_log.h"

static const char *TAG = "device_model";

device_model_t* create_light_controller(void) {
    device_model_t *device = malloc(sizeof(device_model_t));
    if (!device) {
        ESP_LOGE(TAG, "Failed to allocate device model");
        return NULL;
    }
    memset(device, 0, sizeof(device_model_t));
    
    // Device info
    strncpy(device->info.device_id, "living-room-001", sizeof(device->info.device_id) - 1);
    strncpy(device->info.device_name, "Living Room Controller", sizeof(device->info.device_name) - 1);
    strncpy(device->info.device_type, "light_controller", sizeof(device->info.device_type) - 1);
    strncpy(device->info.manufacturer, "MyCompany", sizeof(device->info.manufacturer) - 1);
    strncpy(device->info.model, "LC-100", sizeof(device->info.model) - 1);
    strncpy(device->info.sw_version, "1.0.0", sizeof(device->info.sw_version) - 1);
    strncpy(device->info.hw_version, "v2.0", sizeof(device->info.hw_version) - 1);
    device->info.mac_address = 0x1234567890ABCDEFULL;
    
    // Entity 1: Dimmable light
    entity_light_t *light = malloc(sizeof(entity_light_t));
    if (!light) {
        ESP_LOGE(TAG, "Failed to allocate light entity");
        free(device);
        return NULL;
    }
    memset(light, 0, sizeof(entity_light_t));
    
    strncpy(light->base.entity_id, "light_1", sizeof(light->base.entity_id) - 1);
    strncpy(light->base.name, "Ceiling Light", sizeof(light->base.name) - 1);
    light->base.type = ENTITY_TYPE_LIGHT;
    strncpy(light->base.device_class, "dimmable", sizeof(light->base.device_class) - 1);
    light->base.available = true;
    light->base.last_update = esp_timer_get_time() / 1000000; // Unix timestamp
    
    light->state = false;
    light->brightness = 100;
    light->mode = LIGHT_MODE_DIMMABLE;
    light->min_brightness = 1;
    light->max_brightness = 100;
    light->transition_time = 2;
    
    device->entities[0] = light;
    device->entity_types[0] = ENTITY_TYPE_LIGHT;
    device->entity_count = 1;
    
    ESP_LOGI(TAG, "Created device model with %d entities", device->entity_count);
    
    return device;
}
```

### Serializing to JSON

Complete implementation with all entity types and error handling:

```c
#include "cJSON.h"
#include "esp_log.h"

static const char *TAG = "entity_serialize";

static const char* light_mode_to_string(light_mode_t mode) {
    switch (mode) {
        case LIGHT_MODE_ON_OFF: return "on_off";
        case LIGHT_MODE_DIMMABLE: return "dimmable";
        case LIGHT_MODE_RGB: return "rgb";
        case LIGHT_MODE_RGBW: return "rgbw";
        case LIGHT_MODE_CCT: return "cct";
        default: return "unknown";
    }
}

static const char* fan_mode_to_string(fan_mode_t mode) {
    switch (mode) {
        case FAN_MODE_OFF: return "off";
        case FAN_MODE_LOW: return "low";
        case FAN_MODE_MEDIUM: return "medium";
        case FAN_MODE_HIGH: return "high";
        case FAN_MODE_AUTO: return "auto";
        default: return "unknown";
    }
}

static const char* climate_mode_to_string(climate_mode_t mode) {
    switch (mode) {
        case CLIMATE_MODE_OFF: return "off";
        case CLIMATE_MODE_AUTO: return "auto";
        case CLIMATE_MODE_COOL: return "cool";
        case CLIMATE_MODE_HEAT: return "heat";
        case CLIMATE_MODE_DRY: return "dry";
        case CLIMATE_MODE_FAN_ONLY: return "fan_only";
        default: return "unknown";
    }
}

static const char* climate_fan_speed_to_string(climate_fan_speed_t speed) {
    switch (speed) {
        case FAN_SPEED_AUTO: return "auto";
        case FAN_SPEED_LOW: return "low";
        case FAN_SPEED_MEDIUM: return "medium";
        case FAN_SPEED_HIGH: return "high";
        default: return "unknown";
    }
}

static cJSON* serialize_light(entity_light_t *light) {
    cJSON *entity = cJSON_CreateObject();
    cJSON_AddStringToObject(entity, "entity_id", light->base.entity_id);
    cJSON_AddStringToObject(entity, "name", light->base.name);
    cJSON_AddStringToObject(entity, "type", "light");
    cJSON_AddStringToObject(entity, "device_class", light->base.device_class);
    cJSON_AddBoolToObject(entity, "available", light->base.available);
    cJSON_AddNumberToObject(entity, "last_update", light->base.last_update);
    cJSON_AddBoolToObject(entity, "state", light->state);
    cJSON_AddNumberToObject(entity, "brightness", light->brightness);
    cJSON_AddStringToObject(entity, "mode", light_mode_to_string(light->mode));
    cJSON_AddNumberToObject(entity, "min_brightness", light->min_brightness);
    cJSON_AddNumberToObject(entity, "max_brightness", light->max_brightness);
    
    if (light->mode == LIGHT_MODE_RGB || light->mode == LIGHT_MODE_RGBW) {
        cJSON *rgb = cJSON_CreateArray();
        cJSON_AddItemToArray(rgb, cJSON_CreateNumber(light->rgb[0]));
        cJSON_AddItemToArray(rgb, cJSON_CreateNumber(light->rgb[1]));
        cJSON_AddItemToArray(rgb, cJSON_CreateNumber(light->rgb[2]));
        cJSON_AddItemToObject(entity, "rgb", rgb);
    }
    
    if (light->mode == LIGHT_MODE_CCT) {
        cJSON_AddNumberToObject(entity, "color_temp", light->color_temp);
        cJSON_AddNumberToObject(entity, "min_color_temp", light->min_color_temp);
        cJSON_AddNumberToObject(entity, "max_color_temp", light->max_color_temp);
    }
    
    if (strlen(light->effect) > 0) {
        cJSON_AddStringToObject(entity, "effect", light->effect);
    }
    cJSON_AddNumberToObject(entity, "transition_time", light->transition_time);
    
    return entity;
}

static cJSON* serialize_switch(entity_switch_t *sw) {
    cJSON *entity = cJSON_CreateObject();
    cJSON_AddStringToObject(entity, "entity_id", sw->base.entity_id);
    cJSON_AddStringToObject(entity, "name", sw->base.name);
    cJSON_AddStringToObject(entity, "type", "switch");
    cJSON_AddStringToObject(entity, "device_class", sw->base.device_class);
    cJSON_AddBoolToObject(entity, "available", sw->base.available);
    cJSON_AddNumberToObject(entity, "last_update", sw->base.last_update);
    
    if (sw->type == SWITCH_TYPE_TOGGLE) {
        cJSON_AddBoolToObject(entity, "state", sw->state);
    } else if (sw->type == SWITCH_TYPE_PUSH) {
        cJSON_AddBoolToObject(entity, "pressed", sw->pressed);
    } else if (sw->type == SWITCH_TYPE_MULTI_GANG) {
        cJSON_AddNumberToObject(entity, "gang_count", sw->gang_count);
        cJSON *gang_states = cJSON_CreateArray();
        for (int i = 0; i < sw->gang_count; i++) {
            cJSON_AddItemToArray(gang_states, cJSON_CreateNumber(sw->gang_states[i]));
        }
        cJSON_AddItemToObject(entity, "gang_states", gang_states);
        cJSON_AddBoolToObject(entity, "interlock", sw->interlock);
    }
    
    return entity;
}

static cJSON* serialize_fan(entity_fan_t *fan) {
    cJSON *entity = cJSON_CreateObject();
    cJSON_AddStringToObject(entity, "entity_id", fan->base.entity_id);
    cJSON_AddStringToObject(entity, "name", fan->base.name);
    cJSON_AddStringToObject(entity, "type", "fan");
    cJSON_AddStringToObject(entity, "device_class", fan->base.device_class);
    cJSON_AddBoolToObject(entity, "available", fan->base.available);
    cJSON_AddNumberToObject(entity, "last_update", fan->base.last_update);
    cJSON_AddBoolToObject(entity, "state", fan->state);
    cJSON_AddNumberToObject(entity, "speed", fan->speed);
    cJSON_AddStringToObject(entity, "mode", fan_mode_to_string(fan->mode));
    cJSON_AddNumberToObject(entity, "speed_levels", fan->speed_levels);
    cJSON_AddBoolToObject(entity, "oscillation", fan->oscillation);
    cJSON_AddBoolToObject(entity, "supports_oscillation", fan->supports_oscillation);
    cJSON_AddBoolToObject(entity, "supports_direction", fan->supports_direction);
    
    if (fan->supports_direction) {
        cJSON_AddNumberToObject(entity, "direction", fan->direction);
    }
    
    if (fan->supports_timer) {
        cJSON_AddBoolToObject(entity, "supports_timer", true);
        cJSON_AddNumberToObject(entity, "timer_remaining", fan->timer_remaining);
    }
    
    return entity;
}

static cJSON* serialize_sensor(entity_sensor_t *sensor) {
    cJSON *entity = cJSON_CreateObject();
    cJSON_AddStringToObject(entity, "entity_id", sensor->base.entity_id);
    cJSON_AddStringToObject(entity, "name", sensor->base.name);
    cJSON_AddStringToObject(entity, "type", "sensor");
    cJSON_AddStringToObject(entity, "device_class", sensor->base.device_class);
    cJSON_AddBoolToObject(entity, "available", sensor->base.available);
    cJSON_AddNumberToObject(entity, "last_update", sensor->base.last_update);
    cJSON_AddNumberToObject(entity, "value", sensor->value);
    cJSON_AddStringToObject(entity, "unit", sensor->unit);
    cJSON_AddNumberToObject(entity, "accuracy", sensor->accuracy);
    cJSON_AddNumberToObject(entity, "update_interval", sensor->update_interval);
    
    // Optional statistics
    if (sensor->min_value != 0.0 || sensor->max_value != 0.0) {
        cJSON_AddNumberToObject(entity, "min_value", sensor->min_value);
        cJSON_AddNumberToObject(entity, "max_value", sensor->max_value);
        cJSON_AddNumberToObject(entity, "avg_value", sensor->avg_value);
    }
    
    return entity;
}

static cJSON* serialize_climate(entity_climate_t *climate) {
    cJSON *entity = cJSON_CreateObject();
    cJSON_AddStringToObject(entity, "entity_id", climate->base.entity_id);
    cJSON_AddStringToObject(entity, "name", climate->base.name);
    cJSON_AddStringToObject(entity, "type", "climate");
    cJSON_AddStringToObject(entity, "device_class", climate->base.device_class);
    cJSON_AddBoolToObject(entity, "available", climate->base.available);
    cJSON_AddNumberToObject(entity, "last_update", climate->base.last_update);
    cJSON_AddStringToObject(entity, "mode", climate_mode_to_string(climate->mode));
    cJSON_AddNumberToObject(entity, "current_temp", climate->current_temp);
    cJSON_AddNumberToObject(entity, "target_temp", climate->target_temp);
    cJSON_AddNumberToObject(entity, "current_humidity", climate->current_humidity);
    cJSON_AddStringToObject(entity, "fan_speed", climate_fan_speed_to_string(climate->fan_speed));
    cJSON_AddBoolToObject(entity, "swing", climate->swing);
    cJSON_AddBoolToObject(entity, "eco_mode", climate->eco_mode);
    cJSON_AddBoolToObject(entity, "turbo_mode", climate->turbo_mode);
    cJSON_AddNumberToObject(entity, "min_temp", climate->min_temp);
    cJSON_AddNumberToObject(entity, "max_temp", climate->max_temp);
    cJSON_AddBoolToObject(entity, "supports_heat", climate->supports_heat);
    cJSON_AddBoolToObject(entity, "supports_cool", climate->supports_cool);
    cJSON_AddBoolToObject(entity, "supports_dry", climate->supports_dry);
    cJSON_AddBoolToObject(entity, "supports_swing", climate->supports_swing);
    
    return entity;
}

static cJSON* serialize_binary_sensor(entity_binary_sensor_t *bs) {
    cJSON *entity = cJSON_CreateObject();
    cJSON_AddStringToObject(entity, "entity_id", bs->base.entity_id);
    cJSON_AddStringToObject(entity, "name", bs->base.name);
    cJSON_AddStringToObject(entity, "type", "binary_sensor");
    cJSON_AddStringToObject(entity, "device_class", bs->base.device_class);
    cJSON_AddBoolToObject(entity, "available", bs->base.available);
    cJSON_AddNumberToObject(entity, "last_update", bs->base.last_update);
    cJSON_AddBoolToObject(entity, "state", bs->state);
    cJSON_AddNumberToObject(entity, "last_triggered", bs->last_triggered);
    cJSON_AddNumberToObject(entity, "trigger_count", bs->trigger_count);
    cJSON_AddNumberToObject(entity, "debounce_time", bs->debounce_time);
    
    return entity;
}

char* serialize_device(device_model_t *device) {
    if (!device) {
        ESP_LOGE(TAG, "Invalid device parameter");
        return NULL;
    }
    
    cJSON *root = cJSON_CreateObject();
    if (!root) {
        ESP_LOGE(TAG, "Failed to create JSON root");
        return NULL;
    }
    
    // Device info
    cJSON_AddStringToObject(root, "device_id", device->info.device_id);
    cJSON_AddStringToObject(root, "device_name", device->info.device_name);
    cJSON_AddStringToObject(root, "device_type", device->info.device_type);
    cJSON_AddStringToObject(root, "manufacturer", device->info.manufacturer);
    cJSON_AddStringToObject(root, "model", device->info.model);
    cJSON_AddStringToObject(root, "sw_version", device->info.sw_version);
    cJSON_AddStringToObject(root, "hw_version", device->info.hw_version);
    
    // MAC address as hex string
    char mac_str[19];
    snprintf(mac_str, sizeof(mac_str), "0x%016llX", (unsigned long long)device->info.mac_address);
    cJSON_AddStringToObject(root, "mac_address", mac_str);
    
    // Network info
    cJSON *network = cJSON_CreateObject();
    char ipv6_str[40];
    snprintf(ipv6_str, sizeof(ipv6_str), "%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x:%02x%02x",
             device->ipv6_addr[0], device->ipv6_addr[1], device->ipv6_addr[2], device->ipv6_addr[3],
             device->ipv6_addr[4], device->ipv6_addr[5], device->ipv6_addr[6], device->ipv6_addr[7],
             device->ipv6_addr[8], device->ipv6_addr[9], device->ipv6_addr[10], device->ipv6_addr[11],
             device->ipv6_addr[12], device->ipv6_addr[13], device->ipv6_addr[14], device->ipv6_addr[15]);
    cJSON_AddStringToObject(network, "ipv6_addr", ipv6_str);
    
    char rloc_str[7];
    snprintf(rloc_str, sizeof(rloc_str), "0x%04X", device->rloc16);
    cJSON_AddStringToObject(network, "rloc16", rloc_str);
    
    const char *role_str = (device->role == 1) ? "leader" : 
                          (device->role == 2) ? "router" : "child";
    cJSON_AddStringToObject(network, "role", role_str);
    cJSON_AddItemToObject(root, "network", network);
    
    // Entities array
    cJSON *entities = cJSON_CreateArray();
    if (!entities) {
        ESP_LOGE(TAG, "Failed to create entities array");
        cJSON_Delete(root);
        return NULL;
    }
    
    for (int i = 0; i < device->entity_count; i++) {
        if (!device->entities[i]) {
            ESP_LOGW(TAG, "Entity %d is NULL, skipping", i);
            continue;
        }
        
        cJSON *entity = NULL;
        
        switch (device->entity_types[i]) {
            case ENTITY_TYPE_LIGHT:
                entity = serialize_light((entity_light_t *)device->entities[i]);
                break;
                
            case ENTITY_TYPE_SWITCH:
                entity = serialize_switch((entity_switch_t *)device->entities[i]);
                break;
                
            case ENTITY_TYPE_FAN:
                entity = serialize_fan((entity_fan_t *)device->entities[i]);
                break;
                
            case ENTITY_TYPE_SENSOR:
                entity = serialize_sensor((entity_sensor_t *)device->entities[i]);
                break;
                
            case ENTITY_TYPE_CLIMATE:
                entity = serialize_climate((entity_climate_t *)device->entities[i]);
                break;
                
            case ENTITY_TYPE_BINARY_SENSOR:
                entity = serialize_binary_sensor((entity_binary_sensor_t *)device->entities[i]);
                break;
                
            default:
                ESP_LOGW(TAG, "Unknown entity type %d", device->entity_types[i]);
                continue;
        }
        
        if (entity) {
            cJSON_AddItemToArray(entities, entity);
        }
    }
    
    cJSON_AddItemToObject(root, "entities", entities);
    
    char *json_str = cJSON_PrintUnformatted(root);
    cJSON_Delete(root);
    
    if (!json_str) {
        ESP_LOGE(TAG, "Failed to print JSON");
        return NULL;
    }
    
    return json_str;
}
```

### Parsing JSON to Device Model

Complete implementation with error handling and validation:

```c
#include "cJSON.h"
#include "esp_log.h"

static const char *TAG = "entity_parse";

static int parse_light(cJSON *entity_json, entity_light_t **light_out) {
    cJSON *item;
    entity_light_t *light = malloc(sizeof(entity_light_t));
    if (!light) {
        ESP_LOGE(TAG, "Failed to allocate light entity");
        return -1;
    }
    memset(light, 0, sizeof(entity_light_t));
    
    // Base fields
    item = cJSON_GetObjectItem(entity_json, "entity_id");
    if (!item || !cJSON_IsString(item)) {
        ESP_LOGE(TAG, "Missing or invalid entity_id");
        free(light);
        return -1;
    }
    strncpy(light->base.entity_id, item->valuestring, sizeof(light->base.entity_id) - 1);
    
    item = cJSON_GetObjectItem(entity_json, "name");
    if (item && cJSON_IsString(item)) {
        strncpy(light->base.name, item->valuestring, sizeof(light->base.name) - 1);
    }
    
    light->base.type = ENTITY_TYPE_LIGHT;
    
    item = cJSON_GetObjectItem(entity_json, "device_class");
    if (item && cJSON_IsString(item)) {
        strncpy(light->base.device_class, item->valuestring, sizeof(light->base.device_class) - 1);
    }
    
    item = cJSON_GetObjectItem(entity_json, "available");
    light->base.available = cJSON_IsTrue(item);
    
    // Light-specific fields
    item = cJSON_GetObjectItem(entity_json, "state");
    light->state = cJSON_IsTrue(item);
    
    item = cJSON_GetObjectItem(entity_json, "brightness");
    if (item && cJSON_IsNumber(item)) {
        int brightness = item->valueint;
        light->brightness = (brightness < 0) ? 0 : (brightness > 100) ? 100 : brightness;
    }
    
    item = cJSON_GetObjectItem(entity_json, "mode");
    if (item && cJSON_IsString(item)) {
        const char *mode_str = item->valuestring;
        if (strcmp(mode_str, "dimmable") == 0) {
            light->mode = LIGHT_MODE_DIMMABLE;
        } else if (strcmp(mode_str, "rgb") == 0) {
            light->mode = LIGHT_MODE_RGB;
        } else if (strcmp(mode_str, "rgbw") == 0) {
            light->mode = LIGHT_MODE_RGBW;
        } else if (strcmp(mode_str, "cct") == 0) {
            light->mode = LIGHT_MODE_CCT;
        } else {
            light->mode = LIGHT_MODE_ON_OFF;
        }
    }
    
    // RGB array
    item = cJSON_GetObjectItem(entity_json, "rgb");
    if (item && cJSON_IsArray(item)) {
        int size = cJSON_GetArraySize(item);
        if (size >= 3) {
            light->rgb[0] = cJSON_GetArrayItem(item, 0)->valueint;
            light->rgb[1] = cJSON_GetArrayItem(item, 1)->valueint;
            light->rgb[2] = cJSON_GetArrayItem(item, 2)->valueint;
        }
    }
    
    *light_out = light;
    return 0;
}

// Similar functions for other entity types...
// parse_switch(), parse_fan(), parse_sensor(), parse_climate(), parse_binary_sensor()

device_model_t* parse_device_json(const char *json_str) {
    if (!json_str) {
        ESP_LOGE(TAG, "Invalid JSON string");
        return NULL;
    }
    
    cJSON *root = cJSON_Parse(json_str);
    if (!root) {
        ESP_LOGE(TAG, "Failed to parse JSON: %s", cJSON_GetErrorPtr());
        return NULL;
    }
    
    device_model_t *device = malloc(sizeof(device_model_t));
    if (!device) {
        ESP_LOGE(TAG, "Failed to allocate device model");
        cJSON_Delete(root);
        return NULL;
    }
    memset(device, 0, sizeof(device_model_t));
    
    // Parse device info
    cJSON *item = cJSON_GetObjectItem(root, "device_id");
    if (item && cJSON_IsString(item)) {
        strncpy(device->info.device_id, item->valuestring, sizeof(device->info.device_id) - 1);
    }
    
    item = cJSON_GetObjectItem(root, "device_name");
    if (item && cJSON_IsString(item)) {
        strncpy(device->info.device_name, item->valuestring, sizeof(device->info.device_name) - 1);
    }
    
    item = cJSON_GetObjectItem(root, "device_type");
    if (item && cJSON_IsString(item)) {
        strncpy(device->info.device_type, item->valuestring, sizeof(device->info.device_type) - 1);
    }
    
    item = cJSON_GetObjectItem(root, "manufacturer");
    if (item && cJSON_IsString(item)) {
        strncpy(device->info.manufacturer, item->valuestring, sizeof(device->info.manufacturer) - 1);
    }
    
    item = cJSON_GetObjectItem(root, "model");
    if (item && cJSON_IsString(item)) {
        strncpy(device->info.model, item->valuestring, sizeof(device->info.model) - 1);
    }
    
    item = cJSON_GetObjectItem(root, "sw_version");
    if (item && cJSON_IsString(item)) {
        strncpy(device->info.sw_version, item->valuestring, sizeof(device->info.sw_version) - 1);
    }
    
    item = cJSON_GetObjectItem(root, "hw_version");
    if (item && cJSON_IsString(item)) {
        strncpy(device->info.hw_version, item->valuestring, sizeof(device->info.hw_version) - 1);
    }
    
    // Parse MAC address
    item = cJSON_GetObjectItem(root, "mac_address");
    if (item && cJSON_IsString(item)) {
        unsigned long long mac;
        if (sscanf(item->valuestring, "0x%llX", &mac) == 1) {
            device->info.mac_address = (uint64_t)mac;
        }
    }
    
    // Parse network info
    cJSON *network = cJSON_GetObjectItem(root, "network");
    if (network) {
        item = cJSON_GetObjectItem(network, "rloc16");
        if (item && cJSON_IsString(item)) {
            unsigned int rloc;
            if (sscanf(item->valuestring, "0x%X", &rloc) == 1) {
                device->rloc16 = (uint16_t)rloc;
            }
        }
        
        item = cJSON_GetObjectItem(network, "role");
        if (item && cJSON_IsString(item)) {
            if (strcmp(item->valuestring, "leader") == 0) {
                device->role = 1;
            } else if (strcmp(item->valuestring, "router") == 0) {
                device->role = 2;
            } else {
                device->role = 0; // child
            }
        }
    }
    
    // Parse entities
    cJSON *entities = cJSON_GetObjectItem(root, "entities");
    if (entities && cJSON_IsArray(entities)) {
        int count = cJSON_GetArraySize(entities);
        device->entity_count = (count > MAX_ENTITIES) ? MAX_ENTITIES : count;
        
        for (int i = 0; i < device->entity_count; i++) {
            cJSON *entity = cJSON_GetArrayItem(entities, i);
            if (!entity) continue;
            
            cJSON *type = cJSON_GetObjectItem(entity, "type");
            if (!type || !cJSON_IsString(type)) {
                ESP_LOGW(TAG, "Entity %d missing type, skipping", i);
                continue;
            }
            
            const char *type_str = type->valuestring;
            int result = 0;
            
            if (strcmp(type_str, "light") == 0) {
                entity_light_t *light;
                result = parse_light(entity, &light);
                if (result == 0) {
                    device->entities[i] = light;
                    device->entity_types[i] = ENTITY_TYPE_LIGHT;
                }
            } else if (strcmp(type_str, "switch") == 0) {
                // Parse switch...
                // Similar pattern for other types
            }
            // Add other entity types...
            
            if (result != 0) {
                ESP_LOGW(TAG, "Failed to parse entity %d of type %s", i, type_str);
                device->entity_count = i; // Stop here
                break;
            }
        }
    }
    
    cJSON_Delete(root);
    return device;
}

/**
 * Free device model and all allocated entities.
 */
void free_device_model(device_model_t *device) {
    if (!device) return;
    
    for (int i = 0; i < device->entity_count; i++) {
        if (device->entities[i]) {
            free(device->entities[i]);
            device->entities[i] = NULL;
        }
    }
    
    free(device);
}
```

---

## Security Considerations

### Input Validation

- **Always validate** all input parameters before processing
- **Sanitize** entity_id and device_id to prevent injection attacks
- **Validate** JSON structure and types before parsing
- **Check** buffer sizes to prevent buffer overflows

### Network Security

- **Thread Network**: Uses MAC-layer security (AES-128 encryption)
- **CoAP**: Consider CoAP Secure (DTLS) for sensitive operations
- **Authentication**: Implement device authentication for registration
- **Authorization**: Verify device permissions before allowing control commands

### Rate Limiting

Implement rate limiting to prevent:
- **DoS attacks**: Limit requests per device per time window
- **Resource exhaustion**: Limit entity updates frequency
- **Network flooding**: Throttle CoAP registration attempts

Example:

```c
#define MAX_REQUESTS_PER_MINUTE 60
#define MAX_REGISTRATIONS_PER_HOUR 10

typedef struct {
    uint32_t request_count;
    uint32_t last_reset_time;
    uint32_t registration_count;
    uint32_t last_registration_time;
} rate_limiter_t;

int check_rate_limit(rate_limiter_t *limiter, bool is_registration) {
    uint32_t now = esp_timer_get_time() / 1000000; // seconds
    
    if (is_registration) {
        if (now - limiter->last_registration_time > 3600) {
            limiter->registration_count = 0;
            limiter->last_registration_time = now;
        }
        if (limiter->registration_count >= MAX_REGISTRATIONS_PER_HOUR) {
            return -1; // Rate limit exceeded
        }
        limiter->registration_count++;
    } else {
        if (now - limiter->last_reset_time > 60) {
            limiter->request_count = 0;
            limiter->last_reset_time = now;
        }
        if (limiter->request_count >= MAX_REQUESTS_PER_MINUTE) {
            return -1; // Rate limit exceeded
        }
        limiter->request_count++;
    }
    
    return 0;
}
```

### Secure Storage

- **Device credentials**: Store securely (use ESP-IDF NVS encryption)
- **MAC addresses**: Validate against Thread network whitelist
- **Sensitive data**: Encrypt before transmission if needed

### Best Practices

1. **Never trust client input**: Always validate and sanitize
2. **Use const pointers**: Mark read-only parameters as `const`
3. **Bounds checking**: Always check array bounds and buffer sizes
4. **Error messages**: Don't leak sensitive information in error responses
5. **Logging**: Avoid logging sensitive data (passwords, keys)

---

## Examples

### Example 1: Simple Light Controller

```json
{
  "device_id": "bedroom-light-01",
  "device_name": "Bedroom Light",
  "device_type": "light_controller",
  "manufacturer": "MyCompany",
  "model": "LC-100",
  "entities": [
    {
      "entity_id": "light_1",
      "name": "Main Light",
      "type": "light",
      "device_class": "dimmable",
      "state": true,
      "brightness": 60
    }
  ]
}
```

### Example 2: Multi-Sensor Hub

```json
{
  "device_id": "living-room-hub-01",
  "device_name": "Living Room Sensor Hub",
  "device_type": "sensor_hub",
  "manufacturer": "MyCompany",
  "model": "SH-200",
  "entities": [
    {
      "entity_id": "temp_1",
      "name": "Temperature",
      "type": "sensor",
      "device_class": "temperature",
      "value": 24.5,
      "unit": "°C"
    },
    {
      "entity_id": "humidity_1",
      "name": "Humidity",
      "type": "sensor",
      "device_class": "humidity",
      "value": 55.0,
      "unit": "%"
    },
    {
      "entity_id": "motion_1",
      "name": "Motion",
      "type": "binary_sensor",
      "device_class": "motion",
      "state": false
    },
    {
      "entity_id": "pm25_1",
      "name": "PM2.5",
      "type": "sensor",
      "device_class": "pm25",
      "value": 12.5,
      "unit": "µg/m³"
    }
  ]
}
```

### Example 3: Air Conditioner Controller

```json
{
  "device_id": "bedroom-ac-01",
  "device_name": "Bedroom Air Conditioner",
  "device_type": "climate_controller",
  "manufacturer": "MyCompany",
  "model": "AC-300",
  "entities": [
    {
      "entity_id": "ac_1",
      "name": "Main AC",
      "type": "climate",
      "mode": "cool",
      "current_temp": 27.5,
      "target_temp": 24.0,
      "fan_speed": "medium",
      "swing": true,
      "eco_mode": true
    },
    {
      "entity_id": "temp_1",
      "name": "Room Temperature",
      "type": "sensor",
      "device_class": "temperature",
      "value": 27.5,
      "unit": "°C"
    }
  ]
}
```

### Example 4: Smart Switch Panel

```json
{
  "device_id": "living-room-switch-01",
  "device_name": "Living Room Switch Panel",
  "device_type": "switch_controller",
  "manufacturer": "MyCompany",
  "model": "SW-400",
  "entities": [
    {
      "entity_id": "switch_1",
      "name": "3-Gang Switch",
      "type": "switch",
      "device_class": "multi_gang",
      "gang_count": 3,
      "gang_states": [1, 0, 1]
    }
  ]
}
```

---

## Summary

This entity model provides:

- ✅ **Simplicity**: Easy to understand and implement
- ✅ **Flexibility**: Devices can have multiple entity types
- ✅ **Standardization**: Each entity type has a clear structure
- ✅ **Extensibility**: Easy to add new entity types
- ✅ **Compatibility**: JSON format works with both embedded devices and mobile apps
- ✅ **Lightweight**: Suitable for resource-constrained embedded systems

### Recommended Use Cases

- **Light**: Ceiling lights, table lamps, LED strips
- **Switch**: Wall switches, buttons, multi-gang panels
- **Fan**: Ceiling fans, desk fans, exhaust fans
- **Sensor**: Temperature, humidity, air quality, power monitoring
- **Climate**: Air conditioners, heaters, thermostats
- **Binary Sensor**: Motion, door/window, smoke, gas leak detection