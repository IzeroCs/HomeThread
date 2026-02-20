/*
 * Communicate queue: queue frame, process task gọi command handler.
 */

#include "communicate/communicate_queue.h"
#include "communicate/communicate.h"
#include "communicate/communicate_command.h"
#include "communicate/communicate_task.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include <string.h>

#define TAG "communicate_queue"

#define QUEUE_LEN            16
#define ITEM_MAX_DATA        256
#define PROCESS_TASK_STACK   10240  /* Tăng từ 2048 để tránh stack overflow khi gọi OpenThread/NVS */
#define PROCESS_TASK_PRIO    5
/** Nếu item chờ trong queue vượt ngưỡng này (ms) thì log cảnh báo. */
#define QUEUE_WAIT_WARN_MS   2000
/** Timeout khi gửi vào queue (ms); hết timeout mà vẫn đầy thì trả ESP_ERR_TIMEOUT. */
#define QUEUE_SEND_TIMEOUT_MS  500

typedef struct {
    uint8_t frame_id;
    uint8_t cmd;
    uint16_t len;
    TickType_t enqueue_tick;
    uint8_t data[ITEM_MAX_DATA];
} communicate_queue_item_t;

static QueueHandle_t s_queue = NULL;
static TaskHandle_t s_process_task = NULL;

#define STACK_MONITOR_INTERVAL_MS  30000  /* Log stack high water mark mỗi 30 giây */

static void process_task(void *pv)
{
    (void)pv;
    communicate_queue_item_t item;
    static TickType_t s_last_stack_log = 0;
    for (;;) {
        if (xQueueReceive(s_queue, &item, portMAX_DELAY) != pdTRUE) {
            continue;
        }
        TickType_t now = xTaskGetTickCount();
        if (now - s_last_stack_log >= pdMS_TO_TICKS(STACK_MONITOR_INTERVAL_MS)) {
            UBaseType_t hwm = uxTaskGetStackHighWaterMark(NULL);
            /* hwm = bytes còn lại tối thiểu từng có; stack used ≈ PROCESS_TASK_STACK - hwm */
            ESP_LOGI(TAG, "comm_proc stack: high_water_mark=%u bytes (used ~%u / %u)",
                     (unsigned)hwm, (unsigned)(PROCESS_TASK_STACK - hwm), (unsigned)PROCESS_TASK_STACK);
            s_last_stack_log = now;
        }
        TickType_t wait_ticks = now - item.enqueue_tick;
        if (wait_ticks > pdMS_TO_TICKS(QUEUE_WAIT_WARN_MS)) {
            ESP_LOGW(TAG, "queue wait long: %lu ms, frame_id=%u cmd=%s",
                     (unsigned long)(wait_ticks * portTICK_PERIOD_MS),
                     (unsigned)item.frame_id, communicate_cmd_name(item.cmd));
        }
        if (item.cmd == CMD_STATE) {
            communicate_task_mark_state_received();
            (void)communicate_command_handle_state(item.frame_id);
        } else if (item.cmd == CMD_DATASET_ACTIVE) {
            (void)communicate_command_handle_dataset_active(item.frame_id);
        } else if (item.cmd == CMD_IP_ADDR) {
            (void)communicate_command_handle_ipaddr(item.frame_id);
        } else if (item.cmd == CMD_ROUTER_TABLE) {
            (void)communicate_command_handle_router_table(item.frame_id);
        } else if (item.cmd == CMD_CHILD_TABLE) {
            (void)communicate_command_handle_child_table(item.frame_id);
        } else if (item.cmd == CMD_JOINER_TABLE) {
            (void)communicate_command_handle_joiner_table(item.frame_id);
        } else if (item.cmd == CMD_SET_PANID) {
            (void)communicate_command_handle_set_panid(item.frame_id, item.data, item.len);
        } else if (item.cmd == CMD_SET_CHANNEL) {
            (void)communicate_command_handle_set_channel(item.frame_id, item.data, item.len);
        } else if (item.cmd == CMD_SET_NETWORK_NAME) {
            (void)communicate_command_handle_set_network_name(item.frame_id, item.data, item.len);
        } else if (item.cmd == CMD_SET_EXTENDED_PANID) {
            (void)communicate_command_handle_set_extended_panid(item.frame_id, item.data, item.len);
        } else if (item.cmd == CMD_SET_NETWORK_KEY) {
            (void)communicate_command_handle_set_network_key(item.frame_id, item.data, item.len);
        } else if (item.cmd == CMD_THREAD_START) {
            (void)communicate_command_handle_thread_start(item.frame_id);
        } else if (item.cmd == CMD_THREAD_STOP) {
            (void)communicate_command_handle_thread_stop(item.frame_id);
        } else if (item.cmd == CMD_THREAD_VERSION) {
            (void)communicate_command_handle_thread_version(item.frame_id);
        } else {
            uint8_t err = 0x01; /* Invalid CMD */
            (void)communicate_send_frame(item.frame_id, CMD_NACK, &err, 1);
        }
    }
}

esp_err_t communicate_queue_init(void)
{
    if (s_queue != NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    s_queue = xQueueCreate(QUEUE_LEN, sizeof(communicate_queue_item_t));
    if (s_queue == NULL) {
        ESP_LOGE(TAG, "queue create failed");
        return ESP_ERR_NO_MEM;
    }
    BaseType_t ok = xTaskCreate(process_task, "comm_proc", PROCESS_TASK_STACK, NULL, PROCESS_TASK_PRIO, &s_process_task);
    if (ok != pdPASS) {
        vQueueDelete(s_queue);
        s_queue = NULL;
        return ESP_ERR_NO_MEM;
    }
    ESP_LOGI(TAG, "queue init OK (len=%d)", QUEUE_LEN);
    return ESP_OK;
}

esp_err_t communicate_queue_post(uint8_t frame_id, uint8_t cmd, const uint8_t *data, size_t len)
{
    if (s_queue == NULL) {
        return ESP_ERR_INVALID_STATE;
    }
    communicate_queue_item_t item;
    item.frame_id = frame_id;
    item.cmd = cmd;
    item.enqueue_tick = xTaskGetTickCount();
    if (len > ITEM_MAX_DATA) {
        item.len = ITEM_MAX_DATA;
    } else {
        item.len = (uint16_t)len;
    }
    if (item.len > 0 && data != NULL) {
        memcpy(item.data, data, (size_t)item.len);
    }
    if (xQueueSend(s_queue, &item, pdMS_TO_TICKS(QUEUE_SEND_TIMEOUT_MS)) != pdTRUE) {
        ESP_LOGW(TAG, "queue full, send timeout %u ms, frame_id=%u cmd=%s",
                 (unsigned)QUEUE_SEND_TIMEOUT_MS, (unsigned)frame_id, communicate_cmd_name(cmd));
        return ESP_ERR_TIMEOUT; /* queue full */
    }
    return ESP_OK;
}
