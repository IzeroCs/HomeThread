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
#include "device_model.h"
#include "device_coap.h"

static const char *TAG = "device_coap";

#define COAP_DEFAULT_PORT 5683
#define COAP_TOKEN_LEN 2

#define URI_DEVICE           "device"
#define URI_REGISTER         "register"
#define URI_REGISTER_INFO    "info"
#define URI_REGISTER_ENTITY  "entity"
#define URI_UPDATE           "update"
#define URI_UPDATE_TOPOLOGY  "topology"
#define URI_UPDATE_STATE     "state"
#define URI_PING             "ping"

static bool s_coap_started = false;
static uint16_t s_token_seq = 0;
static volatile bool s_registered = false;
static volatile bool s_entities_acked = false;
static device_coap_register_callback_fn s_register_cb = NULL;
static void *s_register_ctx = NULL;
static device_coap_register_callback_fn s_entities_cb = NULL;
static void *s_entities_ctx = NULL;
static uint32_t s_last_ping_ts = 0;
static bool s_last_ping_ts_valid = false;
static device_coap_ping_ts_changed_fn s_ping_cb = NULL;
static void *s_ping_ctx = NULL;
static device_coap_register_callback_fn s_topology_cb = NULL;
static void *s_topology_ctx = NULL;
static device_coap_register_callback_fn s_state_cb = NULL;
static void *s_state_ctx = NULL;

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

static esp_err_t build_post_cbor(otInstance *instance,
                                 const char *paths[],
                                 int path_count,
                                 const uint8_t *payload,
                                 int payload_len,
                                 otMessage **out_message)
{
    otMessage *message = otCoapNewMessage(instance, NULL);
    if (!message) {
        ESP_LOGE(TAG, "Failed to alloc CoAP message");
        return ESP_FAIL;
    }

    otCoapMessageInit(message, OT_COAP_TYPE_CONFIRMABLE, OT_COAP_CODE_POST);

    otError err = set_request_token(message);
    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "Failed to set token");
        goto fail;
    }

    for (int i = 0; i < path_count; i++) {
        err = otCoapMessageAppendUriPathOptions(message, paths[i]);
        if (err != OT_ERROR_NONE) {
            ESP_LOGE(TAG, "Failed to append path: %s", paths[i]);
            goto fail;
        }
    }

    err = otCoapMessageAppendContentFormatOption(message, OT_COAP_OPTION_CONTENT_FORMAT_CBOR);
    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "Failed to append Content-Format");
        goto fail;
    }

    otCoapMessageSetPayloadMarker(message);

    err = otMessageAppend(message, payload, (uint16_t)payload_len);
    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "Failed to append payload");
        goto fail;
    }

    *out_message = message;
    return ESP_OK;

fail:
    otMessageFree(message);
    return ESP_FAIL;
}

/** Build GET message; if uri_query is non-NULL and non-empty, appends Uri-Query option (e.g. "mac=..."). */
static esp_err_t build_get(otInstance *instance,
                           const char *paths[],
                           int path_count,
                           const char *uri_query,
                           otMessage **out_message)
{
    otMessage *message = otCoapNewMessage(instance, NULL);
    if (!message) {
        ESP_LOGE(TAG, "Failed to alloc CoAP message");
        return ESP_FAIL;
    }

    otCoapMessageInit(message, OT_COAP_TYPE_CONFIRMABLE, OT_COAP_CODE_GET);

    otError err = set_request_token(message);
    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "Failed to set token");
        goto fail;
    }

    for (int i = 0; i < path_count; i++) {
        err = otCoapMessageAppendUriPathOptions(message, paths[i]);
        if (err != OT_ERROR_NONE) {
            ESP_LOGE(TAG, "Failed to append path: %s", paths[i]);
            goto fail;
        }
    }

    if (uri_query != NULL && uri_query[0] != '\0') {
        err = otCoapMessageAppendUriQueryOption(message, uri_query);
        if (err != OT_ERROR_NONE) {
            ESP_LOGE(TAG, "Failed to append Uri-Query");
            goto fail;
        }
    }

    *out_message = message;
    return ESP_OK;

