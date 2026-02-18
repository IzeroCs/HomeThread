# Border Router CoAP Server - Device Registry

## Tổng quan

Border Router (Leader) cần có **CoAP server** để nhận POST request từ child devices đăng ký entity_model. File này mô tả cách implement CoAP server trên Border Router.

---

## Kiến trúc

```
┌─────────────────────────────────────────────────────────────┐
│  Child Device (Endpoint)                                     │
│  - device_registry_register()                                │
│  - CoAP POST /devices/register                               │
│  - Payload: rloc16, ml_eid, parent, entity_model             │
└───────────────────────────┬─────────────────────────────────┘
                            │ CoAP POST
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Border Router (Leader)                                     │
│  - CoAP Server (port 5683)                                  │
│  - Resource: /devices/register                              │
│  - Handler: parse payload, save to registry                │
│  - Response: 2.01 Created                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Các bước implement trên Border Router

### 1. Enable CoAP API

Trong `openthread_custom_config.h` (hoặc config của Border Router):

```c
#ifndef OPENTHREAD_CONFIG_COAP_API_ENABLE
#define OPENTHREAD_CONFIG_COAP_API_ENABLE 1
#endif
```

### 2. Start CoAP Server

```c
#include "openthread/coap.h"

otInstance *instance = esp_openthread_get_instance();
otError err = otCoapStart(instance, OT_DEFAULT_COAP_PORT);  // Port 5683
```

### 3. Register Resource Handler

✅ **Đã implement** trong `device_registry_server.c`:

- Resource path: `/devices/register` (không phải `/devices`)
- Handler parse payload và lưu vào registry
- Tự động update nếu device đã tồn tại (dựa trên rloc16)
- Log thông tin registration để debug

### 4. Parse Payload

Payload format từ child:
```
rloc16=0x7c01
ml_eid=fd00:db8:a0:0:xxxx:xxxx:xxxx:xxxx
parent=0x1001
entity_id=light.0 type=on_off_light name=LED
```

Parse để lấy:
- **rloc16**: RLOC16 của child (0x7c01)
- **ml_eid**: Mesh-Local EID của child
- **parent**: RLOC16 của parent router (0x1001)
- **entity_model**: Danh sách entities (entity_id, type, name)

### 5. Lưu vào Registry

✅ **Đã implement**: In-memory storage với các tính năng:
- Tối đa 32 devices (`MAX_DEVICES = 32`)
- Tự động update nếu device đã tồn tại (dựa trên `rloc16`)
- Lưu timestamp khi register (`registered_time`)
- Log khi register/update device

**Có thể mở rộng sau:**
- **NVS** (persistent qua reboot)
- **Database** (SQLite, Redis, v.v.)
- **REST API** (gửi lên cloud/server)

### 6. Response

Trả về `2.01 Created` nếu thành công:
```c
otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT, OT_COAP_CODE_2_01_CREATED);
otCoapSendResponse(instance, response, aMessageInfo);
```

Hoặc `4.00 Bad Request` nếu payload không hợp lệ:
```c
otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT, OT_COAP_CODE_4_00_BAD_REQUEST);
otCoapSendResponse(instance, response, aMessageInfo);
```

---

## Implementation Status

✅ **Đã hoàn thành**: CoAP server đã được implement và tích hợp vào project.

### Files đã tạo:

1. **`main/openthread_custom_config.h`**: Enable CoAP API
2. **`main/device_registry_server.h`**: Header file
3. **`main/device_registry_server.c`**: Implementation đầy đủ

### Tích hợp vào main.c:

```c
#include "device_registry_server.h"

void app_main(void)
{
    // ... OpenThread initialization ...
    
    ESP_ERROR_CHECK(esp_openthread_start(&config));
    esp_netif_set_default_netif(esp_openthread_get_netif());
    
    ESP_ERROR_CHECK(led_status_start(NULL));
    
    // Start device registry CoAP server để nhận device registration
    ESP_ERROR_CHECK(device_registry_server_init());
    
    // ...
}
```

**Lưu ý**: Code CoAP ping test đã được xóa khỏi `main.c`. Chỉ giữ lại `device_registry_server` để xử lý device registration.

### Cấu hình CMakeLists.txt:

```cmake
idf_component_register(SRCS "led_status.c" "main.c" "device_registry_server.c"
                       PRIV_REQUIRES esp_coex esp_event nvs_flash openthread driver esp_driver_rmt
                       INCLUDE_DIRS ".")
