/*
 * Thread CoAP - Shared CoAP server management implementation.
 */
#include "esp_err.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "openthread/coap.h"
#include "openthread/error.h"
#include "openthread/instance.h"
#include "thread_coap.h"

static const char *TAG = "thread_coap";

#define COAP_DEFAULT_PORT 5683

static bool s_coap_server_started = false;

esp_err_t thread_coap_server_start(void)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance NULL");
        return ESP_ERR_INVALID_STATE;
    }

    if (s_coap_server_started) {
        ESP_LOGD(TAG, "CoAP server already started");
        return ESP_OK;
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        ESP_LOGE(TAG, "Failed to acquire OpenThread lock");
        return ESP_ERR_TIMEOUT;
    }

    otError err = otCoapStart(instance, COAP_DEFAULT_PORT);
    esp_openthread_lock_release();

    if (err != OT_ERROR_NONE && err != OT_ERROR_ALREADY) {
        ESP_LOGE(TAG, "otCoapStart failed: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }

    s_coap_server_started = true;
    ESP_LOGI(TAG, "CoAP server started on port %d", COAP_DEFAULT_PORT);
    return ESP_OK;
}

bool thread_coap_server_is_started(void)
{
    return s_coap_server_started;
}
