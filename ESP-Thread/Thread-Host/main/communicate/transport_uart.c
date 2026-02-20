/*
 * Transport UART cho frame.
 * Chỉ biên dịch khi COMMUNICATE_FRAME_PORT_IS_UART = 1.
 */

#include "communicate/transport_uart.h"
#include "communicate/communicate_config.h"

#if COMMUNICATE_FRAME_PORT_IS_UART

#include "driver/uart.h"
#include "esp_log.h"
#include "freertos/task.h"
#include <stdbool.h>
#include <string.h>

#define TAG "transport_uart"
#define RX_TASK_STACK         2048
#define RX_TASK_PRIO          5

static transport_uart_rx_cb_t s_rx_cb;
static void *s_rx_ctx;
static TaskHandle_t s_rx_task_handle;
static bool s_inited;

static void uart_rx_task(void *pv)
{
    uint8_t buf[128];
    while (1) {
        int len = uart_read_bytes(COMMUNICATE_UART_NUM, buf, sizeof(buf), pdMS_TO_TICKS(50));
        if (len > 0 && s_rx_cb) {
            s_rx_cb(buf, (size_t)len, s_rx_ctx);
        }
    }
}

esp_err_t transport_uart_init(transport_uart_rx_cb_t rx_cb, void *rx_ctx)
{
    if (s_inited) {
        return ESP_ERR_INVALID_STATE;
    }
    s_rx_cb = rx_cb;
    s_rx_ctx = rx_ctx;

    uart_config_t uart_cfg = {
        .baud_rate = COMMUNICATE_UART_BAUD,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };

    esp_err_t err = uart_driver_install(COMMUNICATE_UART_NUM,
                                        COMMUNICATE_UART_RX_BUF_SIZE,
                                        COMMUNICATE_UART_TX_BUF_SIZE,
                                        0, NULL, 0);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "uart_driver_install failed %s", esp_err_to_name(err));
        return err;
    }
    err = uart_param_config(COMMUNICATE_UART_NUM, &uart_cfg);
    if (err != ESP_OK) {
        uart_driver_delete(COMMUNICATE_UART_NUM);
        return err;
    }
    err = uart_set_pin(COMMUNICATE_UART_NUM,
                      COMMUNICATE_UART_TX_GPIO,
                      COMMUNICATE_UART_RX_GPIO,
                      UART_PIN_NO_CHANGE,
                      UART_PIN_NO_CHANGE);
    if (err != ESP_OK) {
        uart_driver_delete(COMMUNICATE_UART_NUM);
        return err;
    }

    BaseType_t ok = xTaskCreate(uart_rx_task, "uart_rx", RX_TASK_STACK, NULL, RX_TASK_PRIO, &s_rx_task_handle);
    if (ok != pdPASS) {
        uart_driver_delete(COMMUNICATE_UART_NUM);
        return ESP_ERR_NO_MEM;
    }

    s_inited = true;
    ESP_LOGI(TAG, "UART frame transport init (UART%d, %d baud)", COMMUNICATE_UART_NUM, COMMUNICATE_UART_BAUD);
    return ESP_OK;
}

esp_err_t transport_uart_send(const uint8_t *data, size_t len)
{
    if (!s_inited || !data) {
        return ESP_ERR_INVALID_STATE;
    }
    int n = uart_write_bytes(COMMUNICATE_UART_NUM, data, len);
    if (n != (int)len) {
        return ESP_FAIL;
    }
    return ESP_OK;
}

void transport_uart_deinit(void)
{
    if (!s_inited) {
        return;
    }
    s_inited = false;
    if (s_rx_task_handle) {
        vTaskDelete(s_rx_task_handle);
        s_rx_task_handle = NULL;
    }
    uart_driver_delete(COMMUNICATE_UART_NUM);
}

#endif /* COMMUNICATE_FRAME_PORT_IS_UART */
