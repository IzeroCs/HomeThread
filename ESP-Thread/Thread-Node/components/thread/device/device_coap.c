/*
 * Device CoAP - CoAP transport tới Backend (register payload, ping).
 */
#include <inttypes.h>
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
#include "device_coap.h"

static const char *TAG = "device_coap";

#define COAP_DEFAULT_PORT 5683
#define DEVICE_URI_PATH "device"
#define REGISTER_URI_PATH "register"
#define PING_URI_PATH "ping"
#define COAP_TOKEN_LEN 2

#define COAP_BUILD_FAIL_IF(condition, msg) do { \
    if (condition) { \
        if (message) { otMessageFree(message); } \
        esp_openthread_lock_release(); \
        ESP_LOGE(TAG, "%s", msg); \
        return ESP_FAIL; \
    } \
} while (0)

static bool s_coap_started = false;
static uint16_t s_token_seq = 0;
static volatile bool s_registered = false;
static device_coap_register_callback_fn s_register_cb = NULL;
static void *s_register_ctx = NULL;
static uint32_t s_last_ping_ts = 0;
static bool s_last_ping_ts_valid = false;
static device_coap_ping_ts_changed_fn s_ping_cb = NULL;
static void *s_ping_ctx = NULL;

static otError set_request_token(otMessage *message)
{
    uint8_t token[COAP_TOKEN_LEN];
    s_token_seq++;
    token[0] = (uint8_t)(s_token_seq & 0xff);
    token[1] = (uint8_t)((s_token_seq >> 8) & 0xff);
    return otCoapMessageSetToken(message, token, COAP_TOKEN_LEN);
}

static esp_err_t check_preconditions(otInstance **out_instance)
{
    otInstance *inst = esp_openthread_get_instance();
    if (!inst) {
        ESP_LOGE(TAG, "OpenThread instance NULL");
        return ESP_ERR_INVALID_STATE;
    }
    if (!s_coap_started) {
        ESP_LOGE(TAG, "CoAP not started, call device_coap_init() first");
        return ESP_ERR_INVALID_STATE;
    }
    *out_instance = inst;
    return ESP_OK;
}

static esp_err_t acquire_lock(uint32_t timeout_ms)
{
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(timeout_ms))) {
        return ESP_ERR_TIMEOUT;
    }
    return ESP_OK;
}

static esp_err_t acquire_lock_and_ensure_joined(otInstance *instance)
{
    if (acquire_lock(200) != ESP_OK) {
        return ESP_ERR_TIMEOUT;
    }
    otDeviceRole role = otThreadGetDeviceRole(instance);
    if (role == OT_DEVICE_ROLE_DISABLED || role == OT_DEVICE_ROLE_DETACHED) {
        esp_openthread_lock_release();
        ESP_LOGW(TAG, "Device not joined yet");
        return ESP_ERR_INVALID_STATE;
    }
    return ESP_OK;
}

static esp_err_t send_request(otInstance *instance,
                              const device_coap_endpoint_t *endpoint,
                              otMessage *message,
                              otCoapResponseHandler handler)
{
    otMessageInfo message_info;
    memset(&message_info, 0, sizeof(message_info));
    message_info.mPeerAddr = endpoint->addr;
    message_info.mPeerPort = endpoint->port;

    otError err = otCoapSendRequest(instance, message, &message_info, handler, NULL);
    esp_openthread_lock_release();

    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "CoAP send failed: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }
    return ESP_OK;
}

static void register_response_handler(void *aContext, otMessage *aMessage, const otMessageInfo *aMessageInfo, otError aError)
{
    (void)aContext;
    (void)aMessageInfo;

    ESP_LOGW(TAG, "Register response handler");
    bool success = false;
    if (aError == OT_ERROR_NONE && aMessage != NULL) {
        otCoapCode code = otCoapMessageGetCode(aMessage);
        if (code >= OT_COAP_CODE_CREATED && code <= OT_COAP_CODE_CONTENT) {
            success = true;
            s_registered = true;
            ESP_LOGI(TAG, "Register OK (CoAP %d.%02d)", (int)(code >> 5), (int)(code & 0x1f));
        } else {
            ESP_LOGW(TAG, "Register fail (CoAP %d.%02d)", (int)(code >> 5), (int)(code & 0x1f));
        }
    } else {
        ESP_LOGW(TAG, "Register response error: %s", otThreadErrorToString(aError));
    }

    if (s_register_cb) {
        s_register_cb(success, s_register_ctx);
    }
}

