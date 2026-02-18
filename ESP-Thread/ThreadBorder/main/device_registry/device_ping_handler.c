/*
 * Device Ping Handler - CoAP handler cho /device/ping
 */

#include "device_ping_handler.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "openthread/coap.h"
#include "openthread/message.h"
#include <string.h>

static const char *TAG = "device_ping";

void device_ping_handler(void *aContext, otMessage *aMessage,
                        const otMessageInfo *aMessageInfo)
{
    (void)aContext;
    (void)aMessage;
    (void)aMessageInfo;

    ESP_LOGI(TAG, ">>> /device/ping handler called (placeholder) <<<");
    // TODO: Implement ping logic
}
