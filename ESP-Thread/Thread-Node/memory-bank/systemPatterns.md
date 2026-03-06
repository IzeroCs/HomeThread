# Thread-Node — System Patterns

## Kiến trúc tổng thể

```
Thread-Node/
├── components/
│   ├── thread/                   # Thread middleware layer
│   │   ├── thread_endpoint       # Application bootstrap framework
│   │   ├── thread_joiner         # OpenThread Joiner state machine
│   │   ├── thread_network_stop   # /network/stop CoAP handler
│   │   ├── coap/                 # Shared CoAP server manager
│   │   ├── device_registry/      # CoAP client → /device/register
│   │   ├── status_led/           # WS2812 RGB status indicator
│   │   └── boot_btn/             # Factory reset trigger
│   └── entity/                   # Entity Model layer
│       ├── model/                # entity_model + device_model + typed structs
│       ├── serialization/        # Custom CBOR encoder
│       └── coap_server/          # /entities CoAP resource
├── main/                         # Stub (migration pending)
└── examples/light_on_off/        # Reference implementation
```

## Pattern 1: One-Call Bootstrap

`thread_endpoint_start()` là single entry point cho toàn bộ hạ tầng. Lập trình viên không gọi bất kỳ OpenThread API nào trực tiếp.

```
thread_endpoint_start(on_joined_cb)
    │
    ├── NVS init
    ├── status_led_init()
    ├── boot_btn_init()
    ├── esp_openthread_init() + esp_openthread_start()   ← OpenThread task
    └── thread_joiner_start()
          └── [On join success] → on_joined_cb() → device_registry_start()
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
- `device_registry.c`: `otThreadGetLeaderRloc()`, `otCoapSendRequest()`
- `thread_coap.c`: `otCoapStart()`, `otCoapAddResource()`
- `entity_coap_server.c`: Mọi OT API trong handler callbacks

**Lưu ý**: Lock phải được release TRƯỚC KHI gọi bất kỳ function nào có thể acquire lock lại (tránh deadlock).

## Pattern 4: CoAP Dual-Role Architecture

Mỗi Thread-Node vừa là **CoAP Server** vừa là **CoAP Client**:

```
Thread-Node CoAP Server:
  /network/stop        GET  → Xử lý yêu cầu tạm dừng mạng từ BR
  /entities            GET  → Liệt kê tất cả entities
  /entities/{id}       GET  → Mô tả entity cụ thể
  /entities/{id}/{attr} PUT/POST → Điều khiển entity

Thread-Node CoAP Client:
  Leader RLOC /device/register  POST → Đăng ký device model (CBOR payload)
```

**Shared CoAP manager** (`thread_coap.c`): Idempotent `otCoapStart()` — có thể gọi nhiều lần mà không lỗi. Resource registration với lock. Response helper `thread_coap_send_response()`.

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
| `registry_task` | 4096 | 5 | Gửi CBOR đến Leader; chỉ khi Child/Router; one-shot (dừng sau ACK); retry 2s khi fail |
| `status_led_task` | 2048 | 2 | Cập nhật WS2812 LED |
| `boot_btn_task` | 2048 | 2 | Poll GPIO, detect long press |
| `network_stop_restart_task` | 4096 | 4 | Dừng 120s rồi restart Thread |

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

## Pattern 8: Device Registry — Gửi tới Backend sau discovery

**Đích:** Backend (IPv6 + port từ `backend_discovery_get_endpoint()`). **Không** còn registry task trong thread_endpoint hay gửi tới Leader RLOC.

**Điều kiện gửi:** App gọi `device_registry_register(endpoint, ...)` chỉ khi đã có endpoint từ `backend_discovery_get_endpoint()`. `device_registry_register()` từ chối khi role là Leader (return `ESP_ERR_INVALID_STATE`). Chỉ gửi khi Child/Router.

**Trigger:** (1) Lần đầu discovery backend thành công (trong on_joined hoặc task) → gọi `device_registry_register(ep, ...)`. (2) Refresh task (vd. 60s) phát hiện endpoint (addr/port) đổi → cập nhật endpoint và gọi lại `device_registry_register()`.

**Luồng:** Gửi với callback `on_registry_response`; timeout 20s. Nếu ACK (2.01/2.04/2.05) → one-shot (chỉ gửi 1 lần rồi dừng cho đến khi app gọi lại). Nếu NACK hoặc timeout → delay 2s rồi retry. Một request trong flight tại một thời điểm — tránh NoBufs.

**Tham số:** `REGISTRY_ACK_TIMEOUT_MS` 20s, `REGISTRY_RETRY_DELAY_MS` 2s (trong `device_registry.c`).

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

## Pattern 11: Network Stop Handler

Khi Border Router gửi `GET /network/stop` và node **đang là Leader**:

```
[Receive /network/stop]
    │
    ├── Send CoAP 2.05 Content response
    └── Spawn network_stop_restart_task
          │
          ├── otThreadSetEnabled(false)   → Rời mạng
          ├── vTaskDelay(120s)            → Chờ BR lấy lại Leader
          └── otThreadSetEnabled(true)    → Tái gia nhập
```

Nếu node không phải Leader, CoAP handler vẫn respond `2.05 Content` nhưng không thực hiện gì (chỉ Leader mới cần nhường).

## Quan hệ giữa các component

```
thread_endpoint
    ├── uses → thread_joiner
    ├── uses → thread_coap
    ├── uses → device_registry   (chỉ khi enable_device_registry = true)
    │              └── uses → device_model (read-only)
    │              └── uses → entity_serialization (encode CBOR)
    ├── uses → thread_network_stop
    │              └── uses → thread_coap
    ├── uses → status_led
    └── uses → boot_btn
                   └── uses → thread_joiner (factory_reset)

backend_discovery (app-level, ví dụ light_on_off)
    └── uses → openthread DNS client (otDnsClient*), nvs_flash; không phụ thuộc device_registry

entity_coap_server
    └── uses → entity_model (get/set entities)
    └── uses → thread_coap (register resource, send response)
```
