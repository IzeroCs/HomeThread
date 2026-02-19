/*
 * Device Registry Server - CoAP server để nhận đăng ký từ child devices.
 * Resources: /device/register, /device/update, /device/ping
 * Một handler chung dùng logic từ device_registry_handler cho cả 3 resource.
 */

#include "coap_controller/device_registry_server.h"
#include "coap_controller/device_registry_handler.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "openthread/coap.h"
#include "openthread/ip6.h"
#include "openthread/message.h"
#include <string.h>
#include <stdbool.h>

#define DEVICE_URI_PATH_REGISTER "device/register"
#define DEVICE_URI_PATH_UPDATE   "device/update"
#define DEVICE_URI_PATH_PING     "device/ping"

#define COAP_PAYLOAD_MAX_LENGTH 768

static const char *TAG = "device_registry";

/**
 * Handler chung cho cả 3 resource: register, update, ping.
 * Dùng chung logic từ device_registry_handler: đọc payload, enqueue, process & clear queue.
 * aContext = (const char*) uri_path để log phân biệt.
 */
static void device_registry_coap_handler(void *aContext, otMessage *aMessage,
                                        const otMessageInfo *aMessageInfo)
{
    const char *uri_path = (const char *)aContext;

    ESP_LOGI(TAG, ">>> /%s handler called <<<", uri_path ? uri_path : "?");

    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance not available");
        return;
    }

    uint16_t rloc16 = aMessageInfo->mPeerAddr.mFields.m16[7];

    uint16_t offset = otMessageGetOffset(aMessage);
    uint16_t payload_len = otMessageGetLength(aMessage) - offset;

    if (payload_len > 0) {
        char payload[COAP_PAYLOAD_MAX_LENGTH];
        if (payload_len >= sizeof(payload)) {
            payload_len = (uint16_t)(sizeof(payload) - 1);
        }
        otMessageRead(aMessage, offset, payload, payload_len);
        payload[payload_len] = '\0';

        ESP_LOGI(TAG, "Received CoAP data from rloc16: 0x%04x, payload_len: %d", rloc16, payload_len);
        device_registry_enqueue_coap_data(payload, payload_len, rloc16);
    }

    device_registry_process_and_clear_queue();
}

/**
 * Helper: đăng ký CoAP resource với handler chung, context = uri_path
 */
static esp_err_t register_coap_resource(otInstance *instance, const char *uri_path,
                                        otCoapResource *resource)
{
    if (!instance || !uri_path || !resource) {
        ESP_LOGE(TAG, "Invalid parameters for register_coap_resource");
        return ESP_ERR_INVALID_ARG;
    }

    memset(resource, 0, sizeof(otCoapResource));
    resource->mUriPath = uri_path;
    resource->mHandler = device_registry_coap_handler;
    resource->mContext = (void *)uri_path;

    otCoapAddResource(instance, resource);
    ESP_LOGI(TAG, "CoAP resource '/%s' registered", uri_path);
    return ESP_OK;
}

esp_err_t device_registry_server_init(void)
{
    ESP_LOGI(TAG, "Initializing device registry CoAP server...");

    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance not available");
        return ESP_ERR_INVALID_STATE;
    }
    ESP_LOGI(TAG, "OpenThread instance obtained");

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        ESP_LOGE(TAG, "Failed to acquire OpenThread lock");
        return ESP_ERR_TIMEOUT;
    }
    ESP_LOGI(TAG, "OpenThread lock acquired");

    // Start CoAP (enables both client and server)
    otError err = otCoapStart(instance, OT_DEFAULT_COAP_PORT);
    if (err != OT_ERROR_NONE) {
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "Failed to start CoAP: %d (OT_ERROR_%d)", err, err);
        if (err == OT_ERROR_ALREADY) {
            ESP_LOGW(TAG, "CoAP already started (maybe by another component)");
        } else {
            return ESP_FAIL;
        }
    } else {
        ESP_LOGI(TAG, "CoAP started on port %d (client + server enabled)", OT_DEFAULT_COAP_PORT);
    }

    ESP_ERROR_CHECK(device_registry_handler_init());

    static otCoapResource s_resource_register;
    static otCoapResource s_resource_update;
    static otCoapResource s_resource_ping;

    register_coap_resource(instance, DEVICE_URI_PATH_REGISTER, &s_resource_register);
    register_coap_resource(instance, DEVICE_URI_PATH_UPDATE,   &s_resource_update);
    register_coap_resource(instance, DEVICE_URI_PATH_PING,     &s_resource_ping);

    esp_openthread_lock_release();

    ESP_LOGI(TAG, "Device registry CoAP server initialized successfully");
    return ESP_OK;
}
