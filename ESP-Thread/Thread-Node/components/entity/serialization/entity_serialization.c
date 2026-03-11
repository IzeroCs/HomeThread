/*
 * Entity Serialization - CBOR payloads for device/entity model.
 * Uses cbor_encode for primitives; this file handles entity/device structure and keys.
 * Keys from cbor_register_keys.h (INFO, TOPOLOGY, ENTITY, STATE).
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

#define RSSI_NA 0x7FFF

typedef int (*entity_serialize_fn)(cbor_encoder_t *enc, const void *entity);

/* -------------------------------------------------------------------------
 * Entity item (ENTITY_KEYS 0–6) for POST /device/register/entity
 * ------------------------------------------------------------------------- */

static int serialize_entity_item_light(cbor_encoder_t *enc, const entity_light_t *light)
{
    const entity_base_t *base = &light->base;
    if (cbor_start_indefinite_map(enc) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_ENTITY_ITEM_ENTITY_ID) < 0) return -1;
    if (cbor_encode_text_string(enc, base->entity_id) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_ENTITY_ITEM_NAME) < 0) return -1;
    if (cbor_encode_text_string(enc, base->name) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_ENTITY_ITEM_TYPE) < 0) return -1;
    if (cbor_encode_uint(enc, (uint32_t)base->type) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_ENTITY_ITEM_DEVICE_CLASS) < 0) return -1;
    if (cbor_encode_uint(enc, (uint32_t)light->mode) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_ENTITY_ITEM_UNIT) < 0) return -1;
    if (cbor_encode_text_string(enc, "") < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_ENTITY_ITEM_RESTORE_MODE) < 0) return -1;
    if (cbor_encode_uint(enc, 0) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_ENTITY_ITEM_DISABLED) < 0) return -1;
    if (cbor_encode_uint(enc, 0) < 0) return -1;

    if (cbor_end_indefinite_map(enc) < 0) return -1;
    return 0;
}

static int serialize_entity_item_sensor(cbor_encoder_t *enc, const entity_sensor_t *sensor)
{
    const entity_base_t *base = &sensor->base;
    if (cbor_start_indefinite_map(enc) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_ENTITY_ITEM_ENTITY_ID) < 0) return -1;
    if (cbor_encode_text_string(enc, base->entity_id) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_ENTITY_ITEM_NAME) < 0) return -1;
    if (cbor_encode_text_string(enc, base->name) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_ENTITY_ITEM_TYPE) < 0) return -1;
    if (cbor_encode_uint(enc, (uint32_t)base->type) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_ENTITY_ITEM_DEVICE_CLASS) < 0) return -1;
    if (cbor_encode_uint(enc, (uint32_t)sensor->sensor_class) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_ENTITY_ITEM_UNIT) < 0) return -1;
    if (cbor_encode_text_string(enc, sensor->unit) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_ENTITY_ITEM_RESTORE_MODE) < 0) return -1;
    if (cbor_encode_uint(enc, 0) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_ENTITY_ITEM_DISABLED) < 0) return -1;
    if (cbor_encode_uint(enc, 0) < 0) return -1;

    if (cbor_end_indefinite_map(enc) < 0) return -1;
    return 0;
}

static const entity_serialize_fn s_entity_item_serializers[] = {
    [ENTITY_TYPE_LIGHT]  = (entity_serialize_fn)serialize_entity_item_light,
    [ENTITY_TYPE_SENSOR] = (entity_serialize_fn)serialize_entity_item_sensor,
};

#define ENTITY_ITEM_SERIALIZERS_COUNT (sizeof(s_entity_item_serializers) / sizeof(s_entity_item_serializers[0]))

static int serialize_all_entity_items(cbor_encoder_t *enc)
{
    int count = entity_get_count();
    for (int i = 0; i < count; i++) {
        entity_type_t type;
        void *ptr = entity_get_by_index(i, &type);
        if (!ptr) continue;
        if ((unsigned)type >= ENTITY_ITEM_SERIALIZERS_COUNT || !s_entity_item_serializers[type]) {
            ESP_LOGW(TAG, "Unsupported entity type %d for register/entity, skipping", type);
            continue;
        }
        if (s_entity_item_serializers[type](enc, ptr) < 0) {
            ESP_LOGE(TAG, "Failed to serialize entity item %d (type %d)", i, type);
            return -1;
        }
    }
    return 0;
}

/* -------------------------------------------------------------------------
 * State item (STATE_KEYS 0–6) for POST /device/update/state
 * ------------------------------------------------------------------------- */

