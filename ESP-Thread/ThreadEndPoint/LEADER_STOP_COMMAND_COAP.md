# CoAP Stop Command Format - Leader Control

## Tổng quan

Border Router gửi CoAP POST request đến Leader hiện tại để yêu cầu Leader offline, từ đó Border Router có thể trở thành Leader mới.

---

## CoAP Request Format

### Method & Type
- **Method**: `POST`
- **Type**: `CONFIRMABLE` (cần ACK response)
- **Code**: `0.02` (POST)

### URI Path
- **Path**: `/network/stop`
- **Segments**: 
  - Segment 1: `"network"`
  - Segment 2: `"stop"`

### Payload
- **Format**: Text/Plain
- **Content**: `"action=stop"`
- **Length**: 11 bytes

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

## Handler Implementation Example

### C Code (OpenThread)

```c
#include "openthread/coap.h"
#include "openthread/thread.h"

static void network_stop_handler(void *aContext, otMessage *aMessage, 
                                 const otMessageInfo *aMessageInfo)
{
    (void)aContext;
    
    otInstance *instance = esp_openthread_get_instance();
    
    // Check method
    otCoapCode code = otCoapMessageGetCode(aMessage);
    if ((code >> 5) != 0 || (code & 0x1f) != 2) {  // Not POST
        return;
    }
    
    // Parse URI path
    otCoapOptionIterator iterator;
    otCoapOptionIteratorInit(&iterator, aMessage);
    char segments[2][64] = {{0}};
    int seg_count = 0;
    
    const otCoapOption *option;
    while ((option = otCoapOptionIteratorGetNextOption(&iterator)) != NULL && seg_count < 2) {
        if (option->mNumber == OT_COAP_OPTION_URI_PATH) {
            uint16_t seg_len = option->mLength;
            if (seg_len >= sizeof(segments[0])) seg_len = sizeof(segments[0]) - 1;
            uint16_t offset = iterator.mNextOptionOffset - seg_len;
            otMessageRead(aMessage, offset, segments[seg_count], seg_len);
            segments[seg_count][seg_len] = '\0';
            seg_count++;
        }
    }
    
    // Check URI path: /network/stop
    if (seg_count != 2 || 
        strcmp(segments[0], "network") != 0 || 
        strcmp(segments[1], "stop") != 0) {
        return;  // Not our endpoint
    }
    
    // Read payload
    uint16_t offset = otMessageGetOffset(aMessage);
    uint16_t payload_len = otMessageGetLength(aMessage) - offset;
    char payload[64] = {0};
    
    if (payload_len > 0 && payload_len < sizeof(payload)) {
        otMessageRead(aMessage, offset, payload, payload_len);
        payload[payload_len] = '\0';
    }
    
    // Check payload: action=stop
    if (strcmp(payload, "action=stop") != 0) {
        ESP_LOGW(TAG, "Invalid payload: %s", payload);
        // Still process, but log warning
    }
    
    ESP_LOGI(TAG, "Received stop command from Border Router (RLOC16: 0x%04x)", 
             aMessageInfo->mPeerAddr.mFields.m16[7]);
    
    // Stop Thread network
    if (instance && esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        otThreadSetEnabled(instance, false);
        otIp6SetEnabled(instance, false);
        esp_openthread_lock_release();
        
        ESP_LOGI(TAG, "Thread network stopped as requested");
    }
    
    // Send success response
    otMessage *response = otCoapNewMessage(instance, NULL);
    if (response) {
        otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT, OT_COAP_CODE_2_05_CONTENT);
        otCoapSendResponse(instance, response, aMessageInfo);
        ESP_LOGI(TAG, "Sent 2.05 Content response");
    }
}

// Register handler
void register_network_stop_handler(otInstance *instance)
{
    static otCoapResource s_resource;
    memset(&s_resource, 0, sizeof(s_resource));
    s_resource.mUriPath = "network";
    s_resource.mHandler = network_stop_handler;
    s_resource.mContext = NULL;
    
    otCoapAddResource(instance, &s_resource);
    ESP_LOGI(TAG, "CoAP resource '/network' registered");
}
```

---

## Message Flow

