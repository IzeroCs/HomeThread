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

Thread-Node giải quyết bằng cách tự động gửi CBOR-encoded device model lên `/device/register` sau khi join thành công. Chỉ gửi khi role là **Child hoặc Router**; gửi xong **chờ ACK/NACK** (timeout 20s). **Thành công thì chỉ gửi 1 lần rồi dừng**; chỉ gửi lại khi có notify (role change hoặc Leader yêu cầu re-register). Thất bại thì retry sau 2s — tránh tích tụ request và NoBufs. Leader (Border Router) phải luôn trả response (ACK/NACK) cho mọi request (xem `docs/coap/border_router_coap_server.md`).

### 3. Quản lý Leader role

Trong Thread mesh, nếu không có Border Router, một node thường tự trở thành Leader. Khi Border Router kết nối lại, nó cần lấy lại vai trò Leader. Thread-Node hỗ trợ lệnh `/network/stop` để tạm thời rời mạng 120 giây, cho phép BR tái thiết lập leader role.

## Cách hoạt động

### Luồng khởi động thiết bị

```
main() 
  └─ thread_endpoint_start(on_joined_callback)
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
                      ├─ thread_network_stop_register()  → /network/stop resource
                      ├─ on_joined_callback()            → App setup entities
                      └─ device_registry_start()         → Gửi CBOR một lần (one-shot sau ACK)
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

### Giao tiếp CoAP với Border Router

```
Thread-Node                           Border Router (Thread-Host)
    │                                         │
    │── POST /device/register (CBOR) ────────►│  Đăng ký device + entities
    │   [chỉ khi Child/Router; one-shot,     │
    │    dừng sau ACK; Leader trả 2.01/NACK]│
    │   [device_type, sw_version, hw_version  │
    │    = number để giảm băng thông]        │
    │                                         │
    │◄── GET /network/stop ──────────────────│  BR yêu cầu node tạm rời mạng
    │── 2.05 Content ──────────────────────►│
    │   [rời mạng 120s, BR lấy lại Leader]   │
    │                                         │
    │◄── PUT /entities/light.0/state ────────│  BR điều khiển entity
    │── 2.04 Changed ──────────────────────►│
```

## Trải nghiệm lập trình viên (Developer UX)

### Mục tiêu thiết kế

- **Minimal boilerplate**: Chỉ cần gọi `thread_endpoint_start()` và implement `on_joined()`
- **Zero network code**: Lập trình viên không cần biết về OpenThread API, CoAP, hay CBOR
- **Extensible entity types**: Định nghĩa entity type mới bằng cách đăng ký struct C

### Ví dụ tối thiểu (từ `examples/light_on_off/`)

```c
// main.c
#include "thread_endpoint.h"

void on_joined(void) {
    // Setup device + entities ở đây
    on_off_light_init();
}

void app_main(void) {
    thread_endpoint_start(on_joined);
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
