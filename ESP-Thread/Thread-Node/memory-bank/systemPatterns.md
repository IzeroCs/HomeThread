# Thread-Node — System Patterns

## Kiến trúc tổng thể

```
Thread-Node/
├── components/
│   ├── thread/                   # Thread middleware (core/, status_led, boot_btn)
│   │   ├── core/                 # thread_node, thread_joiner, thread_coap, thread_discovery
│   │   ├── status_led/           # WS2812 RGB status indicator
│   │   └── boot_btn/             # Factory reset trigger
│   ├── device/                   # Device ↔ Backend (tách khỏi thread)
│   │   ├── device_registry.c/.h  # Build device-only + entities; send_register rồi send_entities
│   │   └── device_coap.c/.h     # CoAP: send_register, send_entities, ping; token 2B
│   └── entity/                   # Entity Model layer
│       ├── model/                # entity_model + device_model + typed structs
│       ├── serialization/        # Custom CBOR encoder
│       └── coap_server/         # /entities CoAP resource
├── main/                         # Stub (migration pending)
└── examples/light_on_off/        # Reference implementation
```

## Pattern 1: One-Call Bootstrap

`thread_node_start()` là single entry point cho toàn bộ hạ tầng. Lập trình viên không gọi bất kỳ OpenThread API nào trực tiếp.

```
thread_node_start(on_joined_cb)
    │
    ├── NVS init
    ├── status_led_init()
    ├── boot_btn_init()
    ├── esp_openthread_init() + esp_openthread_start()   ← OpenThread task
    └── thread_joiner_start()
          └── [On join success] → device_registry_init(), thread_discovery, tasks (disc refresh, ping)
                                  → on_joined_cb()   ← App chỉ setup entities + entity_coap_server
```

**Lý do**: Đảm bảo thứ tự khởi động đúng và che giấu toàn bộ phức tạp của OpenThread khỏi code ứng dụng.

## Pattern 2: Struct-Based Entity Inheritance

Tất cả entity type đều có `entity_base_t` làm **first member**, cho phép cast an toàn từ `void*`.

```c
// entity_base_t (base struct)
typedef struct {
    char entity_id[32];
    char name[64];
    char entity_type[32];
    bool enabled;
} entity_base_t;

// entity_light_t (derived)
typedef struct {
    entity_base_t base;         // ← FIRST MEMBER (safe cast)
    bool state;
    uint8_t brightness;
    uint16_t color_temp;
    uint8_t rgb[3];
    entity_light_mode_t mode;
} entity_light_t;

// Driver wrapper (application level)
typedef struct {
    entity_light_t light;       // ← FIRST MEMBER
    int gpio_num;
    bool invert_logic;
} on_off_light_wrapper_t;
```

**Lý do**: C không có inheritance, nhưng C99 đảm bảo first member không có padding, cho phép `(entity_base_t*)&light` luôn valid.

## Pattern 3: OpenThread Lock Pattern

Mọi tương tác với OpenThread API từ non-OT tasks **BẮT BUỘC** phải dùng lock:

```c
esp_openthread_lock_acquire(portMAX_DELAY);
// ... OpenThread API calls ...
esp_openthread_lock_release();
```

**Các nơi áp dụng**:
- `thread_joiner.c`: `otJoinerStart()`, `otThreadSetEnabled()`, `otDeviceProperties`
- `device/device_registry.c`: `otThreadGetDeviceRole()` (khi build payload)
- `device/device_coap.c`: `otCoapSendRequest()`, lock trong send path
- `thread_coap.c`: `otCoapStart()`, `otCoapAddResource()`
- `entity_coap_server.c`: Mọi OT API trong handler callbacks

**Lưu ý**: Lock phải được release TRƯỚC KHI gọi bất kỳ function nào có thể acquire lock lại (tránh deadlock).

## Pattern 4: CoAP Dual-Role Architecture

Mỗi Thread-Node vừa là **CoAP Server** vừa là **CoAP Client**:

```
Thread-Node CoAP Server:
  /entities            GET  → Liệt kê tất cả entities
  /entities/{id}       GET  → Mô tả entity cụ thể
  /entities/{id}/{attr} PUT/POST → Điều khiển entity

Thread-Node CoAP Client (device_coap, gọi từ device_registry):
  Backend POST /device/register/info → CBOR device only (keys 0–7); POST /device/register/entity → mac (7) + array entities (key 9). Mỗi entity item: keys 0–12 + **13 = restore_mode** (uint, default 0) cho backend mergeEntity. GET /device/ping → timestamp; re-register khi timestamp đổi.
```

**Shared CoAP manager** (`thread_coap.c`): Idempotent `otCoapStart()`. **device_coap**: CoAP client (token 2B, lock), send_register + send_entities + ping; response handlers; ping timestamp → callback re-register. **device_registry**: entity_serialize_device_cbor + entity_serialize_entities_cbor; gọi send_register rồi send_entities (liên tiếp).

## Pattern 5: Custom CBOR Serialization

Không dùng thư viện CBOR ngoài (tinycbor, cn-cbor). Encoder tự viết theo RFC 7049:

```c
// Các primitive CBOR được implement:
cbor_encode_uint()          // Major type 0
cbor_encode_text_string()   // Major type 3
cbor_encode_bool()          // Simple values
cbor_encode_byte_string()   // Major type 2 (dùng cho IPv6 address)
cbor_open_map()             // Indefinite-length map (0xBF)
cbor_close_map()            // Break code (0xFF)
cbor_open_array()           // Indefinite-length array (0x9F)
cbor_close_array()          // Break code (0xFF)
```

