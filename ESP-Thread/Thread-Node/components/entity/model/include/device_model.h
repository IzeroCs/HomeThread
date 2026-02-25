/*
 * Device Model
 * Complete device model structure including device info, entities, and network info.
 */
#pragma once

#include "entity_model.h"
#include "sdkconfig.h"
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Maximum number of entities per device
 * Uses same value as Entity Model (CONFIG_ENTITY_MODEL_MAX_ENTITIES)
 */
#define MAX_ENTITIES CONFIG_ENTITY_MODEL_MAX_ENTITIES

/**
 * Device type IDs (Zigbee-style, number to save bandwidth)
 * String fields: manufacturer_name, model_identifier, device_name only.
 */
#define DEVICE_TYPE_THREAD_ENDPOINT  0x0000
#define DEVICE_TYPE_ON_OFF_LIGHT    0x0100
#define DEVICE_TYPE_SENSOR_HUB      0x0200
#define DEVICE_TYPE_SWITCH          0x0300

/**
 * Version encoding: major << 16 | minor << 8 | patch (e.g. 1.2.3 = 0x00010203)
 */
#define DEVICE_VERSION(major, minor, patch)  (((uint32_t)(major) << 16) | ((uint32_t)(minor) << 8) | (uint32_t)(patch))

/**
 * Device Info Structure
 * manufacturer, model, device_name = string; device_type, sw_version, hw_version = number (save bandwidth).
 */
typedef struct {
    char device_id[16];        // Unique identifier: "living-room-001"
    char device_name[32];      // Human-readable: "Living Room Controller"
    uint16_t device_type;      // Zigbee-style type ID (e.g. DEVICE_TYPE_ON_OFF_LIGHT)
    char manufacturer[32];     // Manufacturer name: "MyCompany"
    char model[32];            // Model identifier: "LC-100"
    uint32_t sw_version;       // Software version: DEVICE_VERSION(maj,min,patch)
    uint32_t hw_version;       // Hardware version: DEVICE_VERSION(maj,min,patch) or revision
    uint64_t mac_address;      // IEEE EUI-64 address (8 bytes)
} device_info_t;

/**
 * Complete Device Model Structure
 * Contains device info, entities array, and network information.
 * 
 * Note: Entities are stored as void* pointers with a parallel type array
 * for type safety. This allows polymorphic storage of different entity types.
 * Entities are references (pointers) to Entity Model entities, not duplicated.
 */
typedef struct {
    device_info_t info;        // Device metadata
    
    // Entities (polymorphic array - references to Entity Model)
    void *entities[MAX_ENTITIES];              // Pointers to entity_light_t, entity_sensor_t, etc.
    entity_type_t entity_types[MAX_ENTITIES]; // Type for each entity
    uint8_t entity_count;                     // Actual count (0 to MAX_ENTITIES)
    
    // Network info
    uint8_t ipv6_addr[16];     // Thread IPv6 address
    uint16_t rloc16;           // Thread RLOC16
    uint8_t role;              // 0=Child, 1=Leader, 2=Router
} device_model_t;

/**
 * Initialize Device Model Manager with device info.
 * Must be called before using any other device_model functions.
 * 
 * @param info Device info structure (can be NULL to use defaults)
 * @return 0 on success, -1 on error
 */
int device_model_init(const device_info_t *info);

/**
 * Get pointer to the singleton device_model_t instance.
 * Returns NULL if not initialized.
 * 
 * @return Pointer to device_model_t or NULL if not initialized
 */
device_model_t* device_model_get(void);

/**
 * Set/update device info.
 * 
 * @param info Device info structure
 * @return 0 on success, -1 on error (NULL pointer or not initialized)
 */
int device_model_set_info(const device_info_t *info);

/**
 * Update network information.
 * 
 * @param rloc16 Thread RLOC16
 * @param ipv6_addr IPv6 address (16 bytes, can be NULL)
 * @param role Device role (0=Child, 1=Leader, 2=Router)
 * @return 0 on success, -1 on error (not initialized)
 */
int device_model_update_network(uint16_t rloc16, const uint8_t *ipv6_addr, uint8_t role);

/**
 * Sync entity pointers from Entity Model.
 * This function updates the entities array in device_model_t to point to
 * all entities currently registered in the Entity Model.
 * 
 * @return 0 on success, -1 on error (not initialized)
 */
int device_model_sync_entities(void);

/**
 * Utility: Get MAC address (IEEE802154 for Thread) and convert to uint64_t.
 * 
 * @param mac_address Output: MAC address as uint64_t (big-endian)
 * @return ESP_OK on success, ESP_ERR_* on error
 */
esp_err_t device_model_get_mac_address(uint64_t *mac_address);

/**
 * Utility: Generate device_id from MAC address.
 * Format: "{prefix}-{mac[6]}{mac[7]}" (e.g., "light-a1b2")
 * 
 * @param prefix Prefix string (e.g., "light", "sensor")
 * @param device_id Output buffer for device_id (must be at least 16 bytes)
 * @param device_id_len Size of device_id buffer
 * @return ESP_OK on success, ESP_ERR_* on error
 */
esp_err_t device_model_generate_device_id(const char *prefix, char *device_id, size_t device_id_len);

#ifdef __cplusplus
}
#endif
