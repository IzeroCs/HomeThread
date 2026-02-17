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

```c
static void device_register_handler(void *aContext, otMessage *aMessage,
                                    const otMessageInfo *aMessageInfo)
{
    (void)aContext;

    // Parse payload từ aMessage
    uint16_t payload_len = otMessageGetLength(aMessage) - otMessageGetOffset(aMessage);
    char payload[768];
    otMessageRead(aMessage, otMessageGetOffset(aMessage), payload, payload_len);
    payload[payload_len] = '\0';

    // Parse: rloc16, ml_eid, parent, entity_model
    // Save vào registry/database

    // Tạo response: 2.01 Created
    otMessage *response = otCoapNewMessage(instance, NULL);
    otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT, OT_COAP_CODE_2_01_CREATED);
    otCoapSendResponse(instance, response, aMessageInfo);
}

// Register resource
static otCoapResource s_device_register_resource;
memset(&s_device_register_resource, 0, sizeof(s_device_register_resource));
s_device_register_resource.mUriPath = "devices";
s_device_register_resource.mHandler = device_register_handler;
s_device_register_resource.mContext = NULL;

otCoapAddResource(instance, &s_device_register_resource);
```

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

Có thể lưu vào:
- **In-memory list** (đơn giản, mất khi reboot)
- **NVS** (persistent qua reboot)
- **Database** (SQLite, Redis, v.v.)
- **REST API** (gửi lên cloud/server)

Ví dụ structure:
```c
typedef struct {
    uint16_t rloc16;
    char ml_eid[40];
    uint16_t parent_rloc16;
    char entity_model[512];
    uint64_t registered_time;
} device_info_t;
```

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

## Example Implementation

### CoAP Server Component

Tạo component `device_registry_server` trên Border Router:

**device_registry_server.h:**
```c
esp_err_t device_registry_server_init(void);
```

**device_registry_server.c:**
```c
#include "openthread/coap.h"
#include "openthread/message.h"

static void device_register_handler(void *aContext, otMessage *aMessage,
                                    const otMessageInfo *aMessageInfo)
{
    otInstance *instance = esp_openthread_get_instance();

    // Read payload
    uint16_t offset = otMessageGetOffset(aMessage);
    uint16_t payload_len = otMessageGetLength(aMessage) - offset;
    char payload[768];

    if (payload_len >= sizeof(payload)) {
        payload_len = sizeof(payload) - 1;
    }
    otMessageRead(aMessage, offset, payload, payload_len);
    payload[payload_len] = '\0';

    // Parse và save device info
    // TODO: Parse payload, save to registry

    // Send response
    otMessage *response = otCoapNewMessage(instance, NULL);
    if (response) {
        otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT,
                         OT_COAP_CODE_2_01_CREATED);
        otCoapSendResponse(instance, response, aMessageInfo);
    }
}

esp_err_t device_registry_server_init(void)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        return ESP_ERR_INVALID_STATE;
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        return ESP_ERR_TIMEOUT;
    }

    // Start CoAP server
    otError err = otCoapStart(instance, OT_DEFAULT_COAP_PORT);
    if (err != OT_ERROR_NONE) {
        esp_openthread_lock_release();
        return ESP_FAIL;
    }

    // Register resource
    static otCoapResource s_resource;
    memset(&s_resource, 0, sizeof(s_resource));
    s_resource.mUriPath = "devices";
    s_resource.mHandler = device_register_handler;
    s_resource.mContext = NULL;

    err = otCoapAddResource(instance, &s_resource);
    esp_openthread_lock_release();

    if (err != OT_ERROR_NONE) {
        return ESP_FAIL;
    }

    return ESP_OK;
}
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

## Testing

### Test từ CLI (nếu Border Router có CLI):

```bash
# Start CoAP server
ot coap start

# Add resource
ot coap resource devices

# Check registered devices (nếu có command)
ot devices list
```

### Test từ Child:

Child tự động gửi POST khi join. Kiểm tra log trên Border Router để xem có nhận được request không.

---

## Next Steps

1. **Parse payload**: Implement parser để extract rloc16, ml_eid, parent, entity_model
2. **Registry storage**: Chọn cách lưu (NVS, database, REST API)
3. **Query API**: Thêm GET endpoints để query devices
4. **Update mechanism**: Xử lý khi device gửi lại (update thay vì duplicate)
