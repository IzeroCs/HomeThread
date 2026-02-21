# CoAP Client thuần — Snippet tham khảo

> Code CoAP client thuần (chỉ dùng OpenThread API, không dùng component `device_registry`) từng dùng để test gửi request lên Leader. Dùng để tham khảo hoặc paste lại khi cần test.

---

## Mục đích

- Gửi **GET /ping** đến Leader RLOC lặp lại mỗi **1 giây**.
- Dùng **NON-CONFIRMABLE** để tránh lỗi "no bufs" (CON giữ buffer đến khi có ACK).
- Lấy đích bằng **`otThreadGetLeaderRloc()`** — không hardcode RLOC16.
- Có **response handler** để log kết quả.

---

## Includes

```c
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "openthread/coap.h"
#include "openthread/error.h"
#include "openthread/instance.h"
#include "openthread/ip6.h"
#include "openthread/message.h"
#include "openthread/thread.h"
```

---

## Response handler

```c
#define COAP_DEFAULT_PORT 5683

static void coap_response_handler(void *aContext, otMessage *aMessage,
                                  const otMessageInfo *aMessageInfo, otError aError)
{
    (void)aContext; (void)aMessageInfo;

    if (aError != OT_ERROR_NONE) {
        ESP_LOGW(TAG, "CoAP response error: %s", otThreadErrorToString(aError));
        return;
    }
    if (!aMessage) {
        ESP_LOGW(TAG, "CoAP response: no message");
        return;
    }

    otCoapCode code = otCoapMessageGetCode(aMessage);
    if (code == OT_COAP_CODE_CONTENT)
        ESP_LOGI(TAG, "CoAP ping OK (2.05 Content)");
    else
        ESP_LOGW(TAG, "CoAP ping response code: %d.%02d", code >> 5, code & 0x1f);
}
```

---

## Hàm gửi GET /ping

```c
static void send_coap_ping_to_leader(void)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) return;

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        ESP_LOGW(TAG, "CoAP: no lock");
        return;
    }

    otIp6Address leader_rloc;
    otError err = otThreadGetLeaderRloc(instance, &leader_rloc);
    if (err != OT_ERROR_NONE) {
        esp_openthread_lock_release();
        ESP_LOGW(TAG, "CoAP: get Leader RLOC failed: %s", otThreadErrorToString(err));
        return;
    }

    otMessage *message = otCoapNewMessage(instance, NULL);
    if (!message) {
        esp_openthread_lock_release();
        ESP_LOGW(TAG, "CoAP: no message buffer");
        return;
    }

    // NON-CONFIRMABLE: tránh "no bufs" khi gửi liên tục
    otCoapMessageInit(message, OT_COAP_TYPE_NON_CONFIRMABLE, OT_COAP_CODE_GET);
    err = otCoapMessageAppendUriPathOptions(message, "ping");
    if (err != OT_ERROR_NONE) {
        otMessageFree(message);
        esp_openthread_lock_release();
        return;
    }

    otMessageInfo info;
    memset(&info, 0, sizeof(info));
    info.mPeerAddr = leader_rloc;
    info.mPeerPort = COAP_DEFAULT_PORT;

    err = otCoapSendRequest(instance, message, &info, coap_response_handler, NULL);
    esp_openthread_lock_release();

    if (err != OT_ERROR_NONE)
        ESP_LOGW(TAG, "CoAP send failed: %s", otThreadErrorToString(err));
}
```

---

## Task gửi ping mỗi 1 giây

```c
static void coap_ping_task(void *pvParameters)
{
    (void)pvParameters;
    vTaskDelay(pdMS_TO_TICKS(2000));  // Đợi network ổn định
    while (1) {
        send_coap_ping_to_leader();
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
```

---

## Khởi tạo (trong on_joined)

```c
static void on_joined(void *ctx)
{
    (void)ctx;
    if (s_app_initialized) return;

    // ... entity model init ...

    // Test CoAP client: gửi GET /ping đến Leader mỗi 1s
    xTaskCreate(coap_ping_task, "coap_ping", 4096, NULL, 5, NULL);

    s_app_initialized = true;
}
```

---

## Lưu ý

1. **NON-CONFIRMABLE**: Dùng `OT_COAP_TYPE_NON_CONFIRMABLE` để không giữ buffer chờ ACK. CON liên tục dễ gây "no bufs".
2. **Leader RLOC**: Luôn lấy bằng `otThreadGetLeaderRloc()` — không hardcode RLOC16.
3. **Port**: 5683 (`COAP_DEFAULT_PORT`).
4. **Handler**: NON vẫn có thể nhận response tùy server; CON cần handler để nhận ACK.

Code production hiện dùng `entity_coap_server`; snippet này chỉ lưu lại để tham khảo khi cần test CoAP client thuần.

---

## Tài liệu liên quan

- **[border_router_coap_server.md](border_router_coap_server.md)** — CoAP server trên BR.
- **[leader_stop_command_coap.md](leader_stop_command_coap.md)** — Leader Control CoAP.
