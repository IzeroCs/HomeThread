# Thread-Node — Tech Context

## Stack công nghệ

| Công nghệ | Vai trò | Ghi chú |
|---|---|---|
| **ESP-IDF** | Firmware SDK | FreeRTOS, NVS, GPIO, RMT, event loop, esp_mac, netif |
| **OpenThread FTD** | Thread mesh stack | Full Thread Device — Child/Router/Leader capable |
| **Thread Joiner** | Commissioning | `otJoinerStart()` với PSKd credential |
| **CoAP** (RFC 7252) | Application protocol | UDP/Thread, dùng `otCoap*` API |
| **CBOR** (RFC 7049) | Serialization | Custom implementation, không dùng lib ngoài |
| **WS2812 via RMT** | Status LED | ESP32 RMT peripheral |
| **mbedTLS** | Crypto | ECJPAKE + DTLS cho Thread commissioning |
| **C (C99)** | Ngôn ngữ | Toàn bộ firmware |

## Chip target

| Chip | Radio | Ghi chú |
|---|---|---|
| **ESP32-C6** | Native IEEE 802.15.4 | Primary target cho `light_on_off` example |
| **ESP32-H2** | Native IEEE 802.15.4 | Alternative target |

Chip được enforce tại build time trong root `CMakeLists.txt`. Các chip khác (ESP32, ESP32-S3, ...) không được hỗ trợ vì thiếu 802.15.4 radio.

## Build system

```bash
# Build example (thư mục chứa CMakeLists.txt có project())
cd examples/light_on_off/
idf.py set-target esp32c6
idf.py build

# Flash + monitor
idf.py -p /dev/ttyUSB0 flash monitor

# Factory reset (nếu cần xóa dataset)
idf.py -p /dev/ttyUSB0 erase-flash
```

**Không build từ root `Thread-Node/`** — `main/main.c` là stub, chưa có project() hoàn chỉnh cho root. Chỉ build từ `examples/light_on_off/`.

### ESP-IDF VS Code (Build / Flash / Monitor từ giao diện)

Để dùng lệnh Build / Flash / Monitor của extension ESP-IDF mà không cần mở terminal thủ công: mở workspace **File > Open Workspace from File** → chọn `Thread-Node.code-workspace`. Sau đó **F1** → **ESP-IDF: Pick a Workspace Folder** (hoặc icon "Current Project" trên status bar) → chọn **light_on_off (build)**. Từ đó ESP-IDF: Build / Flash / Monitor chạy `idf.py` trong `examples/light_on_off`.

## Cấu hình quan trọng (Kconfig / sdkconfig.defaults)

### Thread Joiner

```kconfig
CONFIG_THREAD_JOINER_PSKD_DEFAULT="H01THREAD"   # PSK credential mặc định
CONFIG_THREAD_JOINER_RETRY_SEC=30               # Retry khi lỗi chung
CONFIG_THREAD_JOINER_RETRY_NOT_FOUND_SEC=5      # Retry khi Commissioner không tìm thấy
```

### Status LED

```kconfig
CONFIG_STATUS_LED_GPIO_DEFAULT=<gpio>     # GPIO pin cho WS2812 data
CONFIG_STATUS_LED_BLINK_MS=<ms>           # Chu kỳ nhấp nháy
```

### Boot Button

```kconfig
CONFIG_BOOT_BTN_GPIO_DEFAULT=0            # GPIO0 (BOOT button)
CONFIG_BOOT_BTN_HOLD_MS_DEFAULT=<ms>      # Thời gian giữ để factory reset
```

### OpenThread (sdkconfig.defaults)

```kconfig
CONFIG_OPENTHREAD_ENABLED=y
CONFIG_OPENTHREAD_FTD=y           # Full Thread Device
CONFIG_OPENTHREAD_JOINER=y        # Joiner enabled
CONFIG_MBEDTLS_ECJPAKE_C=y        # ECJPAKE cho commissioning
CONFIG_OPENTHREAD_DNS64_CLIENT=n  # Không dùng DNS64
CONFIG_OPENTHREAD_DNS_CLIENT=y    # Bật DNS client (SRP/DNS-SD browse backend)
```

### Entity Model

```kconfig
CONFIG_ENTITY_MODEL_MAX_TYPES=16     # Số loại entity có thể đăng ký
CONFIG_ENTITY_MODEL_MAX_ENTITIES=32  # Số entity tối đa trên một thiết bị
```

### Example light_on_off (sdkconfig.defaults)

- **CONFIG_ESP_SYSTEM_EVENT_TASK_STACK_SIZE=4096**: Task "sys_evt" (default event loop) chạy handler OpenThread event (update_attached_led_role, log_leader_data). Mặc định 2048 → Stack protection fault; example đặt 4096.

