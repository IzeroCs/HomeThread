# IoT Entity Model - Cấu trúc Model

Tài liệu này mô tả cấu trúc model dựa trên `IoT_Entity_Model_Specification.md`.

---

## 📐 Tổng quan kiến trúc

```
┌─────────────────────────────────────────────────────────┐
│              device_model_t (Complete Device)           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────────────────────────────────┐     │
│  │         device_info_t (Metadata)              │     │
│  ├──────────────────────────────────────────────┤     │
│  │ • device_id[16]        "living-room-001"     │     │
│  │ • device_name[32]      "Living Room Ctrl"    │     │
│  │ • device_type[16]      "light_controller"     │     │
│  │ • manufacturer[32]     "MyCompany"            │     │
│  │ • model[32]            "LC-100"               │     │
│  │ • sw_version[16]       "1.2.3"               │     │
│  │ • hw_version[16]       "v2.0"                 │     │
│  │ • mac_address (uint64) 0x1234...             │     │
│  └──────────────────────────────────────────────┘     │
│                                                         │
│  ┌──────────────────────────────────────────────┐     │
│  │      Network Info (Thread/IPv6)               │     │
│  ├──────────────────────────────────────────────┤     │
│  │ • ipv6_addr[16]        Thread IPv6 address    │     │
│  │ • rloc16 (uint16)      Thread RLOC16          │     │
│  │ • role (uint8)         Leader/Router/Child    │     │
│  └──────────────────────────────────────────────┘     │
│                                                         │
│  ┌──────────────────────────────────────────────┐     │
│  │      Entities[] (Polymorphic Array)          │     │
│  ├──────────────────────────────────────────────┤     │
│  │ • entities[MAX_ENTITIES]  void* pointers     │     │
│  │ • entity_types[MAX_ENTITIES]  type enum     │     │
│  │ • entity_count (uint8)                       │     │
│  │                                               │     │
│  │  ┌────────────────────────────────────┐     │     │
│  │  │  Entity 0: entity_light_t          │     │     │
│  │  │  ┌──────────────────────────────┐  │     │     │
│  │  │  │ entity_base_t (base)         │  │     │     │
│  │  │  │ • entity_id[16]              │  │     │     │
│  │  │  │ • name[32]                   │  │     │     │
│  │  │  │ • type (enum)                │  │     │     │
│  │  │  │ • device_class[16]           │  │     │     │
│  │  │  │ • available (bool)           │  │     │     │
│  │  │  │ • last_update (uint32)       │  │     │     │
│  │  │  └──────────────────────────────┘  │     │     │
│  │  │  • state (bool)                    │     │     │
│  │  │  • brightness (uint8)             │     │     │
│  │  │  • color_temp (uint16)            │     │     │
│  │  │  • rgb[3] (uint8)                 │     │     │
│  │  │  • mode (light_mode_t)            │     │     │
│  │  └────────────────────────────────────┘     │     │
│  │                                               │     │
│  │  ┌────────────────────────────────────┐     │     │
│  │  │  Entity 1: entity_sensor_t        │     │     │
│  │  │  ┌──────────────────────────────┐  │     │     │
│  │  │  │ entity_base_t (base)         │  │     │     │
│  │  │  └──────────────────────────────┘  │     │     │
│  │  │  • value (float)                   │     │     │
│  │  │  • unit[8]                         │     │     │
│  │  │  • sensor_class (enum)             │     │     │
│  │  │  • min/max/avg_value (float)      │     │     │
│  │  │  • accuracy (float)                │     │     │
│  │  │  • update_interval (uint16)       │     │     │
│  │  └────────────────────────────────────┘     │     │
│  │                                               │     │
│  │  ... (up to MAX_ENTITIES = 8)                │     │
│  └──────────────────────────────────────────────┘     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🏗️ Cấu trúc chi tiết

### 1. Device Info (`device_info_t`)

```c
typedef struct {
    char device_id[16];        // "living-room-001"
    char device_name[32];      // "Living Room Controller"
    char device_type[16];      // "light_controller"
    char manufacturer[32];     // "MyCompany"
    char model[32];            // "LC-100"
    char sw_version[16];       // "1.2.3"
    char hw_version[16];       // "v2.0"
    uint64_t mac_address;      // IEEE EUI-64 (8 bytes)
} device_info_t;
```

**Validation:**
- `device_id`: max 15 chars, format `[a-zA-Z0-9_-]+`
- `device_name`: max 31 chars
- `device_type`: max 15 chars

---

### 2. Entity Base Model (`entity_base_t`)

**Base structure** được kế thừa bởi tất cả entity types:

```c
typedef struct {
    char entity_id[16];        // "light_1" (unique within device)
    char name[32];             // "Living Room Light"
    entity_type_t type;        // ENTITY_TYPE_LIGHT, etc.
    char device_class[16];     // "dimmable", "temperature", etc.
    bool available;            // Online/offline status
    uint32_t last_update;      // Unix timestamp (seconds)
} entity_base_t;
```

**Entity Types Enum:**
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

---

### 3. Entity Types

#### 3.1 Light (`entity_light_t`)

```c
typedef enum {
    LIGHT_MODE_ON_OFF = 0,
    LIGHT_MODE_DIMMABLE,
    LIGHT_MODE_RGB,
    LIGHT_MODE_RGBW,
    LIGHT_MODE_CCT             // Color temperature
} light_mode_t;

