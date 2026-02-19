/*
 * Device Register Handler - CoAP handler cho /device/register
 */

#include "device_register_handler.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "openthread/coap.h"
#include "openthread/message.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include <string.h>
#include <stdlib.h>

static const char *TAG = "device_register";

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
esp_err_t device_register_handler_init(void)
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
esp_err_t device_register_enqueue_coap_data(const char *payload, uint16_t payload_len, uint16_t rloc16)
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
 * Output CoAP data qua UART để backend nhận
 */
static void output_coap_data_to_backend(const coap_data_item_t *data_item)
{
    if (!data_item) {
        return;
    }

    ESP_LOGI(TAG, "Outputting CoAP data to backend - rloc16: 0x%04x, payload_len: %d", 
             data_item->rloc16, data_item->payload_len);
    ESP_LOGI(TAG, "Payload: %.*s", data_item->payload_len, data_item->payload);

    // TODO: Gửi data qua UART để backend nhận
    // Có thể dùng printf() nếu UART console đã setup
    // Hoặc dùng UART driver API để gửi
}

/**
 * Dequeue và output tất cả CoAP data trong queue, sau đó clear queue
 */
static void process_and_clear_coap_data_queue(void)
{
    if (!s_coap_data_queue) {
        return;
    }

    coap_data_item_t data_item;
    int data_count = 0;

    // Dequeue và output tất cả data
    while (xQueueReceive(s_coap_data_queue, &data_item, 0) == pdTRUE) {
        output_coap_data_to_backend(&data_item);
        data_count++;
    }

    if (data_count > 0) {
        ESP_LOGI(TAG, "Processed %d CoAP data items from queue and cleared queue", data_count);
    }
}

void device_register_handler(void *aContext, otMessage *aMessage,
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
        device_register_enqueue_coap_data(payload, payload_len, rloc16);
    }

    // Process và clear queue - output tất cả data đã tích lũy qua UART
    process_and_clear_coap_data_queue();

    // TODO: Send CoAP response
}
