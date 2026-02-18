/*
 * Entity Serialization - CBOR implementation.
 * 
 * TODO: Migrate to struct-based approach (see MIGRATION_TO_STRUCT_BASED.md)
 *       - Use device_model_t struct from entity/model/include/device_model.h
 *       - Serialize device_model_t directly to CBOR
 *       - No need to parse text output from entity_describe()
 */
#include <string.h>
#include <stdlib.h>
#include "esp_log.h"
#include "cbor.h"
#include "entity_serialization.h"

static const char *TAG = "entity_serialize";

/**
 * Serialize device model to CBOR format.
 * 
 * TODO: Migrate to struct-based approach
 *   1. Include headers:
 *      #include "device_model.h"
 *      #include "entity_model.h"  // For entity_get_count(), entity_get_by_index()
 *   
 *   2. Get device_model_t struct:
 *      device_model_t device = {0};
 *      - Fill device.info from device metadata
 *      - Fill entities from entity model:
 *        device.entity_count = entity_get_count();
 *        for (int i = 0; i < device.entity_count; i++) {
 *            device.entities[i] = entity_get_by_index(i, &device.entity_types[i]);
 *        }
 *      - Fill network info (rloc16, ml_eid, role)
 *   
 *   3. Serialize device_model_t → CBOR:
 *      - Serialize device.info
 *      - Serialize entities array (iterate through device.entities[])
 *      - Serialize network info
 */
int entity_serialize_cbor(uint16_t rloc16, const char *ml_eid_str, 
                         uint16_t parent_rloc16,
                         uint8_t *buffer, size_t buffer_size)
{
    if (!buffer || buffer_size == 0) {
        ESP_LOGE(TAG, "Invalid buffer");
        return -1;
    }

    /* TODO: Migrate to struct-based approach */
    /* 
     * Old approach removed:
     *   - entity_describe() to get text output
     *   - Parse text to extract entity info
     *   - entity_get() to get attribute values
     * 
     * New approach:
     *   - Get device_model_t struct
     *   - Serialize struct directly to CBOR
     */
    
    ESP_LOGW(TAG, "entity_serialize_cbor() - Not implemented yet (migration pending)");
    ESP_LOGI(TAG, "Would serialize: rloc16=0x%04x, ml_eid=%s, parent=0x%04x",
             rloc16, ml_eid_str ? ml_eid_str : "NULL", parent_rloc16);
    
    return -1;
}

/**
 * Serialize partial updates (only changed entities/attributes).
 * 
 * TODO: Implement after struct-based migration
 */
int entity_serialize_updates_cbor(uint8_t *buffer, size_t buffer_size)
{
    // TODO: Implement partial updates serialization
    // For now, return error
    ESP_LOGW(TAG, "Partial updates not yet implemented");
    return -1;
}
