/*
 * Device Update Handler - CoAP handler cho /device/update
 */

#include "device_update_handler.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "openthread/coap.h"
#include "openthread/message.h"
#include <string.h>

static const char *TAG = "device_update";

void device_update_handler(void *aContext, otMessage *aMessage,
                           const otMessageInfo *aMessageInfo)
{
    (void)aContext;
    (void)aMessage;
    (void)aMessageInfo;

    ESP_LOGI(TAG, ">>> /device/update handler called (placeholder) <<<");
    // TODO: Implement update logic
}
