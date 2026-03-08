/*
 * SPDX-FileCopyrightText: 2021 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: CC0-1.0
 *
 * OpenThread Border Router — ESP32-S3 Host + ESP32-H2 RCP qua SPI.
 * UART dành sau cho flash/update RCP. Pin trong menuconfig (BR_RCP_*).
 */

#pragma once

#include "sdkconfig.h"

/* RCP control pins (RESET/BOOT) — từ Kconfig */
#define CONFIG_PIN_TO_RCP_RESET  CONFIG_BR_RCP_RESET_GPIO
#define CONFIG_PIN_TO_RCP_BOOT   CONFIG_BR_RCP_BOOT_GPIO

#include "driver/spi_master.h"
#include "driver/spi_common.h"

#define ESP_OPENTHREAD_DEFAULT_RADIO_CONFIG() \
{ \
    .radio_mode = RADIO_MODE_SPI_RCP, \
    .radio_spi_config = { \
        .host_device = (spi_host_device_t)CONFIG_BR_RCP_SPI_HOST, \
        .dma_channel = SPI_DMA_CH_AUTO, \
        .spi_interface = { \
            .miso_io_num = CONFIG_BR_RCP_SPI_MISO_GPIO, \
            .mosi_io_num = CONFIG_BR_RCP_SPI_MOSI_GPIO, \
            .sclk_io_num = CONFIG_BR_RCP_SPI_SCLK_GPIO, \
            .quadwp_io_num = -1, \
            .quadhd_io_num = -1, \
        }, \
        .spi_device = { \
            .clock_speed_hz = CONFIG_BR_RCP_SPI_CLOCK_MHZ * 1000 * 1000, \
            .spics_io_num = CONFIG_BR_RCP_SPI_CS_GPIO, \
            .queue_size = 4, \
            .mode = 0, \
        }, \
        .intr_pin = (CONFIG_BR_RCP_SPI_IRQ_GPIO >= 0) ? (gpio_num_t)CONFIG_BR_RCP_SPI_IRQ_GPIO : (gpio_num_t)-1, \
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

/* ---- Task names — dùng trong xTaskCreate và xTaskGetHandle ---- */
#define TASK_NAME_MAIN          "main"
#define TASK_NAME_COMM_QUEUE    "comm_queue"
#define TASK_NAME_COMM_TASK     "comm_task"
#define TASK_NAME_BOOT_BTN      "boot_btn"
#define TASK_NAME_LED_STATUS    "led_status"
#define TASK_NAME_TCP_RX        "tcp_rx"
#define TASK_NAME_STK_MON       "stk_mon"

/* ---- Task stack sizes (bytes) ---- */
#define TASK_STACK_MAIN         CONFIG_ESP_MAIN_TASK_STACK_SIZE
#define TASK_STACK_COMM_QUEUE   10240
#define TASK_STACK_COMM_TASK    4096
#define TASK_STACK_BOOT_BTN     4096
#define TASK_STACK_LED_STATUS   2048
#define TASK_STACK_TCP_RX       4096
#define TASK_STACK_STK_MON      3072
