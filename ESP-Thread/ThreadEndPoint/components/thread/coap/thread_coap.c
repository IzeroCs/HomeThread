/*
 * Thread CoAP - Shared CoAP server management implementation.
 */
#include <string.h>
#include "esp_err.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "openthread/coap.h"
#include "openthread/error.h"
#include "openthread/instance.h"
#include "openthread/message.h"
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

esp_err_t thread_coap_register_resource(otCoapResource *resource, const char *uri_path,
                                        otCoapRequestHandler handler, void *context)
{
    if (!resource) {
        ESP_LOGE(TAG, "Resource pointer NULL");
        return ESP_ERR_INVALID_ARG;
    }

    if (!uri_path || !handler) {
        ESP_LOGE(TAG, "URI path or handler NULL");
        return ESP_ERR_INVALID_ARG;
    }

    /* Setup resource structure */
    memset(resource, 0, sizeof(otCoapResource));
    resource->mUriPath = uri_path;
    resource->mHandler = handler;
    resource->mContext = context;

    /* Add resource (tự động start server nếu cần) */
    return thread_coap_add_resource(resource);
}

esp_err_t thread_coap_add_resource(otCoapResource *resource)
{
    if (!resource) {
        ESP_LOGE(TAG, "Resource pointer NULL");
        return ESP_ERR_INVALID_ARG;
    }

    if (!resource->mUriPath) {
        ESP_LOGE(TAG, "Resource URI path NULL");
        return ESP_ERR_INVALID_ARG;
    }

    /* Tự động start CoAP server nếu chưa start */
    esp_err_t err = thread_coap_server_start();
    if (err != ESP_OK) {
        return err;
    }

    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance NULL");
        return ESP_ERR_INVALID_STATE;
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        ESP_LOGE(TAG, "Failed to acquire OpenThread lock");
        return ESP_ERR_TIMEOUT;
    }

    otCoapAddResource(instance, resource);
    esp_openthread_lock_release();

    ESP_LOGI(TAG, "CoAP resource '%s' registered", resource->mUriPath);
    return ESP_OK;
}

void thread_coap_send_response(otMessage *aMessage, const otMessageInfo *aMessageInfo,
                                otCoapCode response_code, const char *payload, size_t payload_len)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        return;
    }

    otMessage *response = otCoapNewMessage(instance, NULL);
    if (!response) {
        return;
    }

    /* Copy Message ID + Token từ request để client nhận diện response */
    otCoapMessageInitResponse(response, aMessage, OT_COAP_TYPE_ACKNOWLEDGMENT, response_code);

    /* Thêm payload nếu có */
    if (payload && payload_len > 0) {
        otCoapMessageAppendContentFormatOption(response, OT_COAP_OPTION_CONTENT_FORMAT_TEXT_PLAIN);
        otCoapMessageSetPayloadMarker(response);
        otMessageAppend(response, payload, payload_len);
    }

    otCoapSendResponse(instance, response, aMessageInfo);
}
