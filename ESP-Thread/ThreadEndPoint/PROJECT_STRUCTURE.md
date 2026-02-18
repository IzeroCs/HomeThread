# Cấu trúc Project - ThreadEndPoint

Tài liệu này mô tả cấu trúc thư mục và file của project ThreadEndPoint.

---

## 📁 Cấu trúc tổng quan

```
ThreadEndPoint/
├── CMakeLists.txt                    # Root CMakeLists
├── openthread_custom_config.h        # OpenThread custom config
│
├── main/                             # Main application
│   ├── CMakeLists.txt
│   └── main.c
│
├── components/                       # ESP-IDF Components
│   ├── entity/                       # Entity Model Components
│   │   ├── model/                    # Core Entity Model
│   │   │   ├── CMakeLists.txt
│   │   │   ├── entity_model.c
│   │   │   ├── entity_driver_helper.c
│   │   │   ├── entity_model_priv.h
│   │   │   └── include/
│   │   │       ├── entity_model.h
│   │   │       └── entity_driver_helper.h
│   │   │
│   │   ├── coap_server/              # Entity CoAP Server
│   │   │   ├── CMakeLists.txt
│   │   │   ├── entity_coap_server.c
│   │   │   └── include/
│   │   │       └── entity_coap_server.h
│   │   │
│   │   └── serialization/            # CBOR Serialization
│   │       ├── CMakeLists.txt
│   │       ├── idf_component.yml     # CBOR dependency
│   │       ├── entity_serialization.c
│   │       └── include/
│   │           └── entity_serialization.h
│   │
│   └── thread/                       # Thread Network Components
│       ├── CMakeLists.txt
│       ├── thread_joiner.c           # Thread joiner
│       ├── thread_endpoint.c         # Thread endpoint framework
│       ├── thread_network_stop.c     # Network stop handler
│       │
│       ├── coap/                     # CoAP Utilities
│       │   ├── CMakeLists.txt
│       │   ├── thread_coap.c
│       │   └── include/
│       │       └── thread_coap.h
│       │
│       ├── device_registry/          # Device Registry (CoAP Client)
│       │   ├── CMakeLists.txt
│       │   ├── device_registry.c
│       │   └── include/
│       │       └── device_registry.h
│       │
│       ├── status_led/               # Status LED Indicator
│       │   ├── CMakeLists.txt
│       │   ├── status_led.c
│       │   └── include/
│       │       └── status_led.h
│       │
│       ├── boot_btn/                 # Boot Button Handler
│       │   ├── CMakeLists.txt
│       │   ├── boot_btn.c
│       │   └── include/
│       │       └── boot_btn.h
│       │
│       └── include/                  # Thread Component Headers
│           ├── thread_joiner.h
│           ├── thread_endpoint.h
│           ├── thread_network_stop.h
│           └── esp_ot_config_defaults.h
│
├── examples/                         # Example Applications
│   └── light_on_off/                 # Light On/Off Example
│       ├── CMakeLists.txt
│       ├── main/
│       │   ├── CMakeLists.txt
│       │   ├── main.c
│       │   ├── on_off_light.c
│       │   └── on_off_light.h
│       │
│       └── managed_components/      # Auto-managed dependencies
│           └── espressif__cbor/      # TinyCBOR library
│               └── ...
│
└── Documentation/                    # Documentation Files
    ├── IoT_Entity_Model_Specification.md
    ├── MODEL_STRUCTURE.md
    ├── PROJECT_STRUCTURE.md (this file)
    ├── PLAN_ENTITY_MODEL.md
    ├── BORDER_ROUTER_COAP_SERVER.md
    ├── LEADER_STOP_COMMAND_COAP.md
    └── COAP_CLIENT_PURE_MAIN_SNIPPET.md
```

---

## 📂 Chi tiết từng Component

### 1. Entity Model Components (`components/entity/`)

#### 1.1 Model (`components/entity/model/`)

**Mục đích:** Core entity model - type registry và entity management

**Files:**
- `entity_model.c` - Core implementation (init, register_type, add, describe, get, set)
- `entity_driver_helper.c` - Helper functions cho entity drivers
- `entity_model_priv.h` - Private definitions (internal structures)
- `include/entity_model.h` - Public API
- `include/entity_driver_helper.h` - Driver helper API
- `CMakeLists.txt` - Build configuration

**Dependencies:**
- `freertos`

