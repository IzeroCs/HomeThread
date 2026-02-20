#include "esp_err.h"
#include "esp_event.h"
#include "esp_log_level.h"
#include "esp_netif.h"
#include "mdns.h"
#include "esp_openthread_netif_glue.h"
#include "esp_openthread_types.h"
#include "br_config.h"
#include "esp_vfs_eventfd.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_check.h"

#include "br_launch.h"
#include "br_rcp_ctrl.h"
#include "openthread/dataset_init.h"
#include "hardware/led_status.h"
#include "hardware/boot_btn.h"
#include "coap_controller/leader_control_client.h"
#include "communicate/communicate_task.h"
#include "esp_log.h"
#include "esp_system.h"

#define TAG "br_main"

#define BOOT_BTN_GPIO         0    /* BOOT button trên ESP32-S3 DevKit */
#define BOOT_BTN_HOLD_MS      3000 /* Giữ ~3s = long press */

static void on_boot_long_press(void *ctx)
{
    (void)ctx;
    ESP_LOGW(TAG, "Boot button long press: factory reset and restart");
    esp_err_t err = nvs_flash_erase();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_flash_erase failed %s", esp_err_to_name(err));
    }
    esp_restart();
}

void app_main(void)
{
  esp_log_level_set("OPENTHREAD", ESP_LOG_WARN);

  esp_vfs_eventfd_config_t eventfd_config = {
        .max_fds = 3,
    };

    esp_openthread_config_t openthread_config = {
        .netif_config = ESP_NETIF_DEFAULT_OPENTHREAD(),
        .platform_config = {
            .radio_config = ESP_OPENTHREAD_DEFAULT_RADIO_CONFIG(),
            .host_config = ESP_OPENTHREAD_DEFAULT_HOST_CONFIG(),
            .port_config = ESP_OPENTHREAD_DEFAULT_PORT_CONFIG(),
        },
    };
    ESP_ERROR_CHECK(esp_vfs_eventfd_register(&eventfd_config));

    ESP_ERROR_CHECK(nvs_flash_init());
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());

    ESP_ERROR_CHECK(mdns_init());
    ESP_ERROR_CHECK(mdns_hostname_set("Thread-Host"));

    // Initialize RCP control pins (RESET/BOOT) and reset RCP to ensure clean state
    ESP_ERROR_CHECK(br_rcp_ctrl_init());
    br_rcp_reset();
    // Wait for RCP to boot and be ready (ESP32-H2 needs ~500ms to boot)
    vTaskDelay(pdMS_TO_TICKS(500));

    launch_openthread_border_router(&openthread_config);

    /* Nếu chưa có active dataset thì tạo mới (ESP-BR-<MAC>) và set active */
    openthread_dataset_init_on_boot();

    // Communicate task: frame protocol (USB CDC hoặc UART) + state watchdog
    ESP_ERROR_CHECK(communicate_task_start());

    // Initialize LED status indicator (WS2812)
    // Disabled: đỏ nhấp nháy | Detached: xanh dương nhấp nháy
    // Leader: xanh lá tĩnh | Router: tím tĩnh | Child: xanh dương tĩnh
    ESP_ERROR_CHECK(led_status_start(NULL));

    // Initialize Leader Control Client (CoAP client để gửi lệnh stop đến Leader)
    ESP_ERROR_CHECK(leader_control_client_init());

    // Boot button: long press ~3s → factory reset (erase NVS) và restart
    boot_btn_config_t btn_cfg = {
        .gpio_num = BOOT_BTN_GPIO,
        .hold_ms = BOOT_BTN_HOLD_MS,
        .poll_ms = 50,
        .on_long_press = on_boot_long_press,
        .ctx = NULL,
        .task_stack_size = 0,
        .task_priority = 0,
    };
    ESP_ERROR_CHECK(boot_btn_start(&btn_cfg));
}
