/*
 * Device Registry Server - CoAP server để nhận đăng ký từ child devices.
 * Resources: /device/register, /device/update, /device/ping
 */

#include "device_registry_server.h"
#include "device_register_handler.h"
#include "device_update_handler.h"
#include "device_ping_handler.h"
#include "openthread_custom_config.h"  // Enable CoAP API
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "openthread/coap.h"
#include "openthread/ip6.h"
#include "openthread/message.h"
#include <string.h>
#include <stdbool.h>

#define DEVICE_URI_PATH_REGISTER "device/register"
#define DEVICE_URI_PATH_UPDATE "device/update"
#define DEVICE_URI_PATH_PING "device/ping"

static const char *TAG = "device_registry";

/**
 * Helper function để đăng ký CoAP resource
 * @param instance OpenThread instance
 * @param uri_path URI path của resource (ví dụ: "device/register")
 * @param handler Handler function để xử lý request
 * @param resource Pointer đến static otCoapResource struct
 * @return ESP_OK nếu thành công, ESP_FAIL nếu có lỗi
 */
static esp_err_t register_coap_resource(otInstance *instance, const char *uri_path,
                                        otCoapRequestHandler handler, otCoapResource *resource)
{
    if (!instance || !uri_path || !handler || !resource) {
        ESP_LOGE(TAG, "Invalid parameters for register_coap_resource");
        return ESP_ERR_INVALID_ARG;
    }

    memset(resource, 0, sizeof(otCoapResource));
    resource->mUriPath = uri_path;
    resource->mHandler = handler;
    resource->mContext = NULL;

    otCoapAddResource(instance, resource);
    ESP_LOGI(TAG, "CoAP resource '/%s' registered", uri_path);
    return ESP_OK;
}

static void default_coap_handler(void *aContext, otMessage *aMessage, const otMessageInfo *aMessageInfo)
{

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

    // Register 3 resources với full URI paths
    static otCoapResource s_resource_register;
    static otCoapResource s_resource_update;
    static otCoapResource s_resource_ping;

    register_coap_resource(instance, DEVICE_URI_PATH_REGISTER, device_register_handler, &s_resource_register);
    register_coap_resource(instance, DEVICE_URI_PATH_UPDATE, device_update_handler, &s_resource_update);
    register_coap_resource(instance, DEVICE_URI_PATH_PING, device_ping_handler, &s_resource_ping);

    esp_openthread_lock_release();

    // Initialize CLI command queue cho device register handler
    esp_err_t queue_err = device_register_handler_init();
    if (queue_err != ESP_OK) {
        ESP_LOGW(TAG, "Failed to initialize CLI command queue: %d", queue_err);
    }

    ESP_LOGI(TAG, "Device registry CoAP server initialized successfully");
    return ESP_OK;
}
