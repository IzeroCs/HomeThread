# Kế hoạch: Entity Model cho ThreadEndPoint (ESP-IDF)

Mục tiêu: thiết kế một **model kiểu ESPHome** (entity-based, type registry, describe/get/set theo `entity_id`) trong ESP-IDF để **tái sử dụng** khi tạo nhiều loại thiết bị (đèn, cảm biến, công tắc, v.v.) mà không phải viết lại logic điều khiển mỗi lần.

---

## 1. Mục tiêu và phạm vi

- **Một device** = nhiều **entity** (vd: `light.0`, `sensor.0`, `switch.0`).
- Mỗi entity có: **entity_id**, **type** (vd: `on_off_light`, `temperature_sensor`), **name** (hiển thị), và **state/attributes**.
- **Type registry**: định nghĩa các loại entity (schema: attributes, read/write), driver (get/set) gắn với từng type.
- **Discovery/describe**: controller gửi request → device trả về danh sách entity + type để render UI / sinh lệnh.
- **Get/Set theo entity_id**: mọi lệnh đều kèm `entity_id` (và optional `attr`), không còn lệnh “on/off” chung chung.

**Giao thức**: 
- **UDP** (port 5684): describe/get/set cho controller điều khiển device trực tiếp
- **CoAP POST** (port 5683): device tự động register entity_model lên Border Router khi join

---

## 2. Kiến trúc tổng quan

```
┌─────────────────────────────────────────────────────────────────┐
│  UDP Server (port 5684)                                         │
│  - Nhận packet: describe | get <entity_id> [attr] | set ...     │
│  - Gọi entity_model → trả response qua UDP                      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│  Entity Model (core)                                            │
│  - Type registry: bảng các entity_type (tên, get_cb, set_cb)    │
│  - Entity list: danh sách entity (id, type, name, instance_data)│
│  - describe(buf) → ghi danh sách entity vào buffer              │
│  - get(entity_id, attr, value_buf) → gọi type->get_cb           │
│  - set(entity_id, attr, value_str) → gọi type->set_cb          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│  Entity Types (driver layer)                                    │
│  - on_off_light: attr "state" (on/off), instance = GPIO / state  │
│  - (sau này) temperature_sensor, dimmer, switch, ...            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Device Registry (CoAP Client)                                  │
│  - Khi join: CoAP POST /devices/register                        │
│  - Payload: rloc16, ml_eid, parent, entity_model (describe)    │
│  - Gửi lên Border Router (Leader)                               │
└───────────────────────────────┬─────────────────────────────────┘
                                │ CoAP POST
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│  Border Router (CoAP Server)                                    │
│  - Nhận POST /devices/register                                  │
│  - Parse payload, lưu device info vào registry                  │
│  - Response: 2.01 Created                                        │
└─────────────────────────────────────────────────────────────────┘
```

- **Một chiều phụ thuộc**: UDP server → entity model → entity types. Entity types đăng ký type và thêm entity vào model lúc init, không biết gì về UDP.
- **Device Registry**: Component `device_registry` dùng OpenThread CoAP API để tự động register entity_model lên Border Router khi device join Thread network.

---

## 3. Cấu trúc thư mục / file đề xuất

```
main/
├── main.c                    # app_main: init entity model → register types → add entities → start UDP server
├── led_udp_server.c / .h     # UDP server: parse request, gọi entity_*(), gửi response (giữ tên để ít đổi)
├── entity_model.c / .h      # Core: type registry, entity list, describe / get / set
├── entity_type_on_off_light.c   # Đăng ký type "on_off_light", thêm entity "light.0" (LED GPIO 8)
├── entity_type_on_off_light.h   # (optional) nếu cần export config (GPIO, entity_id) cho main
└── (sau này)
    ├── entity_type_temperature_sensor.c
    ├── entity_type_dimmer.c
    └── ...
```

- **entity_model**: không phụ thuộc driver (GPIO, ADC…). Driver (on_off_light) depend on entity_model và đăng ký type + add entity.
- Mỗi **entity type** một file (hoặc một file chứa nhiều type đơn giản) để sau này clone/sửa dễ (vd: copy `entity_type_on_off_light.c` thành `entity_type_dimmer.c` rồi chỉnh attr/callback).

