/*
 * Leader Control Client - CoAP client để gửi lệnh đến Leader
 * Gửi command "stop" để yêu cầu Leader offline
 */

#include "coap_controller/leader_control_client.h"
#include "br_config.h"
#include "br_custom_config.h"  // Enable CoAP API
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "openthread/coap.h"
#include "openthread/ip6.h"
#include "openthread/message.h"
#include "openthread/thread.h"
#include "openthread/thread_ftd.h"
#include <string.h>
#include <stdbool.h>

static const char *TAG = "leader_control";

#define COAP_RESPONSE_TIMEOUT_MS 5000
#define DEFAULT_MAX_RETRIES 3
#define LEADER_RLOC_CHECK_INTERVAL_MS 5000  // Check every 5 seconds
#define LEADER_STOP_RETRY_INTERVAL_MS 30000  // Retry stop command after 120 seconds if Leader still exists

// CoAP response handler context
typedef struct {
    bool response_received;
    bool response_success;
    otCoapCode response_code;
} coap_response_context_t;

static coap_response_context_t s_response_ctx = {0};

// CoAP response handler
static void coap_response_handler(void *aContext, otMessage *aMessage, const otMessageInfo *aMessageInfo, otError aError)
{
    (void)aMessageInfo;
    coap_response_context_t *ctx = (coap_response_context_t *)aContext;

    if (aError != OT_ERROR_NONE) {
        ESP_LOGW(TAG, "CoAP response error: %d", aError);
        ctx->response_received = true;
        ctx->response_success = false;
        return;
    }

    otCoapCode code = otCoapMessageGetCode(aMessage);
    ctx->response_code = code;
    ctx->response_received = true;

    // Check if response is success (2.xx)
    uint8_t code_class = (code >> 5) & 0x07;
    if (code_class == 2) {
        ctx->response_success = true;
        ESP_LOGI(TAG, "CoAP response received: %d.%02d (Success)", (int)(code >> 5), (int)(code & 0x1f));
    } else {
        ctx->response_success = false;
        ESP_LOGW(TAG, "CoAP response received: %d.%02d (Not success)", (int)(code >> 5), (int)(code & 0x1f));
    }
}

/**
 * Extract RLOC16 from IPv6 address (last 2 bytes)
 * Format: mesh_prefix + 0000:00ff:fe00:RLOC16
 * RLOC16 is stored in big-endian: m8[14] = high byte, m8[15] = low byte
 */
static uint16_t extract_rloc16_from_ip6(const otIp6Address *addr)
{
    return (addr->mFields.m8[14] << 8) | addr->mFields.m8[15];
}

/**
 * Get Leader RLOC16 using multiple methods (with fallback)
 * Returns OT_ERROR_NONE on success, error code otherwise
 */
static otError get_leader_rloc16(otInstance *instance, uint16_t *rloc16)
{
    if (!instance || !rloc16) {
        return OT_ERROR_INVALID_ARGS;
    }

    otIp6Address leader_rloc_addr;
    otError err;

    // Method 1: Try otThreadGetLeaderRloc() - simplest and most direct
    err = otThreadGetLeaderRloc(instance, &leader_rloc_addr);
    if (err == OT_ERROR_NONE) {
        *rloc16 = extract_rloc16_from_ip6(&leader_rloc_addr);
        return OT_ERROR_NONE;
    }

    // Method 2: Get from Router Table
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

    // Method 3: Fallback - Calculate from Router ID
    // RLOC16 = (Router ID << 10) | Child ID (0 for Router)
    *rloc16 = (leader_data.mLeaderRouterId << 10) | 0x0000;
    return OT_ERROR_NONE;
}

/**
 * Construct Leader RLOC IPv6 address from RLOC16
 */
static void construct_leader_rloc_address(otInstance *instance, uint16_t rloc16, otIp6Address *address)
{
    const otMeshLocalPrefix *mesh_prefix = otThreadGetMeshLocalPrefix(instance);

    // Copy mesh prefix (first 8 bytes)
    memcpy(&address->mFields.m8[0], mesh_prefix->m8, 8);

    // Set RLOC part: 0000:00ff:fe00:RLOC16
    address->mFields.m8[8] = 0x00;
    address->mFields.m8[9] = 0x00;
    address->mFields.m8[10] = 0x00;
    address->mFields.m8[11] = 0xff;
    address->mFields.m8[12] = 0xfe;
    address->mFields.m8[13] = 0x00;
    address->mFields.m8[14] = (rloc16 >> 8) & 0xff;
    address->mFields.m8[15] = rloc16 & 0xff;
}

/**
 * Get Leader RLOC16 and log it. Chỉ log Partition ID / Weight khi state khác detached.
 */
