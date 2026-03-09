#include "esp_err.h"
#include "esp_event.h"
#include "esp_log_level.h"
#include "esp_netif.h"
#include "mdns.h"
#include "esp_openthread.h"
#include "esp_openthread_border_router.h"
#include "esp_openthread_lock.h"
#include "esp_openthread_netif_glue.h"
#include "esp_openthread_types.h"
#include "openthread/srp_server.h"
#include "br_config.h"
#include "esp_vfs_eventfd.h"
#include "esp_partition.h"
#include "nvs_flash.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "br_launch.h"
#include "br_rcp_ctrl.h"
#include "openthread/dataset_init.h"
#include "hardware/led_status.h"
#include "hardware/boot_btn.h"
#include "backhaul/eth_w5500.h"
#include "communicate/communicate_task.h"
#include "esp_log.h"
#include "esp_system.h"

#define TAG "br_main"

#define BOOT_BTN_GPIO         0    /* BOOT button trên ESP32-S3 DevKit */
#define BOOT_BTN_HOLD_MS      3000 /* Giữ ~3s = long press */

#define STACK_MONITOR_INTERVAL_MS  30000
#define STACK_MONITOR_TASK_PRIO    2

typedef struct {
    const char *name;
    uint32_t    total;
} task_stack_info_t;

static const task_stack_info_t k_tasks[] = {
    { TASK_NAME_MAIN,         TASK_STACK_MAIN         },
    { TASK_NAME_COMM_QUEUE,   TASK_STACK_COMM_QUEUE   },
    { TASK_NAME_COMM_TASK,    TASK_STACK_COMM_TASK    },
    { TASK_NAME_BOOT_BTN,     TASK_STACK_BOOT_BTN     },
    { TASK_NAME_LED_STATUS,   TASK_STACK_LED_STATUS   },
    { TASK_NAME_TCP_RX,       TASK_STACK_TCP_RX       },
    { TASK_NAME_STK_MON,      TASK_STACK_STK_MON      },
};

static void __attribute__((unused)) stack_monitor_task(void *pv)
{
    (void)pv;
    const int n = (int)(sizeof(k_tasks) / sizeof(k_tasks[0]));
    for (;;) {
        vTaskDelay(pdMS_TO_TICKS(STACK_MONITOR_INTERVAL_MS));
        for (int i = 0; i < n; i++) {
            TaskHandle_t h = xTaskGetHandle(k_tasks[i].name);
            if (h == NULL) {
                continue;
            }
            UBaseType_t hwm  = uxTaskGetStackHighWaterMark(h);
            uint32_t    used = k_tasks[i].total > (uint32_t)hwm ? k_tasks[i].total - (uint32_t)hwm : 0;
            ESP_LOGI(TAG, "stack hwm | %-22s high_water_mark=%4u bytes (used ~%4u / %u)",
                     k_tasks[i].name, (unsigned)hwm, (unsigned)used, (unsigned)k_tasks[i].total);
        }
        ESP_LOGI(TAG, "heap      | free=%u bytes  min_free=%u bytes",
                 (unsigned)esp_get_free_heap_size(),
                 (unsigned)esp_get_minimum_free_heap_size());
    }
}

static void on_boot_long_press(void *ctx)
{
    (void)ctx;
    ESP_LOGW(TAG, "Boot button long press: factory reset");
    nvs_flash_deinit();
    const esp_partition_t *nvs_part = esp_partition_find_first(
        ESP_PARTITION_TYPE_DATA, ESP_PARTITION_SUBTYPE_DATA_NVS, "nvs");
    if (nvs_part != NULL) {
        esp_err_t err = esp_partition_erase_range(nvs_part, 0, nvs_part->size);
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "partition erase failed: %s", esp_err_to_name(err));
        }
    } else {
        ESP_LOGW(TAG, "NVS partition not found, using nvs_flash_erase fallback");
        nvs_flash_erase();
    }
    esp_restart();
}

