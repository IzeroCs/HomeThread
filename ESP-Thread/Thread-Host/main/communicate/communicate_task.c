/*
 * Communicate task: RX callback (PING→ACK, khác→NACK) + ping watchdog.
 * Backend ping interval để check. Nếu không nhận ping trong 5 lần × 15s → restart ESP.
 */

#include "communicate/communicate_task.h"
#include "communicate/communicate.h"
#include "esp_log.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define TAG "communicate_task"

#define PING_WATCHDOG_INTERVAL_MS   (15 * 1000)  /* 15s mỗi lần check */
#define PING_WATCHDOG_MAX_MISS      5             /* 5 lần miss → restart */
#define PING_WATCHDOG_TASK_STACK    2048
#define PING_WATCHDOG_TASK_PRIO     5

static volatile bool s_ping_received = false;

static void communicate_rx_cb(uint8_t frame_id, uint8_t cmd, const uint8_t *data, size_t len, void *ctx)
{
    (void)data;
    (void)len;
    (void)ctx;
    if (cmd == CMD_PING) {
        s_ping_received = true;
        (void)communicate_send_frame(frame_id, CMD_ACK, NULL, 0);
    } else {
        uint8_t err = 0x01; /* Invalid CMD / chưa implement */
        (void)communicate_send_frame(frame_id, CMD_NACK, &err, 1);
    }
}

static void ping_watchdog_task(void *pv)
{
    (void)pv;
    uint32_t miss_count = 0;
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(PING_WATCHDOG_INTERVAL_MS));
        if (s_ping_received) {
            s_ping_received = false;
            miss_count = 0;
        } else {
            miss_count++;
            ESP_LOGW(TAG, "No ping from backend, miss %lu/%d", (unsigned long)miss_count, PING_WATCHDOG_MAX_MISS);
            if (miss_count >= PING_WATCHDOG_MAX_MISS) {
                ESP_LOGW(TAG, "No ping in %u intervals, restarting", (unsigned)miss_count);
                esp_restart();
            }
        }
    }
}

esp_err_t communicate_task_start(void)
{
    esp_err_t err = communicate_init(communicate_rx_cb, NULL);
    if (err != ESP_OK) {
        return err;
    }
    if (xTaskCreate(ping_watchdog_task, "ping_wdg", PING_WATCHDOG_TASK_STACK, NULL, PING_WATCHDOG_TASK_PRIO, NULL) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}
