/*
 * SPDX-FileCopyrightText: 2021-2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: CC0-1.0
 *
 * OpenThread Full Thread Device (FTD) Example for ESP32-H2
 *
 * Chạy OpenThread stack đầy đủ trên ESP32-H2 làm Router/Leader
 * Không cần Wi-Fi/Internet, chỉ Thread mesh network nội bộ
 */

#include <stdio.h>
#include <unistd.h>
#include <string.h>

#include "sdkconfig.h"
#include "openthread_custom_config.h"  // Enable CoAP API - must be before OpenThread headers
#include "esp_err.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_netif_types.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "esp_openthread_netif_glue.h"
#include "esp_openthread_types.h"
#include "esp_ot_config.h"
#include "esp_vfs_eventfd.h"
#include "nvs_flash.h"
#include "ot_examples_common.h"

#include "led_status.h"
#include "device_registry_server.h"  // Header ở device_registry/include/
#include "leader_control_client.h"
#include "state_change_notifier.h"

#include "openthread/thread.h"
#include "openthread/thread_ftd.h"
#include "openthread/coap.h"
#include "openthread/dataset.h"
#include "openthread/dataset_ftd.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#if CONFIG_OPENTHREAD_CLI_ESP_EXTENSION
#include "esp_ot_cli_extension.h"
#endif // CONFIG_OPENTHREAD_CLI_ESP_EXTENSION

#define TAG "ot_esp_ftd"

void app_main(void)
{
    // Used eventfds:
    // * netif
    // * ot task queue
    // * radio driver
    esp_vfs_eventfd_config_t eventfd_config = {
        .max_fds = 3,
    };

    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_vfs_eventfd_register(&eventfd_config));

#if CONFIG_OPENTHREAD_CLI
    ot_console_start();
#endif

#if CONFIG_ESP_COEX_EXTERNAL_COEXIST_ENABLE
    ot_external_coexist_init();
#endif

    static esp_openthread_config_t config = {
        .netif_config = ESP_NETIF_DEFAULT_OPENTHREAD(),
        .platform_config = {
            .radio_config = ESP_OPENTHREAD_DEFAULT_RADIO_CONFIG(),
            .host_config = ESP_OPENTHREAD_DEFAULT_HOST_CONFIG(),
            .port_config = ESP_OPENTHREAD_DEFAULT_PORT_CONFIG(),
        },
    };

    ESP_ERROR_CHECK(esp_openthread_start(&config));
    esp_netif_set_default_netif(esp_openthread_get_netif());

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

        // Set leader weight adjustment cao nhất (+16)
        device_props.mLeaderWeightAdjustment = 16;
        // Set Border Router để tăng weight
        device_props.mIsBorderRouter = true;
        // Set power supply stable để tăng weight
        device_props.mPowerSupply = OT_POWER_SUPPLY_EXTERNAL_STABLE;
        // Set stable (không unstable)
        device_props.mIsUnstable = false;

        // Set device properties (returns void)
        otThreadSetDeviceProperties(instance, &device_props);

        // Preferred Leader Partition Id cao nhất (0xFFFFFFFF)
        otThreadSetPreferredLeaderPartitionId(instance, 0xFFFFFFFF);

        esp_openthread_lock_release();
    }

    ESP_ERROR_CHECK(led_status_start(NULL));  /* LED: disabled=đỏ nhấp nháy, detached=xanh dương nhấp nháy, leader=xanh lá tĩnh, router=tím tĩnh, child=xanh dương tĩnh */

    /* Initialize Device Registry Server (CoAP server cho device registration) */
    ESP_ERROR_CHECK(device_registry_server_init());

    /* CoAP đã được start bởi device_registry_server_init(), nhưng giữ lại để đảm bảo leader_control_client có thể dùng */
    instance = esp_openthread_get_instance();
    if (instance && esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        otError err = otCoapStart(instance, OT_DEFAULT_COAP_PORT);
        if (err == OT_ERROR_NONE) {
            ESP_LOGI(TAG, "CoAP started on port %d (for leader control client)", OT_DEFAULT_COAP_PORT);
        } else if (err != OT_ERROR_ALREADY) {
            ESP_LOGW(TAG, "CoAP start: %d", err);
        }
        esp_openthread_lock_release();
    }

    /* Initialize Leader Control Client (network stop) */
    ESP_ERROR_CHECK(leader_control_client_init());

    /* Initialize State Change Notifier (notify Backend khi có thay đổi) */
    ESP_ERROR_CHECK(state_change_notifier_init());

#if CONFIG_OPENTHREAD_CLI_ESP_EXTENSION
    esp_cli_custom_command_init();
#endif

#if CONFIG_OPENTHREAD_NETWORK_AUTO_START
    // Tự động form/start network khi boot
    // Delay một chút để OpenThread stack sẵn sàng
    vTaskDelay(pdMS_TO_TICKS(1000));

    // Get instance for network setup
    otInstance *instance = esp_openthread_get_instance();
    if (instance && esp_openthread_lock_acquire(pdMS_TO_TICKS(2000))) {
        // Kiểm tra xem đã có active dataset chưa
        otOperationalDataset dataset;
        bool has_dataset = (otDatasetGetActive(instance, &dataset) == OT_ERROR_NONE);

        if (!has_dataset) {
            ESP_LOGI(TAG, "No active dataset found, creating new one...");
            // Tạo dataset mới
            otError err = otDatasetCreateNewNetwork(instance, &dataset);
            if (err == OT_ERROR_NONE) {
                // Set active dataset
                err = otDatasetSetActive(instance, &dataset);
                if (err == OT_ERROR_NONE) {
                    ESP_LOGI(TAG, "New dataset created and set as active");
                } else {
                    ESP_LOGE(TAG, "Failed to set active dataset: %d", err);
                }
            } else {
                ESP_LOGE(TAG, "Failed to create new dataset: %d", err);
            }
        } else {
            ESP_LOGW(TAG, "Active dataset already exists - device may join existing network");
            ESP_LOGW(TAG, "To form new network with RLOC16=0x0000, run: ot factoryreset");
        }

        // Enable interface và start thread
        otIp6SetEnabled(instance, true);
        otThreadSetEnabled(instance, true);

        esp_openthread_lock_release();
        ESP_LOGI(TAG, "Thread network auto-started");

        // Đợi một chút để network ổn định, sau đó log Leader RLOC16
        vTaskDelay(pdMS_TO_TICKS(3000));
        leader_control_log_leader_rloc16();
    }
#else
    // Không auto start - user phải start thủ công qua CLI
    ESP_LOGI(TAG, "Network auto-start disabled. Use CLI commands to start network:");
    ESP_LOGI(TAG, "  ot dataset init new");
    ESP_LOGI(TAG, "  ot dataset commit active");
    ESP_LOGI(TAG, "  ot ifconfig up");
    ESP_LOGI(TAG, "  ot thread start");
#endif

    ESP_LOGI(TAG, "OpenThread FTD started on ESP32-H2. Ready to form/join Thread network.");
}
