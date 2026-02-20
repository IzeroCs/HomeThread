/*
 * SPDX-FileCopyrightText: 2021-2026 Espressif Systems (Shanghai) CO LTD
 * SPDX-License-Identifier: CC0-1.0
 * Launch OpenThread Border Router — không WiFi/Ethernet.
 */

#include "br_launch.h"
#include "br_console.h"

#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "esp_ot_cli_extension.h"
#include "openthread/instance.h"
#include "openthread/thread.h"
#include "openthread/thread_ftd.h"
#include "esp_log.h"
#include <string.h>

#define TAG "br_launch"

void launch_openthread_border_router(const esp_openthread_config_t *config)
{
#if CONFIG_OPENTHREAD_CLI
    br_console_start();
#endif

    ESP_ERROR_CHECK(esp_openthread_start(config));

    /* Set Leader Weight cao nhất để đảm bảo device này luôn là Leader */
    otInstance *instance = esp_openthread_get_instance();
    if (instance && esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        otDeviceProperties device_props;
        const otDeviceProperties *current = otThreadGetDeviceProperties(instance);
        if (current) {
            memcpy(&device_props, current, sizeof(device_props));
        } else {
            memset(&device_props, 0, sizeof(device_props));
        }

        /* Set leader weight adjustment cao nhất (+16) */
        device_props.mLeaderWeightAdjustment = 16;
        /* Set Border Router để tăng weight */
        device_props.mIsBorderRouter = true;
        /* Set power supply stable để tăng weight */
        device_props.mPowerSupply = OT_POWER_SUPPLY_EXTERNAL_STABLE;
        /* Set stable (không unstable) */
        device_props.mIsUnstable = false;

        /* Set device properties */
        otThreadSetDeviceProperties(instance, &device_props);

        /* Preferred Leader Partition Id cao nhất (0xFFFFFFFF) */
        otThreadSetPreferredLeaderPartitionId(instance, 0xFFFFFFFF);

        esp_openthread_lock_release();
        ESP_LOGI(TAG, "Leader weight set to maximum (adjustment=+16, BR=true, stable)");
    } else {
        ESP_LOGW(TAG, "Failed to set leader weight (instance NULL or lock timeout)");
    }

#if CONFIG_OPENTHREAD_CLI_ESP_EXTENSION
    esp_cli_custom_command_init();
#endif
    br_register_external_commands();
}
