# CoAP Stop Command Format - Leader Control

## Tổng quan

Border Router gửi CoAP **GET** request đến Leader hiện tại để yêu cầu Leader offline, từ đó Border Router có thể trở thành Leader mới.

---

## CoAP Request Format (hiện tại)

### Method & Type
- **Method**: `GET`
- **Type**: `CONFIRMABLE` (cần ACK response)
- **Code**: `0.01` (GET)

### URI Path (quan trọng: chỉ một segment)
- **Path**: `/network` (một segment duy nhất)
- **Segment**: `"network"`

**Lý do không dùng `/network/stop`:** OpenThread CoAP match resource theo **full path string** (xem phần "OpenThread CoAP: Match theo full path" bên dưới). Resource đăng ký với `mUriPath = "network"` chỉ match request có path đúng `"network"`. Request có hai segment `"network"` + `"stop"` tạo path `"network/stop"` → không match resource `"network"`. Vì vậy Border Router gửi GET với **chỉ một** Uri-Path option `"network"`.

### Payload
- **GET không có payload.** (Không gửi body.)

### Port
- **Port**: `5683` (OT_DEFAULT_COAP_PORT)

### Destination Address
- **Address**: Leader RLOC IPv6 address
- **Format**: `mesh_prefix + 0000:00ff:fe00:RLOC16`
- **RLOC16**: Lấy từ `otThreadGetLeaderRloc()` hoặc Router Table

---

## CoAP Response Format (Expected)

### Success Response
- **Type**: `ACKNOWLEDGMENT`
- **Code**: `2.05` (Content) hoặc `2.04` (Changed) hoặc `2.01` (Created)
- **Payload**: Optional (có thể empty)

### Error Response
- **Type**: `ACKNOWLEDGMENT`
- **Code**: `4.xx` (Client Error) hoặc `5.xx` (Server Error)
- **Payload**: Optional error message

---

## OpenThread CoAP: Match theo full path

Trong OpenThread (`coap.cpp`), request được match với resource như sau:

- `ReadUriPathOptions(uriPath)` đọc **toàn bộ** Uri-Path options của request vào một chuỗi (các segment nối với `/`).
- So khớp: `StringMatch(resource.mUriPath, uriPath)` — **exact full path**.
- Resource `mUriPath = "network"` chỉ match request có path đúng `"network"`.
- Request có hai segment `"network"` + `"stop"` → path = `"network/stop"` → **không** match `"network"`.

**Kết luận:** Để handler được gọi, client phải gửi GET với **một** segment `"network"`. Endpoint đăng ký resource `"network"` và trong handler có thể chấp nhận path chỉ có "network" là lệnh stop.

---

## Handler Implementation Example (GET, path /network)

### C Code (OpenThread)

```c
#include "openthread/coap.h"
#include "openthread/thread.h"

static void network_stop_handler(void *aContext, otMessage *aMessage,
                                 const otMessageInfo *aMessageInfo)
{
    (void)aContext;

    otInstance *instance = esp_openthread_get_instance();
    if (!instance) return;

    // Check method: GET (0.01)
    otCoapCode code = otCoapMessageGetCode(aMessage);
    if ((code >> 5) != 0 || (code & 0x1f) != 1) {  // Not GET
        return;
    }

    // Resource "network" đã match (path = "network"). GET không có payload.

    // (Tùy chọn: check role = Leader trước khi xử lý)

    ESP_LOGI(TAG, "Received stop command from Border Router");

    // QUAN TRỌNG 1: Dùng otCoapMessageInitResponse (không phải otCoapMessageInit) để copy Message ID
    // và Token từ request sang response. Client OpenThread khớp response với request bằng token;
    // nếu response không có cùng token, client sẽ không gọi callback → timeout dù endpoint đã gửi 2.05.
    // QUAN TRỌNG 2: Gửi response trước, sau đó mới stop network.
    otMessage *response = otCoapNewMessage(instance, NULL);
    if (response) {
        otCoapMessageInitResponse(response, aMessage, OT_COAP_TYPE_ACKNOWLEDGMENT, OT_COAP_CODE_CONTENT);
        otCoapSendResponse(instance, response, aMessageInfo);
    }

    if (esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        vTaskDelay(pdMS_TO_TICKS(100));  // Cho response kịp gửi ra trước khi tắt mạng
        otThreadSetEnabled(instance, false);
        otIp6SetEnabled(instance, false);
        esp_openthread_lock_release();
        ESP_LOGI(TAG, "Thread network stopped as requested");
    }
}

void register_network_stop_handler(otInstance *instance)
{
    static otCoapResource s_resource;
    memset(&s_resource, 0, sizeof(s_resource));
    s_resource.mUriPath = "network";
    s_resource.mHandler = network_stop_handler;
    s_resource.mContext = NULL;
    otCoapAddResource(instance, &s_resource);
}
```

