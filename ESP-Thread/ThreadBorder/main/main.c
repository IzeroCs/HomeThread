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
#include "device_registry_server.h"
/* Tạm tắt network stop để test CoAP thuần trong main */
/* #include "leader_control_client.h" */

#include "openthread/thread.h"
#include "openthread/coap.h"
#include "openthread/message.h"
#include "openthread/thread_ftd.h"
#include "openthread/dataset.h"
#include "openthread/dataset_ftd.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#if CONFIG_OPENTHREAD_CLI_ESP_EXTENSION
#include "esp_ot_cli_extension.h"
#endif // CONFIG_OPENTHREAD_CLI_ESP_EXTENSION

#define TAG "ot_esp_ftd"

/* ---------- CoAP thuần trong main (để test) ---------- */
static void coap_ping_handler(void *aContext, otMessage *aMessage, const otMessageInfo *aMessageInfo)
{
    (void)aContext;
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) return;

    otCoapCode code = otCoapMessageGetCode(aMessage);
    otCoapType type = otCoapMessageGetType(aMessage);
    ESP_LOGI(TAG, ">>> CoAP /ping <<< Type=%d Code=%d.%02d", type, (int)(code >> 5), (int)(code & 0x1f));

    otMessage *response = otCoapNewMessage(instance, NULL);
    if (!response) return;
    otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT, OT_COAP_CODE_CONTENT);
    const char *payload = "pong";
    (void)otMessageAppend(response, payload, (uint16_t)strlen(payload));
    (void)otCoapSendResponse(instance, response, aMessageInfo);
    ESP_LOGI(TAG, "CoAP /ping -> 2.05 pong");
}

static void main_coap_test_init(void)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance || !esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) return;

    static otCoapResource s_ping_resource;
    memset(&s_ping_resource, 0, sizeof(s_ping_resource));
    s_ping_resource.mUriPath = "ping";
    s_ping_resource.mHandler = coap_ping_handler;
    s_ping_resource.mContext = NULL;
    otCoapAddResource(instance, &s_ping_resource);

    esp_openthread_lock_release();
    ESP_LOGI(TAG, "CoAP test resource /ping registered (trong main)");
}

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
        
        // Get and log the calculated leader weight
        uint8_t leader_weight = otThreadGetLocalLeaderWeight(instance);
        ESP_LOGI(TAG, "Leader weight set: adjustment=+16, calculated weight=%d", leader_weight);
        
        esp_openthread_lock_release();
    }

    ESP_ERROR_CHECK(led_status_start(NULL));  /* LED: disabled=đỏ nhấp nháy, detached=xanh dương nhấp nháy, leader=xanh lá tĩnh, router=tím tĩnh, child=xanh dương tĩnh */

    /* Start device registry CoAP server */
    ESP_ERROR_CHECK(device_registry_server_init());

    /* CoAP thuần trong main: đăng ký /ping để test */
    main_coap_test_init();

    /* Tạm tắt network stop */
    /* ESP_ERROR_CHECK(leader_control_client_init()); */

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

        /* Tạm tắt: leader_control_log_leader_rloc16(); */
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
