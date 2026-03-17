/*
 * Thread-Node - Test entity_model component tại root project.
 * 
 * TODO: Migrate to struct-based approach (see MIGRATION_TO_STRUCT_BASED.md)
 */
#include <stdio.h>
#include "esp_log.h"

static const char *TAG = "main";

void app_main(void)
{
    /* TODO: Migrate to struct-based approach
     * Old approach removed:
     *   entity_model_init();
     *   entity_describe(buf, sizeof(buf));
     * 
     * New approach (after migration):
     *   1. entity_model_init();
     *   2. Get device_model_t
     *   3. Serialize to JSON/CBOR for display
     */
    ESP_LOGW(TAG, "main.c test - Not implemented yet (migration pending)");
    ESP_LOGI(TAG, "Waiting for struct-based migration...");
}
