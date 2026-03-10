/*
 * Entity Serialization - CBOR payloads for device/entity model.
 * Uses cbor_encode for primitives; this file handles entity/device structure and keys.
 */
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include "esp_log.h"
#include "entity_serialization.h"
#include "cbor_encode.h"
#include "cbor_register_keys.h"
#include "device_model.h"
#include "entity_model.h"
#include "entity_light.h"
#include "entity_sensor.h"

static const char *TAG = "entity_serialize";

/**
 * Encode common entity map fields (entity_id, name, type, device_class, available, last_update, restore_mode).
 * Does not start/end the map; caller does that and appends type-specific keys after.
 */
static int serialize_entity_base(cbor_encoder_t *enc,
                                 const entity_base_t *base,
                                 entity_type_t type,
                                 uint32_t device_class)
{
    if (cbor_encode_uint(enc, CBOR_K_ENT_ENTITY_ID) < 0) return -1;
    if (cbor_encode_text_string(enc, base->entity_id) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_ENT_NAME) < 0) return -1;
    if (cbor_encode_text_string(enc, base->name) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_ENT_TYPE) < 0) return -1;
    if (cbor_encode_uint(enc, (uint32_t)type) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_ENT_DEVICE_CLASS) < 0) return -1;
    if (cbor_encode_uint(enc, device_class) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_ENT_AVAILABLE) < 0) return -1;
    if (cbor_encode_bool(enc, base->available) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_ENT_LAST_UPDATE) < 0) return -1;
    if (cbor_encode_uint(enc, base->last_update) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_ENT_RESTORE_MODE) < 0) return -1;
    if (cbor_encode_uint(enc, 0) < 0) return -1;

    return 0;
}

/**
 * Serialize entity_light_t to CBOR
 */
static int serialize_light_entity(cbor_encoder_t *enc, const entity_light_t *light)
{
    if (cbor_start_indefinite_map(enc) < 0) return -1;

    if (serialize_entity_base(enc, &light->base, ENTITY_TYPE_LIGHT, (uint32_t)light->mode) < 0) return -1;

    // Light-specific fields
    if (cbor_encode_uint(enc, CBOR_K_ENT_STATE) < 0) return -1;
    if (cbor_encode_bool(enc, light->state) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_ENT_BRIGHTNESS) < 0) return -1;
    if (cbor_encode_uint(enc, light->brightness) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_ENT_MODE) < 0) return -1;
    if (cbor_encode_uint(enc, (uint32_t)light->mode) < 0) return -1;

    // RGB array (if RGB or RGBW mode)
    if (light->mode == LIGHT_MODE_RGB || light->mode == LIGHT_MODE_RGBW) {
        if (cbor_encode_uint(enc, CBOR_K_ENT_RGB) < 0) return -1;
        if (cbor_start_array(enc, 3) < 0) return -1;
        if (cbor_encode_uint(enc, light->rgb[0]) < 0) return -1;
        if (cbor_encode_uint(enc, light->rgb[1]) < 0) return -1;
        if (cbor_encode_uint(enc, light->rgb[2]) < 0) return -1;
    }

    // Color temperature (if CCT mode)
    if (light->mode == LIGHT_MODE_CCT) {
        if (cbor_encode_uint(enc, CBOR_K_ENT_COLOR_TEMP) < 0) return -1;
        if (cbor_encode_uint(enc, light->color_temp) < 0) return -1;
    }

    if (cbor_end_indefinite_map(enc) < 0) return -1;

    return 0;
}

/**
 * Serialize entity_sensor_t to CBOR
 */
static int serialize_sensor_entity(cbor_encoder_t *enc, const entity_sensor_t *sensor)
{
    if (cbor_start_indefinite_map(enc) < 0) return -1;

    if (serialize_entity_base(enc, &sensor->base, ENTITY_TYPE_SENSOR, (uint32_t)sensor->sensor_class) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_ENT_VALUE) < 0) return -1;
    if (cbor_encode_float(enc, sensor->value) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_ENT_UNIT) < 0) return -1;
    if (cbor_encode_text_string(enc, sensor->unit) < 0) return -1;

    if (cbor_end_indefinite_map(enc) < 0) return -1;

    return 0;
}