static int serialize_state_item_light(cbor_encoder_t *enc, const entity_light_t *light)
{
    const entity_base_t *base = &light->base;
    if (cbor_start_indefinite_map(enc) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_STATE_ITEM_ENTITY_ID) < 0) return -1;
    if (cbor_encode_text_string(enc, base->entity_id) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_STATE_ITEM_STATE) < 0) return -1;
    if (cbor_encode_uint(enc, light->state ? 1 : 0) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_STATE_ITEM_BRIGHTNESS) < 0) return -1;
    if (cbor_encode_uint(enc, light->brightness) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_STATE_ITEM_MODE) < 0) return -1;
    if (cbor_encode_uint(enc, (uint32_t)light->mode) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_STATE_ITEM_RGB) < 0) return -1;
    if (cbor_start_array(enc, 3) < 0) return -1;
    if (cbor_encode_uint(enc, light->rgb[0]) < 0) return -1;
    if (cbor_encode_uint(enc, light->rgb[1]) < 0) return -1;
    if (cbor_encode_uint(enc, light->rgb[2]) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_STATE_ITEM_COLOR_TEMP) < 0) return -1;
    if (cbor_encode_uint(enc, light->color_temp) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_STATE_ITEM_VALUE) < 0) return -1;
    if (cbor_encode_uint(enc, 0) < 0) return -1;

    if (cbor_end_indefinite_map(enc) < 0) return -1;
    return 0;
}

static int serialize_state_item_sensor(cbor_encoder_t *enc, const entity_sensor_t *sensor)
{
    const entity_base_t *base = &sensor->base;
    if (cbor_start_indefinite_map(enc) < 0) return -1;

    if (cbor_encode_uint(enc, CBOR_K_STATE_ITEM_ENTITY_ID) < 0) return -1;
    if (cbor_encode_text_string(enc, base->entity_id) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_STATE_ITEM_STATE) < 0) return -1;
    if (cbor_encode_uint(enc, 0) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_STATE_ITEM_BRIGHTNESS) < 0) return -1;
    if (cbor_encode_uint(enc, 0) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_STATE_ITEM_MODE) < 0) return -1;
    if (cbor_encode_uint(enc, 0) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_STATE_ITEM_RGB) < 0) return -1;
    if (cbor_start_array(enc, 0) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_STATE_ITEM_COLOR_TEMP) < 0) return -1;
    if (cbor_encode_uint(enc, 0) < 0) return -1;
    if (cbor_encode_uint(enc, CBOR_K_STATE_ITEM_VALUE) < 0) return -1;
    if (cbor_encode_float(enc, sensor->value) < 0) return -1;

    if (cbor_end_indefinite_map(enc) < 0) return -1;
    return 0;
}

static const entity_serialize_fn s_state_item_serializers[] = {
    [ENTITY_TYPE_LIGHT]  = (entity_serialize_fn)serialize_state_item_light,
    [ENTITY_TYPE_SENSOR] = (entity_serialize_fn)serialize_state_item_sensor,
};

#define STATE_ITEM_SERIALIZERS_COUNT (sizeof(s_state_item_serializers) / sizeof(s_state_item_serializers[0]))

static int serialize_all_state_items(cbor_encoder_t *enc)
{
    int count = entity_get_count();
    for (int i = 0; i < count; i++) {
        entity_type_t type;
        void *ptr = entity_get_by_index(i, &type);
        if (!ptr) continue;
        if ((unsigned)type >= STATE_ITEM_SERIALIZERS_COUNT || !s_state_item_serializers[type]) {
            ESP_LOGW(TAG, "Unsupported entity type %d for update/state, skipping", type);
            continue;
        }
        if (s_state_item_serializers[type](enc, ptr) < 0) {
            ESP_LOGE(TAG, "Failed to serialize state item %d (type %d)", i, type);
            return -1;
        }
    }
    return 0;
}

/* -------------------------------------------------------------------------
 * entity_serialize_info_cbor — DeviceInfoPayload keys 0–6
 * ------------------------------------------------------------------------- */

