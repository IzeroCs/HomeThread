/*
 * Network Stop Handler - Implementation.
 *
 * Handler cho CoAP POST /network/stop command từ Border Router.
 */
#include <string.h>
#include "esp_err.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "openthread/coap.h"
#include "openthread/ip6.h"
#include "openthread/message.h"
#include "openthread/thread.h"
#include "status_led.h"
#include "network_stop_handler.h"

static const char *TAG = "network_stop";

#define COAP_DEFAULT_PORT 5683
#define NETWORK_STOP_WAIT_SECONDS 240
static bool s_resource_registered = false;

/* Task để handle stop Thread, wait, và restart */
static void network_stop_restart_task(void *pvParameters)
{
    (void)pvParameters;

    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance NULL in stop/restart task");
        vTaskDelete(NULL);
        return;
    }

    ESP_LOGI(TAG, "Stopping Thread network as requested by Border Router");

    /* Stop Thread network */
    if (esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        otThreadSetEnabled(instance, false);
        otIp6SetEnabled(instance, false);
        esp_openthread_lock_release();
        ESP_LOGI(TAG, "Thread network stopped");
    }

    /* Update LED */
    status_led_set_state(STATUS_LED_DETACHED);

    /* Wait 240 seconds */
    ESP_LOGI(TAG, "Waiting %d seconds before restarting Thread...", NETWORK_STOP_WAIT_SECONDS);
    for (int i = 0; i < NETWORK_STOP_WAIT_SECONDS; i++) {
        vTaskDelay(pdMS_TO_TICKS(1000));
        if ((i + 1) % 60 == 0) {
            ESP_LOGI(TAG, "Waiting... %d seconds remaining", NETWORK_STOP_WAIT_SECONDS - (i + 1));
        }
    }

    /* Restart Thread network */
    ESP_LOGI(TAG, "Restarting Thread network...");
    if (esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        otIp6SetEnabled(instance, true);
        otThreadSetEnabled(instance, true);
        esp_openthread_lock_release();
        ESP_LOGI(TAG, "Thread network restarted - Border Router should become Leader");
    }

    vTaskDelete(NULL);
}

/* CoAP handler cho GET /network/stop */
static void network_stop_handler(void *aContext, otMessage *aMessage,
                                 const otMessageInfo *aMessageInfo)
{
    (void)aContext;

    ESP_LOGI(TAG, "Network stop handler");
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        return;
    }

    /* Check method: phải là GET */
    otCoapCode code = otCoapMessageGetCode(aMessage);
    if ((code >> 5) != 0 || (code & 0x1f) != 1) {  /* Not GET */
        ESP_LOGW(TAG, "network_stop_handler: Not a GET request");
        return;
    }

    /* Parse URI path */
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

    /* Check URI path: /network/stop */
    if (seg_count != 2 ||
        strcmp(segments[0], "network") != 0 ||
        strcmp(segments[1], "stop") != 0) {
        ESP_LOGW(TAG, "network_stop_handler: Invalid URI path");
        return;  /* Not our endpoint */
    }

    /* GET thường không có payload; bỏ kiểm tra payload */

    /* Check device role: phải là Leader */
    otDeviceRole role;
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        ESP_LOGE(TAG, "network_stop_handler: Failed to acquire lock");
        return;
    }

    role = otThreadGetDeviceRole(instance);
    esp_openthread_lock_release();

    if (role != OT_DEVICE_ROLE_LEADER) {
        ESP_LOGW(TAG, "network_stop_handler: Device is not Leader (role=%d), ignoring", role);
        /* Send error response */
        otMessage *response = otCoapNewMessage(instance, NULL);
        if (response) {
            otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT, OT_COAP_CODE_FORBIDDEN);
            otCoapSendResponse(instance, response, aMessageInfo);
        }
        return;
    }

    /* Extract peer RLOC16 for logging */
    uint16_t peer_rloc16 = (aMessageInfo->mPeerAddr.mFields.m16[7]);
    ESP_LOGI(TAG, "Received stop command from Border Router (RLOC16: 0x%04x)", peer_rloc16);

    /* Create task để stop Thread, wait, và restart */
    TaskHandle_t task_handle = NULL;
    if (xTaskCreate(network_stop_restart_task, "network_stop", 4096, NULL, 5, &task_handle) != pdPASS) {
        ESP_LOGE(TAG, "Failed to create network_stop_restart_task");
        /* Send error response */
        otMessage *response = otCoapNewMessage(instance, NULL);
        if (response) {
            otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT, OT_COAP_CODE_SERVICE_UNAVAILABLE);
            otCoapSendResponse(instance, response, aMessageInfo);
        }
        return;
    }

    /* Send success response */
    otMessage *response = otCoapNewMessage(instance, NULL);
    if (response) {
        otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT, OT_COAP_CODE_CONTENT);
        otCoapSendResponse(instance, response, aMessageInfo);
        ESP_LOGI(TAG, "Sent 2.05 Content response");
    }
}

esp_err_t network_stop_handler_register(void)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance NULL");
        return ESP_ERR_INVALID_STATE;
    }

    if (s_resource_registered) {
        ESP_LOGW(TAG, "Resource already registered");
        return ESP_OK;
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        ESP_LOGE(TAG, "Failed to acquire OpenThread lock");
        return ESP_ERR_TIMEOUT;
    }

    /* Start CoAP server nếu chưa start */
    otError err = otCoapStart(instance, COAP_DEFAULT_PORT);
    if (err != OT_ERROR_NONE && err != OT_ERROR_ALREADY) {
        esp_openthread_lock_release();
        ESP_LOGE(TAG, "otCoapStart failed: %s", otThreadErrorToString(err));
        return ESP_FAIL;
    }

    /* Register resource: /network */
    static otCoapResource s_network_resource;
    memset(&s_network_resource, 0, sizeof(s_network_resource));
    s_network_resource.mUriPath = "network/stop";
    s_network_resource.mHandler = network_stop_handler;
    s_network_resource.mContext = NULL;

    otCoapAddResource(instance, &s_network_resource);
    s_resource_registered = true;

    esp_openthread_lock_release();

    ESP_LOGI(TAG, "CoAP resource '/network' registered for stop command");
    return ESP_OK;
}
