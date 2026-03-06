/*
 * Device Registry - CoAP client: gửi POST /device/register lên Backend.
 * Chỉ gửi sau khi discovery được backend; khi backend IPv6 đổi thì app gọi lại device_registry_register().
 */
#include <string.h>
#include "esp_err.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "openthread/coap.h"
#include "openthread/error.h"
#include "openthread/instance.h"
#include "openthread/ip6.h"
#include "openthread/message.h"
#include "openthread/thread.h"
#include "openthread/thread_ftd.h"
#include "device_registry.h"
#include "device_model.h"
#include "entity_serialization.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "device_registry";

#define COAP_DEFAULT_PORT 5683
#define REGISTER_URI_PATH "device"
#define REGISTER_URI_PATH_REGISTER "register"

static bool s_coap_started = false;
static device_registry_callback_fn s_callback = NULL;
static void *s_callback_ctx = NULL;
static volatile bool s_registered = false;

/* CoAP response handler */
static void coap_response_handler(void *aContext, otMessage *aMessage, const otMessageInfo *aMessageInfo, otError aError)
{
    (void)aContext;
    (void)aMessageInfo;

    bool success = false;
    if (aError == OT_ERROR_NONE && aMessage != NULL) {
        otCoapCode code = otCoapMessageGetCode(aMessage);
        if (code >= OT_COAP_CODE_CREATED && code <= OT_COAP_CODE_CONTENT) {
            success = true;
            s_registered = true;
            ESP_LOGI(TAG, "Device registered successfully (CoAP %d.%02d)",
                     (int)(code >> 5), (int)(code & 0x1f));
        } else {
            ESP_LOGW(TAG, "Device registration failed (CoAP %d.%02d)",
                     (int)(code >> 5), (int)(code & 0x1f));
        }
    } else {
        ESP_LOGW(TAG, "CoAP response error: %s", otThreadErrorToString(aError));
    }

    if (s_callback) {
        s_callback(success, s_callback_ctx);
    }
}

bool device_registry_is_registered(void)
{
    return s_registered;
}

esp_err_t device_registry_init(void)
{
    s_registered = false;

    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance NULL");
        return ESP_ERR_INVALID_STATE;
    }

    if (s_coap_started) {
        ESP_LOGW(TAG, "CoAP already started");
        return ESP_ERR_INVALID_STATE;
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        ESP_LOGE(TAG, "Failed to acquire OpenThread lock");
        return ESP_ERR_TIMEOUT;
    }

    otError err = otCoapStart(instance, COAP_DEFAULT_PORT);
    esp_openthread_lock_release();

    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "otCoapStart failed: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }

    s_coap_started = true;
    ESP_LOGI(TAG, "Device Registry CoAP client started");
    return ESP_OK;
}

esp_err_t device_registry_register(const device_registry_endpoint_t *endpoint,
                                  device_registry_callback_fn callback,
                                  void *ctx)
{
    if (!endpoint) {
        ESP_LOGE(TAG, "endpoint is NULL");
        return ESP_ERR_INVALID_ARG;
    }

    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance NULL");
        return ESP_ERR_INVALID_STATE;
    }

    if (!s_coap_started) {
        ESP_LOGE(TAG, "CoAP not started, call device_registry_init() first");
        return ESP_ERR_INVALID_STATE;
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(200))) {
        return ESP_ERR_TIMEOUT;
    }

    otDeviceRole role = otThreadGetDeviceRole(instance);
    if (role == OT_DEVICE_ROLE_DISABLED || role == OT_DEVICE_ROLE_DETACHED) {
        esp_openthread_lock_release();
        ESP_LOGW(TAG, "Device not joined yet");
        return ESP_ERR_INVALID_STATE;
    }

    uint16_t rloc16 = 0;
    uint16_t parent_rloc16 = 0;
    const otIp6Address *ml_eid = otThreadGetMeshLocalEid(instance);
    uint8_t role_enum = 0;

    rloc16 = otThreadGetRloc16(instance);

    switch (role) {
        case OT_DEVICE_ROLE_CHILD:
            role_enum = 0;
            {
                otRouterInfo parent_info;
                memset(&parent_info, 0, sizeof(parent_info));
                if (otThreadGetParentInfo(instance, &parent_info) == OT_ERROR_NONE) {
                    parent_rloc16 = parent_info.mRloc16;
                }
            }
            break;
        case OT_DEVICE_ROLE_ROUTER:
            role_enum = 2;
            parent_rloc16 = 0;
            break;
        case OT_DEVICE_ROLE_LEADER:
            role_enum = 3;
            parent_rloc16 = 0;
            break;
        default:
            role_enum = 0;
            parent_rloc16 = 0;
            break;
    }

    esp_openthread_lock_release();

    device_model_t *device = device_model_get();
    if (!device) {
        ESP_LOGE(TAG, "Device Model not initialized");
        return ESP_ERR_INVALID_STATE;
    }

    uint8_t ipv6_bytes[16] = {0};
    if (ml_eid) {
        memcpy(ipv6_bytes, ml_eid->mFields.m8, 16);
    }
    device_model_update_network(rloc16, ipv6_bytes, role_enum);

    if (device_model_sync_entities() < 0) {
        ESP_LOGE(TAG, "Failed to sync entities");
        return ESP_FAIL;
    }

    uint8_t cbor_buffer[1024];
    int cbor_len = entity_serialize_cbor(rloc16, NULL, parent_rloc16, cbor_buffer, sizeof(cbor_buffer));
    if (cbor_len < 0) {
        ESP_LOGE(TAG, "Failed to serialize device model to CBOR");
        return ESP_FAIL;
    }

    s_callback = callback;
    s_callback_ctx = ctx;

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        return ESP_ERR_TIMEOUT;
    }

    otMessage *message = otCoapNewMessage(instance, NULL);
    if (!message) {
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "Failed to create CoAP message");
        return ESP_ERR_NO_MEM;
    }

    otCoapMessageInit(message, OT_COAP_TYPE_CONFIRMABLE, OT_COAP_CODE_POST);
    otError err = otCoapMessageAppendUriPathOptions(message, REGISTER_URI_PATH);
    if (err != OT_ERROR_NONE) {
        otMessageFree(message);
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "Failed to append URI path: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }
    err = otCoapMessageAppendUriPathOptions(message, REGISTER_URI_PATH_REGISTER);
    if (err != OT_ERROR_NONE) {
        otMessageFree(message);
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "Failed to append URI path register: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }
    err = otCoapMessageAppendContentFormatOption(message, OT_COAP_OPTION_CONTENT_FORMAT_CBOR);
    if (err != OT_ERROR_NONE) {
        otMessageFree(message);
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "Failed to append Content-Format: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }
    otCoapMessageSetPayloadMarker(message);
    err = otMessageAppend(message, cbor_buffer, cbor_len);
    if (err != OT_ERROR_NONE) {
        otMessageFree(message);
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "Failed to append payload: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }

    otMessageInfo message_info;
    memset(&message_info, 0, sizeof(message_info));
    message_info.mPeerAddr = endpoint->addr;
    message_info.mPeerPort = endpoint->port;

    err = otCoapSendRequest(instance, message, &message_info, coap_response_handler, NULL);
    esp_openthread_lock_release();

    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "Failed to send CoAP request: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "CoAP POST /device/register sent to backend (rloc16=0x%04x, port=%u)", rloc16, (unsigned)endpoint->port);
    return ESP_OK;
}