**Lý do**: Giảm binary size trên embedded target. CBOR spec đủ đơn giản để tự implement cho use case này.

## Pattern 6: FreeRTOS Task Structure

| Task | Stack | Priority | Mục đích |
|---|---|---|---|
| `openthread` | 10240 | 5 | OpenThread stack (do ESP-IDF tạo) |
| `sys_evt` | 4096 (light_on_off) | — | Default event loop; handler OT event (LED, log_leader_data). Mặc định 2048 dễ stack overflow. |
| `thread_disc` | 4096 | 5 | Discovery: delay **10s** khi chưa có backend, **60s** khi đã có; cập nhật endpoint khi addr/port đổi; log "Backend discovered" / "Backend endpoint updated" chỉ khi lần đầu hoặc đổi; trigger_register |
| `backend_ping` | 4096 | 5 | GET /device/ping mỗi 10s; khi timestamp response khác → trigger_register |
| `status_led_task` | 2048 | 2 | WS2812 LED |
| `boot_btn_task` | 2048 | 2 | Poll GPIO, long press → factory reset |

## Pattern 7: Joiner State Machine

```
[Start]
   │
   ├── [Dataset exists] ─────────────────────────────────────────────►
   │                                                                  │
   └── [No dataset] → otJoinerStart(pskd)                            │
         │                                                            │
         ├── OT_JOINER_STATE_JOINED ─────────────────────────────────►
         │                                                            │
         ├── OT_ERROR_NOT_FOUND → retry in 5s (Commissioner missing) │
         │                                                            │
         └── Other error → retry in 30s                              │
                                                                      │
                                                              otThreadSetEnabled(true)
                                                                      │
                                                            [Wait for OT_STATE_CHANGE]
                                                                      │
                                              OT_CHANGED_THREAD_ROLE → CHILD/ROUTER/LEADER
                                                                      │
                                                              on_joined_callback()
```

**Factory Reset**: `otInstanceErasePersistentInfo()` + NVS namespace erase + `esp_restart()`

## Pattern 8: Device Registry + device_coap — Backend sau discovery

**Đích:** Backend (IPv6 + port từ `thread_discovery_get_endpoint()`). **thread_node** nội bộ: discovery, refresh task 60s, ping task 10s; khi có/đổi endpoint hoặc ping timestamp đổi → gọi `device_registry_register()` / `device_registry_ping()`. App không gọi discovery/register/ping.

**device_registry** (components/device/): Build device-only (entity_serialize_device_cbor) + entities (entity_serialize_entities_cbor); gửi POST /device/register rồi POST /device/entities liên tiếp. API: `device_registry_register(endpoint, callback, ctx)`, `device_registry_ping(...)`, `device_registry_is_registered()`.

**device_coap** (components/device/): CoAP client: `device_coap_send_register(...)`, `device_coap_send_entities(...)`, `device_coap_ping()`. Token 2 byte; lock. GET /device/ping response 4-byte timestamp (LE) → nếu khác lần trước gọi callback (thread_node → trigger_register).

**Log backend IP:** Chỉ log INFO **1 lần** khi có IP và **khi IP thay đổi** (thread_node: "Backend discovered", "Backend endpoint updated"). thread_discovery khi trả cache/static/SRP dùng LOGD.

## Pattern 9: Device info — strings vs numbers

**device_info_t** (`device_model.h`): Chỉ **string** cho manufacturer, model, device_name (tốn băng thông ít vì ngắn). **Number** cho device_type (uint16 Zigbee-style), sw_version (uint32), hw_version (uint32) — gửi nhiều lần register thì số tiết kiệm hơn chuỗi. Macro `DEVICE_VERSION(maj, min, patch)`; device_id prefix lấy từ `device_type_to_prefix(device_type)` (0x0100 → "light", …).

## Pattern 10: Entity Model Registry

```
entity_model (global registry)
├── type_registry[]      ← Mapping: "on_off_light" → ENTITY_TYPE_LIGHT + sizeof()
│   max: CONFIG_ENTITY_MODEL_MAX_TYPES
└── entity_entries[]     ← Array of entity_entry_t
    max: CONFIG_ENTITY_MODEL_MAX_ENTITIES
    └── entity_entry_t
        ├── entity_base_t base    ← id, name, type, enabled
        └── void* typed_ptr       ← Pointer to entity_light_t, entity_sensor_t, ...
```

**API chính**:
- `entity_model_register_type(name, enum_type, sizeof)` → Đăng ký type mới
- `entity_add(id, name, type_name, ptr)` → Thêm entity instance
- `entity_get(id)` → Lookup by ID
- `entity_set(id, attr, value)` → Update attribute
- `entity_describe(id, buf, len)` → Human-readable description

## Quan hệ giữa các component

```
thread_node
    ├── uses → thread_joiner
    ├── uses → thread_coap
    ├── uses → thread_discovery   (khi enable_device_registry)
    ├── uses → device (device_registry)   (khi enable_device_registry)
    ├── uses → status_led
    └── uses → boot_btn → thread_joiner (factory_reset)

device (component)
    ├── device_registry  → device_model, entity_serialization (build payload)
    └── device_coap     → openthread CoAP client (transport)

thread_discovery
    └── uses → openthread DNS client, nvs_flash

entity_coap_server
    └── uses → entity_model, thread_coap
```

## Workflow / Agent

- **Terminal:** Agent không tự chạy lệnh terminal (build, flash, monitor, v.v.). Không yêu cầu user tự chạy lệnh bằng tay — chỉ thực hiện thay đổi code/tài liệu; user tự quyết định khi nào build/chạy.