typedef int (*entity_serialize_fn)(cbor_encoder_t *enc, const void *entity);

static const entity_serialize_fn s_entity_serializers[] = {
    [ENTITY_TYPE_LIGHT]  = (entity_serialize_fn)serialize_light_entity,
    [ENTITY_TYPE_SENSOR] = (entity_serialize_fn)serialize_sensor_entity,
};

#define ENTITY_SERIALIZERS_COUNT (sizeof(s_entity_serializers) / sizeof(s_entity_serializers[0]))

static int serialize_all_entities(cbor_encoder_t *enc)
{
    int count = entity_get_count();
    for (int i = 0; i < count; i++) {
        entity_type_t type;
        void *ptr = entity_get_by_index(i, &type);
        if (!ptr) continue;
        if ((unsigned)type >= ENTITY_SERIALIZERS_COUNT || !s_entity_serializers[type]) {
            ESP_LOGW(TAG, "Unsupported entity type %d, skipping", type);
            continue;
        }
        if (s_entity_serializers[type](enc, ptr) < 0) {
            ESP_LOGE(TAG, "Failed to serialize entity %d (type %d)", i, type);
            return -1;
        }
    }
    return 0;
}

#define RSSI_NA 0x7FFF

/**
 * Encode device info keys 1–7 only (device_name, device_type, manufacturer, model, sw_version, hw_version, mac_address).
 * Used by both register info (keys 1–7 only) and full device+network (keys 1–7 then key 8).
 */
static int encode_device_info_keys_1_7(cbor_encoder_t *enc, const device_model_t *device)
{
    if (cbor_encode_uint(enc, CBOR_K_DEVICE_NAME) < 0) return -1;
    if (cbor_encode_text_string(enc, device->info.device_name) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_DEVICE_TYPE) < 0) return -1;
    if (cbor_encode_uint(enc, device->info.device_type) < 0) return -1;

    if (device->info.manufacturer[0] != '\0') {
        if (cbor_encode_uint(enc, CBOR_K_MANUFACTURER) < 0) return -1;
        if (cbor_encode_text_string(enc, device->info.manufacturer) < 0) return -1;
    }

    if (device->info.model[0] != '\0') {
        if (cbor_encode_uint(enc, CBOR_K_MODEL) < 0) return -1;
        if (cbor_encode_text_string(enc, device->info.model) < 0) return -1;
    }

    if (cbor_encode_uint(enc, CBOR_K_SW_VERSION) < 0) return -1;
    if (cbor_encode_uint(enc, device->info.sw_version) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_HW_VERSION) < 0) return -1;
    if (cbor_encode_uint(enc, device->info.hw_version) < 0) return -1;

    if (device->info.mac_address != 0) {
        if (cbor_encode_uint(enc, CBOR_K_MAC_ADDRESS) < 0) return -1;
        if (cbor_encode_uint(enc, device->info.mac_address) < 0) return -1;
    }

    return 0;
}

/**
 * Helper: encode device info + network (keys 1–8, device by mac) into existing encoder.
 * Caller must have started the main map and will close it.
 * Returns 0 on success, -1 on error.
 */
