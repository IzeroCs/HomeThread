/*
 * Device Registry Server - CoAP server để nhận đăng ký từ child devices.
 * Resource: /devices/register
 * Method: POST
 * Payload: rloc16, ml_eid, parent, entity_model
 */

#include "device_registry_server.h"
#include "openthread_custom_config.h"  // Enable CoAP API
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "openthread/coap.h"
#include "openthread/ip6.h"
#include "openthread/message.h"
#include <string.h>
#include <stdbool.h>

static const char *TAG = "device_registry";

#define MAX_PAYLOAD_SIZE 768
#define MAX_DEVICES 32

typedef struct {
    uint16_t rloc16;
    char ml_eid[40];
    uint16_t parent_rloc16;
    char entity_model[512];
    uint64_t registered_time;
} device_info_t;

static device_info_t s_devices[MAX_DEVICES];
static int s_device_count = 0;

static void parse_payload(const char *payload, device_info_t *info)
{
    memset(info, 0, sizeof(device_info_t));

    // Parse rloc16
    const char *rloc_str = strstr(payload, "rloc16=");
    if (rloc_str) {
        sscanf(rloc_str, "rloc16=%hx", &info->rloc16);
    }

    // Parse ml_eid
    const char *ml_eid_str = strstr(payload, "ml_eid=");
    if (ml_eid_str) {
        const char *start = ml_eid_str + 7;
        const char *end = strchr(start, '\n');
        if (!end) end = strchr(start, '\r');
        if (!end) end = start + strlen(start);
        size_t len = end - start;
        if (len >= sizeof(info->ml_eid)) len = sizeof(info->ml_eid) - 1;
        strncpy(info->ml_eid, start, len);
        info->ml_eid[len] = '\0';
    }

    // Parse parent
    const char *parent_str = strstr(payload, "parent=");
    if (parent_str) {
        sscanf(parent_str, "parent=%hx", &info->parent_rloc16);
    }

    // Parse entity_model (từ entity_id đến hết)
    const char *entity_str = strstr(payload, "entity_id=");
    if (entity_str) {
        size_t len = strlen(entity_str);
        if (len >= sizeof(info->entity_model)) len = sizeof(info->entity_model) - 1;
        strncpy(info->entity_model, entity_str, len);
        info->entity_model[len] = '\0';
    }
}

static void default_coap_handler(void *aContext, otMessage *aMessage, const otMessageInfo *aMessageInfo)
{
    (void)aContext;
    otCoapCode code = otCoapMessageGetCode(aMessage);
    otCoapType type = otCoapMessageGetType(aMessage);

    ESP_LOGW(TAG, "*** Unhandled CoAP request: Type=%d, Code=%d.%02d from %04x ***",
             type, (int)(code >> 5), (int)(code & 0x1f), aMessageInfo->mPeerAddr.mFields.m16[7]);

    // Read URI path options
    otCoapOptionIterator iterator;
    otCoapOptionIteratorInit(&iterator, aMessage);
    char uri_path[256] = {0};
    int seg_count = 0;

    const otCoapOption *option;
    while ((option = otCoapOptionIteratorGetNextOption(&iterator)) != NULL) {
        if (option->mNumber == OT_COAP_OPTION_URI_PATH) {
            if (seg_count > 0) {
                strcat(uri_path, "/");
            }
            char seg[64];
            uint16_t seg_len = option->mLength;
            if (seg_len >= sizeof(seg)) seg_len = sizeof(seg) - 1;
            uint16_t offset = iterator.mNextOptionOffset - seg_len;
            otMessageRead(aMessage, offset, seg, seg_len);
            seg[seg_len] = '\0';
            strcat(uri_path, seg);
            seg_count++;
        }
    }
    if (seg_count > 0) {
        ESP_LOGW(TAG, "URI Path: /%s (%d segments)", uri_path, seg_count);
    }
}

