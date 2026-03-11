# Thread-Node — Product Context

## Vấn đề cần giải quyết

### 1. Độ phức tạp của Thread mesh

Việc viết firmware cho một thiết bị IoT kết nối Thread từ đầu đòi hỏi:
- Hiểu sâu về OpenThread API (joining, role transitions, CoAP, lock patterns)
- Xử lý nhiều trạng thái mạng (detached, child, router, leader)
- Đồng bộ hóa giữa OpenThread task và FreeRTOS tasks khác (mutex lock)
- Retry logic khi join thất bị, factory reset, persistent dataset

Thread-Node đóng gói toàn bộ phức tạp này thành một API duy nhất.

### 2. Cần hệ thống đăng ký thiết bị tập trung

Border Router (Thread-Host) cần biết:
- Thiết bị nào đang online
- Thiết bị đó có những entity (light, sensor, ...) gì
- Các thuộc tính của từng entity
- Trạng thái mạng của thiết bị (IP, RLOC, role)

Thread-Node giải quyết bằng cách gửi hai request CoAP lên **Backend** (không phải BR): (1) POST `/device/register/info` — device_info (keys 0–6, **key 0 = mac_address bstr(8)** EUI-64 802.15.4); (2) POST `/device/register/entity` — **key 0** mac bstr(8) + **key 1** array entities. Địa chỉ Backend lấy từ **thread_discovery** (SRP/DNS-SD `_dashboard._udp`). **thread_node** khi `enable_device_registry` tự chạy discovery (retry 10s khi chưa có backend, refresh 60s khi đã có), ping 10s; khi có endpoint hoặc endpoint đổi thì gửi register/info rồi register/entity (liên tiếp); khi GET `/device/ping` nhận timestamp backend khác thì gửi lại cả hai. Mọi role **Child/Router/Leader** đều gửi được; CoAP token 2 byte; chờ ACK (2.01/2.04/2.05). Spec: `Documents/coap/device_payload_spec.md`.

### 3. Quản lý Leader role

Trong Thread mesh, nếu không có Border Router, một node thường tự trở thành Leader. Khi Border Router kết nối lại, nó cần lấy lại vai trò Leader. Thread-Node sử dụng `prefer_not_leader` và `router_selection_jitter` để tránh trở thành Leader khi không mong muốn.

## Cách hoạt động

### Luồng khởi động thiết bị

```
main()
  └─ thread_node_start(on_joined_callback)
       ├─ nvs_flash_init()
       ├─ status_led_init()          → LED đỏ nhấp nháy (Boot)
       ├─ boot_btn_init()            → Giám sát long press → factory reset
       ├─ esp_openthread_start()     → Khởi động OpenThread stack
       └─ thread_joiner_start()
            ├─ [Có dataset] → otThreadSetEnabled() → reattach trực tiếp
            └─ [Không có] → otJoinerStart(pskd) → chờ Commissioner
                 └─ [Join thành công]
                      ├─ status_led_update(CHILD/ROUTER)
                      ├─ thread_coap_start()
                      ├─ device_registry_init()          → (nếu enable_device_registry)
                      ├─ thread_discovery_init()        → (nếu enable_device_registry)
                      ├─ Discovery lần đầu + task discovery (10s/60s) + task ping 10s (thread_node nội bộ)
                      └─ on_joined_callback()           → App chỉ setup entities + entity_coap_server; không gọi discovery/register/ping
```

### Luồng callback của lập trình viên (on_joined)

```c
void on_joined(void) {
    // 1. Khởi tạo device model
    device_model_init("my_device", "My Light", DEVICE_TYPE_LIGHT, ...);
    
    // 2. Khởi tạo entity system
    entity_model_init();
    entity_model_register_type("on_off_light", ENTITY_TYPE_LIGHT, sizeof(entity_light_t));
    
    // 3. Thêm entity
    entity_light_t *light = ...;
    entity_add("light.0", "Main Light", "on_off_light", light);
    
    // 4. Sync với device model và khởi động CoAP server
    device_model_sync_entities();
    entity_coap_server_start();
}
```

### Giao tiếp CoAP

```
Thread-Node                    Backend (địa chỉ từ backend discovery)     Border Router (Thread-Host)
    │                                         │                                        │
    │── POST /device/register (CBOR keys 0–8) ─►│  Đăng ký device + network               │
    │── POST /device/entities (device_id + arr) ►│  Đăng ký / cập nhật entities            │
    │   [sau discovery hoặc ping timestamp đổi; gửi liên tiếp; 2.01/2.04/2.05]         │
    │                                         │                                        │
    │◄── PUT /entities/light.0/state ────────────────────────────────────────────────│  BR điều khiển entity
    │── 2.04 Changed ───────────────────────────────────────────────────────────────►│
```

## Trải nghiệm lập trình viên (Developer UX)

### Mục tiêu thiết kế

- **Minimal boilerplate**: Chỉ cần gọi `thread_node_start()` và implement `on_joined()`
- **Zero network code**: Lập trình viên không cần biết về OpenThread API, CoAP, hay CBOR
- **Extensible entity types**: Định nghĩa entity type mới bằng cách đăng ký struct C

### Ví dụ tối thiểu (từ `examples/light_on_off/`)

```c
// main.c
#include "thread_node.h"

void on_joined(void) {
    // Setup device + entities ở đây
    on_off_light_init();
}

void app_main(void) {
    thread_node_start(on_joined);
}
```

### LED Status phản hồi trực quan

| Trạng thái | Màu LED |
|---|---|
| Boot/Init | Đỏ nhấp nháy |
| Chưa join (Joiner active) | Vàng nhấp nháy |
| Detached | Xanh dương nhấp nháy |
| Child | Xanh dương solid |
| Router | Tím solid |
| Leader | Xanh lá solid |

### Factory Reset

Giữ nút BOOT > `CONFIG_BOOT_BTN_HOLD_MS_DEFAULT` ms → xóa NVS + OpenThread dataset → restart. Cho phép re-commission thiết bị vào mạng mới mà không cần flash lại firmware.

## Người dùng của framework

1. **Lập trình viên nhúng** xây dựng thiết bị IoT cụ thể (ví dụ: đèn, cảm biến) — sử dụng framework như một black box, chỉ implement `on_joined()`

2. **Hệ thống HomeThread** — Thread-Host (Border Router) tương tác với Thread-Node qua CoAP để thu thập device info và gửi control commands