### 3.1 Làm entity model dạng thư viện (ESP-IDF component)

Để **tái sử dụng** entity model ở nhiều project (ThreadEndPoint, project đèn khác, gateway, v.v.) nên đóng gói **core** thành **ESP-IDF component** (thư viện). Cách làm chuẩn trong ESP-IDF:

- Tạo thư mục **component** trong repo (cùng cấp với `main/`):
  - `components/entity/entity_model/` chứa toàn bộ core (type registry, entity list, describe/get/set).
  - Build system ESP-IDF tự nhận thư mục `components/` trong project; bất kỳ target nào có `PRIV_REQUIRES entity_model` hoặc `REQUIRES entity_model` sẽ link thư viện này.

**Cấu trúc thực tế hiện tại:**

```
ThreadEndPoint/
├── main/
│   ├── main.c
│   ├── led_udp_server.c / .h
│   ├── entity_type_on_off_light.c   # (có thể để trong main hoặc tách thành component)
│   └── ...
├── components/
│   ├── entity/
│   │   ├── entity_model/
│   │   │   ├── CMakeLists.txt
│   │   │   ├── Kconfig              # (optional) ENTITY_MODEL_MAX_ENTITIES, MAX_TYPES
│   │   │   ├── include/
│   │   │   │   └── entity_model.h
│   │   │   └── entity_model.c
│   │   └── entity_coap_server/
│   │       └── ...
│   └── thread/
│       ├── thread_joiner.c
│       ├── thread_endpoint.c
│       ├── thread_network_stop.c
│       ├── coap/              # Shared CoAP utilities
│       ├── device_registry/   # Device registration client
│       ├── status_led/
│       └── boot_btn/
└── CMakeLists.txt
```

- **components/entity/entity_model/CMakeLists.txt**:
  - `idf_component_register(SRCS "entity_model.c" INCLUDE_DIRS "include" REQUIRES ...)`
  - Không cần `driver`, `lwip` (core không đụng GPIO/UDP). Chỉ cần dependencies tối thiểu (freertos nếu dùng mutex).

- **components/entity/entity_model/include/entity_model.h**:
  - API public: `entity_model_init`, `entity_register_type`, `entity_add`, `entity_describe`, `entity_get`, `entity_set`.
  - Include path: app dùng `#include "entity_model.h"` (vì INCLUDE_DIRS "include").

- **Kconfig (optional)**:
  - Thêm `ENTITY_MODEL_MAX_ENTITIES` và `ENTITY_MODEL_MAX_TYPES` trong component Kconfig để mỗi project có thể chỉnh số lượng tối đa (menuconfig) thay vì sửa macro trong header.

**App (main) khi dùng thư viện:**

- Trong **main/CMakeLists.txt**: thêm `entity_model` vào `PRIV_REQUIRES` (hoặc `REQUIRES`):
  `PRIV_REQUIRES ... entity_model`
- Trong **main.c**: `#include "entity_model.h"`, gọi `entity_model_init()`, rồi đăng ký type và add entity (từ code trong main hoặc từ component type).

**Entity types: nằm trong main hay thành component riêng?**

- **Cách 1 – Type trong main**:
  - Giữ `entity_type_on_off_light.c` trong `main/`.
  - Main link cả `entity_model` (component) và file type trong main; gọi `entity_type_on_off_light_register()` trong `app_main`.
  - Ưu: đơn giản, ít component. Nhược: mỗi project muốn dùng on_off_light phải copy file type vào main.

- **Cách 2 – Mỗi type là một component (thư viện type)**
  - Tạo `components/entity_type_on_off_light/` với CMakeLists.txt (REQUIRES entity_model, driver), implement get/set và export hàm `entity_type_on_off_light_register(void)`.
  - Main chỉ cần `PRIV_REQUIRES entity_model entity_type_on_off_light` và gọi `entity_type_on_off_light_register()`.
  - Ưu: tái sử dụng type giữa nhiều project; nhược: nhiều thư mục component hơn.

**Dùng entity model ở project khác (repo khác):**