**API chính:**
```c
void entity_model_init(void);
int entity_register_type(const char *type_id, get_cb, set_cb);
int entity_add(const char *entity_id, const char *type_id, const char *name, void *instance_data);
int entity_describe(char *buf, size_t buf_len);
int entity_get(const char *entity_id, const char *attr, char *value_buf, size_t value_buf_len);
int entity_set(const char *entity_id, const char *attr, const char *value);
```

---

#### 1.2 CoAP Server (`components/entity/coap_server/`)

**Mục đích:** CoAP server để điều khiển entities qua CoAP

**Files:**
- `entity_coap_server.c` - CoAP server implementation
- `include/entity_coap_server.h` - Public API
- `CMakeLists.txt` - Build configuration

**Dependencies:**
- `openthread`
- `model` (entity_model)
- `coap` (thread_coap)

**API chính:**
```c
esp_err_t entity_coap_server_start(void);
```

**Endpoints:**
- `GET /entity/{entity_id}` - Get entity state
- `POST /entity/{entity_id}/set` - Set entity attribute
- `GET /entities` - List all entities

---

#### 1.3 Serialization (`components/entity/serialization/`)

**Mục đích:** CBOR binary serialization cho CoAP payloads

**Files:**
- `entity_serialization.c` - CBOR serialization implementation
- `include/entity_serialization.h` - Public API
- `idf_component.yml` - Dependency: `espressif/cbor`
- `CMakeLists.txt` - Build configuration

**Dependencies:**
- `model` (entity_model)
- `cbor` (TinyCBOR - via idf_component.yml)

**API chính:**
```c
int entity_serialize_cbor(uint16_t rloc16, const char *ml_eid_str, 
                         uint16_t parent_rloc16,
                         uint8_t *buffer, size_t buffer_size);
int entity_serialize_updates_cbor(uint8_t *buffer, size_t buffer_size);
```

---

### 2. Thread Network Components (`components/thread/`)

#### 2.1 Thread Joiner (`thread_joiner.c`)

**Mục đích:** Thread network joining với callback

**Files:**
- `thread_joiner.c` - Joiner implementation
- `include/thread_joiner.h` - Public API

**API:**
```c
esp_err_t thread_joiner_start(const char *pskd, thread_joiner_callback_t callback);
```

---

#### 2.2 Thread Endpoint (`thread_endpoint.c`)

**Mục đích:** Thread endpoint framework - init OpenThread, LED, boot button, joiner, device registry

**Files:**
- `thread_endpoint.c` - Endpoint framework
- `include/thread_endpoint.h` - Public API

**Features:**
- OpenThread initialization
- Status LED management
- Boot button handler
- Thread joiner integration
- Device registry integration

---

#### 2.3 Network Stop (`thread_network_stop.c`)

**Mục đích:** CoAP resource `/network/stop` handler (chỉ Leader xử lý)

**Files:**
- `thread_network_stop.c` - Network stop handler
- `include/thread_network_stop.h` - Public API

**Behavior:**
- Leader nhận POST `/network/stop`
- Stop network → đợi 120s → restart

---

#### 2.4 CoAP Utilities (`coap/`)

**Mục đích:** Shared CoAP server utilities

**Files:**
- `thread_coap.c` - CoAP helper functions
- `include/thread_coap.h` - Public API

**Functions:**
- `thread_coap_send_response()` - Send CoAP response
- CoAP message helpers

---

#### 2.5 Device Registry (`device_registry/`)

**Mục đích:** CoAP client để register device lên Border Router

**Files:**
- `device_registry.c` - CoAP client implementation
- `include/device_registry.h` - Public API
- `CMakeLists.txt` - Build configuration

**Dependencies:**
- `openthread`
- `model` (entity_model)
- `serialization` (entity_serialization)

**API:**
```c
esp_err_t device_registry_init(void);
esp_err_t device_registry_register(device_registry_callback_fn callback, void *ctx);
```

**Behavior:**
- Khi device join Thread → tự động POST `/devices/register` lên Leader
- Payload: CBOR format với device info và entities

---

#### 2.6 Status LED (`status_led/`)

**Mục đích:** Status LED indicator cho Thread network state

**Files:**
- `status_led.c` - LED control
- `include/status_led.h` - Public API
- `CMakeLists.txt` - Build configuration

---

#### 2.7 Boot Button (`boot_btn/`)

**Mục đích:** Boot button handler

**Files:**
- `boot_btn.c` - Button handler
- `include/boot_btn.h` - Public API
- `CMakeLists.txt` - Build configuration

---

### 3. Main Application (`main/`)

**Mục đích:** Root main application (test entity_model)

