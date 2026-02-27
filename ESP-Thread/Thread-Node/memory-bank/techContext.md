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
```

### Entity Model

```kconfig
CONFIG_ENTITY_MODEL_MAX_TYPES=16     # Số loại entity có thể đăng ký
CONFIG_ENTITY_MODEL_MAX_ENTITIES=32  # Số entity tối đa trên một thiết bị
```

### Device Registry (thread_endpoint.c)

```c
#define REGISTRY_ACK_TIMEOUT_MS  20000   // Timeout chờ ACK từ Leader (20s)
#define REGISTRY_PERIODIC_MS     5000    // Khoảng cách giữa hai lần gửi thành công (5s)
#define REGISTRY_RETRY_DELAY_MS  2000    // Delay trước khi retry khi NACK/timeout (2s)
```

### Device info (device_model.h)

- **Strings** (manufacturer, model, device_name): dùng cho hiển thị / định danh.
- **Numbers** (Zigbee-style, giảm băng thông khi gửi register nhiều lần):
  - `device_type`: uint16 (DEVICE_TYPE_ON_OFF_LIGHT = 0x0100, DEVICE_TYPE_SENSOR_HUB = 0x0200, …)
  - `sw_version`, `hw_version`: uint32 = `DEVICE_VERSION(major, minor, patch)` (e.g. 1.2.3 → 0x00010203)
- CBOR payload: device_type, sw_version, hw_version encode dạng unsigned int.

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
│   │   ├── Kconfig                   # THREAD_JOINER_PSKD, RETRY_SEC, RETRY_NOT_FOUND_SEC
│   │   ├── thread_endpoint.c/.h      # Bootstrap framework
│   │   ├── thread_joiner.c/.h        # Joiner state machine
│   │   ├── thread_network_stop.c/.h  # /network/stop CoAP handler
│   │   ├── include/
│   │   │   └── esp_ot_config_defaults.h  # Radio/host/port macros
│   │   ├── coap/
│   │   │   ├── thread_coap.c/.h      # Shared CoAP server
│   │   │   └── CMakeLists.txt
│   │   ├── device_registry/
│   │   │   ├── device_registry.c/.h  # CoAP POST → /device/register
│   │   │   └── CMakeLists.txt
│   │   ├── status_led/
│   │   │   ├── status_led.c/.h       # WS2812 via RMT
│   │   │   ├── Kconfig
│   │   │   └── CMakeLists.txt
│   │   └── boot_btn/
│   │       ├── boot_btn.c/.h         # Long press → factory reset
│   │       ├── Kconfig
│   │       └── CMakeLists.txt
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
| `thread` | `openthread`, `esp_netif` | `nvs_flash`, `esp_event` |
| `thread/coap` | `openthread` | — |
| `thread/device_registry` | `openthread` | `entity/model`, `entity/serialization` |
| `thread/status_led` | `led_strip` | `freertos` |
| `thread/boot_btn` | — | `freertos`, `thread_joiner` |
| `entity/model` | — | `esp_mac` |
| `entity/serialization` | `entity/model` | — |
| `entity/coap_server` | `entity/model`, `thread/coap` | `openthread` |

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