esp_err_t leader_control_log_leader_rloc16(void)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance not available");
        return ESP_ERR_INVALID_STATE;
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        ESP_LOGE(TAG, "Failed to acquire OpenThread lock");
        return ESP_ERR_TIMEOUT;
    }

    otDeviceRole role = otThreadGetDeviceRole(instance);
    if (role == OT_DEVICE_ROLE_DETACHED || role == OT_DEVICE_ROLE_DISABLED) {
        ESP_LOGI(TAG, "Device detached/disabled, skip leader/partition/weight log");
        esp_openthread_lock_release();
        return ESP_OK;
    }

    // Get Leader RLOC16 using helper function
    uint16_t leader_rloc16 = 0xffff;
    otError err = get_leader_rloc16(instance, &leader_rloc16);
    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "Failed to get Leader RLOC16: %d", err);
        esp_openthread_lock_release();
        return ESP_FAIL;
    }

    esp_openthread_lock_release();
    return ESP_OK;
}

/**
 * Send CoAP stop command to Leader (single attempt, no retry)
 * Returns ESP_OK if sent successfully, ESP_FAIL otherwise
 * Sets *success to true if Leader acknowledged, false otherwise
 */
static esp_err_t send_coap_stop_command_once(otInstance *instance, uint16_t leader_rloc16, bool *success)
{
    *success = false;

    if (!instance) {
        return ESP_ERR_INVALID_STATE;
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        ESP_LOGE(TAG, "send_coap: failed to acquire lock");
        return ESP_ERR_TIMEOUT;
    }

    otIp6Address leader_address;
    construct_leader_rloc_address(instance, leader_rloc16, &leader_address);

    memset(&s_response_ctx, 0, sizeof(s_response_ctx));

    otMessage *message = otCoapNewMessage(instance, NULL);
    if (!message) {
        ESP_LOGE(TAG, "Failed to create CoAP message");
        esp_openthread_lock_release();
        return ESP_ERR_NO_MEM;
    }

    otCoapMessageInit(message, OT_COAP_TYPE_CONFIRMABLE, OT_COAP_CODE_GET);

    otError err = otCoapMessageAppendUriPathOptions(message, "network");
    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "Failed to append URI path 'network': %d", err);
        otMessageFree(message);
        esp_openthread_lock_release();
        return ESP_FAIL;
    }

    err = otCoapMessageAppendUriPathOptions(message, "stop");
    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "Failed to append URI path 'stop': %d", err);
        otMessageFree(message);
        esp_openthread_lock_release();
        return ESP_FAIL;
    }

    otMessageInfo message_info;
    memset(&message_info, 0, sizeof(message_info));
    memcpy(&message_info.mPeerAddr, &leader_address, sizeof(otIp6Address));
    message_info.mPeerPort = OT_DEFAULT_COAP_PORT;

    err = otCoapSendRequest(instance, message, &message_info, coap_response_handler, &s_response_ctx);
    esp_openthread_lock_release();

    if (err != OT_ERROR_NONE) {
        ESP_LOGE(TAG, "Failed to send CoAP request: %d", err);
        otMessageFree(message);
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, "CoAP GET /network/stop sent to Leader (RLOC16: 0x%04x), waiting for response...", leader_rloc16);

    int timeout_ms = COAP_RESPONSE_TIMEOUT_MS;
    int elapsed_ms = 0;
    while (!s_response_ctx.response_received && elapsed_ms < timeout_ms) {
        vTaskDelay(pdMS_TO_TICKS(100));
        elapsed_ms += 100;
    }

    if (!s_response_ctx.response_received) {
        ESP_LOGW(TAG, "CoAP response timeout after %d ms", timeout_ms);
        return ESP_ERR_TIMEOUT;
    }

    if (s_response_ctx.response_success) {
        *success = true;
        ESP_LOGI(TAG, "✓ Leader acknowledged stop command");
        return ESP_OK;
    } else {
        ESP_LOGW(TAG, "Leader responded with error code: %d.%02d",
                 (int)(s_response_ctx.response_code >> 5),
                 (int)(s_response_ctx.response_code & 0x1f));
        return ESP_FAIL;
    }
}

/**
 * Task to continuously check Leader RLOC16 and send CoAP stop command when device is Router or Child
 */
