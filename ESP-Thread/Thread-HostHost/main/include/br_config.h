/*
 * SPDX-FileCopyrightText: 2021 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: CC0-1.0
 *
 * OpenThread Border Router — ESP32-S3 Host + ESP32-H2 RCP over UART.
 * UART: 460800, Host RX=GPIO4, Host TX=GPIO5 (recommended for S3).
 */

#pragma once

#include "sdkconfig.h"

/* Standalone: pin names are "to RCP" — Host RX receives from RCP TX, Host TX sends to RCP RX */
#ifndef CONFIG_PIN_TO_RCP_TX
#define CONFIG_PIN_TO_RCP_TX  4   /* Host RX (connected to RCP TX) */
#endif
#ifndef CONFIG_PIN_TO_RCP_RX
#define CONFIG_PIN_TO_RCP_RX  5   /* Host TX (connected to RCP RX) */
#endif

/* RCP control pins: RESET and BOOT (optional, for auto-flash feature) */
#ifndef CONFIG_PIN_TO_RCP_RESET
#define CONFIG_PIN_TO_RCP_RESET  7   /* Host GPIO to control RCP RESET pin */
#endif
#ifndef CONFIG_PIN_TO_RCP_BOOT
#define CONFIG_PIN_TO_RCP_BOOT  8    /* Host GPIO to control RCP BOOT pin */
#endif

#define ESP_OPENTHREAD_DEFAULT_RADIO_CONFIG() \
{ \
    .radio_mode = RADIO_MODE_UART_RCP, \
    .radio_uart_config = { \
        .port = 1, \
        .uart_config = { \
            .baud_rate = 460800, \
            .data_bits = UART_DATA_8_BITS, \
            .parity = UART_PARITY_DISABLE, \
            .stop_bits = UART_STOP_BITS_1, \
            .flow_ctrl = UART_HW_FLOWCTRL_DISABLE, \
            .rx_flow_ctrl_thresh = 0, \
            .source_clk = UART_SCLK_DEFAULT, \
        }, \
        .rx_pin = CONFIG_PIN_TO_RCP_TX, \
        .tx_pin = CONFIG_PIN_TO_RCP_RX, \
    }, \
}

#define ESP_OPENTHREAD_DEFAULT_HOST_CONFIG() \
{ \
    .host_connection_mode = HOST_CONNECTION_MODE_NONE, \
}

#define ESP_OPENTHREAD_DEFAULT_PORT_CONFIG() \
{ \
    .storage_partition_name = "nvs", \
    .netif_queue_size = 10, \
    .task_queue_size = 10, \
}
