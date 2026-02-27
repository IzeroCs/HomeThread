/*
 * Device Registry - CoAP client wrapper implementation.
 * Dung OpenThread CoAP API de gui POST request len Leader.
 *
 * TODO: Sau này lắng nghe từ Leader yêu cầu gửi lại đăng ký (re-register); khi nhận
 *       request đó thì trigger gửi lại POST /device/register ngay (vd. resource
 *       GET /device/reregister từ Leader, handler gọi notify registry task).
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
static otIp6Address s_leader_rloc;
static bool s_leader_rloc_valid = false;
/* false at boot; set true when Leader has ACKed at least one /device/register. */
static volatile bool s_registered_with_leader = false;

/* Helper: Extract RLOC16 từ IPv6 RLOC address (2 bytes cuối) */
static uint16_t extract_rloc16_from_ip6(const otIp6Address *addr)
{
    if (!addr) {
        return 0;
    }
    return (addr->mFields.m8[14] << 8) | addr->mFields.m8[15];
}

/* Helper: Get Leader RLOC16 với nhiều fallback methods */
/* TODO: May be used after migration */
__attribute__((unused)) static otError get_leader_rloc16(otInstance *instance, uint16_t *rloc16)
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

bool device_registry_is_registered(void)
{
    return s_registered_with_leader;
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
    s_registered_with_leader = false; /* Boot: chưa nhận ACK từ Leader */

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

/**
 * Register device lên Leader: gửi CoAP POST /device/register với device model.
 *
 * TODO: Migrate to struct-based approach
 *   1. Include headers:
 *      #include "entity_model.h"
 *      #include "device_model.h"
 *      #include "entity_serialization.h"
 *
 *   2. Create device_model_t struct:
 *      device_model_t device = {0};
 *      - Fill device.info from device metadata
 *      - Fill entities from entity model (entity_get_by_index, etc.)
 *      - Fill network info (rloc16, ml_eid, role)
 *
 *   3. Serialize device_model_t → CBOR:
 *      serialize_device_cbor(&device, buffer, buffer_size)
 *
 *   4. Send CoAP POST with CBOR payload
 */
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

    /* Check device da join chua và lấy thông tin network */
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(200))) {
        return ESP_ERR_TIMEOUT;
    }
    
    otDeviceRole role = otThreadGetDeviceRole(instance);
    if (role == OT_DEVICE_ROLE_DISABLED || role == OT_DEVICE_ROLE_DETACHED) {
        esp_openthread_lock_release();
        ESP_LOGW(TAG, "Device not joined yet");
        return ESP_ERR_INVALID_STATE;
    }
    if (role == OT_DEVICE_ROLE_LEADER) {
        esp_openthread_lock_release();
        ESP_LOGW(TAG, "Device is Leader, no need to register to self");
        return ESP_ERR_INVALID_STATE;
    }

    /* Lay thong tin device (phải có lock) */
    uint16_t rloc16 = 0;
    uint16_t parent_rloc16 = 0;
    const otIp6Address *ml_eid = NULL;
    uint8_t role_enum = 0;

    rloc16 = otThreadGetRloc16(instance);
    ml_eid = otThreadGetMeshLocalEid(instance);

    // Convert role to uint8_t và lấy parent RLOC16
    switch (role) {
        case OT_DEVICE_ROLE_CHILD:
            role_enum = 0;
            // Get parent RLOC16 (only CHILD has parent)
            {
                otRouterInfo parent_info;
                memset(&parent_info, 0, sizeof(parent_info)); // Initialize struct
                otError parent_err = otThreadGetParentInfo(instance, &parent_info);
                if (parent_err == OT_ERROR_NONE) {
                    parent_rloc16 = parent_info.mRloc16;
                }
            }
            break;
        case OT_DEVICE_ROLE_LEADER:
            role_enum = 1;
            // Leader has no parent
            parent_rloc16 = 0;
            break;
        case OT_DEVICE_ROLE_ROUTER:
            role_enum = 2;
            // Router may have parent, but for now we don't track it
            parent_rloc16 = 0;
            break;
        default:
            role_enum = 0;
            parent_rloc16 = 0;
            break;
    }

    esp_openthread_lock_release();

    /* Check Device Model initialized */
    device_model_t *device = device_model_get();
    if (!device) {
        ESP_LOGE(TAG, "Device Model not initialized, call device_model_init() first");
        return ESP_ERR_INVALID_STATE;
    }

    // Update Device Model network info
    uint8_t ipv6_bytes[16] = {0};
    if (ml_eid) {
        memcpy(ipv6_bytes, ml_eid->mFields.m8, 16);
    }
    device_model_update_network(rloc16, ipv6_bytes, role_enum);

    // Sync entities from Entity Model
    if (device_model_sync_entities() < 0) {
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "Failed to sync entities");
        return ESP_FAIL;
    }

    esp_openthread_lock_release();

    // Serialize device model to CBOR
    uint8_t cbor_buffer[1024]; // TODO: Make configurable
    const char *ml_eid_str = NULL; // Not used anymore, device_model has ipv6_addr
    int cbor_len = entity_serialize_cbor(rloc16, ml_eid_str, parent_rloc16, cbor_buffer, sizeof(cbor_buffer));
    if (cbor_len < 0) {
        ESP_LOGE(TAG, "Failed to serialize device model to CBOR");
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "Serialized device model: %d bytes", cbor_len);

    // Get Leader RLOC
    if (!s_leader_rloc_valid) {
        ESP_LOGW(TAG, "Leader RLOC not available, cannot send register request");
        return ESP_ERR_INVALID_STATE;
    }
    
    // Log Leader RLOC16 for debugging
    uint16_t leader_rloc16 = extract_rloc16_from_ip6(&s_leader_rloc);
    ESP_LOGI(TAG, "Leader RLOC16: 0x%04x", leader_rloc16);

    // Store callback for response handler
    s_callback = callback;
    s_callback_ctx = ctx;

    // Send CoAP POST request
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        return ESP_ERR_TIMEOUT;
    }

    otMessage *message = otCoapNewMessage(instance, NULL);
    if (!message) {
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "Failed to create CoAP message");
        return ESP_ERR_NO_MEM;
    }

    // Initialize CoAP message
    otCoapMessageInit(message, OT_COAP_TYPE_CONFIRMABLE, OT_COAP_CODE_POST);

    // Set URI path: /device/register
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

    // Set Content-Format: application/cbor
    err = otCoapMessageAppendContentFormatOption(message, OT_COAP_OPTION_CONTENT_FORMAT_CBOR);
    if (err != OT_ERROR_NONE) {
        otMessageFree(message);
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "Failed to append Content-Format: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }

    // Set payload marker and append CBOR data
    otCoapMessageSetPayloadMarker(message);
    err = otMessageAppend(message, cbor_buffer, cbor_len);
    if (err != OT_ERROR_NONE) {
        otMessageFree(message);
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "Failed to append payload: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }

    // Prepare message info (destination: Leader)
    otMessageInfo message_info;
    memset(&message_info, 0, sizeof(message_info));
    message_info.mPeerAddr = s_leader_rloc;
    message_info.mPeerPort = COAP_DEFAULT_PORT;

    // Send request
    err = otCoapSendRequest(instance, message, &message_info, coap_response_handler, NULL);
    esp_openthread_lock_release();

    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "Failed to send CoAP request: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "CoAP POST /device/register sent to Leader (device_rloc16=0x%04x, parent_rloc16=0x%04x, leader_rloc16=0x%04x)", 
             rloc16, parent_rloc16, leader_rloc16);
    return ESP_OK;
}