static void leader_rloc_check_task(void *arg)
{
    (void)arg;
    static uint16_t last_leader_rloc16 = 0xffff;
    static bool last_send_success = false;
    static uint32_t last_send_time_ms = 0;  // Timestamp of last successful send

    // Wait a bit for network to start
    vTaskDelay(pdMS_TO_TICKS(5000));

    while (1) {
        otInstance *instance = esp_openthread_get_instance();
        if (instance && esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
            otDeviceRole role = otThreadGetDeviceRole(instance);

            // Only process when device is Router or Child (joined network)
            if (role == OT_DEVICE_ROLE_ROUTER || role == OT_DEVICE_ROLE_CHILD) {
                // Get Leader RLOC16 using helper function
                uint16_t leader_rloc16 = 0xffff;
                otError err = get_leader_rloc16(instance, &leader_rloc16);
                if (err == OT_ERROR_NONE) {
                    ESP_LOGI(TAG, "=== Leader RLOC16 (device role: %s) ===",
                             role == OT_DEVICE_ROLE_ROUTER ? "ROUTER" : "CHILD");
                    ESP_LOGI(TAG, "Leader RLOC16: 0x%04x", leader_rloc16);

                    // Also get Leader Data for additional info
                    otLeaderData leader_data;
                    err = otThreadGetLeaderData(instance, &leader_data);
                    if (err == OT_ERROR_NONE) {
                        ESP_LOGI(TAG, "Leader Router ID: %d", leader_data.mLeaderRouterId);
                        ESP_LOGI(TAG, "Leader Weight: %d", leader_data.mWeighting);
                        ESP_LOGI(TAG, "Partition ID: 0x%08lx", (unsigned long)leader_data.mPartitionId);
                    }

                    // Check if enough time has passed since last successful send
                    uint32_t current_time_ms = xTaskGetTickCount() * portTICK_PERIOD_MS;
                    bool retry_timeout = (last_send_success &&
                                          (last_leader_rloc16 != 0xffff) &&
                                          (leader_rloc16 == last_leader_rloc16) &&
                                          (current_time_ms - last_send_time_ms >= LEADER_STOP_RETRY_INTERVAL_MS));

                    // Send CoAP stop command if:
                    // 1. First time (last_leader_rloc16 == 0xffff)
                    // 2. Leader RLOC16 changed (new Leader)
                    // 3. Last send was not successful (retry on failure)
                    // 4. Retry timeout: Leader still exists after sending successfully (for testing/retry)
                    bool should_send = (last_leader_rloc16 == 0xffff) ||
                                       (leader_rloc16 != last_leader_rloc16) ||
                                       (!last_send_success) ||
                                       retry_timeout;

                    if (should_send) {
                        // Log reason for sending
                        if (last_leader_rloc16 == 0xffff) {
                            ESP_LOGI(TAG, "Sending CoAP stop command (first time, Leader RLOC16: 0x%04x)...", leader_rloc16);
                        } else if (leader_rloc16 != last_leader_rloc16) {
                            ESP_LOGI(TAG, "Sending CoAP stop command (Leader changed: 0x%04x -> 0x%04x)...",
                                     last_leader_rloc16, leader_rloc16);
                        } else if (retry_timeout) {
                            ESP_LOGI(TAG, "Sending CoAP stop command (retry timeout - Leader still exists, RLOC16: 0x%04x)...", leader_rloc16);
                        } else {
                            ESP_LOGI(TAG, "Sending CoAP stop command (retry on failure, Leader RLOC16: 0x%04x)...", leader_rloc16);
                        }

                        esp_openthread_lock_release();

                        bool success = false;
                        esp_err_t send_err = send_coap_stop_command_once(instance, leader_rloc16, &success);

                        if (send_err == ESP_OK && success) {
                            ESP_LOGI(TAG, "✓ CoAP stop command acknowledged by Leader (RLOC16: 0x%04x)", leader_rloc16);
                            last_send_success = true;
                            last_leader_rloc16 = leader_rloc16;
                            last_send_time_ms = current_time_ms;
                        } else {
                            ESP_LOGW(TAG, "✗ CoAP stop command failed or not acknowledged (err: %d, success: %d, RLOC16: 0x%04x)",
                                     send_err, success, leader_rloc16);
                            last_send_success = false;
                        }

                        /* send_coap_stop_command_once tự quản lý lock bên trong.
                         * Sau khi hàm trả về lock đã được release — không cần re-acquire,
                         * nhảy thẳng xuống next_iteration để bỏ qua lock_release() bên dưới. */
                        goto next_iteration;
                    } else {
                        ESP_LOGD(TAG, "Skipping CoAP send (Leader RLOC16 unchanged: 0x%04x, last_send_success=%d)",
                                 leader_rloc16, last_send_success);
                    }
                }
            } else if (role == OT_DEVICE_ROLE_LEADER) {
                last_leader_rloc16 = 0xffff;  // Reset to trigger send when we become Router/Child again
                last_send_success = false;
                last_send_time_ms = 0;  // Reset timestamp
            }
            esp_openthread_lock_release();
        }

next_iteration:
        // Check every 5 seconds
        vTaskDelay(pdMS_TO_TICKS(LEADER_RLOC_CHECK_INTERVAL_MS));
    }
}

/**
 * Initialize Leader Control Client
 */
esp_err_t leader_control_client_init(void)
{
    ESP_LOGI(TAG, "Leader Control Client initialized");

    // Create task to continuously check and log Leader RLOC16
    xTaskCreate(leader_rloc_check_task, TASK_NAME_LEADER_RLOC, TASK_STACK_LEADER_RLOC, NULL, 5, NULL);
    ESP_LOGI(TAG, "Leader RLOC check task created (checks every %d ms)", LEADER_RLOC_CHECK_INTERVAL_MS);

    return ESP_OK;
}
