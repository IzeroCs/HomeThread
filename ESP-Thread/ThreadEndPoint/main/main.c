/*
 * ThreadEndPoint - Test entity_model component tại root project.
 */
#include <stdio.h>
#include "esp_log.h"
#include "entity_model.h"

static const char *TAG = "main";

void app_main(void)
{
    entity_model_init();
    ESP_LOGI(TAG, "entity_model_init ok");

    char buf[128];
    int n = entity_describe(buf, sizeof(buf));
    if (n >= 0) {
        ESP_LOGI(TAG, "describe (%d bytes):\n%.*s", n, n, buf);
    } else {
        ESP_LOGI(TAG, "describe empty (chua co entity)");
    }
}