static int encode_device_and_network(cbor_encoder_t *enc,
                                    const device_model_t *device,
                                    uint16_t rloc16,
                                    const char *ml_eid_str,
                                    uint16_t parent_rloc16,
                                    int16_t rssi_dbm,
                                    int16_t link_quality)
{
    if (encode_device_info_keys_1_7(enc, device) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_NETWORK) < 0) return -1;
    if (cbor_start_indefinite_map(enc) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_NET_RLOC16) < 0) return -1;
    uint16_t net_rloc16 = (device->rloc16 != 0) ? device->rloc16 : rloc16;
    if (cbor_encode_uint(enc, net_rloc16) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_NET_ROLE) < 0) return -1;
    if (cbor_encode_uint(enc, device->role) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_NET_IPV6) < 0) return -1;
    const uint8_t *ipv6_addr = device->ipv6_addr;
    bool ipv6_is_zero = true;
    for (int i = 0; i < 16; i++) {
        if (device->ipv6_addr[i] != 0) {
            ipv6_is_zero = false;
            break;
        }
    }
    if (ipv6_is_zero && ml_eid_str) {
        ipv6_addr = NULL;
    }
    if (ipv6_addr) {
        if (cbor_encode_byte_string(enc, ipv6_addr, 16) < 0) return -1;
    } else {
        uint8_t ipv6_placeholder[16] = {0};
        if (cbor_encode_byte_string(enc, ipv6_placeholder, 16) < 0) return -1;
    }

    /* parent_rloc16: always send (0 when not child) */
    if (cbor_encode_uint(enc, CBOR_K_NET_PARENT) < 0) return -1;
    if (cbor_encode_uint(enc, parent_rloc16) < 0) return -1;

    if (rssi_dbm != RSSI_NA) {
        if (cbor_encode_uint(enc, CBOR_K_NET_RSSI) < 0) return -1;
        if (cbor_encode_int(enc, (int64_t)rssi_dbm) < 0) return -1;
    }
    if (link_quality >= 0 && link_quality <= 255) {
        if (cbor_encode_uint(enc, CBOR_K_NET_LINK_QUALITY) < 0) return -1;
        if (cbor_encode_uint(enc, (uint32_t)link_quality) < 0) return -1;
    }

    if (cbor_end_indefinite_map(enc) < 0) return -1;
    return 0;
}

/**
 * Encode device info only (keys 1–7). No device_id (key 0); device identified by mac_address (7). No network (key 8). No entities.
 * For POST /device/register/info (backend contract).
 */
static int encode_device_only(cbor_encoder_t *enc, const device_model_t *device)
{
    return encode_device_info_keys_1_7(enc, device);
}

/**
 * Serialize device info only (keys 1–7) to CBOR. No network, no entities. Device identified by mac_address (7).
 * For POST /device/register/info (backend contract).
 */
int entity_serialize_register_info_cbor(uint8_t *buffer, size_t buffer_size)
{
    if (!buffer || buffer_size == 0) {
        ESP_LOGE(TAG, "Invalid buffer");
        return -1;
    }

    device_model_t *device = device_model_get();
    if (!device) {
        ESP_LOGE(TAG, "Device Model not initialized");
        return -1;
    }

    cbor_encoder_t enc = {
        .buffer = buffer,
        .buffer_size = buffer_size,
        .pos = 0
    };

    if (cbor_start_indefinite_map(&enc) < 0) return -1;
    if (encode_device_only(&enc, device) < 0) return -1;
    if (cbor_end_indefinite_map(&enc) < 0) return -1;

    ESP_LOGD(TAG, "Register info CBOR encoded %zu bytes (keys 1-7)", enc.pos);
    return (int)enc.pos;
}

/**
 * Serialize device + network only (keys 1–8) to CBOR. No entities.
 * For legacy / full register; topology sent separately via update/topology.
 */
int entity_serialize_device_cbor(uint16_t rloc16, const char *ml_eid_str,
                                 uint16_t parent_rloc16,
                                 int16_t rssi_dbm,
                                 int16_t link_quality,
                                 uint8_t *buffer, size_t buffer_size)
{
    if (!buffer || buffer_size == 0) {
        ESP_LOGE(TAG, "Invalid buffer");
        return -1;
    }

    device_model_t *device = device_model_get();
    if (!device) {
        ESP_LOGE(TAG, "Device Model not initialized");
        return -1;
    }

    cbor_encoder_t enc = {
        .buffer = buffer,
        .buffer_size = buffer_size,
        .pos = 0
    };

    if (cbor_start_indefinite_map(&enc) < 0) return -1;
    if (encode_device_and_network(&enc, device, rloc16, ml_eid_str, parent_rloc16, rssi_dbm, link_quality) < 0) return -1;
    if (cbor_end_indefinite_map(&enc) < 0) return -1;

    ESP_LOGD(TAG, "Device CBOR encoded %zu bytes", enc.pos);
    return (int)enc.pos;
}

/**
 * Internal: encode map with mac_address (key 7) + entities array (key 9).
 * Used by entity_serialize_entities_cbor and entity_serialize_updates_cbor.
 */