static void ping_response_handler(void *aContext, otMessage *aMessage, const otMessageInfo *aMessageInfo, otError aError)
{
    (void)aContext;
    (void)aMessageInfo;

    if (aError != OT_ERROR_NONE || aMessage == NULL) {
        ESP_LOGD(TAG, "Ping response error: %s", otThreadErrorToString(aError));
        return;
    }

    ESP_LOGW(TAG, "Ping handler");
    otCoapCode code = otCoapMessageGetCode(aMessage);
    if (code < OT_COAP_CODE_CREATED || code > OT_COAP_CODE_CONTENT) {
        ESP_LOGD(TAG, "Ping response code %d.%02d", (int)(code >> 5), (int)(code & 0x1f));
        return;
    }

    uint16_t offset = otMessageGetOffset(aMessage);
    uint16_t len = otMessageGetLength(aMessage);
    if (len < offset + 4) {
        ESP_LOGD(TAG, "Ping payload too short");
        return;
    }

    uint8_t buf[4];
    if (otMessageRead(aMessage, offset, buf, 4) != 4) {
        return;
    }
    uint32_t ts = (uint32_t)buf[0] | ((uint32_t)buf[1] << 8) | ((uint32_t)buf[2] << 16) | ((uint32_t)buf[3] << 24);

    if (s_last_ping_ts_valid && ts != s_last_ping_ts && s_ping_cb) {
        ESP_LOGI(TAG, "Backend timestamp changed (0x%08" PRIx32 " -> 0x%08" PRIx32 ")", (unsigned long)s_last_ping_ts, (unsigned long)ts);
        s_ping_cb(s_ping_ctx);
    }

    s_last_ping_ts = ts;
    s_last_ping_ts_valid = true;
}

esp_err_t device_coap_init(void)
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
    ESP_LOGI(TAG, "Device CoAP client started");
    return ESP_OK;
}

bool device_coap_is_registered(void)
{
    return s_registered;
}

esp_err_t device_coap_send_register(const device_coap_endpoint_t *endpoint,
                                    const uint8_t *payload,
                                    int payload_len,
                                    device_coap_register_callback_fn callback,
                                    void *ctx)
{
    if (!endpoint || !payload || payload_len <= 0) {
        ESP_LOGE(TAG, "Invalid args");
        return ESP_ERR_INVALID_ARG;
    }

    otInstance *instance = NULL;
    esp_err_t ret = check_preconditions(&instance);
    if (ret != ESP_OK) {
        return ret;
    }

    ret = acquire_lock_and_ensure_joined(instance);
    if (ret != ESP_OK) {
        return ret;
    }

    s_register_cb = callback;
    s_register_ctx = ctx;

    otMessage *message = otCoapNewMessage(instance, NULL);
    COAP_BUILD_FAIL_IF(!message, "Failed to create CoAP message");

    otCoapMessageInit(message, OT_COAP_TYPE_CONFIRMABLE, OT_COAP_CODE_POST);
    otError err = set_request_token(message);
    COAP_BUILD_FAIL_IF(err != OT_ERROR_NONE, "Failed to set token");
    err = otCoapMessageAppendUriPathOptions(message, DEVICE_URI_PATH);
    COAP_BUILD_FAIL_IF(err != OT_ERROR_NONE, "Failed to append path device");
    err = otCoapMessageAppendUriPathOptions(message, REGISTER_URI_PATH);
    COAP_BUILD_FAIL_IF(err != OT_ERROR_NONE, "Failed to append path register");
    err = otCoapMessageAppendContentFormatOption(message, OT_COAP_OPTION_CONTENT_FORMAT_CBOR);
    COAP_BUILD_FAIL_IF(err != OT_ERROR_NONE, "Failed to append Content-Format");
    otCoapMessageSetPayloadMarker(message);
    err = otMessageAppend(message, payload, (uint16_t)payload_len);
    COAP_BUILD_FAIL_IF(err != OT_ERROR_NONE, "Failed to append payload");

    ret = send_request(instance, endpoint, message, register_response_handler);
    if (ret != ESP_OK) {
        return ret;
    }

    ESP_LOGD(TAG, "POST /device/register sent");
    return ESP_OK;
}

esp_err_t device_coap_ping(const device_coap_endpoint_t *endpoint,
                           device_coap_ping_ts_changed_fn on_timestamp_changed,
                           void *ctx)
{
    if (!endpoint) {
        ESP_LOGE(TAG, "endpoint is NULL");
        return ESP_ERR_INVALID_ARG;
    }

    otInstance *instance = NULL;
    esp_err_t ret = check_preconditions(&instance);
    if (ret != ESP_OK) {
        return ret;
    }

    ret = acquire_lock_and_ensure_joined(instance);
    if (ret != ESP_OK) {
        ESP_LOGD(TAG, "Ping skipped: %s", esp_err_to_name(ret));
        return ret;
    }

    s_ping_cb = on_timestamp_changed;
    s_ping_ctx = ctx;

    otMessage *message = otCoapNewMessage(instance, NULL);
    COAP_BUILD_FAIL_IF(!message, "Failed to create ping message");

    otCoapMessageInit(message, OT_COAP_TYPE_CONFIRMABLE, OT_COAP_CODE_GET);
    otError err = set_request_token(message);
    COAP_BUILD_FAIL_IF(err != OT_ERROR_NONE, "Failed to set token");
    err = otCoapMessageAppendUriPathOptions(message, DEVICE_URI_PATH);
    COAP_BUILD_FAIL_IF(err != OT_ERROR_NONE, "Failed to append path device");
    err = otCoapMessageAppendUriPathOptions(message, PING_URI_PATH);
    COAP_BUILD_FAIL_IF(err != OT_ERROR_NONE, "Failed to append path ping");

    ret = send_request(instance, endpoint, message, ping_response_handler);
    if (ret != ESP_OK) {
        return ret;
    }

    ESP_LOGD(TAG, "GET /device/ping sent");
    return ESP_OK;
}
