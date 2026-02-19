/*
 * SPDX-FileCopyrightText: 2021-2026 Espressif Systems (Shanghai) CO LTD
 * SPDX-License-Identifier: CC0-1.0
 * Launch OpenThread Border Router — không WiFi/Ethernet.
 */

#include "br_launch.h"
#include "br_console.h"

#include "esp_openthread.h"
#include "esp_ot_cli_extension.h"

void launch_openthread_border_router(const esp_openthread_config_t *config)
{
#if CONFIG_OPENTHREAD_CLI
    br_console_start();
#endif

    ESP_ERROR_CHECK(esp_openthread_start(config));
#if CONFIG_OPENTHREAD_CLI_ESP_EXTENSION
    esp_cli_custom_command_init();
#endif
    br_register_external_commands();
}
