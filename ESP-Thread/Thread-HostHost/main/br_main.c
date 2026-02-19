#include "esp_err.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "mdns.h"
#include "esp_openthread_netif_glue.h"
#include "esp_openthread_types.h"
#include "br_config.h"
#include "esp_vfs_eventfd.h"
#include "nvs_flash.h"

#include "br_launch.h"
#include "br_rcp_ctrl.h"

void app_main(void)
{
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

    launch_openthread_border_router(&openthread_config);
}
