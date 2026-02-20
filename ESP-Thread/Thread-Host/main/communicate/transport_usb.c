/*
 * Transport USB CDC (USB Serial/JTAG) cho frame.
 * Dùng driver USB Serial/JTAG của ESP-IDF (ESP32-S3).
 * Chỉ biên dịch khi COMMUNICATE_FRAME_PORT_IS_UART = 0.
 */

#include "communicate/transport_usb.h"
#include "communicate/communicate_config.h"

#if !COMMUNICATE_FRAME_PORT_IS_UART

#include "driver/usb_serial_jtag.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <stdbool.h>
#include <string.h>

#define TAG "transport_usb"

#define RX_TASK_STACK         2048
#define RX_TASK_PRIO          5
#define RX_READ_CHUNK        128
#define RX_READ_TIMEOUT_MS   50

static transport_usb_rx_cb_t s_rx_cb;
static void *s_rx_ctx;
static TaskHandle_t s_rx_task_handle;
static bool s_inited;

static void usb_rx_task(void *pv)
{
    uint8_t buf[RX_READ_CHUNK];
    while (1) {
        int len = usb_serial_jtag_read_bytes(buf, sizeof(buf), pdMS_TO_TICKS(RX_READ_TIMEOUT_MS));
        if (len > 0 && s_rx_cb) {
            s_rx_cb(buf, (size_t)len, s_rx_ctx);
        }
    }
}

esp_err_t transport_usb_init(transport_usb_rx_cb_t rx_cb, void *rx_ctx)
{
    if (s_inited) {
        return ESP_ERR_INVALID_STATE;
    }
    s_rx_cb = rx_cb;
    s_rx_ctx = rx_ctx;

    usb_serial_jtag_driver_config_t usb_config = {
        .rx_buffer_size = COMMUNICATE_CDC_RX_BUF_SIZE,
        .tx_buffer_size = COMMUNICATE_CDC_TX_BUF_SIZE,
    };

    esp_err_t err = usb_serial_jtag_driver_install(&usb_config);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "usb_serial_jtag_driver_install failed %s", esp_err_to_name(err));
        return err;
    }

    BaseType_t ok = xTaskCreate(usb_rx_task, "usb_rx", RX_TASK_STACK, NULL, RX_TASK_PRIO, &s_rx_task_handle);
    if (ok != pdPASS) {
        usb_serial_jtag_driver_uninstall();
        return ESP_ERR_NO_MEM;
    }

    s_inited = true;
    ESP_LOGI(TAG, "USB CDC frame transport init OK");
    return ESP_OK;
}

esp_err_t transport_usb_send(const uint8_t *data, size_t len)
{
    if (!s_inited || !data) {
        return ESP_ERR_INVALID_STATE;
    }
    int n = usb_serial_jtag_write_bytes(data, len, pdMS_TO_TICKS(1000));
    if (n != (int)len) {
        return ESP_FAIL;
    }
    return ESP_OK;
}

void transport_usb_deinit(void)
{
    if (!s_inited) {
        return;
    }
    s_inited = false;
    if (s_rx_task_handle) {
        vTaskDelete(s_rx_task_handle);
        s_rx_task_handle = NULL;
    }
    usb_serial_jtag_driver_uninstall();
}

#endif /* !COMMUNICATE_FRAME_PORT_IS_UART */