int entity_serialize_info_cbor(uint8_t *buffer, size_t buffer_size)
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

    if (cbor_encode_uint(&enc, CBOR_K_INFO_MAC_ADDRESS) < 0) return -1;
    if (cbor_encode_uint(&enc, device->info.mac_address) < 0) return -1;

    if (cbor_encode_uint(&enc, CBOR_K_INFO_DEVICE_NAME) < 0) return -1;
    if (cbor_encode_text_string(&enc, device->info.device_name) < 0) return -1;

    if (cbor_encode_uint(&enc, CBOR_K_INFO_DEVICE_TYPE) < 0) return -1;
    if (cbor_encode_uint(&enc, device->info.device_type) < 0) return -1;

    if (device->info.manufacturer[0] != '\0') {
        if (cbor_encode_uint(&enc, CBOR_K_INFO_MANUFACTURER) < 0) return -1;
        if (cbor_encode_text_string(&enc, device->info.manufacturer) < 0) return -1;
    }
    if (device->info.model[0] != '\0') {
        if (cbor_encode_uint(&enc, CBOR_K_INFO_MODEL) < 0) return -1;
        if (cbor_encode_text_string(&enc, device->info.model) < 0) return -1;
    }

    if (cbor_encode_uint(&enc, CBOR_K_INFO_SW_VERSION) < 0) return -1;
    if (cbor_encode_uint(&enc, device->info.sw_version) < 0) return -1;

    if (cbor_encode_uint(&enc, CBOR_K_INFO_HW_VERSION) < 0) return -1;
    if (cbor_encode_uint(&enc, device->info.hw_version) < 0) return -1;

    if (cbor_end_indefinite_map(&enc) < 0) return -1;

    ESP_LOGD(TAG, "Register info CBOR encoded %zu bytes (keys 0-6)", enc.pos);
    return (int)enc.pos;
}

/* -------------------------------------------------------------------------
 * entity_serialize_topology_child_cbor — Child: keys 0–5 (mac, rloc16, role=0, parent, rssi, lq)
 * ------------------------------------------------------------------------- */

int entity_serialize_topology_child_cbor(uint16_t rloc16, const char *ml_eid_str,
                                         uint16_t parent_rloc16,
                                         int16_t rssi_dbm,
                                         int16_t link_quality,
                                         uint8_t *buffer, size_t buffer_size)
{
    (void)ml_eid_str;
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

    if (cbor_encode_uint(&enc, CBOR_K_TOPOLOGY_MAC_ADDRESS) < 0) return -1;
    if (cbor_encode_uint(&enc, device->info.mac_address) < 0) return -1;

    if (cbor_encode_uint(&enc, CBOR_K_TOPOLOGY_RLOC16) < 0) return -1;
    uint16_t net_rloc16 = (device->rloc16 != 0) ? device->rloc16 : rloc16;
    if (cbor_encode_uint(&enc, net_rloc16) < 0) return -1;

    if (cbor_encode_uint(&enc, CBOR_K_TOPOLOGY_ROLE) < 0) return -1;
    if (cbor_encode_uint(&enc, 0) < 0) return -1;  /* Child = 0 */

    if (cbor_encode_uint(&enc, CBOR_K_TOPOLOGY_PARENT) < 0) return -1;
    if (cbor_encode_uint(&enc, parent_rloc16) < 0) return -1;

    if (rssi_dbm != RSSI_NA) {
        if (cbor_encode_uint(&enc, CBOR_K_TOPOLOGY_RSSI) < 0) return -1;
        if (cbor_encode_int(&enc, (int64_t)rssi_dbm) < 0) return -1;
    }
    if (link_quality >= 0 && link_quality <= 255) {
        if (cbor_encode_uint(&enc, CBOR_K_TOPOLOGY_LINK_QUALITY) < 0) return -1;
        if (cbor_encode_uint(&enc, (uint32_t)link_quality) < 0) return -1;
    }

    if (cbor_end_indefinite_map(&enc) < 0) return -1;

    ESP_LOGI(TAG, "Topology Child CBOR %zu bytes, rssi_dbm=%d, link_quality=%d",
             enc.pos, (int)rssi_dbm, (int)link_quality);
    return (int)enc.pos;
}

/* -------------------------------------------------------------------------
 * entity_serialize_topology_router_leader_cbor — Router/Leader: keys 0, 1, 2, 6 (mac, rloc16, role, neighbors)
 * ------------------------------------------------------------------------- */