```
Border Router (Router/Child)          Leader (Current)
     |                                      |
     |  POST /network/stop                  |
     |  Type: CONFIRMABLE                    |
     |  Payload: "action=stop"               |
     |------------------------------------->|
     |                                      |
     |                                      | Parse request
     |                                      | Stop Thread network
     |                                      |
     |  2.05 Content                        |
     |  Type: ACKNOWLEDGMENT                 |
     |<-------------------------------------|
     |                                      |
```

---

## Request Details

### CoAP Message Structure
```
┌─────────────────────────────────────┐
│ CoAP Header                         │
│ - Type: CON (0)                     │
│ - Code: POST (0.02)                 │
│ - Message ID: <auto>                │
├─────────────────────────────────────┤
│ Options                             │
│ - URI-Path: "network"               │
│ - URI-Path: "stop"                  │
│ - Content-Format: text/plain (0)    │
├─────────────────────────────────────┤
│ Payload                             │
│ "action=stop"                        │
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

### Test từ CLI (nếu Endpoint có bật OpenThread CLI)
```bash
# Gửi CoAP GET đến Leader (triển khai hiện tại dùng GET)
ot coap get fdde:ad00:beef:0:0:ff:fe00:d400 5683 /network/stop
# Hoặc POST (nếu Border Router / client gửi POST):
ot coap post fdde:ad00:beef:0:0:ff:fe00:d400 5683 /network/stop "action=stop"
```
Lưu ý: Handler trong `network_stop_handler.c` hiện chỉ xử lý GET; nếu cần POST thì cần mở rộng handler.

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
2. **Type**: Request phải là `CONFIRMABLE` để đảm bảo nhận được response
3. **Timeout**: Border Router đợi response trong 5 giây (COAP_RESPONSE_TIMEOUT_MS)
4. **Retry**: Border Router sẽ tự động retry nếu không nhận được response
5. **Leader Address**: Border Router tự động lấy Leader RLOC16 và construct address
6. **Leader Election Timing**: Sau khi Leader cũ offline, cần đợi **1-2.5 phút** để Leader mới được bầu

---

## Implementation Checklist cho Endpoint

- [x] Enable CoAP API (`OPENTHREAD_CONFIG_COAP_API_ENABLE`)
- [x] Start CoAP server (`otCoapStart()`)
- [x] Register resource `/network` với handler
- [x] Parse URI path segments: `["network", "stop"]`
- [x] Parse payload: `"action=stop"` (triển khai hiện tại dùng GET, không payload)
- [x] Stop Thread network (`otThreadSetEnabled(false)`)
- [x] Send response: `2.05 Content` (success) hoặc `4.03 Forbidden`/`5.03 Service Unavailable` (error)

---

## Triển khai thực tế (thread_endpoint_core)

Handler đã được implement trong component **thread_endpoint_core**, file `components/thread_endpoint_core/network_stop_handler.c`.

### Cách bật

- Trong `thread_endpoint_config_t` đặt `enable_network_stop_handler = true`. Khi đó `thread_endpoint_start()` sẽ gọi `network_stop_handler_register()`.

### Hành vi

1. **CoAP resource**: Đăng ký resource URI path `"network/stop"` (hai segment: `network`, `stop`). **Hiện tại handler chỉ nhận GET** (không POST), không yêu cầu payload.
2. **Kiểm tra Leader**: Chỉ xử lý lệnh stop khi `otThreadGetDeviceRole() == OT_DEVICE_ROLE_LEADER`. Nếu không phải Leader → trả `4.03 Forbidden` và bỏ qua.
3. **Stop → Chờ → Restart**: Khi là Leader và nhận đúng request:
   - Gửi ngay response `2.05 Content`.
   - Tạo task `network_stop_restart_task`:
     - Gọi `otThreadSetEnabled(false)` và `otIp6SetEnabled(false)`.
     - Cập nhật status LED (detached).
     - **Đợi 240 giây** (`NETWORK_STOP_WAIT_SECONDS`).
     - Gọi `otIp6SetEnabled(true)` và `otThreadSetEnabled(true)` để restart Thread (Border Router có thời gian trở thành Leader mới).

### API

- `network_stop_handler_register()`: Đăng ký resource với CoAP server (và start CoAP server nếu chưa). Gọi từ `thread_endpoint_core` khi `enable_network_stop_handler == true`.
