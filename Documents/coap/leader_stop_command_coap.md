# CoAP Stop Command — Leader Control

> **Platform:** ESP-IDF + OpenThread
> **Cơ chế:** Border Router gửi **GET `/network`** (một segment) đến Leader để yêu cầu offline. Leader Control Client kiểm tra mỗi 5 giây.

---

## Request (BR → Leader)

| Mục | Giá trị |
|-----|---------|
| Method | GET (0.01) |
| Type | CONFIRMABLE (cần ACK response) |
| Path | **Một segment** `"network"` — OpenThread match full path, không dùng `/network/stop` |
| Payload | Không có |
| Port | 5683 |
| Destination | Leader RLOC: `mesh_prefix + 0000:00ff:fe00:RLOC16` từ `otThreadGetLeaderRloc()` |

---

## Response (Leader → BR)

| Kết quả | Code | Ghi chú |
|---------|------|---------|
| Thành công | 2.05 Content (hoặc 2.04) | Message ID + Token **phải** copy từ request |
| Lỗi | 4.xx / 5.xx | Dùng `otCoapMessageInitResponse()` |

**Quan trọng:** Response phải có **cùng Message ID và Token** với request. Nếu endpoint dùng `otCoapMessageInit()` thay vì `otCoapMessageInitResponse(response, aMessage, ...)`, client sẽ timeout dù endpoint đã gửi 2.05.

---

## OpenThread CoAP: Match theo full path

OpenThread (`coap.cpp`) đọc toàn bộ Uri-Path options thành một chuỗi rồi **exact match** với `resource.mUriPath`.

- Resource `mUriPath = "network"` chỉ match request có path `"network"`.
- Request hai segment `"network"` + `"stop"` → path = `"network/stop"` → **không match**.

**Kết luận:** Client gửi GET với **một** Uri-Path option `"network"`.

---

## Message Flow

```
Border Router                        Leader (Current)
     |                                    |
     |  GET /network (CONFIRMABLE)        |
     |   → no payload                     |
     |──────────────────────────────────>|
     |                                    | Match resource "network"
     |                                    | 1. Gửi 2.05 Content TRƯỚC
     |  2.05 Content (ACK, same token)   |
     |<──────────────────────────────────|
     |                                    | 2. SAU đó mới stop Thread
```

---

## Handler Implementation (Endpoint/Leader)

```c
#include "openthread/coap.h"
#include "openthread/thread.h"

static void network_stop_handler(void *aContext, otMessage *aMessage,
                                 const otMessageInfo *aMessageInfo)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) return;

    // Check method: GET (code = 0.01)
    otCoapCode code = otCoapMessageGetCode(aMessage);
    if ((code >> 5) != 0 || (code & 0x1f) != 1) return;  // Not GET

    ESP_LOGI(TAG, "Received stop command from Border Router");

    // QUAN TRỌNG 1: Gửi response TRƯỚC khi stop network
    // QUAN TRỌNG 2: Dùng InitResponse để copy Message ID + Token từ request
    otMessage *response = otCoapNewMessage(instance, NULL);
    if (response) {
        otCoapMessageInitResponse(response, aMessage,
                                  OT_COAP_TYPE_ACKNOWLEDGMENT,
                                  OT_COAP_CODE_CONTENT);
        otCoapSendResponse(instance, response, aMessageInfo);
    }

    if (esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        vTaskDelay(pdMS_TO_TICKS(100));  // Cho response kịp gửi ra
        otThreadSetEnabled(instance, false);
        otIp6SetEnabled(instance, false);
        esp_openthread_lock_release();
        ESP_LOGI(TAG, "Thread network stopped");
    }
}

void register_network_stop_handler(otInstance *instance)
{
    static otCoapResource s_resource;
    memset(&s_resource, 0, sizeof(s_resource));
    s_resource.mUriPath = "network";
    s_resource.mHandler = network_stop_handler;
    otCoapAddResource(instance, &s_resource);
}
```

---

## Khi nào BR gửi lệnh stop?

1. **First time** — chưa gửi lần nào
2. **Leader changed** — RLOC16 Leader thay đổi
3. **Retry on failure** — lần trước timeout hoặc lỗi
4. **Retry timeout** — đã gửi thành công nhưng sau 2 phút Leader vẫn còn → gửi lại

Timeout đợi response: 5 giây. Retry ở lần check tiếp theo (5 giây sau).

---

## Leader Election Timing

Sau khi Leader cũ offline:

| Giai đoạn | Thời gian | Cơ chế |
|-----------|-----------|--------|
| Router detection | 60–120 s | Routers phát hiện Leader offline qua MLE advertisements |
| Leader election | 10–30 s | Router có Leader Weight cao nhất được bầu |
| **Tổng** | **~70–150 s** | BR (weight +16) được ưu tiên |

```
T=0s      Leader cũ nhận CoAP stop
T=0-1s    Leader cũ offline
T=1-120s  Routers phát hiện timeout
T=120-150s Leader election
T=~150s   Border Router = Leader mới ✓
```

**Monitor:** `otThreadGetDeviceRole()` → `OT_DEVICE_ROLE_LEADER`.

---

## Implementation Location (ThreadEndPoint)

| File | Mô tả |
|------|-------|
| `components/thread/thread_network_stop.c` | Handler |
| `components/thread/include/thread_network_stop.h` | Header |
| `components/thread/coap/` (thread_coap) | CoAP shared utilities |

---

## Checklist Implementation

- [ ] Enable `OPENTHREAD_CONFIG_COAP_API_ENABLE`
- [ ] Start CoAP server (`otCoapStart()`)
- [ ] Register resource `mUriPath = "network"` (một segment)
- [ ] Handler: check method = GET (0.01)
- [ ] **Gửi response TRƯỚC** bằng `otCoapMessageInitResponse(response, aMessage, ...)` → copy Message ID + Token
- [ ] **SAU ĐÓ** mới `otThreadSetEnabled(false)`

---

## Lịch sử thay đổi

- **POST → GET:** Chuyển sang GET (không payload).
- **Path một segment:** Do OpenThread match full path, chỉ gửi `/network` (không gửi `/network/stop`).
- **Response phải dùng InitResponse:** Phải copy token/ID từ request; nếu không client timeout.

---

## Tài liệu liên quan

- **[border_router_coap_server.md](border_router_coap_server.md)** — CoAP server đăng ký device trên BR.
- **[coap_client_snippet.md](coap_client_snippet.md)** — Snippet CoAP client thuần (test GET /ping).