typedef struct {
    entity_base_t base;        // Inherited
    
    // State
    bool state;                // on/off
    uint8_t brightness;        // 0-100%
    uint16_t color_temp;       // 2700-6500K
    uint8_t rgb[3];            // R, G, B (0-255)
    
    // Capabilities
    light_mode_t mode;
    uint8_t min_brightness;    // 1-100
    uint8_t max_brightness;    // 1-100
    uint16_t min_color_temp;   // 2700K
    uint16_t max_color_temp;   // 6500K
    
    // Effects
    char effect[16];           // "none", "blink", "rainbow"
    uint8_t transition_time;   // seconds
} entity_light_t;
```

**Validation:**
- `brightness`: 0-100
- `color_temp`: 2700-6500K
- `rgb[]`: 0-255 per channel

---

#### 3.2 Switch (`entity_switch_t`)

```c
typedef enum {
    SWITCH_TYPE_TOGGLE = 0,
    SWITCH_TYPE_PUSH,          // Momentary button
    SWITCH_TYPE_MULTI_GANG     // Multi-gang switch
} switch_type_t;

typedef struct {
    entity_base_t base;
    
    // State
    bool state;                // on/off (toggle)
    bool pressed;              // true when pressed (push)
    uint8_t gang_states[4];    // Multi-gang states
    uint8_t gang_count;        // 1-4
    
    // Config
    switch_type_t type;
    bool momentary;
    bool interlock;            // Only one gang ON
} entity_switch_t;
```

---

#### 3.3 Fan (`entity_fan_t`)

```c
typedef enum {
    FAN_MODE_OFF = 0,
    FAN_MODE_LOW,
    FAN_MODE_MEDIUM,
    FAN_MODE_HIGH,
    FAN_MODE_AUTO
} fan_mode_t;

typedef struct {
    entity_base_t base;
    
    // State
    bool state;                // on/off
    uint8_t speed;             // 0-100% or 0-N levels
    fan_mode_t mode;
    bool oscillation;
    int16_t direction;         // 0-360°
    
    // Capabilities
    uint8_t speed_levels;      // 3, 5, or 100
    bool supports_oscillation;
    bool supports_direction;
    bool supports_timer;
    uint16_t timer_remaining;  // minutes
} entity_fan_t;
```

**Validation:**
- `speed`: 0-100 or 0-N levels
- `direction`: 0-360°

---

#### 3.4 Sensor (`entity_sensor_t`)

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

typedef struct {
    entity_base_t base;
    
    // Value
    float value;               // Current reading
    char unit[8];              // "°C", "%", "ppm", etc.
    sensor_class_t sensor_class;
    
    // Statistics (optional)
    float min_value;           // Last 24h min
    float max_value;           // Last 24h max
    float avg_value;           // Average
    
    // Config
    float accuracy;            // ±0.5°C
    uint16_t update_interval;  // seconds (min 1)
} entity_sensor_t;
```

**Validation:**
- `value`: Float, reasonable range for sensor class
- `update_interval`: Minimum 1 second

---

#### 3.5 Climate (`entity_climate_t`)

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

typedef struct {
    entity_base_t base;
    
    // Current state
    climate_mode_t mode;
    float current_temp;        // °C
    float target_temp;         // °C
    uint8_t current_humidity;  // %
    
    // Control
    climate_fan_speed_t fan_speed;
    bool swing;                // Swing mode
    bool eco_mode;             // Energy saving
    bool turbo_mode;           // Powerful mode
    
    // Capabilities
    float min_temp;            // 16.0°C
    float max_temp;            // 30.0°C
    bool supports_heat;
    bool supports_cool;
    bool supports_dry;
    bool supports_swing;
} entity_climate_t;
```

**Validation:**
- `current_temp`, `target_temp`: Within `min_temp` and `max_temp`
- Typical range: 16.0-30.0°C

---

#### 3.6 Binary Sensor (`entity_binary_sensor_t`)

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

typedef struct {
    entity_base_t base;
    
    // State
    bool state;                // true/false, detected/clear
    binary_sensor_class_t sensor_class;
    
    // Metadata
    uint32_t last_triggered;   // Unix timestamp
    uint16_t trigger_count;    // Last 24h count
    uint16_t debounce_time;    // ms
} entity_binary_sensor_t;
```