### Thread Node (thread_node_config_t)

- **enable_device_registry** (bool): Khi `true`, thread_node gọi `device_registry_init()`, `thread_discovery_init()`, tạo task discovery và task ping. **Discovery task**: delay **10s** khi chưa có backend (`!s_backend_ep_valid`), **60s** khi đã có (DEFAULT_DISCOVERY_RETRY_MS / DEFAULT_DISCOVERY_REFRESH_MS). Ping task: 10s. Trong on_joined_wrapper log Mesh-Local EID + RLOC16 của node. App **không** gọi discovery/register/ping — chỉ implement on_joined. Mặc định `true` khi `config == NULL`.

### Device (components/device/)

- **device_registry**: Build payload: info (`entity_serialize_info_cbor`), entities (`entity_serialize_entities_cbor`), topology **role-based** (`entity_serialize_topology_child_cbor` khi Child, `entity_serialize_topology_router_leader_cbor` khi Router/Leader; key 6 = neighbors từ otThreadGetNextNeighborInfo), state (`entity_serialize_state_cbor`). Gửi POST /device/register/info, POST /device/register/entity, POST /device/update/topology, POST /device/update/state. API: `device_registry_register(endpoint, callback, ctx)`, `device_registry_ping(...)`, `device_registry_is_registered()`. Gọi **device_coap** cho transport.
- **device_coap**: CoAP client: init, `device_coap_send_register(...)`, `device_coap_send_entities(...)`, `device_coap_ping()`. Token 2 byte; GET /device/ping response timestamp → callback re-register khi đổi. Backend restart (timestamp đổi) → trigger re-register.

### Thread Discovery (thread_discovery.c)

- API: `thread_discovery_init(&cfg)`, `thread_discovery_get_endpoint(out, force_refresh)`. `thread_discovery_cfg_t.cache_ttl_sec`. Bật **CONFIG_OPENTHREAD_DNS_CLIENT=y**. Browse `_dashboard._udp.default.svc.arpa`; mHostNameBuffer API (ESP-IDF 5.5.3). **Log:** Chỉ thread_node log INFO khi có IP lần đầu hoặc khi IP thay đổi ("Backend discovered", "Backend endpoint updated"); thread_discovery log cache/static/SRP ở LOGD. Chi tiết: `docs/coap/backend_discovery_srp.md`.

### Device info (device_model.h)

- **Strings** (manufacturer, model, device_name): dùng cho hiển thị / định danh.
- **Numbers** (Zigbee-style, giảm băng thông khi gửi register nhiều lần):
  - `device_type`: uint16 (DEVICE_TYPE_ON_OFF_LIGHT = 0x0100, DEVICE_TYPE_SENSOR_HUB = 0x0200, …)
  - `sw_version`, `hw_version`: uint32 = `DEVICE_VERSION(major, minor, patch)` (e.g. 1.2.3 → 0x00010203)
- CBOR payload: device_type, sw_version, hw_version encode dạng unsigned int.

### Entity register payload (register/entity)

- Mỗi item trong array entities (key 9): map với keys 0–12 (entity_id, name, type, device_class, available, last_update, state/brightness/mode/rgb/color_temp hoặc value/unit tùy type) và **key 13 = restore_mode** (uint). Node encode restore_mode mặc định 0; backend dùng cho mergeEntity. Định nghĩa key: `cbor_register_keys.h` (`CBOR_K_ENT_RESTORE_MODE 13`).

## Custom OpenThread config (`openthread_custom_config.h`)

File này được chỉ định trong `sdkconfig.defaults` qua `CONFIG_OPENTHREAD_CUSTOM_PARAMETERS_FILE`:

```c
// Tăng tốc độ phát hiện disconnect
#define OPENTHREAD_CONFIG_MLE_CHILD_TIMEOUT_DEFAULT              60   // default: 240s
#define OPENTHREAD_CONFIG_CHILD_SUPERVISION_CHECK_TIMEOUT        60   // default: 190s
#define OPENTHREAD_CONFIG_CHILD_SUPERVISION_INTERVAL             30   // default: 129s

// Cho phép điều chỉnh leader weight (để tránh tranh quyền Leader với BR)
#define OPENTHREAD_CONFIG_MLE_DEVICE_PROPERTY_LEADER_WEIGHT_ENABLE  1

// Bật CoAP API
#define OPENTHREAD_CONFIG_COAP_API_ENABLE                        1
```

**Lưu ý DNS client:** Không define `OPENTHREAD_CONFIG_DNS_CLIENT_ENABLE` trong file này — ESP-IDF 5.5.3 đã define trong `openthread-core-esp32x-ftd-config.h` từ `CONFIG_OPENTHREAD_DNS_CLIENT` (sdkconfig). Bật DNS client qua `CONFIG_OPENTHREAD_DNS_CLIENT=y` trong sdkconfig / sdkconfig.defaults.