static int serialize_mac_and_entities(uint8_t *buffer, size_t buffer_size, const char *log_tag)
{
    if (!buffer || buffer_size == 0) {
        ESP_LOGE(TAG, "Invalid buffer");
        return -1;
    }

    device_model_t *device = device_model_get();
    if (!device) {
        ESP_LOGE(TAG, "Device Model not initialized");
        return -1;
    }

    if (device_model_sync_entities() < 0) {
        ESP_LOGW(TAG, "Failed to sync entities, continuing anyway");
    }

    cbor_encoder_t enc = {
        .buffer = buffer,
        .buffer_size = buffer_size,
        .pos = 0
    };

    if (cbor_start_indefinite_map(&enc) < 0) return -1;

    if (device->info.mac_address != 0) {
        if (cbor_encode_uint(&enc, CBOR_K_MAC_ADDRESS) < 0) return -1;
        if (cbor_encode_uint(&enc, device->info.mac_address) < 0) return -1;
    }

    if (cbor_encode_uint(&enc, CBOR_K_ENTITIES) < 0) return -1;
    if (cbor_start_indefinite_array(&enc) < 0) return -1;

    if (serialize_all_entities(&enc) < 0) return -1;

    if (cbor_end_indefinite_array(&enc) < 0) return -1;
    if (cbor_end_indefinite_map(&enc) < 0) return -1;

    ESP_LOGD(TAG, "%s CBOR encoded %zu bytes", log_tag, enc.pos);
    return (int)enc.pos;
}

/**
 * Serialize entities only to CBOR: map with mac_address (key 7) + entities array (key 9).
 * For POST /device/register/entity (backend contract).
 */
int entity_serialize_entities_cbor(uint8_t *buffer, size_t buffer_size)
{
    return serialize_mac_and_entities(buffer, buffer_size, "Entities");
}

/**
 * Serialize device model to CBOR format (full: device + network + entities).
 *
 * CBOR structure (numeric map keys, see cbor_register_keys.h):
 * {
 *   1: string,   // device_name
 *   ...
 *   7: uint,    // mac_address (device identifier)
 *   8: { network },
 *   9: [ entity maps... ]
 * }
 */
int entity_serialize_cbor(uint16_t rloc16, const char *ml_eid_str,
                         uint16_t parent_rloc16,
                         uint8_t *buffer, size_t buffer_size)
{
    if (!buffer || buffer_size == 0) {
        ESP_LOGE(TAG, "Invalid buffer");
        return -1;
    }

    cbor_encoder_t enc = {
        .buffer = buffer,
        .buffer_size = buffer_size,
        .pos = 0
    };

    if (cbor_start_indefinite_map(&enc) < 0) {
        ESP_LOGE(TAG, "Failed to start main map");
        return -1;
    }

    device_model_t *device = device_model_get();
    if (!device) {
        ESP_LOGE(TAG, "Device Model not initialized, call device_model_init() first");
        return -1;
    }

    if (device_model_sync_entities() < 0) {
        ESP_LOGW(TAG, "Failed to sync entities, continuing anyway");
    }

    if (encode_device_and_network(&enc, device, rloc16, ml_eid_str, parent_rloc16, RSSI_NA, -1) < 0) return -1;

    if (cbor_encode_uint(&enc, CBOR_K_ENTITIES) < 0) return -1;
    if (cbor_start_indefinite_array(&enc) < 0) return -1;

    if (serialize_all_entities(&enc) < 0) return -1;

    if (cbor_end_indefinite_array(&enc) < 0) return -1;

    // End main map
    if (cbor_end_indefinite_map(&enc) < 0) return -1;

    ESP_LOGI(TAG, "CBOR encoded %zu bytes", enc.pos);
    return (int)enc.pos;
}

/**
 * Serialize current entity state to CBOR (for POST /device/update/state).
 * Same structure as register/entity: map with mac_address (7) + entities array (9).
 */
int entity_serialize_updates_cbor(uint8_t *buffer, size_t buffer_size)
{
    return serialize_mac_and_entities(buffer, buffer_size, "Update state");
}
