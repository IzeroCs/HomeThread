/*
 * Device Registry Handler - CoAP handler cho device registry (register/update/ping)
 */

#include "coap_controller/device_registry_handler.h"
#include "communicate/communicate_task.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "openthread/coap.h"
#include "openthread/message.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include <string.h>
#include <stdlib.h>

#define CMD_DATA_BACKEND_TIMEOUT_MS  2500

static const char *TAG = "device_registry";

#define COAP_DATA_QUEUE_SIZE 10
#define COAP_PAYLOAD_MAX_LENGTH 768

// Structure để lưu CoAP data từ child
typedef struct {
    char payload[COAP_PAYLOAD_MAX_LENGTH];
    uint16_t payload_len;
    uint16_t rloc16;  // RLOC16 của child device gửi request
} coap_data_item_t;

// Queue để lưu CoAP data từ child devices
static QueueHandle_t s_coap_data_queue = NULL;

/**
 * Initialize CoAP data queue
 */
esp_err_t device_registry_handler_init(void)
{
    if (s_coap_data_queue == NULL) {
        s_coap_data_queue = xQueueCreate(COAP_DATA_QUEUE_SIZE, sizeof(coap_data_item_t));
        if (s_coap_data_queue == NULL) {
            ESP_LOGE(TAG, "Failed to create CoAP data queue");
            return ESP_ERR_NO_MEM;
        }
        ESP_LOGI(TAG, "CoAP data queue initialized (size: %d items)", COAP_DATA_QUEUE_SIZE);
    }
    return ESP_OK;
}

/**
 * Enqueue CoAP data từ child device
 * @param payload CoAP payload data
 * @param payload_len Length của payload
 * @param rloc16 RLOC16 của child device gửi request
 * @return ESP_OK nếu thành công
 */
esp_err_t device_registry_enqueue_coap_data(const char *payload, uint16_t payload_len, uint16_t rloc16)
{
    if (!payload || !s_coap_data_queue) {
        ESP_LOGE(TAG, "Invalid parameters or queue not initialized");
        return ESP_ERR_INVALID_ARG;
    }

    if (payload_len >= COAP_PAYLOAD_MAX_LENGTH) {
        ESP_LOGE(TAG, "Payload too large: %d (max: %d)", payload_len, COAP_PAYLOAD_MAX_LENGTH - 1);
        return ESP_ERR_INVALID_SIZE;
    }

    coap_data_item_t data_item;
    memset(&data_item, 0, sizeof(coap_data_item_t));
    memcpy(data_item.payload, payload, payload_len);
    data_item.payload[payload_len] = '\0';
    data_item.payload_len = payload_len;
    data_item.rloc16 = rloc16;

    // Enqueue data
    BaseType_t result = xQueueSend(s_coap_data_queue, &data_item, pdMS_TO_TICKS(100));
    if (result != pdTRUE) {
        ESP_LOGW(TAG, "Failed to enqueue CoAP data (queue full), rloc16: 0x%04x", rloc16);
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGI(TAG, "CoAP data enqueued from rloc16: 0x%04x, payload_len: %d", rloc16, payload_len);
    return ESP_OK;
}

/**
 * Forward CoAP payload lên backend qua CMD_DATA và chờ CMD_ACK.
 */
static esp_err_t output_coap_data_to_backend(const coap_data_item_t *data_item)
{
    if (!data_item) {
        return ESP_ERR_INVALID_ARG;
    }
    ESP_LOGI(TAG, "Forwarding CoAP data to backend - rloc16: 0x%04x, payload_len: %d",
             data_item->rloc16, data_item->payload_len);
    esp_err_t err = communicate_task_send_cmd_data_and_wait_ack(
        (const uint8_t *)data_item->payload, data_item->payload_len, CMD_DATA_BACKEND_TIMEOUT_MS);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "CMD_DATA backend ack failed: %s (rloc16: 0x%04x)", esp_err_to_name(err), data_item->rloc16);
        return err;
    }
    return ESP_OK;
}

/**
 * Dequeue, forward từng item qua CMD_DATA (chờ backend ACK), rồi clear queue.
 */
esp_err_t device_registry_process_and_clear_queue(void)
{
    if (!s_coap_data_queue) {
        return ESP_OK;
    }
    esp_err_t first_error = ESP_OK;
    int data_count = 0;
    coap_data_item_t data_item;

    while (xQueueReceive(s_coap_data_queue, &data_item, 0) == pdTRUE) {
        esp_err_t err = output_coap_data_to_backend(&data_item);
        data_count++;
        if (err != ESP_OK && first_error == ESP_OK) {
            first_error = err;
        }
    }
    if (data_count > 0) {
        ESP_LOGI(TAG, "Processed %d CoAP data items from queue and cleared queue", data_count);
    }
    return first_error;
}

void device_registry_handler(void *aContext, otMessage *aMessage,
                            const otMessageInfo *aMessageInfo)
{
    (void)aContext;

    ESP_LOGI(TAG, ">>> /device/register handler called <<<");

    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance not available");
        return;
    }

    // Extract RLOC16 từ message info
    uint16_t rloc16 = aMessageInfo->mPeerAddr.mFields.m16[7];

    // Read CoAP payload
    uint16_t offset = otMessageGetOffset(aMessage);
    uint16_t payload_len = otMessageGetLength(aMessage) - offset;
    
    if (payload_len > 0) {
        char payload[COAP_PAYLOAD_MAX_LENGTH];
        if (payload_len >= sizeof(payload)) {
            payload_len = sizeof(payload) - 1;
        }
        
        otMessageRead(aMessage, offset, payload, payload_len);
        payload[payload_len] = '\0';

        ESP_LOGI(TAG, "Received CoAP data from rloc16: 0x%04x, payload_len: %d", rloc16, payload_len);

        // Enqueue CoAP data vào queue
        device_registry_enqueue_coap_data(payload, payload_len, rloc16);
    }

    // Process và clear queue - output tất cả data đã tích lũy qua UART
    device_registry_process_and_clear_queue();

    // TODO: Send CoAP response
}
