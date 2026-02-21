# Border Router CoAP Server - Device Registry

> **Platform:** ESP-IDF + OpenThread
> **Role:** Border Router (Leader)

CoAP server trên BR (port 5683) nhận đăng ký từ child devices. Resources được xử lý bởi `device_registry_server` + `device_registry_handler`.

---

## Resources

| Path | Method | Mô tả |
|------|--------|--------|
| `/device/register` | POST | Đăng ký device (payload: rloc16, ml_eid, parent, entity_model) |
| `/device/update` | POST | Cập nhật (cùng handler) |
| `/device/ping` | GET | Ping (cùng handler) |

Response: `2.01 Created` hoặc `4.00`/`5.03` khi lỗi.

---

## Địa chỉ Leader

Child gửi đến **Leader ALOC** (0xfc00): `mesh_prefix + 0000:00ff:fe00:fc00`.  
Hoặc dùng `otThreadGetLeaderRloc()` để lấy Leader RLOC chính xác. **Không hardcode RLOC16 = 0x0000.**

---

## Border Router phải là Leader

CoAP server chạy trên BR; child gửi đến Leader ALOC → message tới Leader hiện tại.  
**Nếu BR không phải Leader**, message tới Leader cũ → không xử lý được.

**Giải pháp:** BR form network trước (Leader), Router khác join với weight thấp. BR cấu hình `mLeaderWeightAdjustment = +16`.

---

## Kiến trúc

```
┌─────────────────────────────────────────┐
│  Child Device (Endpoint)                │
│  - device_registry_register()           │
│  - CoAP POST /device/register           │
│  - Payload: rloc16, ml_eid, parent,     │
│             entity_model                │
└──────────────────┬──────────────────────┘
                   │ CoAP POST (Thread mesh)
                   ▼
┌─────────────────────────────────────────┐
│  Border Router (Leader)                 │
│  - CoAP Server (port 5683)              │
│  - Resource: /device/register           │
│  - Handler: parse → enqueue → process  │
│  - Response: 2.01 Created               │
└─────────────────────────────────────────┘
```

---

## Implementation

### 1. Enable CoAP API

```c
// openthread_custom_config.h (hoặc br_custom_config.h)
#ifndef OPENTHREAD_CONFIG_COAP_API_ENABLE
#define OPENTHREAD_CONFIG_COAP_API_ENABLE 1
#endif
```

### 2. Start CoAP Server + Register Resources

```c
#include "openthread/coap.h"

otInstance *instance = esp_openthread_get_instance();
otError err = otCoapStart(instance, OT_DEFAULT_COAP_PORT);  // Port 5683

static otCoapResource s_resource;
memset(&s_resource, 0, sizeof(s_resource));
s_resource.mUriPath = "device";  // matches /device/*
s_resource.mHandler = device_register_handler;
s_resource.mContext = NULL;
otCoapAddResource(instance, &s_resource);
```

### 3. Handler Example

```c
static void device_register_handler(void *aContext, otMessage *aMessage,
                                    const otMessageInfo *aMessageInfo)
{
    otInstance *instance = esp_openthread_get_instance();

    uint16_t offset = otMessageGetOffset(aMessage);
    uint16_t payload_len = otMessageGetLength(aMessage) - offset;
    char payload[768];
    if (payload_len >= sizeof(payload)) payload_len = sizeof(payload) - 1;
    otMessageRead(aMessage, offset, payload, payload_len);
    payload[payload_len] = '\0';

    // enqueue payload for processing
    device_registry_enqueue_coap_data(payload, payload_len);

    // Send 2.01 Created
    otMessage *response = otCoapNewMessage(instance, NULL);
    if (response) {
        otCoapMessageInitResponse(response, aMessage,
                                  OT_COAP_TYPE_ACKNOWLEDGMENT,
                                  OT_COAP_CODE_2_01_CREATED);
        otCoapSendResponse(instance, response, aMessageInfo);
    }
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
    { "entity_id": "light.0", "type": "on_off_light", "name": "LED" }
  ]
}
```

---

## Files trong project

| File | Mô tả |
|------|-------|
| `main/coap_controller/device_registry_server.c` | Init CoAP, đăng ký resource |
| `main/coap_controller/device_registry_handler.c` | Queue, enqueue, process_and_clear |
| `br_custom_config.h` | Bật CoAP API |

---

## Lưu ý

1. **CoAP server chỉ chạy trên Leader**: Chỉ BR (Leader) cần implement server này.
2. **Port 5683**: CoAP default port.
3. **Thread routing**: CoAP request tự động route qua Thread mesh đến Leader.
4. **Re-registration**: Child gửi lại khi role thay đổi (Child → Router).
5. **Response timeout**: Child retry nếu không nhận được response.

---

## Tài liệu liên quan

- **[leader_stop_command_coap.md](leader_stop_command_coap.md)** — Leader Control (GET `/network`).
- **[../iot-entity-model/entity_model_specification.md](../iot-entity-model/entity_model_specification.md)** — Entity model spec.
- **[../iot-entity-model/entity_model_schema.md](../iot-entity-model/entity_model_schema.md)** — SQLite schema backend.
