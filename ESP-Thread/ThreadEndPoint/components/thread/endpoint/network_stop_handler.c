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
#include "thread_coap.h"

static const char *TAG = "network_stop";
#define NETWORK_STOP_WAIT_SECONDS 120
/* OpenThread CoAP match full URI only (not prefix). Path = segment1/segment2. */
#define NETWORK_STOP_URI_PATH_FULL   "network/stop"

static bool s_resource_registered = false;
/* true = đang trong chu kỳ stop → wait → start; tránh request trùng gây start/stop chồng chéo */
static volatile bool s_network_stop_in_progress = false;

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
        if ((i + 1) % 10 == 0) {
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

    /* Chu kỳ stop → wait → start đã xong, cho phép nhận lệnh stop mới */
    s_network_stop_in_progress = false;
    vTaskDelete(NULL);
}

/* Đang trong chu kỳ stop → wait → start: không chạy lại logic stop, chỉ trả response */
static bool is_stop_cycle_in_progress(void)
{
    return s_network_stop_in_progress;
}

/* Bật flag khi nhận lệnh stop (Leader chấp nhận, bắt đầu chu kỳ) */
static void set_stop_cycle_in_progress(void)
{
    s_network_stop_in_progress = true;
}

/* CoAP handler cho GET /network/stop */
static void network_stop_handler(void *aContext, otMessage *aMessage,
                                 const otMessageInfo *aMessageInfo)
{
    (void)aContext;

    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        return;
    }

    /* Đang trong chu kỳ stop → wait → start: chỉ trả 2.05, không chạy stop/restart trùng */
    if (is_stop_cycle_in_progress()) {
        ESP_LOGD(TAG, "Stop cycle in progress, ignoring new request but sending response");
        /* Vẫn gửi response để client không timeout */
        otMessage *response = otCoapNewMessage(instance, NULL);
        if (response) {
            otCoapMessageInitResponse(response, aMessage, OT_COAP_TYPE_ACKNOWLEDGMENT, OT_COAP_CODE_CONTENT);
            otCoapSendResponse(instance, response, aMessageInfo);
        }
        return;
    }

    ESP_LOGI(TAG, "Network stop handler");

    /* Check method: phải là GET */
    otCoapCode code = otCoapMessageGetCode(aMessage);
    if ((code >> 5) != 0 || (code & 0x1f) != 1) {  /* Not GET */
        ESP_LOGW(TAG, "network_stop_handler: Not a GET request");
        return;
    }

    /* Parse URI path: First = segment 0, muốn thêm thì each bằng GetNextOption. */
    otCoapOptionIterator iterator;
    otCoapOptionIteratorInit(&iterator, aMessage);
    char segments[2][64] = {{0}};
    int seg_count = 0;

    const otCoapOption *option = otCoapOptionIteratorGetFirstOptionMatching(&iterator, OT_COAP_OPTION_URI_PATH);
    while (option != NULL && seg_count < 2) {
        uint16_t seg_len = option->mLength;
        if (seg_len >= sizeof(segments[0])) {
            seg_len = sizeof(segments[0]) - 1;
        }
        if (seg_len > 0 &&
            otCoapOptionIteratorGetOptionValue(&iterator, segments[seg_count]) == OT_ERROR_NONE) {
            segments[seg_count][seg_len] = '\0';
        }
        seg_count++;
        option = otCoapOptionIteratorGetNextOptionMatching(&iterator, OT_COAP_OPTION_URI_PATH);
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
        /* Send error response: copy Message ID + Token từ request để client nhận diện response */
        otMessage *response = otCoapNewMessage(instance, NULL);
        if (response) {
            otCoapMessageInitResponse(response, aMessage, OT_COAP_TYPE_ACKNOWLEDGMENT, OT_COAP_CODE_FORBIDDEN);
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
        otMessage *response = otCoapNewMessage(instance, NULL);
        if (response) {
            otCoapMessageInitResponse(response, aMessage, OT_COAP_TYPE_ACKNOWLEDGMENT, OT_COAP_CODE_SERVICE_UNAVAILABLE);
            otCoapSendResponse(instance, response, aMessageInfo);
        }
        return;
    }

    /* Send success response: copy Message ID + Token từ request để client nhận diện response */
    otMessage *response = otCoapNewMessage(instance, NULL);
    if (response) {
        otCoapMessageInitResponse(response, aMessage, OT_COAP_TYPE_ACKNOWLEDGMENT, OT_COAP_CODE_CONTENT);
        otCoapSendResponse(instance, response, aMessageInfo);
        ESP_LOGI(TAG, "Sent 2.05 Content response");
        /* Bật flag: đang trong chu kỳ stop → wait → start; tắt khi task restart xong */
        set_stop_cycle_in_progress();
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

    /* Start CoAP server (dùng chung với các component khác) */
    esp_err_t err = thread_coap_server_start();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "thread_coap_server_start failed: %s", esp_err_to_name(err));
        return err;
    }

    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        ESP_LOGE(TAG, "Failed to acquire OpenThread lock");
        return ESP_ERR_TIMEOUT;
    }

    /* Register resource: full URI path only (CoAP exact match, no prefix) */
    static otCoapResource s_network_resource;
    memset(&s_network_resource, 0, sizeof(s_network_resource));
    s_network_resource.mUriPath = NETWORK_STOP_URI_PATH_FULL;
    s_network_resource.mHandler = network_stop_handler;
    s_network_resource.mContext = NULL;

    otCoapAddResource(instance, &s_network_resource);
    s_resource_registered = true;

    esp_openthread_lock_release();

    ESP_LOGI(TAG, "CoAP resource '%s' registered (full URI match)", NETWORK_STOP_URI_PATH_FULL);
    return ESP_OK;
}