**Files:**
- `main.c` - Application entry point
- `CMakeLists.txt` - Build configuration

**Dependencies:**
- `freertos`
- `model` (entity_model)

---

### 4. Examples (`examples/`)

#### 4.1 Light On/Off (`light_on_off/`)

**Mục đích:** Example application với Thread joiner + entity model + LED control

**Files:**
- `main/main.c` - Main application
- `main/on_off_light.c` - On/Off light entity driver
- `main/on_off_light.h` - Driver header
- `CMakeLists.txt` - Project CMakeLists
- `main/CMakeLists.txt` - Main component CMakeLists

**Dependencies:**
- `driver` (GPIO)
- `model` (entity_model)
- `coap_server` (entity_coap_server)
- `thread` (thread components)

**Features:**
- Thread network joining
- Entity model với on_off_light type
- CoAP server để điều khiển LED
- Device registry để register lên Leader

---

## 📋 Component Dependencies Graph

```
main/
└── model (entity_model)
    └── freertos

examples/light_on_off/
└── main/
    ├── driver
    ├── model (entity_model)
    ├── coap_server (entity_coap_server)
    │   ├── openthread
    │   ├── model
    │   └── coap (thread_coap)
    └── thread (thread components)
        ├── thread_joiner
        ├── thread_endpoint
        ├── device_registry
        │   ├── openthread
        │   ├── model
        │   └── serialization
        │       ├── model
        │       └── cbor (espressif/cbor)
        ├── status_led
        └── boot_btn
```

---

## 🔧 Build Configuration

### Root CMakeLists.txt
```cmake
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(ThreadEndPoint)
```

### Component CMakeLists.txt Pattern
```cmake
idf_component_register(
    SRCS "source1.c" "source2.c"
    INCLUDE_DIRS "include"
    REQUIRES dependency1 dependency2
    PRIV_REQUIRES private_dependency
)
```

---

## 📦 External Dependencies

### Managed Components (via idf_component.yml)

1. **espressif/cbor** (TinyCBOR)
   - Location: `examples/light_on_off/managed_components/espressif__cbor/`
   - Used by: `components/entity/serialization/`
   - Purpose: CBOR binary serialization

---

## 📝 File Naming Conventions

### Components
- Component name = thư mục name (e.g., `model`, `coap_server`, `serialization`)
- Header files: `include/{component_name}.h`
- Source files: `{component_name}.c`

### Entity Components (đã đổi tên)
- ~~`entity_model`~~ → `model`
- ~~`entity_coap_server`~~ → `coap_server`
- ~~`entity_serialization`~~ → `serialization`

**Note:** Header file names giữ nguyên (`entity_model.h`, `entity_coap_server.h`, etc.) để maintain backward compatibility với includes.

---

## 🗂️ Documentation Files

| File | Mục đích |
|------|----------|
| `IoT_Entity_Model_Specification.md` | Complete specification của entity model |
| `MODEL_STRUCTURE.md` | Cấu trúc model chi tiết |
| `PROJECT_STRUCTURE.md` | Cấu trúc project (this file) |
| `PLAN_ENTITY_MODEL.md` | Kế hoạch implementation entity model |
| `BORDER_ROUTER_COAP_SERVER.md` | Border Router CoAP server implementation |
| `LEADER_STOP_COMMAND_COAP.md` | Network stop command documentation |
| `COAP_CLIENT_PURE_MAIN_SNIPPET.md` | CoAP client examples |

---

## 🚀 Quick Start

### Build Project
```bash
cd ThreadEndPoint
idf.py build
```

### Flash và Monitor
```bash
idf.py flash monitor
```

### Build Example
```bash
cd examples/light_on_off
idf.py build
```

---

## 📊 Statistics

- **Total Components:** 10+
- **Entity Components:** 3 (model, coap_server, serialization)
- **Thread Components:** 7+ (joiner, endpoint, coap, device_registry, status_led, boot_btn, network_stop)
- **Examples:** 1 (light_on_off)
- **Documentation Files:** 7

---

## 🔄 Recent Changes

1. **Component Renaming:**
   - `entity_model` → `model`
   - `entity_coap_server` → `coap_server`
   - `entity_serialization` → `serialization`

2. **CBOR Serialization:**
   - Added `serialization` component
   - Integrated TinyCBOR library
   - Updated `device_registry` to use CBOR format

3. **Documentation:**
   - Created `MODEL_STRUCTURE.md`
   - Created `PROJECT_STRUCTURE.md`
   - Updated `IoT_Entity_Model_Specification.md` với CBOR recommendations
