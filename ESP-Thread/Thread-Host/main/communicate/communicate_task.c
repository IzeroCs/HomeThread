/*
 * Communicate task: RX callback (STATE→ACK, khác→NACK) + state watchdog.
 * Backend gửi STATE interval để check. Nếu không nhận state trong 5 lần × 15s → restart ESP.
 */

#include "communicate/communicate_task.h"
#include "communicate/communicate.h"
#include "communicate/communicate_queue.h"
#include "esp_log.h"
#include "esp_system.h"
#include "esp_timer.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define TAG "communicate_task"

#define STATE_WATCHDOG_INTERVAL_MS   (15 * 1000)  /* 15s mỗi lần check */
#define STATE_WATCHDOG_MAX_MISS      5             /* 5 lần miss → restart */
#define STATE_WATCHDOG_TASK_STACK    2048
#define STATE_WATCHDOG_TASK_PRIO     5
#define STATE_TO_BACKEND_RETRY_MS    1000          /* retry gửi STATE nếu không ACK */

static volatile bool s_state_received = false;
static uint8_t s_pending_state_frame_id = 0;
static uint8_t s_pending_state_byte = 0;
static esp_timer_handle_t s_state_retry_timer = NULL;

static void state_retry_timer_cb(void *arg)
{
    (void)arg;
    if (s_pending_state_frame_id == 0) {
        return;
    }
    s_pending_state_frame_id = (s_pending_state_frame_id == 255) ? 1 : (s_pending_state_frame_id + 1);
    (void)communicate_send_frame(s_pending_state_frame_id, CMD_STATE, &s_pending_state_byte, 1);
    ESP_LOGW(TAG, "state to backend no ACK, retry frame_id=%u", (unsigned)s_pending_state_frame_id);
    esp_timer_start_once(s_state_retry_timer, STATE_TO_BACKEND_RETRY_MS * 1000);
}

static void communicate_rx_cb(uint8_t frame_id, uint8_t cmd, const uint8_t *data, size_t len, void *ctx)
{
    (void)ctx;
    if (cmd == CMD_ACK && s_pending_state_frame_id != 0 && frame_id == s_pending_state_frame_id) {
        s_pending_state_frame_id = 0;
        if (s_state_retry_timer != NULL) {
            esp_timer_stop(s_state_retry_timer);
        }
        return;
    }
    esp_err_t err = communicate_queue_post(frame_id, cmd, data, len);
    if (err == ESP_OK) {
        return;
    }
    if (err == ESP_ERR_TIMEOUT) {
        uint8_t nack = 0x05; /* Busy */
        (void)communicate_send_frame(frame_id, CMD_NACK, &nack, 1);
    } else {
        uint8_t nack = 0x01; /* Invalid CMD / not ready */
        (void)communicate_send_frame(frame_id, CMD_NACK, &nack, 1);
    }
}

void communicate_task_mark_state_received(void)
{
    s_state_received = true;
}

void communicate_task_send_state_to_backend(uint8_t state_byte)
{
    s_pending_state_byte = state_byte;
    s_pending_state_frame_id = (s_pending_state_frame_id == 0 || s_pending_state_frame_id == 255) ? 1 : (s_pending_state_frame_id + 1);
    (void)communicate_send_frame(s_pending_state_frame_id, CMD_STATE, &s_pending_state_byte, 1);
    if (s_state_retry_timer != NULL) {
        esp_timer_start_once(s_state_retry_timer, STATE_TO_BACKEND_RETRY_MS * 1000);
    }
}

static void state_watchdog_task(void *pv)
{
    (void)pv;
    uint32_t miss_count = 0;
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(STATE_WATCHDOG_INTERVAL_MS));
        if (s_state_received) {
            s_state_received = false;
            miss_count = 0;
        } else {
            miss_count++;
            ESP_LOGW(TAG, "No state from backend, miss %lu/%d", (unsigned long)miss_count, STATE_WATCHDOG_MAX_MISS);
            if (miss_count >= STATE_WATCHDOG_MAX_MISS) {
                ESP_LOGW(TAG, "No state in %u intervals, restarting", (unsigned)miss_count);
                esp_restart();
            }
        }
    }
}

esp_err_t communicate_task_start(void)
{
    esp_err_t err = communicate_queue_init();
    if (err != ESP_OK) {
        return err;
    }
    err = communicate_init(communicate_rx_cb, NULL);
    if (err != ESP_OK) {
        return err;
    }
    const esp_timer_create_args_t retry_timer_args = {
        .callback = state_retry_timer_cb,
        .arg = NULL,
        .dispatch_method = ESP_TIMER_TASK,
        .name = "state_retry",
    };
    if (esp_timer_create(&retry_timer_args, &s_state_retry_timer) != ESP_OK) {
        return ESP_ERR_NO_MEM;
    }
    if (xTaskCreate(state_watchdog_task, "state_wdg", STATE_WATCHDOG_TASK_STACK, NULL, STATE_WATCHDOG_TASK_PRIO, NULL) != pdPASS) {
        esp_timer_delete(s_state_retry_timer);
        s_state_retry_timer = NULL;
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}
