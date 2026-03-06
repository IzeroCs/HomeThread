# Border Router CoAP Server - Device Registry

> **Platform:** ESP-IDF + OpenThread
> **Role:** Border Router (Leader)

**Với BR thật (sau Phase 1):** CoAP device registry **không còn chạy trên BR**. Child devices gửi register/update/ping **trực tiếp tới backend** (CoAP hoặc HTTP tới IP:port của backend). BR chỉ route IP và quản lý (state, dataset, Commissioner) qua frame protocol với backend. **Backend** nhận `/device/register` phải trả ACK/NACK đúng quy tắc trong tài liệu này (để Node không treo đợi). Tài liệu dưới mô tả flow legacy / tham khảo cho backend và Thread-Node.

CoAP server trên BR (port 5683) nhận đăng ký từ child devices — **đã gỡ khỏi Thread-Host**. Resources từng được xử lý bởi `device_registry_server` + `device_registry_handler`.

---

## Resources

| Path | Method | Mô tả |
|------|--------|--------|
| `/device/register` | POST | Đăng ký device (payload: CBOR, numeric map keys — xem [Payload Format](#payload-format)) |
| `/device/update` | POST | Cập nhật (cùng handler) |
| `/device/ping` | GET | Ping (cùng handler) |

Response: `2.01 Created` (register), `2.04 Changed` (update), `2.05 Content` (ping) khi backend đã ACK; `5.03 Service Unavailable` khi backend không ACK trong timeout hoặc lỗi forward.

---

## ACK / NACK — Phản hồi bắt buộc cho mọi message từ Node

**Nguyên tắc:** Leader (Border Router) **bắt buộc** phải trả response (ACK hoặc NACK) cho **mọi** CoAP request nhận được từ Node. Không được bỏ qua hoặc im lặng.

**Lý do:**

- Node gửi request **CONFIRMABLE** (CON). Nếu Leader không trả response, Node sẽ retransmit cho đến khi timeout, message nằm lâu trong hàng đợi → dễ dẫn tới **NoBufs** (message buffer pool cạn) trên Node.
- Node có thể triển khai cơ chế "chỉ gửi request tiếp theo sau khi nhận response hoặc timeout". Điều này chỉ hoạt động nếu Leader luôn trả ACK/NACK.

**ACK (thành công):** Leader trả một trong các mã sau khi xử lý xong và chấp nhận request:

| Code | Ý nghĩa |
|------|----------|
| `2.01 Created` | Đã tạo / đã nhận và lưu (dùng cho POST `/device/register`, `/device/update`) |
| `2.04 Changed` | Đã cập nhật thành công |
| `2.05 Content` | Trả dữ liệu (dùng cho GET nếu có) |

**NACK (lỗi):** Leader trả một trong các mã sau khi từ chối hoặc lỗi xử lý:

| Code | Ý nghĩa |
|------|----------|
| `4.00 Bad Request` | Payload sai format, thiếu trường bắt buộc |
| `4.01 Unauthorized` | Không được phép (nếu có cơ chế auth) |
| `4.04 Not Found` | URI không tồn tại |
| `4.13 Request Entity Too Large` | Payload quá lớn |
| `5.00 Internal Server Error` | Lỗi nội bộ Leader khi xử lý |
| `5.03 Service Unavailable` | Tạm thời không xử lý được (ví dụ queue đầy) |

**Implementation:** BR forward payload lên backend qua frame protocol (**CMD_DATA**), chờ backend gửi **CMD_ACK** (cùng Frame ID) trong timeout (vd. 2,5 s). Chỉ khi nhận CMD_ACK thì BR mới trả CoAP `2.01`/`2.04`/`2.05` cho child; nếu timeout hoặc lỗi gửi thì trả `5.03 Service Unavailable`. Handler luôn gọi `otCoapSendResponse()` với một trong các mã trên (thành công hoặc lỗi) để Node không treo đợi.

**Lưu ý NoBufs / partition:** Nếu Node gửi quá nhiều CoAP confirmable mà không chờ ACK, message buffer trên Node có thể cạn (NoBufs). Theo OpenThread issue #4508, buffer exhaustion có thể dẫn tới mất MLE/keep-alive → topology thay đổi, partition → Node có thể tự trở thành Leader. Thread-Node chỉ gửi request tiếp theo sau khi nhận ACK/NACK hoặc timeout; **sau ACK thì gửi 1 lần rồi dừng** (one-shot), chỉ gửi lại khi có notify (role change hoặc sau này lệnh re-register từ Leader).

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
│  - CoAP POST /device/register (one-shot  │
│    sau ACK; gửi lại khi notify)         │
│  - Payload: CBOR, numeric keys          │
└──────────────────┬──────────────────────┘
                   │ CoAP POST (Thread mesh)
                   ▼
┌─────────────────────────────────────────┐
│  Border Router (Leader)                 │
│  - CoAP Server (port 5683)              │
│  - Resource: /device/register|update|  │
│    ping                                 │
│  - Handler: parse → enqueue → CMD_DATA  │
│    → chờ CMD_ACK từ backend → response  │
│  - Response: 2.01/2.04/2.05 nếu ACK;  │
│    5.03 nếu timeout/error               │
└──────────────────┬──────────────────────┘
                   │ CMD_DATA (USB CDC frame)
                   ▼
            [Backend / Node]
                   │ CMD_ACK (cùng Frame ID)
                   ▼
            BR gửi CoAP response cho child
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

Thread-Node gửi POST `/device/register` với payload **CBOR**, dùng **numeric map keys** để giảm băng thông. Backend phải parse map key dạng integer và map theo bảng dưới (cùng giá trị với `cbor_register_keys.h` trong Thread-Node).

### CBOR numeric keys (bắt buộc cho parser)

Định nghĩa đầy đủ: `components/entity/serialization/include/cbor_register_keys.h`.

**Device register — top-level map:**

| Key (số) | Tên logic   | CBOR value type |
|----------|-------------|------------------|
| 0        | device_id   | text string      |
| 1        | device_name | text string      |
| 2        | device_type | unsigned int     |
| 3        | manufacturer| text string (optional) |
| 4        | model       | text string (optional) |
| 5        | sw_version  | unsigned int     |
| 6        | hw_version  | unsigned int     |
| 7        | mac_address | unsigned int (optional) |
| 8        | network     | map (xem bảng network) |
| 9        | entities    | array of maps (xem bảng entity) |

**Network sub-map (key 8):**

| Key (số) | Tên logic | CBOR value type |
|----------|-----------|------------------|
| 0        | rloc16    | unsigned int     |
| 1        | role      | text string ("child" / "router" / "leader" / "unknown") |
| 2        | ipv6_addr | byte string (16 bytes) |
| 3        | parent    | unsigned int (optional) |

**Entity map (mỗi phần tử trong array key 9):**

| Key (số) | Tên logic   | CBOR value type |
|----------|-------------|------------------|
| 0        | entity_id   | text string      |
| 1        | name        | text string      |
| 2        | type        | text string ("light", "sensor", …) |
| 3        | device_class| text string      |
| 4        | available   | bool             |
| 5        | last_update | unsigned int     |
| 6        | state       | bool (light)     |
| 7        | brightness  | unsigned int (light) |
| 8        | mode        | text string (light) |
| 9        | rgb         | array of 3 uint (light, optional) |
| 10       | color_temp  | unsigned int (light, optional) |
| 11       | value       | float (sensor)   |
| 12       | unit        | text string (sensor) |

### Text Format (legacy / tham khảo)

```
rloc16=0x7c01
ml_eid=fd00:db8:a0:0:xxxx:xxxx:xxxx:xxxx
parent=0x1001
entity_id=light.0 type=on_off_light name=LED
```

---

## Files trong project

**Thread-Host (BR):** CoAP server và device registry **đã gỡ** (Phase 1). Các file dưới mô tả kiến trúc legacy / tham khảo cho backend và Thread-Node.

| File (legacy / tham khảo) | Mô tả |
|---------------------------|-------|
| ~~`main/coap_controller/device_registry_server.c`~~ | Đã xóa khỏi Thread-Host — init CoAP, resource; handler forward CMD_DATA. |
| ~~`main/coap_controller/device_registry_handler.c`~~ | Đã xóa — queue, CMD_DATA + chờ CMD_ACK. |
| `main/communicate/communicate_task.c` | Không còn `communicate_task_send_cmd_data_and_wait_ack`; frame protocol chỉ quản lý BR. |
| `br_custom_config.h` | Có thể bật CoAP API nếu BR cần CoAP lại (hiện BR không chạy CoAP). |

---

## Lưu ý

1. **CoAP server chỉ chạy trên Leader**: Chỉ BR (Leader) cần implement server này.
2. **Port 5683**: CoAP default port.
3. **Thread routing**: CoAP request tự động route qua Thread mesh đến Leader.
4. **Re-registration**: Child gửi lại khi role thay đổi (Child → Router).
5. **Response timeout**: Child retry nếu không nhận được response.
6. **ACK/NACK bắt buộc**: Leader phải luôn trả response (ACK hoặc NACK) cho mọi request từ Node — xem mục [ACK / NACK](#ack--nack--phản-hồi-bắt-buộc-cho-mọi-message-từ-node) ở trên.
7. **Kiểm thử end-to-end**: Backend mock gửi CMD_ACK (cùng Frame ID) khi nhận CMD_DATA → BR trả CoAP 2.01/2.04/2.05; không gửi CMD_ACK → BR timeout và trả 5.03. Thread-Node nhận ACK thì dừng, nhận 5.03 thì retry theo logic.

---

## Tài liệu liên quan

- **[../iot-entity-model/entity_model_specification.md](../iot-entity-model/entity_model_specification.md)** — Entity model spec.
- **[../iot-entity-model/entity_model_schema.md](../iot-entity-model/entity_model_schema.md)** — SQLite schema backend.