---

## Message Flow

```
Border Router (Router/Child)          Leader (Current)
     |                                      |
     |  GET /network                        |
     |  Type: CONFIRMABLE                    |
     |  (no payload)                        |
     |------------------------------------->|
     |                                      |
     |                                      | Match resource "network"
     |                                      | 1. Gửi 2.05 Content trước
     |  2.05 Content (ACK)                  |
     |<-------------------------------------|
     |                                      | 2. Sau đó mới stop Thread network
     |                                      |
```

---

## Request Details

### CoAP Message Structure (GET /network)
```
┌─────────────────────────────────────┐
│ CoAP Header                         │
│ - Type: CON (0)                     │
│ - Code: GET (0.01)                  │
│ - Message ID: <auto>                │
├─────────────────────────────────────┤
│ Options                             │
│ - URI-Path: "network"               │
│ (chỉ một segment)                   │
├─────────────────────────────────────┤
│ (no payload)                        │
└─────────────────────────────────────┘
```

### IPv6 Address Format
```
Leader RLOC = mesh_prefix + 0000:00ff:fe00:RLOC16

Example:
- Mesh Prefix: fdde:ad00:beef:0::/64
- RLOC16: 0xd400
- Leader RLOC: fdde:ad00:beef:0:0:ff:fe00:d400
```

---

## Response Details

### Success Response (2.05 Content)
```
┌─────────────────────────────────────┐
│ CoAP Header                         │
│ - Type: ACK (2)                     │
│ - Code: 2.05 Content                │
│ - Message ID: <same as request>     │
├─────────────────────────────────────┤
│ Payload (optional)                  │
│ Empty or "ok"                        │
└─────────────────────────────────────┘
```

### Error Response (4.xx or 5.xx)
```
┌─────────────────────────────────────┐
│ CoAP Header                         │
│ - Type: ACK (2)                     │
│ - Code: 4.00 Bad Request            │
│        or 5.03 Service Unavailable  │
│ - Message ID: <same as request>     │
├─────────────────────────────────────┤
│ Payload (optional)                  │
│ Error message                        │
└─────────────────────────────────────┘
```

---

## Testing

### Test từ Border Router
Border Router sẽ tự động gửi khi:
- Device là Router hoặc Child
- Leader RLOC16 thay đổi
- Lần gửi trước không thành công

### Test từ CLI (nếu cần)
```bash
# Gửi CoAP GET đến Leader (path /network, một segment)
ot coap get fdde:ad00:beef:0:0:ff:fe00:d400 5683 /network
```

---

## Leader Election Timing

### ⏱️ Thời gian Leader mới được bầu sau khi Leader cũ offline

Sau khi Leader cũ nhận lệnh CoAP stop và offline (`otThreadSetEnabled(false)`), quá trình bầu Leader mới diễn ra như sau:

#### 1. Router Detection Timeout
- **Thời gian**: **60-120 giây** (1-2 phút)
- **Cơ chế**: Các Router khác trong network phát hiện Leader offline thông qua:
  - Không nhận được MLE advertisements từ Leader
  - Không nhận được response từ Leader khi gửi Link Request
  - Router timeout mechanism trong MLE protocol

#### 2. Leader Election Process
- **Thời gian**: **10-30 giây** sau khi detect Leader offline
- **Cơ chế**:
  - Các Router còn lại bắt đầu leader election
  - Router có Leader Weight cao nhất sẽ được bầu làm Leader mới
  - Border Router (với weight = +16) sẽ được ưu tiên

#### 3. Tổng thời gian
- **Tối thiểu**: ~70 giây (1 phút 10 giây)
- **Tối đa**: ~150 giây (2 phút 30 giây)
- **Trung bình**: ~90-120 giây (1.5-2 phút)

### 📊 Timeline chi tiết