int entity_serialize_topology_router_leader_cbor(uint16_t rloc16, uint8_t role,
                                               const topology_neighbor_t *neighbors,
                                               size_t neighbor_count,
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

    if (cbor_encode_uint(&enc, CBOR_K_TOPOLOGY_MAC_ADDRESS) < 0) return -1;
    if (cbor_encode_uint(&enc, device->info.mac_address) < 0) return -1;

    if (cbor_encode_uint(&enc, CBOR_K_TOPOLOGY_RLOC16) < 0) return -1;
    uint16_t net_rloc16 = (device->rloc16 != 0) ? device->rloc16 : rloc16;
    if (cbor_encode_uint(&enc, net_rloc16) < 0) return -1;

    if (cbor_encode_uint(&enc, CBOR_K_TOPOLOGY_ROLE) < 0) return -1;
    if (cbor_encode_uint(&enc, role) < 0) return -1;

    if (cbor_encode_uint(&enc, CBOR_K_TOPOLOGY_NEIGHBORS) < 0) return -1;
    if (cbor_start_indefinite_array(&enc) < 0) return -1;

    for (size_t i = 0; i < neighbor_count && neighbors; i++) {
        const topology_neighbor_t *n = &neighbors[i];
        if (cbor_start_indefinite_map(&enc) < 0) return -1;

        if (cbor_encode_uint(&enc, CBOR_K_NEIGHBOR_RLOC16) < 0) return -1;
        if (cbor_encode_uint(&enc, n->rloc16) < 0) return -1;

        if (n->rssi_dbm != RSSI_NA) {
            if (cbor_encode_uint(&enc, CBOR_K_NEIGHBOR_RSSI) < 0) return -1;
            if (cbor_encode_int(&enc, (int64_t)n->rssi_dbm) < 0) return -1;
        }
        if (n->lq_in >= 0 && n->lq_in <= 255) {
            if (cbor_encode_uint(&enc, CBOR_K_NEIGHBOR_LQ_IN) < 0) return -1;
            if (cbor_encode_uint(&enc, (uint32_t)n->lq_in) < 0) return -1;
        }
        if (n->lq_out >= 0 && n->lq_out <= 255) {
            if (cbor_encode_uint(&enc, CBOR_K_NEIGHBOR_LQ_OUT) < 0) return -1;
            if (cbor_encode_uint(&enc, (uint32_t)n->lq_out) < 0) return -1;
        }
        if (cbor_encode_uint(&enc, CBOR_K_NEIGHBOR_IS_CHILD) < 0) return -1;
        if (cbor_encode_uint(&enc, n->is_child ? 1 : 0) < 0) return -1;

        if (cbor_end_indefinite_map(&enc) < 0) return -1;
    }

    if (cbor_end_indefinite_array(&enc) < 0) return -1;
    if (cbor_end_indefinite_map(&enc) < 0) return -1;

    ESP_LOGI(TAG, "Topology Router/Leader CBOR %zu bytes, role=%u, neighbors=%zu",
             enc.pos, (unsigned)role, neighbor_count);
    return (int)enc.pos;
}

/* -------------------------------------------------------------------------
 * entity_serialize_entities_cbor — key 0 = mac, key 1 = array (ENTITY_KEYS 0–6 per item)
 * ------------------------------------------------------------------------- */

static int serialize_entity_items(uint8_t *buffer, size_t buffer_size, const char *log_tag)
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
        if (cbor_encode_uint(&enc, CBOR_K_ENTITY_MAC) < 0) return -1;
        if (cbor_encode_uint(&enc, device->info.mac_address) < 0) return -1;
    }

    if (cbor_encode_uint(&enc, CBOR_K_ENTITY_ARRAY) < 0) return -1;
    if (cbor_start_indefinite_array(&enc) < 0) return -1;

    if (serialize_all_entity_items(&enc) < 0) return -1;

    if (cbor_end_indefinite_array(&enc) < 0) return -1;
    if (cbor_end_indefinite_map(&enc) < 0) return -1;

    ESP_LOGD(TAG, "%s CBOR encoded %zu bytes", log_tag, enc.pos);
    return (int)enc.pos;
}

int entity_serialize_entities_cbor(uint8_t *buffer, size_t buffer_size)
{
    return serialize_entity_items(buffer, buffer_size, "Entities");
}

/* -------------------------------------------------------------------------
 * entity_serialize_state_cbor — key 0 = mac, key 1 = array (STATE_KEYS 0–6 per item)
 * ------------------------------------------------------------------------- */

int entity_serialize_state_cbor(uint8_t *buffer, size_t buffer_size)
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
        if (cbor_encode_uint(&enc, CBOR_K_STATE_MAC) < 0) return -1;
        if (cbor_encode_uint(&enc, device->info.mac_address) < 0) return -1;
    }

    if (cbor_encode_uint(&enc, CBOR_K_STATE_ARRAY) < 0) return -1;
    if (cbor_start_indefinite_array(&enc) < 0) return -1;

    if (serialize_all_state_items(&enc) < 0) return -1;

    if (cbor_end_indefinite_array(&enc) < 0) return -1;
    if (cbor_end_indefinite_map(&enc) < 0) return -1;

    ESP_LOGD(TAG, "Update state CBOR encoded %zu bytes", enc.pos);
    return (int)enc.pos;
}