```

---

## Implementation Details

### 1. Enable CoAP API

File `main/openthread_custom_config.h`:
```c
#ifndef OPENTHREAD_CONFIG_COAP_API_ENABLE
#define OPENTHREAD_CONFIG_COAP_API_ENABLE 1
#endif
```

### 2. CoAP Server Component

**device_registry_server.h:**
```c
esp_err_t device_registry_server_init(void);
```

**device_registry_server.c** đã implement:
- ✅ CoAP server trên port 5683
- ✅ Resource handler cho `/devices/register` (POST)
- ✅ Parse payload: `rloc16`, `ml_eid`, `parent`, `entity_model`
- ✅ In-memory registry (tối đa 32 devices)
- ✅ Update mechanism: tự động update nếu device đã tồn tại
- ✅ Response codes: `2.01 Created` hoặc `5.03 Service Unavailable`

### 3. Registry Storage

Hiện tại dùng **in-memory storage**:
- Tối đa 32 devices (`MAX_DEVICES`)
- Mất dữ liệu khi reboot
- Tự động update nếu device gửi lại registration

**Structure:**
```c
typedef struct {
    uint16_t rloc16;
    char ml_eid[40];
    uint16_t parent_rloc16;
    char entity_model[512];
    uint64_t registered_time;  // milliseconds
} device_info_t;
```

---

## Payload Format

### Text Format (hiện tại)

```
rloc16=0x7c01
ml_eid=fd00:db8:a0:0:xxxx:xxxx:xxxx:xxxx
parent=0x1001
entity_id=light.0 type=on_off_light name=LED
```

### JSON Format (có thể chuyển sau)

```json
{
  "rloc16": "0x7c01",
  "ml_eid": "fd00:db8:a0:0:xxxx:xxxx:xxxx:xxxx",
  "parent": "0x1001",
  "entities": [
    {
      "entity_id": "light.0",
      "type": "on_off_light",
      "name": "LED"
    }
  ]
}
```

---

## API để Query Devices

Sau khi lưu vào registry, có thể thêm API để query:

### CoAP GET `/devices`

Trả về danh sách tất cả devices đã register.

### CoAP GET `/devices/{rloc16}`

Trả về thông tin device cụ thể.

---

## Lưu ý

1. **CoAP server chỉ chạy trên Leader**: Chỉ Border Router (Leader) cần implement server này.
2. **Port 5683**: CoAP default port, có thể đổi nếu cần.
3. **Thread routing**: CoAP request tự động route qua Thread mesh đến Leader.
4. **Response timeout**: Child sẽ retry nếu không nhận được response.
5. **Re-registration**: Child sẽ gửi lại khi role thay đổi (Child → Router).

---

## Gửi CoAP đến Leader khi RLOC16 không phải 0x0000

### Vấn đề

Trong OpenThread, Leader có thể có Router ID bất kỳ (0-31), không nhất thiết phải là Router ID 0. Do đó RLOC16 của Leader có thể không phải 0x0000.

### Giải pháp

#### Cách 1: Dùng Leader ALOC (Anycast Locator) - Khuyến nghị

Leader ALOC luôn có ALOC16 = `0xfc00`, không phụ thuộc vào Router ID:

```c
// Construct Leader ALOC: mesh_prefix + 0000:00ff:fe00:fc00
otIp6Address leader_aloc;
const otMeshLocalPrefix *mesh_prefix = otThreadGetMeshLocalPrefix(instance);
memcpy(&leader_aloc.mFields.m8[0], mesh_prefix->m8, 8);
leader_aloc.mFields.m8[8] = 0x00;
leader_aloc.mFields.m8[9] = 0x00;
leader_aloc.mFields.m8[10] = 0x00;
leader_aloc.mFields.m8[11] = 0xff;
leader_aloc.mFields.m8[12] = 0xfe;
leader_aloc.mFields.m8[13] = 0x00;
leader_aloc.mFields.m8[14] = 0xfc;
leader_aloc.mFields.m8[15] = 0x00;