```
T=0s     Leader cũ nhận CoAP stop command
         ↓
T=0-1s   Leader cũ offline (otThreadSetEnabled(false))
         ↓
T=1-60s  Routers vẫn nghĩ Leader còn online
         (Router timeout detection period)
         ↓
T=60-120s Routers phát hiện Leader offline
         ↓
T=120-150s Leader election process
         ↓
T=150s   Border Router trở thành Leader mới ✓
```

### 🔍 Monitoring trong Code

Border Router có thể monitor quá trình này bằng cách:

1. **Check device role**: `otThreadGetDeviceRole()` → `OT_DEVICE_ROLE_LEADER`
2. **Check Leader RLOC16**: `otThreadGetLeaderRloc()` → RLOC16 của chính nó
3. **Check Leader Data**: `otThreadGetLeaderData()` → `mLeaderRouterId` khớp với Router ID của Border Router

Code hiện tại trong `leader_rloc_check_task` đã check mỗi 5 giây và sẽ tự động detect khi Border Router trở thành Leader.

### ⚠️ Lưu ý quan trọng

1. **Network Stability**: Thread protocol ưu tiên network stability, nên không rush leader election quá nhanh
2. **Partition Merge**: Nếu Leader cũ và Border Router ở khác partition, cần partition merge trước (có thể mất thêm thời gian)
3. **Router Count**: Nếu có nhiều Router trong network, leader election có thể mất thời gian hơn
4. **Weight Comparison**: Border Router phải có weight cao nhất để đảm bảo được bầu làm Leader

---

## Notes

1. **Port**: Luôn dùng port `5683` (OT_DEFAULT_COAP_PORT)
2. **Method**: GET (0.01); không payload
3. **Path**: Chỉ một segment `"network"` (OpenThread match full path, nên không dùng `/network/stop`)
4. **Type**: Request phải là `CONFIRMABLE` để đảm bảo nhận được response
5. **Timeout**: Border Router đợi response trong 5 giây (COAP_RESPONSE_TIMEOUT_MS)
6. **Retry**: Border Router sẽ tự động retry nếu không nhận được response
7. **Leader Address**: Border Router tự động lấy Leader RLOC16 và construct address
8. **Leader Election Timing**: Sau khi Leader cũ offline, cần đợi **1-2.5 phút** để Leader mới được bầu
9. **Endpoint: Gửi response trước khi stop**: Endpoint phải gửi CoAP 2.05 **trước**, sau đó mới gọi `otThreadSetEnabled(false)`. Nếu stop network trước rồi mới send response thì mạng đã tắt, client không nhận được → timeout dù endpoint đã gửi 2.05.
10. **Endpoint: Response phải copy Message ID + Token từ request**: Client OpenThread chỉ gọi callback khi response **cùng token** (và Message ID) với request. Nếu endpoint dùng `otCoapMessageInit()` rồi gửi response thì response có token/ID khác → client không nhận diện → **timeout**. Phải dùng **`otCoapMessageInitResponse(response, aMessage, type, code)`** (truyền con trỏ request `aMessage`) để copy Message ID và Token từ request sang response.

---

## Implementation Checklist cho Endpoint

- [ ] Enable CoAP API (`OPENTHREAD_CONFIG_COAP_API_ENABLE`)
- [ ] Start CoAP server (`otCoapStart()`)
- [ ] Register resource `mUriPath = "network"` (một segment) với handler
- [ ] Trong handler: check method = GET (0.01); GET không có payload
- [ ] (Tùy chọn) Check device role = Leader trước khi stop
- [ ] **Gửi response trước**: dùng `otCoapMessageInitResponse(response, aMessage, ...)` (truyền request `aMessage`) để copy Message ID + Token → client mới nhận được; sau đó mới `otThreadSetEnabled(false)`
- [ ] Send response: `2.05 Content` (success) hoặc `4.03`/`5.03` (error)

---

## Lịch sử thay đổi

- **POST → GET:** Lệnh stop chuyển từ POST sang GET; GET không payload, endpoint chỉ cần check method GET và path "network".
- **Path một segment:** Do OpenThread match resource theo full path, client gửi chỉ `/network` (một Uri-Path option) để match resource "network"; không gửi `/network/stop` (hai segment) vì khi đó path = "network/stop" không match resource "network".
- **Response phải dùng InitResponse:** Client khớp response với request bằng Message ID + Token. Endpoint phải dùng `otCoapMessageInitResponse(response, aMessage, ...)` thay vì `otCoapMessageInit(response, ...)` để copy token/ID từ request, nếu không client sẽ timeout dù endpoint đã gửi 2.05.
