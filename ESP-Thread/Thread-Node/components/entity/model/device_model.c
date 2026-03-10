/*
 * Device Model Manager - Implementation
 * Singleton manager for device model (device info + network info + entity references)
 * 
 * Reference-based approach: Entities are pointers to Entity Model entities, not duplicated.
 */
#include <string.h>
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_err.h"
#include "device_model.h"
#include "entity_model.h"

static const char *TAG = "device_model";

// Singleton device model instance
static device_model_t s_device_model;
static bool s_initialized = false;

// Default device info if not provided
static const device_info_t s_default_device_info = {
    .device_name = "ESP Thread Device",
    .device_type = DEVICE_TYPE_THREAD_ENDPOINT,
    .manufacturer = "Espressif",
    .model = "ESP32",
    .sw_version = DEVICE_VERSION(1, 0, 0),
    .hw_version = DEVICE_VERSION(1, 0, 0),
    .mac_address = 0
};

int device_model_init(const device_info_t *info)
{
    if (s_initialized) {
        ESP_LOGW(TAG, "Device Model already initialized");
        return 0; // Already initialized, not an error
    }
    
    // Initialize device model structure
    memset(&s_device_model, 0, sizeof(device_model_t));
    
    // Set device info (use provided or defaults)
    if (info != NULL) {
        memcpy(&s_device_model.info, info, sizeof(device_info_t));
    } else {
        memcpy(&s_device_model.info, &s_default_device_info, sizeof(device_info_t));
    }
    
    // Auto-generate MAC address if not provided (0)
    if (s_device_model.info.mac_address == 0) {
        esp_err_t err = device_model_get_mac_address(&s_device_model.info.mac_address);
        if (err != ESP_OK) {
            ESP_LOGW(TAG, "Failed to get MAC address, mac_address will be 0");
        }
    }
    
    // Initialize network info to zero
    memset(s_device_model.ipv6_addr, 0, 16);
    s_device_model.rloc16 = 0;
    s_device_model.role = 0;
    
    // Initialize entities array (empty initially)
    s_device_model.entity_count = 0;
    memset(s_device_model.entities, 0, sizeof(s_device_model.entities));
    memset(s_device_model.entity_types, 0, sizeof(s_device_model.entity_types));
    
    s_initialized = true;
    
    ESP_LOGI(TAG, "Device Model initialized: device_name=%s, mac=0x%016llx",
             s_device_model.info.device_name, (unsigned long long)s_device_model.info.mac_address);
    
    return 0;
}

device_model_t* device_model_get(void)
{
    if (!s_initialized) {
        ESP_LOGW(TAG, "Device Model not initialized, call device_model_init() first");
        return NULL;
    }
    
    return &s_device_model;
}

int device_model_set_info(const device_info_t *info)
{
    if (!s_initialized) {
        ESP_LOGE(TAG, "Device Model not initialized");
        return -1;
    }
    
    if (info == NULL) {
        ESP_LOGE(TAG, "Invalid device info pointer");
        return -1;
    }
    
    memcpy(&s_device_model.info, info, sizeof(device_info_t));
    
    ESP_LOGI(TAG, "Device info updated: device_name=%s", s_device_model.info.device_name);
    
    return 0;
}

int device_model_update_network(uint16_t rloc16, const uint8_t *ipv6_addr, uint8_t role)
{
    if (!s_initialized) {
        ESP_LOGE(TAG, "Device Model not initialized");
        return -1;
    }
    
    s_device_model.rloc16 = rloc16;
    s_device_model.role = role;
    
    if (ipv6_addr != NULL) {
        memcpy(s_device_model.ipv6_addr, ipv6_addr, 16);
    } else {
        memset(s_device_model.ipv6_addr, 0, 16);
    }
    
    ESP_LOGI(TAG, "Network info updated: rloc16=0x%04x, role=%d", rloc16, role);
    
    return 0;
}

int device_model_sync_entities(void)
{
    if (!s_initialized) {
        ESP_LOGE(TAG, "Device Model not initialized");
        return -1;
    }
    
    // Get entity count from Entity Model
    int entity_count = entity_get_count();
    
    if (entity_count > MAX_ENTITIES) {
        ESP_LOGW(TAG, "Entity count (%d) exceeds MAX_ENTITIES (%d), truncating",
                 entity_count, MAX_ENTITIES);
        entity_count = MAX_ENTITIES;
    }
    
    // Clear existing entity references
    memset(s_device_model.entities, 0, sizeof(s_device_model.entities));
    memset(s_device_model.entity_types, 0, sizeof(s_device_model.entity_types));
    
    // Sync entity pointers from Entity Model
    s_device_model.entity_count = 0;
    for (int i = 0; i < entity_count; i++) {
        entity_type_t type_enum;
        void *entity_ptr = entity_get_by_index(i, &type_enum);
        
        if (entity_ptr != NULL) {
            s_device_model.entities[s_device_model.entity_count] = entity_ptr;
            s_device_model.entity_types[s_device_model.entity_count] = type_enum;
            s_device_model.entity_count++;
        }
    }
    
    ESP_LOGI(TAG, "Synced %d entities from Entity Model", s_device_model.entity_count);
    
    return 0;
}

esp_err_t device_model_get_mac_address(uint64_t *mac_address)
{
    if (!mac_address) {
        return ESP_ERR_INVALID_ARG;
    }
    
    uint8_t mac[8] = {0};
    esp_err_t err = esp_read_mac(mac, ESP_MAC_IEEE802154);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to read MAC address: %s", esp_err_to_name(err));
        *mac_address = 0;
        return err;
    }
    
    // Convert 8-byte MAC to uint64_t (big-endian)
    *mac_address = ((uint64_t)mac[0] << 56) |
                  ((uint64_t)mac[1] << 48) |
                  ((uint64_t)mac[2] << 40) |
                  ((uint64_t)mac[3] << 32) |
                  ((uint64_t)mac[4] << 24) |
                  ((uint64_t)mac[5] << 16) |
                  ((uint64_t)mac[6] << 8) |
                  (uint64_t)mac[7];
    
    return ESP_OK;
}
