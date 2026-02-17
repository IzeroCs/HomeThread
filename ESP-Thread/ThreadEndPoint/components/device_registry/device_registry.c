/*
 * Device Registry - CoAP client wrapper implementation.
 * Dung OpenThread CoAP API de gui POST request len Leader.
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
#include "entity_model.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "device_registry";

#define COAP_DEFAULT_PORT 5683
#define REGISTER_URI_PATH "devices"
#define REGISTER_URI_PATH_REGISTER "register"

static bool s_coap_started = false;
static device_registry_callback_fn s_callback = NULL;
static void *s_callback_ctx = NULL;
static otIp6Address s_leader_rloc;
static bool s_leader_rloc_valid = false;

/* Helper: Extract RLOC16 từ IPv6 RLOC address (2 bytes cuối) */
static uint16_t extract_rloc16_from_ip6(const otIp6Address *addr)
{
    if (!addr) {
        return 0;
    }
    return (addr->mFields.m8[14] << 8) | addr->mFields.m8[15];
}

/* Helper: Get Leader RLOC16 với nhiều fallback methods */
static otError get_leader_rloc16(otInstance *instance, uint16_t *rloc16)
{
    if (!instance || !rloc16) {
        return OT_ERROR_INVALID_ARGS;
    }

    otIp6Address leader_rloc_addr;
    otError err;

    /* Method 1: Try otThreadGetLeaderRloc() - simplest and most direct */
    err = otThreadGetLeaderRloc(instance, &leader_rloc_addr);
    if (err == OT_ERROR_NONE) {
        *rloc16 = extract_rloc16_from_ip6(&leader_rloc_addr);
        return OT_ERROR_NONE;
    }

    /* Method 2: Get from Router Table */
    otLeaderData leader_data;
    err = otThreadGetLeaderData(instance, &leader_data);
    if (err != OT_ERROR_NONE) {
        return err;
    }

    otRouterInfo router_info;
    err = otThreadGetRouterInfo(instance, leader_data.mLeaderRouterId, &router_info);
    if (err == OT_ERROR_NONE) {
        *rloc16 = router_info.mRloc16;
        return OT_ERROR_NONE;
    }

    /* Method 3: Fallback - Calculate from Router ID */
    /* RLOC16 = (Router ID << 10) | Child ID (0 for Router) */
    *rloc16 = (leader_data.mLeaderRouterId << 10) | 0x0000;
    return OT_ERROR_NONE;
}

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

/**
 * Update Leader RLOC address (gọi khi join hoặc state change)
 */
void device_registry_update_leader_rloc(void)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        return;
    }
    
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(200))) {
        return;
    }
    
    /* Get Leader RLOC address */
    otError err = otThreadGetLeaderRloc(instance, &s_leader_rloc);
    if (err == OT_ERROR_NONE) {
        s_leader_rloc_valid = true;
        char leader_addr_str[40];
        otIp6AddressToString(&s_leader_rloc, leader_addr_str, sizeof(leader_addr_str));
        uint16_t leader_rloc16 = extract_rloc16_from_ip6(&s_leader_rloc);
        ESP_LOGI(TAG, "Leader RLOC updated: 0x%04x = %s", leader_rloc16, leader_addr_str);
    } else {
        s_leader_rloc_valid = false;
        ESP_LOGW(TAG, "Cannot get Leader RLOC: %s", otThreadErrorToString(err));
    }
    
    esp_openthread_lock_release();
}

/**
 * Get Leader RLOC address đã lưu
 */
bool device_registry_get_leader_rloc(otIp6Address *leader_rloc)
{
    if (!leader_rloc) {
        return false;
    }
    
    if (s_leader_rloc_valid) {
        *leader_rloc = s_leader_rloc;
        return true;
    }
    
    return false;
}