static void device_register_handler(void *aContext, otMessage *aMessage,
                                    const otMessageInfo *aMessageInfo)
{
    (void)aContext;

    otInstance *instance = esp_openthread_get_instance();

    // Log message info
    otCoapCode code = otCoapMessageGetCode(aMessage);
    otCoapType type = otCoapMessageGetType(aMessage);
    ESP_LOGI(TAG, ">>> CoAP handler called! <<<");
    ESP_LOGI(TAG, "Message: Type=%d, Code=%d.%02d", type, (int)(code >> 5), (int)(code & 0x1f));
    ESP_LOGI(TAG, "From: %04x", aMessageInfo->mPeerAddr.mFields.m16[7]);

    // Read URI path options và check có phải /devices/register không
    otCoapOptionIterator iterator;
    otCoapOptionIteratorInit(&iterator, aMessage);
    char segments[2][64] = {{0}};
    int seg_count = 0;

    const otCoapOption *option;
    while ((option = otCoapOptionIteratorGetNextOption(&iterator)) != NULL && seg_count < 2) {
        if (option->mNumber == OT_COAP_OPTION_URI_PATH) {
            uint16_t seg_len = option->mLength;
            if (seg_len >= sizeof(segments[0])) seg_len = sizeof(segments[0]) - 1;
            uint16_t offset = iterator.mNextOptionOffset - seg_len;
            otMessageRead(aMessage, offset, segments[seg_count], seg_len);
            segments[seg_count][seg_len] = '\0';
            seg_count++;
        }
    }

    ESP_LOGI(TAG, "URI Path segments: [0]=%s, [1]=%s (count=%d)",
             segments[0], segments[1], seg_count);

    // Check có phải POST /devices/register không
    if (seg_count < 2 || strcmp(segments[0], "devices") != 0 || strcmp(segments[1], "register") != 0) {
        ESP_LOGW(TAG, "Not a registration request (expected /devices/register, got /%s/%s)",
                 segments[0], seg_count > 1 ? segments[1] : "(none)");
        return;  // Không phải registration request
    }

    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance is NULL in handler!");
        return;
    }

    // Read payload
    uint16_t offset = otMessageGetOffset(aMessage);
    uint16_t payload_len = otMessageGetLength(aMessage) - offset;
    char payload[MAX_PAYLOAD_SIZE + 1];

    if (payload_len >= sizeof(payload)) {
        payload_len = sizeof(payload) - 1;
    }

    otMessageRead(aMessage, offset, payload, payload_len);
    payload[payload_len] = '\0';

    ESP_LOGI(TAG, "=== Device Registration Request ===");
    ESP_LOGI(TAG, "From: %04x (RLOC16)", aMessageInfo->mPeerAddr.mFields.m16[7]);
    ESP_LOGI(TAG, "Payload length: %d bytes", payload_len);
    ESP_LOGI(TAG, "Payload:\n%.*s", payload_len, payload);

    // Parse payload
    device_info_t info;
    parse_payload(payload, &info);
    info.registered_time = xTaskGetTickCount() * portTICK_PERIOD_MS; // milliseconds

    ESP_LOGI(TAG, "Parsed: rloc16=0x%04x, ml_eid=%s, parent=0x%04x",
             info.rloc16, info.ml_eid[0] ? info.ml_eid : "(empty)", info.parent_rloc16);
    if (info.entity_model[0]) {
        ESP_LOGI(TAG, "Entity model: %s", info.entity_model);
    }

    // Find existing device or add new
    bool found = false;
    for (int i = 0; i < s_device_count; i++) {
        if (s_devices[i].rloc16 == info.rloc16) {
            // Update existing
            s_devices[i] = info;
            found = true;
            ESP_LOGI(TAG, "✓ Updated existing device rloc16=0x%04x (total devices: %d)",
                     info.rloc16, s_device_count);
            break;
        }
    }

    if (!found && s_device_count < MAX_DEVICES) {
        // Add new device
        s_devices[s_device_count++] = info;
        ESP_LOGI(TAG, "✓ Registered NEW device rloc16=0x%04x, ml_eid=%s, parent=0x%04x (total: %d/%d)",
                 info.rloc16, info.ml_eid, info.parent_rloc16, s_device_count, MAX_DEVICES);
    } else if (!found) {
        ESP_LOGW(TAG, "✗ Registry FULL! Cannot register device rloc16=0x%04x (max: %d)",
                 info.rloc16, MAX_DEVICES);
    }

    ESP_LOGI(TAG, "=== End Registration ===");

    // Send response
    otMessage *response = otCoapNewMessage(instance, NULL);
    if (response) {
        otCoapCode code = (found || s_device_count <= MAX_DEVICES) ? OT_COAP_CODE_CREATED : OT_COAP_CODE_SERVICE_UNAVAILABLE;
        otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT, code);
        otError send_err = otCoapSendResponse(instance, response, aMessageInfo);
        if (send_err == OT_ERROR_NONE) {
            ESP_LOGI(TAG, "Sent response: %s",
                     code == OT_COAP_CODE_CREATED ? "2.01 Created" : "5.03 Service Unavailable");
        } else {
            ESP_LOGE(TAG, "Failed to send CoAP response: %d", send_err);
        }
    } else {
        ESP_LOGE(TAG, "Failed to create CoAP response message");
    }
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

    // Register resource với path "devices" (segment đầu tiên)
    // Handler sẽ check segment tiếp theo có phải "register" không
    static otCoapResource s_resource;
    memset(&s_resource, 0, sizeof(s_resource));
    s_resource.mUriPath = "devices";  // Chỉ register segment đầu tiên
    s_resource.mHandler = device_register_handler;
    s_resource.mContext = NULL;

    otCoapAddResource(instance, &s_resource);
    ESP_LOGI(TAG, "CoAP resource '/devices' registered (handler checks for /register)");

    // Set default handler để catch unhandled requests
    otCoapSetDefaultHandler(instance, default_coap_handler, NULL);
    ESP_LOGI(TAG, "CoAP default handler set (for debugging)");

    esp_openthread_lock_release();

    memset(s_devices, 0, sizeof(s_devices));
    s_device_count = 0;

    ESP_LOGI(TAG, "Device registry CoAP server initialized successfully (max devices: %d)", MAX_DEVICES);
    return ESP_OK;
}