- Copy cả thư mục `components/entity/entity_model` sang project kia, hoặc
- Đặt component trong repo riêng, trong project app khai báo:
  - `EXTRA_COMPONENT_DIRS "path/to/repo_entity"` (repo có cấu trúc `.../entity/entity_model/` chứa component entity_model), hoặc
  - Dùng [Managed components](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/api-guides/build-system.html#managed-components) (idf_component_register với URL) nếu đẩy component lên GitHub.

**Examples ngay trong repo — có thể, không cần build “ngoài”:**

- **Cách A – Một project, main là example:**
  Giữ nguyên cấu trúc hiện tại: root repo là **một** project ESP-IDF (có `main/` và `components/`). Phần `main/` chính là “example” dùng thư viện. Build như bình thường tại root: `idf.py build`. Không cần thư mục hay project riêng — example nằm trong chính project.

- **Cách B – Nhiều examples trong repo (library-style):**
  Biến repo thành dạng “thư viện kèm examples”: root **không** phải project (xóa hoặc không dùng `main/` và `CMakeLists.txt` tại root), chỉ có:
  - `components/entity/entity_model/`
  - `examples/thread_endpoint/`  ← project 1 (có `main/`, CMakeLists.txt, set `EXTRA_COMPONENT_DIRS ".."` hoặc `"../.."` để trỏ tới chỗ chứa `components/`)
  - `examples/minimal_entity/`   ← project 2 (chỉ entity_model + 1 LED, không Thread)
  Mỗi example là một project độc lập. Build **vẫn trong repo**, từ thư mục example:
  `idf.py -C examples/thread_endpoint build`
  hoặc `idf.py -C examples/minimal_entity build`. Component được tìm nhờ `EXTRA_COMPONENT_DIRS` trong CMakeLists.txt của từng example (trỏ lên thư mục chứa `components/`). Không cần clone repo khác hay build “ra ngoài” — chỉ khác chỗ bạn gọi `idf.py` từ thư mục con.

- **Tóm lại:** Có thể đặt examples ngay trong repo; hoặc 1 project (main = example), hoặc nhiều project con trong `examples/` và build từ từng thư mục example. Cả hai đều build “trong repo”.

**Tóm tắt:**

- **Core** → làm **một component** `entity_model` trong `components/entity/entity_model/` (CMakeLists + include + Kconfig nếu cần).
- **App** → `PRIV_REQUIRES entity_model` và gọi API; entity types có thể nằm trong main (Cách 1) hoặc từng type là component riêng (Cách 2).
- Dùng lại ở project khác: copy component hoặc EXTRA_COMPONENT_DIRS / managed components.

---

## 4. Entity Model (core) – API và dữ liệu

### 4.1 Khái niệm

- **Entity type**:
  - `type_id` (string, vd: `"on_off_light"`),
  - `get_attr(entity, attr_name, value_buf, buf_len)` → 0 = ok, -1 = không có attr/lỗi,
  - `set_attr(entity, attr_name, value_str)` → 0 = ok, -1 = lỗi.

- **Entity**:
  - `id` (string, vd: `"light.0"`),
  - `type` (con trỏ tới entity_type),
  - `name` (string, hiển thị),
  - `instance_data` (void* cho driver: GPIO num, state, cấu hình…).

- **Type registry**: mảng (hoặc danh sách) các `entity_type` đã đăng ký.
- **Entity list**: mảng (hoặc danh sách) các `entity` đã thêm. Dùng mảng cố định (ví dụ tối đa 8 entity, 4 type) để tránh heap, phù hợp ESP.

### 4.2 API đề xuất (entity_model.h)

- `entity_model_init()`
  - Khởi tạo type registry và entity list (clear hoặc set count = 0).

- `entity_register_type(type_id, get_cb, set_cb)`
  - Thêm một type vào registry. Trả về 0/-1.

- `entity_add(entity_id, type_id, name, instance_data)`
  - Thêm entity (type_id phải đã đăng ký). Trả về 0/-1.

- `entity_describe(buf, buf_len)`
  - Ghi mô tả tất cả entity vào `buf` (format text hoặc JSON nhẹ, xem mục 5). Trả về số byte ghi, hoặc -1 nếu lỗi.

- `entity_get(entity_id, attr, value_buf, value_buf_len)`
  - Tìm entity theo `entity_id`, gọi `type->get_attr`, ghi giá trị vào `value_buf`. Trả về 0/-1.

- `entity_set(entity_id, attr, value_str)`
  - Tìm entity, gọi `type->set_attr`. Trả về 0/-1.

Callback có thể có dạng:

- `int (*get_attr_fn)(const char *entity_id, const char *attr, void *instance_data, char *value_buf, size_t value_buf_len);`
- `int (*set_attr_fn)(const char *entity_id, const char *attr, const char *value, void *instance_data);`

(instance_data chính là `entity->instance_data` khi model gọi.)

### 4.3 Bảng entity / type

- Cố định trong RAM (vd: `entity_t entities[8]`, `entity_type_t types[4]`), không malloc.
- Kích thước có thể đặt qua macro (ví dụ `ENTITY_MODEL_MAX_ENTITIES`, `ENTITY_MODEL_MAX_TYPES`) trong `entity_model.h` hoặc Kconfig nếu sau này cần.

---

## 5. Device Discovery & Registration (CoAP)

### 5.1 Tổng quan

Khi device join Thread network, nó tự động **register entity_model** lên Border Router (Leader) qua **CoAP POST** để Leader biết device có những entity nào.

### 5.2 Component: device_registry

**Location**: `components/thread/device_registry/`

**API**:
- `device_registry_init()` - Start CoAP client
- `device_registry_register(callback, ctx)` - Gửi POST request với entity_model

**Implementation**:
- Dùng OpenThread CoAP API (`otCoap`)
- POST đến `/devices/register` trên Leader RLOC (0x0000)
- Payload: text format chứa rloc16, ml_eid, parent, entity_model

**Payload format**:
```
rloc16=0x7c01
ml_eid=fd00:db8:a0:0:xxxx:xxxx:xxxx:xxxx
parent=0x1001
entity_id=light.0 type=on_off_light name=LED
```

### 5.3 Border Router CoAP Server

Border Router cần implement CoAP server để nhận registration:

- **Start CoAP server**: `otCoapStart(instance, 5683)`
- **Register resource**: `otCoapAddResource()` với URI `/devices/register`
- **Handler**: Parse payload, lưu device info, trả `2.01 Created`

Xem chi tiết trong `BORDER_ROUTER_COAP_SERVER.md`.

### 5.4 Flow

1. **Device join** → `on_joined()` callback
2. **Init entity_model** → register types, add entities
3. **device_registry_init()** → start CoAP client
4. **device_registry_register()** → POST entity_model lên Leader
5. **Leader nhận** → parse và lưu vào registry
6. **Leader response** → `2.01 Created` (hoặc `4.00 Bad Request` nếu lỗi)

### 5.5 Re-registration

Device sẽ gửi lại registration khi:
- Role thay đổi (Child → Router)
- Có thể thêm periodic refresh sau này

---

## 6. Giao thức UDP (request / response)

- **Port**: giữ 5684.
- **Một packet = một request**. Response gửi lại cùng socket (địa chỉ nguồn của request).

Hai hướng format:

### Phương án A: Text đơn giản (ít phụ thuộc, dễ parse trên MCU)

- Request:
  - `describe`
  - `get <entity_id> [attr]`
  - `set <entity_id> <attr> <value>`
- Response:
  - describe: mỗi dòng một entity, vd: `entity_id=light.0 type=on_off_light name=LED`
  - get: một dòng `entity_id attr value`, vd: `light.0 state on`
  - set: `ok` hoặc `err`

Ưu điểm: không cần thư viện JSON, buffer nhỏ, parse đơn giản (strtok/sscanf). Nhược: mở rộng nested attr hoặc list sau này sẽ hơi vướng.

### Phương án B: JSON nhẹ (cJSON – ESP-IDF có sẵn component `json`)

- Request: một object, vd:
  `{"cmd":"describe"}`, `{"cmd":"get","entity_id":"light.0","attr":"state"}`, `{"cmd":"set","entity_id":"light.0","attr":"state","value":true}`.
- Response: object (vd: `{"entities":[...]}`, `{"entity_id":"light.0","attr":"state","value":true}`, `{"ok":true}`).

Ưu điểm: dễ mở rộng, controller (web/mobile) xử lý tiện. Nhược: tốn RAM và stack hơn, cần kiểm tra kích thước buffer và độ sâu parse.

**Đề xuất**: bắt đầu với **Phương án A (text)** để ổn định model và flow; sau nếu cần có thể thêm một lớp “protocol adapter” (text ↔ JSON) hoặc chuyển sang JSON từng bước.

---

## 7. Luồng khởi tạo và xử lý request

1. **Boot**:
   `app_main` → `entity_model_init()` → gọi từng `entity_register_*()` (vd: từ `entity_type_on_off_light_register()`) → gọi từng `entity_add(...)` (vd: thêm `light.0` với instance_data là struct chứa GPIO 8 và state) → `led_udp_server_start()`.

2. **Join Thread**:
   `on_joined()` → `entity_model_init()` (nếu chưa) → `on_off_light_register()` → `led_udp_server_start()` → `device_registry_init()` → `device_registry_register()` (POST entity_model lên Leader).

3. **UDP server** (trong task hiện tại):
   - `recvfrom` → parse dòng đầu (hoặc token đầu) để nhận diện: describe / get / set.
   - describe → `entity_describe(buf, len)` → `sendto(buf)`.
   - get → parse entity_id (+ attr) → `entity_get(...)` → format response → `sendto`.
   - set → parse entity_id, attr, value → `entity_set(...)` → gửi `ok`/`err`.
   - Nếu không nhận dạng được: gửi `err` hoặc `unknown_cmd`.

4. **Tương thích ngược (tùy chọn)**:
   Nếu muốn giữ lệnh “on”/“off” cũ: trong parser, nếu không khớp describe/get/set thì fallback: nếu chuỗi là `on`/`off` thì coi như `set light.0 state on`/`off` rồi gọi `entity_set`. Như vậy firmware mới vẫn chấp nhận controller cũ.

---

## 8. Cách thêm entity / type mới sau này

- **Thêm entity cùng type (vd: đèn thứ hai)**:
  - Trong init: gọi thêm `entity_add("light.1", "on_off_light", "LED 2", &led2_instance)`.
  - Driver `on_off_light` phải hỗ trợ nhiều instance (instance_data khác nhau cho từng entity).

- **Thêm type mới (vd: temperature_sensor)**:
  - Tạo file `entity_type_temperature_sensor.c`.
  - Implement `get_attr` (vd: đọc ADC, format nhiệt độ), `set_attr` (nếu có) hoặc no-op.
  - Trong init: gọi `entity_register_type("temperature_sensor", get_cb, set_cb)` và `entity_add("sensor.0", "temperature_sensor", "Temperature", &sensor_instance)`.
  - UDP server không cần sửa (đã generic: describe/get/set theo entity_id).

- **Thêm attribute mới cho một type**:
  Trong driver (get_cb/set_cb) của type đó, so sánh `attr` với tên mới (vd: `brightness`) và xử lý tương ứng. Entity model core không cần biết tên attr, chỉ chuyển tiếp.

---

## 9. Thứ tự triển khai (khi bắt đầu code)

**Nếu làm dạng thư viện (component)** – làm theo thứ tự sau:

1. **Tạo component entity_model**: thư mục `components/entity/entity_model/`, CMakeLists.txt, Kconfig (optional), `include/entity_model.h`, `entity_model.c` — định nghĩa struct, API, registry + entity list.
2. **main/CMakeLists.txt**: thêm `PRIV_REQUIRES entity_model` (không còn SRCS cho entity_model).
3. **entity_type_on_off_light**: implement trong `main/entity_type_on_off_light.c` (hoặc tạo component `entity_type_on_off_light` nếu muốn type cũng là thư viện); đăng ký type và add entity `light.0`.
4. **led_udp_server.c**: refactor — parse describe/get/set (text), gọi entity_*(), format và gửi response; (tùy chọn) giữ fallback on/off.
5. **device_registry component**: tạo `components/thread/device_registry/` với CoAP client wrapper để gửi POST request lên Leader.
6. **main.c**: `entity_model_init()`, `entity_type_on_off_light_register()`, `led_udp_server_start()`, `device_registry_init()`, `device_registry_register()`.
7. **Border Router**: implement CoAP server để nhận và xử lý registration (xem `BORDER_ROUTER_COAP_SERVER.md`).

**Nếu làm toàn bộ trong main** (không tách component): bước 1–2 thay bằng đặt `entity_model.c` và `entity_model.h` trong `main/` và thêm `entity_model.c` vào SRCS của main.

Sau khi chạy ổn: mở rộng type/entity khác theo nhu cầu (sensor, dimmer, …).

---

## 10. Rủi ro và lưu ý

- **RAM**: mảng entity/type cố định; chuỗi entity_id/name/type_id nên dùng const hoặc buffer nhỏ, tránh copy lớn.
- **Thread-safety**: hiện tại UDP task và main đều có thể đụng entity list; nếu sau này có task khác ghi state (vd: sensor đọc định kỳ), nên có mutex hoặc quy ước “chỉ UDP task gọi set, driver chỉ ghi instance_data trong get/set”.
- **Bảo mật**: UDP không bảo mật; CoAP có thể dùng CoAP Secure (DTLS) nếu cần. Hiện tại dùng CoAP không mã hóa trong Thread mesh (đã có MAC layer security).
- **Kích thước packet**: giới hạn buffer describe (vd: 512 byte) để tránh tràn; số entity tối đa có thể tính từ độ dài mỗi dòng.

---

## 11. Tóm tắt

- **Core**: entity model với type registry + entity list, API describe / get / set theo entity_id và attr.
- **Driver**: từng entity type (bắt đầu với on_off_light) đăng ký type và thêm entity, implement get/set.
- **Giao thức**: 
  - **UDP** (port 5684): text format (describe / get / set) cho controller điều khiển trực tiếp
  - **CoAP POST** (port 5683): device tự động register entity_model lên Border Router khi join
- **Device Registry**: component `device_registry` dùng OpenThread CoAP API để push device info lên Leader
- **Border Router**: cần implement CoAP server để nhận và lưu device registry (xem `BORDER_ROUTER_COAP_SERVER.md`)
- **Mở rộng**: thêm entity = gọi `entity_add`; thêm type = thêm file driver + register_type + add entity.
- **Triển khai**: làm lần lượt entity_model → on_off_light → refactor UDP server → device_registry → Border Router CoAP server.

## 12. Components đã tạo

**Thread Components** (`components/thread/`):
- ✅ `components/thread/thread_joiner.c` - Thread joiner với callback
- ✅ `components/thread/thread_endpoint.c` - Thread endpoint framework (OpenThread init, LED, boot button, joiner, device registry)
- ✅ `components/thread/thread_network_stop.c` - CoAP resource `/network/stop` handler (chỉ Leader xử lý, stop → đợi 120s → restart)
- ✅ `components/thread/coap/` - Shared CoAP server utilities (thread_coap)
- ✅ `components/thread/device_registry/` - CoAP client để register device lên Border Router
- ✅ `components/thread/status_led/` - Status LED indicator
- ✅ `components/thread/boot_btn/` - Boot button handler

**Entity Components** (`components/entity/`):
- ✅ `components/entity/entity_model/` - Core entity model (type registry, entity list, describe/get/set)
- ✅ `components/entity/entity_coap_server/` - CoAP server để điều khiển entities qua CoAP

## 13. Example: light_on_off

- **Đường dẫn**: `examples/light_on_off/`
- **Chức năng**: Thread Endpoint FTD + Joiner, Entity Model (on_off_light), entity_coap_server, device_registry, thread_network_stop (khi `enable_network_stop_handler = true`).
- **Không dùng OpenThread CLI**: Example đã gỡ toàn bộ CLI (esp_ot_cli_extension, esp_openthread_launch_mainloop, CONFIG_OPENTHREAD_CLI). Chỉ chạy app (entity + CoAP server), không có lệnh `ot` trên console.

## 14. Tài liệu liên quan

- `BORDER_ROUTER_COAP_SERVER.md` - Hướng dẫn implement CoAP server trên Border Router
- `LEADER_STOP_COMMAND_COAP.md` - CoAP GET `/network/stop` cho Leader, triển khai trong `components/thread/thread_network_stop.c`