void app_main(void)
{
  esp_log_level_set("OPENTHREAD", ESP_LOG_WARN);

  /* eventfd: netif, task queue, border router; +1 khi dùng RCP SPI (Spinel). Giống esp-thread-br. */
  size_t max_eventfd = 3;
#if CONFIG_OPENTHREAD_RADIO_SPINEL_SPI
  max_eventfd++;
#endif
  esp_vfs_eventfd_config_t eventfd_config = { .max_fds = max_eventfd };

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

    /* Backhaul: chỉ LAN (Ethernet W5500) */
    esp_netif_t *backbone = NULL;
#if CONFIG_BR_ETH_W5500_ENABLE
    esp_err_t eth_err = eth_w5500_init();
    if (eth_err == ESP_OK) {
        backbone = eth_w5500_get_netif();
    } else if (eth_err == ESP_ERR_TIMEOUT) {
        ESP_LOGW(TAG, "Ethernet IPv4 timeout, restarting...");
        esp_restart();
    }
#endif
    if (backbone != NULL) {
        esp_openthread_set_backbone_netif(backbone);
    }

    ESP_ERROR_CHECK(mdns_init());
    ESP_ERROR_CHECK(mdns_hostname_set("Thread-Host"));
    /* Quảng bá port frame qua mDNS để backend dò được BR_IP:port */
    ESP_ERROR_CHECK(mdns_service_add(NULL, "_thread-frame", "_tcp", CONFIG_BR_FRAME_TCP_PORT, NULL, 0));

    // RCP control pins (RESET/BOOT): nếu không nối dây, RCP tự boot từ flash; nếu nối thì reset RCP cho clean state
    ESP_ERROR_CHECK(br_rcp_ctrl_init());
    br_rcp_reset();
    vTaskDelay(pdMS_TO_TICKS(500));  // Đợi RCP (H2) boot và sẵn sàng

    ESP_LOGI(TAG, "RCP over SPI: host=%d SCLK=%d MOSI=%d MISO=%d CS=%d IRQ=%d clk=%d MHz",
             (int)CONFIG_BR_RCP_SPI_HOST, CONFIG_BR_RCP_SPI_SCLK_GPIO, CONFIG_BR_RCP_SPI_MOSI_GPIO,
             CONFIG_BR_RCP_SPI_MISO_GPIO, CONFIG_BR_RCP_SPI_CS_GPIO, CONFIG_BR_RCP_SPI_IRQ_GPIO,
             CONFIG_BR_RCP_SPI_CLOCK_MHZ);

    launch_openthread_border_router(&openthread_config);

    /* Nếu chưa có active dataset thì tạo mới (ESP-BR-<MAC>) và set active */
    openthread_dataset_init_on_boot();

    /* Phase 2.5: bật border routing + prefix delegation (sau OT start) */
    if (backbone != NULL) {
        esp_openthread_lock_acquire(portMAX_DELAY);
        esp_err_t br_err = esp_openthread_border_router_init();
        esp_openthread_lock_release();
        if (br_err != ESP_OK) {
            ESP_LOGE(TAG, "esp_openthread_border_router_init %s", esp_err_to_name(br_err));
        } else {
            ESP_LOGI(TAG, "border router init OK (routing + prefix)");
        }

        /* Bật SRP server để Thread node (SRP client) đăng ký service, DNS-based discovery */
        otInstance *instance = esp_openthread_get_instance();
        if (instance != NULL && esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
            otSrpServerSetEnabled(instance, true);
            esp_openthread_lock_release();
            ESP_LOGI(TAG, "SRP server enabled");
        } else {
            ESP_LOGW(TAG, "SRP server not started (instance or lock failed)");
        }
    }

    // Communicate task: frame protocol (USB CDC hoặc UART) + state watchdog
    ESP_ERROR_CHECK(communicate_task_start());

    // Initialize LED status indicator (WS2812)
    // Disabled: đỏ nhấp nháy | Detached: xanh dương nhấp nháy
    // Leader: xanh lá tĩnh | Router: tím tĩnh | Child: xanh dương tĩnh
    ESP_ERROR_CHECK(led_status_start(NULL));

    // Boot button: long press ~3s → factory reset (erase NVS) và restart
    boot_btn_config_t btn_cfg = {
        .gpio_num = BOOT_BTN_GPIO,
        .hold_ms = BOOT_BTN_HOLD_MS,
        .poll_ms = 50,
        .on_long_press = on_boot_long_press,
        .ctx = NULL,
        .task_stack_size = TASK_STACK_BOOT_BTN,
        .task_priority = 0,
    };
    ESP_ERROR_CHECK(boot_btn_start(&btn_cfg));

    // xTaskCreate(stack_monitor_task, TASK_NAME_STK_MON, TASK_STACK_STK_MON, NULL, STACK_MONITOR_TASK_PRIO, NULL);
}