fail:
    otMessageFree(message);
    return ESP_FAIL;
}

static void register_response_handler(void *aContext, otMessage *aMessage, const otMessageInfo *aMessageInfo, otError aError)
{
    (void)aContext;
    (void)aMessageInfo;

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

static void entities_response_handler(void *aContext, otMessage *aMessage, const otMessageInfo *aMessageInfo, otError aError)
{
    (void)aContext;
    (void)aMessageInfo;

    bool success = false;
    if (aError == OT_ERROR_NONE && aMessage != NULL) {
        otCoapCode code = otCoapMessageGetCode(aMessage);
        if (code >= OT_COAP_CODE_CREATED && code <= OT_COAP_CODE_CONTENT) {
            success = true;
            s_entities_acked = true;
            ESP_LOGD(TAG, "Entities POST OK (CoAP %d.%02d)", (int)(code >> 5), (int)(code & 0x1f));
        } else {
            ESP_LOGW(TAG, "Entities POST fail (CoAP %d.%02d)", (int)(code >> 5), (int)(code & 0x1f));
        }
    } else {
        ESP_LOGW(TAG, "Entities response error: %s", otThreadErrorToString(aError));
    }

    if (s_entities_cb) {
        s_entities_cb(success, s_entities_ctx);
    }
}

static void topology_response_handler(void *aContext, otMessage *aMessage, const otMessageInfo *aMessageInfo, otError aError)
{
    (void)aContext;
    (void)aMessageInfo;

    bool success = false;
    if (aError == OT_ERROR_NONE && aMessage != NULL) {
        otCoapCode code = otCoapMessageGetCode(aMessage);
        if (code >= OT_COAP_CODE_CREATED && code <= OT_COAP_CODE_CONTENT) {
            success = true;
            ESP_LOGD(TAG, "Update topology OK (CoAP %d.%02d)", (int)(code >> 5), (int)(code & 0x1f));
        } else {
            ESP_LOGW(TAG, "Update topology fail (CoAP %d.%02d)", (int)(code >> 5), (int)(code & 0x1f));
        }
    } else {
        ESP_LOGW(TAG, "Update topology response error: %s", otThreadErrorToString(aError));
    }

    if (s_topology_cb) {
        s_topology_cb(success, s_topology_ctx);
    }
}

static void state_response_handler(void *aContext, otMessage *aMessage, const otMessageInfo *aMessageInfo, otError aError)
{
    (void)aContext;
    (void)aMessageInfo;

    bool success = false;
    if (aError == OT_ERROR_NONE && aMessage != NULL) {
        otCoapCode code = otCoapMessageGetCode(aMessage);
        if (code >= OT_COAP_CODE_CREATED && code <= OT_COAP_CODE_CONTENT) {
            success = true;
            ESP_LOGD(TAG, "Update state OK (CoAP %d.%02d)", (int)(code >> 5), (int)(code & 0x1f));
        } else {
            ESP_LOGW(TAG, "Update state fail (CoAP %d.%02d)", (int)(code >> 5), (int)(code & 0x1f));
        }
    } else {
        ESP_LOGW(TAG, "Update state response error: %s", otThreadErrorToString(aError));
    }

    if (s_state_cb) {
        s_state_cb(success, s_state_ctx);
    }
}

static void ping_response_handler(void *aContext, otMessage *aMessage, const otMessageInfo *aMessageInfo, otError aError)
{
    (void)aContext;
    (void)aMessageInfo;

    if (aError != OT_ERROR_NONE || aMessage == NULL) {
        ESP_LOGW(TAG, "Ping response error: %s", otThreadErrorToString(aError));
        return;
    }

    otCoapCode code = otCoapMessageGetCode(aMessage);
    if (code < OT_COAP_CODE_CREATED || code > OT_COAP_CODE_CONTENT) {
        ESP_LOGW(TAG, "Ping response code %d.%02d", (int)(code >> 5), (int)(code & 0x1f));
        return;
    }

    uint16_t offset = otMessageGetOffset(aMessage);
    uint16_t len = otMessageGetLength(aMessage);
    if (len < offset + 4) {
        ESP_LOGW(TAG, "Ping payload too short");
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
    return s_registered && s_entities_acked;
}

void device_coap_set_entities_acked(bool acked)
{
    s_entities_acked = acked;
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
    s_entities_acked = false;

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

    static const char *paths[] = { URI_DEVICE, URI_REGISTER, URI_REGISTER_INFO };
    otMessage *message = NULL;
    ret = build_post_cbor(instance, paths, 3, payload, payload_len, &message);
    if (ret != ESP_OK) {
        return ret;
    }

    ret = send_request(instance, endpoint, message, register_response_handler);
    if (ret != ESP_OK) {
        return ret;
    }

    ESP_LOGD(TAG, "POST /device/register/info sent");
    return ESP_OK;
}

esp_err_t device_coap_send_entities(const device_coap_endpoint_t *endpoint,
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

    s_entities_cb = callback;
    s_entities_ctx = ctx;

    static const char *paths[] = { URI_DEVICE, URI_REGISTER, URI_REGISTER_ENTITY };
    otMessage *message = NULL;
    ret = build_post_cbor(instance, paths, 3, payload, payload_len, &message);
    if (ret != ESP_OK) {
        return ret;
    }

    ret = send_request(instance, endpoint, message, entities_response_handler);
    if (ret != ESP_OK) {
        return ret;
    }

    ESP_LOGD(TAG, "POST /device/register/entity sent");
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

    /* Optional Uri-Query "mac=<16_hex>" for backend heartbeat (last_seen_at) */
    const char *uri_query = NULL;
    char mac_query_buf[4 + 16 + 1]; /* "mac=" + 16 hex + NUL */
    device_model_t *device = device_model_get();
    if (device != NULL && device->info.mac_address != 0) {
        uint64_t mac = device->info.mac_address;
        memcpy(mac_query_buf, "mac=", 4);
        for (int i = 0; i < 8; i++) {
            uint8_t b = (uint8_t)(mac >> (56 - i * 8));
            int n = snprintf(mac_query_buf + 4 + i * 2, 3, "%02x", (unsigned)b);
            (void)n;
        }
        mac_query_buf[4 + 16] = '\0';
        uri_query = mac_query_buf;
    }

    static const char *paths[] = { URI_DEVICE, URI_PING };
    otMessage *message = NULL;
    ret = build_get(instance, paths, 2, uri_query, &message);
    if (ret != ESP_OK) {
        return ret;
    }

    ret = send_request(instance, endpoint, message, ping_response_handler);
    if (ret != ESP_OK) {
        return ret;
    }

    ESP_LOGD(TAG, "GET /device/ping sent");
    return ESP_OK;
}

esp_err_t device_coap_send_update_topology(const device_coap_endpoint_t *endpoint,
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

    s_topology_cb = callback;
    s_topology_ctx = ctx;

    static const char *paths[] = { URI_DEVICE, URI_UPDATE, URI_UPDATE_TOPOLOGY };
    otMessage *message = NULL;
    ret = build_post_cbor(instance, paths, 3, payload, payload_len, &message);
    if (ret != ESP_OK) {
        return ret;
    }

    ret = send_request(instance, endpoint, message, topology_response_handler);
    if (ret != ESP_OK) {
        return ret;
    }

    ESP_LOGD(TAG, "POST /device/update/topology sent");
    return ESP_OK;
}

esp_err_t device_coap_send_update_state(const device_coap_endpoint_t *endpoint,
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

    s_state_cb = callback;
    s_state_ctx = ctx;

    static const char *paths[] = { URI_DEVICE, URI_UPDATE, URI_UPDATE_STATE };
    otMessage *message = NULL;
    ret = build_post_cbor(instance, paths, 3, payload, payload_len, &message);
    if (ret != ESP_OK) {
        return ret;
    }

    ret = send_request(instance, endpoint, message, state_response_handler);
    if (ret != ESP_OK) {
        return ret;
    }

    ESP_LOGD(TAG, "POST /device/update/state sent");
    return ESP_OK;
}