---

### 4. Complete Device Model (`device_model_t`)

```c
#define MAX_ENTITIES 8

typedef struct {
    device_info_t info;
    
    // Entities (polymorphic array)
    void *entities[MAX_ENTITIES];      // Pointers to entity structs
    entity_type_t entity_types[MAX_ENTITIES];  // Type for each entity
    uint8_t entity_count;              // Actual count (0 to MAX_ENTITIES)
    
    // Network info
    uint8_t ipv6_addr[16];             // Thread IPv6 address
    uint16_t rloc16;                   // Thread RLOC16
    uint8_t role;                      // 0=Child, 1=Leader, 2=Router
} device_model_t;
```

**Notes:**
- **MAX_ENTITIES**: Fixed at compile time (default: 8)
- **Polymorphic entities**: Use `void*` with type array for type safety
- **Memory**: Can allocate on stack or heap

---

## 📊 Memory Layout Example

### Stack Allocation (Recommended)

```c
// Pre-allocate on stack
entity_light_t light1;
entity_sensor_t temp1;

// Initialize
strcpy(light1.base.entity_id, "light_1");
light1.base.type = ENTITY_TYPE_LIGHT;
light1.state = false;
light1.brightness = 100;

// Add to device
device_model_t device = {0};
device.entities[0] = &light1;
device.entity_types[0] = ENTITY_TYPE_LIGHT;
device.entity_count = 1;
```

### Heap Allocation

```c
entity_light_t *light = malloc(sizeof(entity_light_t));
memset(light, 0, sizeof(entity_light_t));
// ... initialize ...
device.entities[0] = light;
device.entity_types[0] = ENTITY_TYPE_LIGHT;
device.entity_count = 1;
```

---

## 🔄 Serialization Format

### CBOR Binary Format (Recommended)

**Content-Type:** `application/cbor` (60)

**Structure:**
```
Map {
  "device_id": string
  "device_name": string
  "rloc16": uint16
  "ml_eid": string (IPv6)
  "parent": uint16 (optional)
  "entities": Array [
    Map {
      "entity_id": string
      "type": string
      "name": string
      "state": bool (if applicable)
      "value": float (if sensor)
      "brightness": uint8 (if light)
      ...
    },
    ...
  ]
}
```

**Size Comparison:**
- JSON: ~450 bytes (3 entities)
- CBOR: ~280 bytes (3 entities) - **38% smaller**

---

## ✅ Validation Rules

### Device Info
- `device_id`: Required, max 15 chars, `[a-zA-Z0-9_-]+`
- `device_name`: Required, max 31 chars
- `mac_address`: Required, 8-byte EUI-64

### Entity
- `entity_id`: Required, max 15 chars, `[a-zA-Z0-9_]+`, unique within device
- `type`: Required, must be valid entity type
- `name`: Required, max 31 chars

### Value Ranges
- Light brightness: 0-100
- Light color_temp: 2700-6500K
- Fan speed: 0-100 or 0-N levels
- Climate temp: Within min_temp/max_temp range
- Sensor update_interval: Minimum 1 second

---

## 📝 Summary

**Key Points:**
1. **Hierarchical Structure**: Device → Entities → Attributes
2. **Polymorphic Entities**: Use `void*` with type array
3. **Base Model**: All entities inherit `entity_base_t`
4. **6 Entity Types**: Light, Switch, Fan, Sensor, Climate, Binary Sensor
5. **Fixed Size**: MAX_ENTITIES = 8 (configurable)
6. **Binary Format**: CBOR for CoAP payloads (30-50% smaller than JSON)
7. **Validation**: Input validation at all levels
8. **Memory**: Stack allocation recommended for embedded

**Use Cases:**
- **Light**: Ceiling lights, table lamps, LED strips
- **Switch**: Wall switches, buttons, multi-gang panels
- **Fan**: Ceiling fans, desk fans, exhaust fans
- **Sensor**: Temperature, humidity, air quality, power monitoring
- **Climate**: Air conditioners, heaters, thermostats
- **Binary Sensor**: Motion, door/window, smoke, gas leak detection
