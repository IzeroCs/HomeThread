# CoAP Client thuần trong main (snippet tham khảo)

Tài liệu này ghi lại phần **code CoAP client thuần** (chỉ dùng OpenThread API, không dùng component `device_registry`) từng được viết trong `examples/light_on_off/main/main.c` để test gửi request lên Leader. Code đã được gỡ ra khỏi main; snippet dưới đây dùng để tham khảo hoặc paste lại khi cần test CoAP client.

Example `light_on_off` hiện **không dùng OpenThread CLI** (đã gỡ esp_ot_cli_extension và ot CLI task); chỉ chạy entity model + entity_coap_server.

---

## Mục đích

- Gửi **GET /ping** đến Leader RLOC lặp lại mỗi **1 giây**.
- Dùng **NON-CONFIRMABLE** để tránh lỗi "no bufs" (CON giữ buffer đến khi có ACK).
- Lấy đích gửi bằng **`otThreadGetLeaderRloc()`** (không hardcode RLOC16).
- Có **response handler** để log kết quả.

---

## Includes cần thêm trong main.c

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
    (void)aContext;
    (void)aMessageInfo;

    if (aError != OT_ERROR_NONE) {
        ESP_LOGW(TAG, "CoAP response error: %s", otThreadErrorToString(aError));
        return;
    }
    if (aMessage == NULL) {
        ESP_LOGW(TAG, "CoAP response: no message");
        return;
    }

    otCoapCode code = otCoapMessageGetCode(aMessage);
    if (code == OT_COAP_CODE_CONTENT) {
        ESP_LOGI(TAG, "CoAP ping OK (2.05 Content)");
    } else {
        ESP_LOGW(TAG, "CoAP ping response code: %d.%02d", (int)(code >> 5), (int)(code & 0x1f));
    }
}
```

---

## Hàm gửi GET /ping (gọi mỗi 1 giây từ task)

```c
static void send_coap_ping_to_leader(void)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        return;
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        ESP_LOGW(TAG, "CoAP: no lock");
        return;
    }

    /* Lấy Leader RLOC (IPv6) */
    otIp6Address leader_rloc;
    otError ot_err = otThreadGetLeaderRloc(instance, &leader_rloc);
    if (ot_err != OT_ERROR_NONE) {
        esp_openthread_lock_release();
        ESP_LOGW(TAG, "CoAP: get Leader RLOC failed: %s", otThreadErrorToString(ot_err));
        return;
    }

    otMessage *message = otCoapNewMessage(instance, NULL);
    if (!message) {
        esp_openthread_lock_release();
        ESP_LOGW(TAG, "CoAP: no message buffer");
        return;
    }

    /* GET, NON-CONFIRMABLE để tránh "no bufs" */
    otCoapMessageInit(message, OT_COAP_TYPE_NON_CONFIRMABLE, OT_COAP_CODE_GET);
    ot_err = otCoapMessageAppendUriPathOptions(message, "ping");
    if (ot_err != OT_ERROR_NONE) {
        otMessageFree(message);
        esp_openthread_lock_release();
        ESP_LOGW(TAG, "CoAP: append URI failed: %s", otThreadErrorToString(ot_err));
        return;
    }

    otMessageInfo message_info;
    memset(&message_info, 0, sizeof(message_info));
    message_info.mPeerAddr = leader_rloc;
    message_info.mPeerPort = COAP_DEFAULT_PORT;

    ot_err = otCoapSendRequest(instance, message, &message_info, coap_response_handler, NULL);
    esp_openthread_lock_release();

    if (ot_err != OT_ERROR_NONE) {
        ESP_LOGW(TAG, "CoAP send failed: %s", otThreadErrorToString(ot_err));
    }
}
```

---

## Task gửi ping mỗi 1 giây (chạy sau khi đã join)

```c
static void coap_ping_task(void *pvParameters)
{
    (void)pvParameters;

    /* Đợi một chút cho network ổn định */
    vTaskDelay(pdMS_TO_TICKS(2000));

    while (1) {
        send_coap_ping_to_leader();
        vTaskDelay(pdMS_TO_TICKS(1000));  /* 1 giây */
    }
}
```

---

## Gọi trong on_joined (chỉ để test CoAP client)

Trong `on_joined()`, thay vì (hoặc tạm bỏ) `entity_coap_server_start()`, có thể tạo task ping:

```c
static void on_joined(void *ctx)
{
    (void)ctx;

    if (s_app_initialized) {
        return;
    }

    /* ... entity_model_init(), on_off_light_register_type(), on_off_light_add() ... */

    /* Test CoAP client: gửi GET /ping đến Leader mỗi 1s */
    xTaskCreate(coap_ping_task, "coap_ping", 4096, NULL, 5, NULL);

    s_app_initialized = true;
}
```

---

## Lưu ý

1. **NON-CONFIRMABLE**: Dùng `OT_COAP_TYPE_NON_CONFIRMABLE` để không giữ buffer chờ ACK; gửi liên tục CON dễ gây "no bufs".
2. **Leader RLOC**: Luôn lấy bằng `otThreadGetLeaderRloc(instance, &addr)` thay vì hardcode RLOC16 (Leader có thể đổi).
3. **Port**: Cùng port CoAP mặc định `5683` (COAP_DEFAULT_PORT).
4. **Handler**: Response có thể đến bất đồng bộ; CON request thì cần handler để nhận ACK/response, NON vẫn có thể nhận response tùy server.

Code hiện tại trong main đã chuyển sang dùng `entity_coap_server`; file này chỉ để lưu lại snippet CoAP client thuần khi cần test hoặc tham chiếu.