**Lý do custom timeout**: Giảm từ 240s → 60s để Border Router biết sớm hơn khi một node disconnect khỏi mạng.

## Cấu trúc thư mục và file nguồn

```
Thread-Node/
├── CMakeLists.txt                    # Root: project "Thread-Node", chip check
├── sdkconfig.defaults                # Default Kconfig values
├── openthread_custom_config.h        # OpenThread overrides
│
├── main/
│   ├── CMakeLists.txt                # PRIV_REQUIRES: freertos, model
│   └── main.c                        # STUB — migration pending
│
├── components/
│   ├── thread/
│   │   ├── CMakeLists.txt
│   │   ├── core/                     # Thread core (node, joiner, coap, discovery)
│   │   │   ├── thread_node.c/.h
│   │   │   ├── thread_joiner.c/.h
│   │   │   ├── thread_coap.c/.h
│   │   │   ├── thread_discovery.c/.h
│   │   │   └── include/
│   │   ├── include/
│   │   │   └── esp_ot_config_defaults.h
│   │   ├── status_led/
│   │   │   ├── status_led.c/.h       # WS2812 via RMT
│   │   │   ├── Kconfig
│   │   │   └── CMakeLists.txt
│   │   └── boot_btn/
│   │       ├── boot_btn.c/.h         # Long press → factory reset
│   │       ├── Kconfig
│   │       └── CMakeLists.txt
│   ├── device/                       # Component "device" (tách khỏi thread)
│   │   ├── device_registry.c/.h      # Build device + entities payload; register/ping API
│   │   ├── device_coap.c/.h          # CoAP: send_register, send_entities, ping
│   │   └── CMakeLists.txt
│   │
│   └── entity/
│       ├── model/
│       │   ├── CMakeLists.txt
│       │   ├── entity_model.c/.h           # Type registry + CRUD
│       │   ├── entity_model_priv.h         # Internal structs (private)
│       │   ├── device_model.c/.h           # Singleton device_model_t
│       │   ├── light/include/entity_light.h
│       │   ├── switch/include/entity_switch.h
│       │   ├── fan/include/entity_fan.h
│       │   ├── sensor/include/entity_sensor.h
│       │   ├── climate/include/entity_climate.h
│       │   └── binary_sensor/include/entity_binary_sensor.h
│       ├── serialization/
│       │   ├── entity_serialization.c/.h   # Custom CBOR encoder
│       │   └── CMakeLists.txt
│       └── coap_server/
│           ├── entity_coap_server.c/.h     # /entities CoAP resource
│           └── CMakeLists.txt
│
└── examples/
    └── light_on_off/                  # Reference example (buildable)
        ├── CMakeLists.txt
        ├── sdkconfig / sdkconfig.defaults
        └── main/
            ├── main.c                 # Entry point
            ├── on_off_light.c/.h      # GPIO + entity_light_t driver
            └── CMakeLists.txt
```

## Dependencies (ESP-IDF components)

Khai báo trong các `CMakeLists.txt` của từng component:

| Component | REQUIRES | PRIV_REQUIRES |
|---|---|---|
| `thread` | `openthread`, `esp_netif`, `device`, … | `nvs_flash`, `esp_event` |
| `device` | `openthread` | `model`, `serialization` (device_registry + device_coap) |
| `thread/status_led` | `led_strip` | `freertos` |
| `thread/boot_btn` | — | `freertos`, `thread_joiner` |
| `entity/model` | — | `esp_mac` |
| `entity/serialization` | `entity/model` | — |
| `entity/coap_server` | `entity/model`, `thread` | `openthread` |

## Thiết lập môi trường phát triển

```bash
# Cài đặt ESP-IDF (khuyến nghị v5.5.x)
# Xem: https://docs.espressif.com/projects/esp-idf/

# Clone repo
git clone https://github.com/izerocs/HomeThread
cd HomeThread/ESP-Thread/Thread-Node

# Build example
cd examples/light_on_off/
idf.py set-target esp32c6
idf.py build
idf.py -p /dev/ttyACM0 flash monitor
```

## Lưu ý quan trọng về phiên bản

- ESP-IDF **v5.5.x** — cần API `esp_openthread_lock_acquire/release` (không có trong v4.x)
- OpenThread stack được ESP-IDF bundle sẵn, không cần cài riêng
- `led_strip` component là ESP-IDF built-in (WS2812 driver)
- `CONFIG_OPENTHREAD_CUSTOM_PARAMETERS_FILE` — feature có từ ESP-IDF v5.x