// Gửi CoAP đến Leader ALOC
otCoapSendRequest(instance, message, &leader_aloc, ...);
```

#### Cách 2: Dùng API `otThreadGetLeaderRloc()` (nếu có)

```c
otIp6Address leader_rloc;
otThreadGetLeaderRloc(instance, &leader_rloc);
// Gửi CoAP đến Leader RLOC
otCoapSendRequest(instance, message, &leader_rloc, ...);
```

#### Cách 3: Construct Leader RLOC từ Leader Router ID

```c
// 1. Lấy Leader Data
otLeaderData leader_data;
otThreadGetLeaderData(instance, &leader_data);
uint8_t leader_router_id = leader_data.mLeaderRouterId;

// 2. Tính RLOC16: RLOC16 = (Router ID << 10) | Child ID
// Child ID = 0 cho Router
uint16_t leader_rloc16 = (leader_router_id << 10) | 0x0000;

// 3. Construct Leader RLOC address
const otMeshLocalPrefix *mesh_prefix = otThreadGetMeshLocalPrefix(instance);
otIp6Address leader_rloc;
memcpy(&leader_rloc.mFields.m8[0], mesh_prefix->m8, 8);
leader_rloc.mFields.m8[8] = 0x00;
leader_rloc.mFields.m8[9] = 0x00;
leader_rloc.mFields.m8[10] = 0x00;
leader_rloc.mFields.m8[11] = 0xff;
leader_rloc.mFields.m8[12] = 0xfe;
leader_rloc.mFields.m8[13] = 0x00;
leader_rloc.mFields.m8[14] = (leader_rloc16 >> 8) & 0xff;
leader_rloc.mFields.m8[15] = leader_rloc16 & 0xff;
```

**Khuyến nghị**: Dùng **Cách 1 (Leader ALOC)** vì đơn giản và không cần biết Router ID của Leader.

---

## ⚠️ Vấn đề quan trọng: Border Router phải là Leader

### Vấn đề

**CoAP server chỉ chạy trên Border Router**, nhưng child devices gửi CoAP đến **Leader ALOC (0xfc00)**. Thread sẽ route message đến Leader hiện tại.

**Nếu Border Router không phải Leader:**
- Child devices gửi CoAP đến Leader ALOC → Message được route đến Leader cũ (Router cũ)
- CoAP server không chạy trên Leader cũ → **Message không được xử lý!**
- Dữ liệu registration sẽ bị mất

### Giải pháp

#### ✅ Option 1: Border Router phải là Leader (Khuyến nghị)

**Thiết kế đúng:**
1. **Border Router form network trước** → Tự động trở thành Leader
2. **Router khác join sau** với weight thấp (0 hoặc -16) → Không cạnh tranh leadership
3. **Child devices gửi CoAP đến Leader ALOC** → Message đến Border Router → Được xử lý ✅

**Cấu hình Leader Weight:**
- Border Router: `mLeaderWeightAdjustment = +16`, `mIsBorderRouter = true`, `mPowerSupply = EXTERNAL_STABLE`
- Router khác: `mLeaderWeightAdjustment = 0` hoặc `-16`, `mIsBorderRouter = false`

**Nếu Border Router restart và join lại:**
- Border Router có weight cao hơn nhưng Leader cũ không tự động từ chức
- **Giải pháp**: Restart Leader cũ để force re-election → Border Router sẽ trở thành Leader

#### Option 2: Child devices gửi đến Border Router cụ thể

Nếu không thể đảm bảo Border Router là Leader, child devices phải:
- **Không dùng Leader ALOC**
- Gửi CoAP đến **RLOC hoặc Mesh-Local EID của Border Router** cụ thể
- Cần biết địa chỉ của Border Router (không linh hoạt)

**Không khuyến nghị** vì:
- Phức tạp hơn (cần biết địa chỉ Border Router)
- Không tự động khi Border Router thay đổi địa chỉ
- Vi phạm thiết kế Thread (Leader ALOC là cách chuẩn để gửi đến Leader)

### Kết luận

**Border Router PHẢI là Leader** để CoAP server hoạt động đúng. Đây là thiết kế chuẩn của Thread network:
- Leader quản lý network và nhận requests từ child devices
- Border Router là Leader để có thể xử lý CoAP registration requests
- Router khác chỉ forward traffic, không cần CoAP server

---

## Testing

### Log Messages

Khi nhận được registration request, Border Router sẽ log:
```
I (xxx) device_registry: Received registration request from xxxx
I (xxx) device_registry: Registered new device rloc16=0x7c01, ml_eid=fd00:db8:..., parent=0x1001
```

Hoặc nếu device đã tồn tại:
```
I (xxx) device_registry: Updated device rloc16=0x7c01
```

### Test từ Child Device

Child device gửi CoAP POST đến `/devices/register` với payload:
```
rloc16=0x7c01
ml_eid=fd00:db8:a0:0:xxxx:xxxx:xxxx:xxxx
parent=0x1001
entity_id=light.0 type=on_off_light name=LED
```

Border Router sẽ:
1. Parse payload
2. Lưu vào registry (hoặc update nếu đã tồn tại)
3. Trả về `2.01 Created`

### Kiểm tra Registry

Hiện tại registry chỉ lưu trong memory. Để xem devices đã register, check log khi có request đến.

---

## Next Steps (Future Enhancements)

1. ✅ **Parse payload**: ✅ Đã implement parser để extract rloc16, ml_eid, parent, entity_model
2. ✅ **Registry storage**: ✅ Đã implement in-memory storage (có thể mở rộng NVS/database sau)
3. ✅ **Update mechanism**: ✅ Đã implement - tự động update nếu device đã tồn tại
4. ✅ **Leader addressing**: ✅ Đã document cách gửi CoAP đến Leader khi RLOC16 không phải 0x0000
5. ⏳ **Query API**: Thêm GET endpoints để query devices (`/devices`, `/devices/{rloc16}`)
6. ⏳ **Persistent storage**: Chuyển sang NVS để lưu qua reboot
7. ⏳ **Device removal**: Xử lý khi device offline (timeout, heartbeat)
8. ⏳ **Statistics**: Thêm API để xem số lượng devices, last update time, etc.

---

## Vấn đề đã giải quyết

### 1. Leader RLOC16 không phải 0x0000

**Vấn đề**: OpenThread không đảm bảo Leader có RLOC16 = 0x0000. Router ID của Leader có thể là bất kỳ giá trị từ 0-31.

**Giải pháp**: 
- Child devices nên dùng **Leader ALOC** (ALOC16 = 0xfc00) để gửi CoAP đến Leader
- Hoặc dùng API `otThreadGetLeaderRloc()` để lấy Leader RLOC address
- Không nên hardcode RLOC16 = 0x0000

**Tài liệu tham khảo**: Xem phần "Gửi CoAP đến Leader khi RLOC16 không phải 0x0000" ở trên.

### 2. Border Router phải là Leader để CoAP server hoạt động

**Vấn đề**: CoAP server chỉ chạy trên Border Router, nhưng child devices gửi CoAP đến Leader ALOC. Nếu Border Router không phải Leader, message sẽ đến Leader cũ và không được xử lý.

**Giải pháp**:
- **Border Router phải form network trước** để trở thành Leader
- Set Leader Weight cao nhất (`mLeaderWeightAdjustment = +16`) trên Border Router
- Router khác join với weight thấp (0 hoặc -16) để không cạnh tranh leadership
- Nếu Border Router restart và join lại, restart Leader cũ để force re-election

**Tài liệu tham khảo**: Xem phần "⚠️ Vấn đề quan trọng: Border Router phải là Leader" ở trên.

---

## Cập nhật liên quan (Leader Control, LED)

- **Leader Control (network stop):** Border Router gửi CoAP **GET** `/network` (một segment) đến Leader để yêu cầu stop; Leader offline sau đó Border Router có thể trở thành Leader mới. Chi tiết format, handler endpoint, timing bầu Leader: xem **`LEADER_STOP_COMMAND_COAP.md`**.
- **OpenThread CoAP path match:** Resource match theo **full path string**. Resource `mUriPath = "network"` chỉ match request path `"network"`, không match `"network/stop"`. Client gửi GET với một segment `"network"`.
- **LED status (WS2812):** Disabled = đỏ nhấp nháy; Detached = xanh dương nhấp nháy; Leader = xanh lá tĩnh; Router = tím tĩnh; Child = xanh dương tĩnh (`led_status.c`).