esp_err_t device_registry_init(void)
{
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

esp_err_t device_registry_register(device_registry_callback_fn callback, void *ctx)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance NULL");
        return ESP_ERR_INVALID_STATE;
    }

    if (!s_coap_started) {
        ESP_LOGE(TAG, "CoAP not started, call device_registry_init() first");
        return ESP_ERR_INVALID_STATE;
    }

    /* Check device da join chua */
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(200))) {
        return ESP_ERR_TIMEOUT;
    }
    otDeviceRole role = otThreadGetDeviceRole(instance);
    if (role == OT_DEVICE_ROLE_DISABLED || role == OT_DEVICE_ROLE_DETACHED) {
        esp_openthread_lock_release();
        ESP_LOGW(TAG, "Device not joined yet");
        return ESP_ERR_INVALID_STATE;
    }
    esp_openthread_lock_release();

    /* Lay thong tin device */
    uint16_t rloc16 = 0;
    const otIp6Address *ml_eid = NULL;
    uint16_t parent_rloc16 = 0;

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        return ESP_ERR_TIMEOUT;
    }

    rloc16 = otThreadGetRloc16(instance);
    ml_eid = otThreadGetMeshLocalEid(instance);
    
    if (role == OT_DEVICE_ROLE_CHILD) {
        otRouterInfo parent_info;
        if (otThreadGetParentInfo(instance, &parent_info) == OT_ERROR_NONE) {
            parent_rloc16 = parent_info.mRloc16;
        }
    }

    /* Lay entity_model description */
    char entity_desc[512];
    int desc_len = entity_describe(entity_desc, sizeof(entity_desc));
    if (desc_len < 0) {
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "entity_describe failed");
        return ESP_FAIL;
    }

    /* Format payload: text format (co the chuyen sang JSON sau) */
    char payload[768];
    char ml_eid_str[40];
    if (ml_eid) {
        otIp6AddressToString(ml_eid, ml_eid_str, sizeof(ml_eid_str));
    } else {
        strcpy(ml_eid_str, "unknown");
    }

    int payload_len = snprintf(payload, sizeof(payload),
                               "rloc16=0x%04x\nml_eid=%s\nparent=0x%04x\n%s",
                               rloc16, ml_eid_str, parent_rloc16, entity_desc);
    if (payload_len < 0 || (size_t)payload_len >= sizeof(payload)) {
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "Payload buffer too small");
        return ESP_FAIL;
    }

    /* Tao CoAP POST message */
    otMessage *message = otCoapNewMessage(instance, NULL);
    if (!message) {
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "otCoapNewMessage failed");
        return ESP_ERR_NO_MEM;
    }

    otCoapMessageInit(message, OT_COAP_TYPE_CONFIRMABLE, OT_COAP_CODE_POST);

    /* Add URI path: /devices/register */
    otError err = otCoapMessageAppendUriPathOptions(message, REGISTER_URI_PATH);
    if (err == OT_ERROR_NONE) {
        err = otCoapMessageAppendUriPathOptions(message, REGISTER_URI_PATH_REGISTER);
    }
    if (err != OT_ERROR_NONE) {
        otMessageFree(message);
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "Failed to append URI path: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }

    /* Add Content-Format option (text/plain) */
    err = otCoapMessageAppendContentFormatOption(message, OT_COAP_OPTION_CONTENT_FORMAT_TEXT_PLAIN);
    if (err != OT_ERROR_NONE) {
        otMessageFree(message);
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "Failed to append Content-Format: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }

    /* Set payload marker va append payload */
    err = otCoapMessageSetPayloadMarker(message);
    if (err == OT_ERROR_NONE) {
        err = otMessageAppend(message, payload, payload_len);
    }
    if (err != OT_ERROR_NONE) {
        otMessageFree(message);
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "Failed to append payload: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }

    /* Update Leader RLOC nếu chưa có hoặc cần refresh */
    if (!s_leader_rloc_valid) {
        device_registry_update_leader_rloc();
    }
    
    if (!s_leader_rloc_valid) {
        otMessageFree(message);
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "Leader RLOC not available");
        return ESP_FAIL;
    }
    
    /* Tạo destination address từ Leader RLOC đã lưu */
    otMessageInfo message_info;
    memset(&message_info, 0, sizeof(message_info));
    message_info.mPeerPort = COAP_DEFAULT_PORT;
    message_info.mPeerAddr = s_leader_rloc;

    /* Save callback */
    s_callback = callback;
    s_callback_ctx = ctx;

    /* Gui CoAP request */
    err = otCoapSendRequest(instance, message, &message_info, coap_response_handler, NULL);
    esp_openthread_lock_release();

    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "otCoapSendRequest failed: %s", otThreadErrorToString(err));
        s_callback = NULL;
        s_callback_ctx = NULL;
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "Device registration request sent: rloc16=0x%04x, parent=0x%04x", 
             rloc16, parent_rloc16);
    return ESP_OK;
}
