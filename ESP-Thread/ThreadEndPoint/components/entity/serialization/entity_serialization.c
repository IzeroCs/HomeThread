/*
 * Entity Serialization - Self-implemented CBOR encoder.
 * 
 * Implements minimal CBOR encoding following RFC 7049.
 * No external library dependencies - lightweight implementation for embedded systems.
 * 
 * Supported CBOR types:
 * - Text strings (major type 3)
 * - Unsigned integers (major type 0)
 * - Boolean (major type 7, simple value 20/21)
 * - Arrays (major type 4)
 * - Maps (major type 5)
 * - Byte strings (major type 2, for IPv6 addresses)
 */
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include "esp_log.h"
#include "entity_serialization.h"
#include "device_model.h"
#include "entity_model.h"
#include "entity_light.h"
#include "entity_sensor.h"

static const char *TAG = "entity_serialize";

// CBOR Major Types (RFC 7049)
#define CBOR_MT_UNSIGNED_INT  0  // 0xxx xxxx
#define CBOR_MT_NEGATIVE_INT  1  // 1xxx xxxx
#define CBOR_MT_BYTE_STRING   2  // 2xxx xxxx
#define CBOR_MT_TEXT_STRING   3  // 3xxx xxxx
#define CBOR_MT_ARRAY         4  // 4xxx xxxx
#define CBOR_MT_MAP           5  // 5xxx xxxx
#define CBOR_MT_TAG           6  // 6xxx xxxx
#define CBOR_MT_SIMPLE        7  // 7xxx xxxx

// CBOR Additional Information
#define CBOR_AI_ONE_BYTE      24
#define CBOR_AI_TWO_BYTES     25
#define CBOR_AI_FOUR_BYTES    26
#define CBOR_AI_EIGHT_BYTES   27
#define CBOR_AI_INDEFINITE    31

// CBOR Simple Values
#define CBOR_FALSE            20  // 0xf4
#define CBOR_TRUE             21  // 0xf5
#define CBOR_NULL             22  // 0xf6
#define CBOR_BREAK            31  // 0xff (end of indefinite-length item)

/**
 * CBOR Encoder Context
 * Tracks current position in output buffer
 */
typedef struct {
    uint8_t *buffer;
    size_t buffer_size;
    size_t pos;  // Current write position
} cbor_encoder_t;

/**
 * Write a single byte to buffer
 */
static inline int cbor_write_byte(cbor_encoder_t *enc, uint8_t byte)
{
    if (enc->pos >= enc->buffer_size) {
        ESP_LOGE(TAG, "Buffer overflow at pos %zu", enc->pos);
        return -1;
    }
    enc->buffer[enc->pos++] = byte;
    return 0;
}

/**
 * Write multiple bytes to buffer
 */
static inline int cbor_write_bytes(cbor_encoder_t *enc, const uint8_t *data, size_t len)
{
    if (enc->pos + len > enc->buffer_size) {
        ESP_LOGE(TAG, "Buffer overflow: pos=%zu, len=%zu, size=%zu", enc->pos, len, enc->buffer_size);
        return -1;
    }
    memcpy(&enc->buffer[enc->pos], data, len);
    enc->pos += len;
    return 0;
}

/**
 * Encode type and length (RFC 7049 Section 3)
 */
static int cbor_encode_type_length(cbor_encoder_t *enc, uint8_t major_type, uint64_t length)
{
    uint8_t byte = (major_type << 5);
    
    if (length < 24) {
        byte |= (uint8_t)length;
        return cbor_write_byte(enc, byte);
    } else if (length <= UINT8_MAX) {
        byte |= CBOR_AI_ONE_BYTE;
        if (cbor_write_byte(enc, byte) < 0) return -1;
        return cbor_write_byte(enc, (uint8_t)length);
    } else if (length <= UINT16_MAX) {
        byte |= CBOR_AI_TWO_BYTES;
        if (cbor_write_byte(enc, byte) < 0) return -1;
        uint8_t bytes[2] = {(uint8_t)(length >> 8), (uint8_t)(length & 0xFF)};
        return cbor_write_bytes(enc, bytes, 2);
    } else if (length <= UINT32_MAX) {
        byte |= CBOR_AI_FOUR_BYTES;
        if (cbor_write_byte(enc, byte) < 0) return -1;
        uint8_t bytes[4] = {
            (uint8_t)(length >> 24),
            (uint8_t)((length >> 16) & 0xFF),
            (uint8_t)((length >> 8) & 0xFF),
            (uint8_t)(length & 0xFF)
        };
        return cbor_write_bytes(enc, bytes, 4);
    } else {
        byte |= CBOR_AI_EIGHT_BYTES;
        if (cbor_write_byte(enc, byte) < 0) return -1;
        uint8_t bytes[8] = {
            (uint8_t)(length >> 56),
            (uint8_t)((length >> 48) & 0xFF),
            (uint8_t)((length >> 40) & 0xFF),
            (uint8_t)((length >> 32) & 0xFF),
            (uint8_t)((length >> 24) & 0xFF),
            (uint8_t)((length >> 16) & 0xFF),
            (uint8_t)((length >> 8) & 0xFF),
            (uint8_t)(length & 0xFF)
        };
        return cbor_write_bytes(enc, bytes, 8);
    }
}

/**
 * Encode unsigned integer
 */
static int cbor_encode_uint(cbor_encoder_t *enc, uint64_t value)
{
    return cbor_encode_type_length(enc, CBOR_MT_UNSIGNED_INT, value);
}

/**
 * Encode text string
 */
static int cbor_encode_text_string(cbor_encoder_t *enc, const char *str)
{
    size_t len = strlen(str);
    if (cbor_encode_type_length(enc, CBOR_MT_TEXT_STRING, len) < 0) return -1;
    return cbor_write_bytes(enc, (const uint8_t *)str, len);
}

/**
 * Encode boolean
 */
static int cbor_encode_bool(cbor_encoder_t *enc, bool value)
{
    uint8_t byte = (CBOR_MT_SIMPLE << 5) | (value ? CBOR_TRUE : CBOR_FALSE);
    return cbor_write_byte(enc, byte);
}

/**
 * Encode byte string
 */
static int cbor_encode_byte_string(cbor_encoder_t *enc, const uint8_t *data, size_t len)
{
    if (cbor_encode_type_length(enc, CBOR_MT_BYTE_STRING, len) < 0) return -1;
    return cbor_write_bytes(enc, data, len);
}

/**
 * Start indefinite-length array
 */
static int cbor_start_indefinite_array(cbor_encoder_t *enc)
{
    uint8_t byte = (CBOR_MT_ARRAY << 5) | CBOR_AI_INDEFINITE;
    return cbor_write_byte(enc, byte);
}

/**
 * Start definite-length array
 */
static int cbor_start_array(cbor_encoder_t *enc, size_t count)
{
    return cbor_encode_type_length(enc, CBOR_MT_ARRAY, count);
}

/**
 * End indefinite-length array (write BREAK)
 */
static int cbor_end_indefinite_array(cbor_encoder_t *enc)
{
    uint8_t byte = (CBOR_MT_SIMPLE << 5) | CBOR_BREAK;
    return cbor_write_byte(enc, byte);
}

/**
 * Start indefinite-length map
 */
static int cbor_start_indefinite_map(cbor_encoder_t *enc)
{
    uint8_t byte = (CBOR_MT_MAP << 5) | CBOR_AI_INDEFINITE;
    return cbor_write_byte(enc, byte);
}

/**
 * Start definite-length map
 */
static int cbor_start_map(cbor_encoder_t *enc, size_t count)
{
    return cbor_encode_type_length(enc, CBOR_MT_MAP, count);
}

/**
 * End indefinite-length map (write BREAK)
 */
static int cbor_end_indefinite_map(cbor_encoder_t *enc)
{
    uint8_t byte = (CBOR_MT_SIMPLE << 5) | CBOR_BREAK;
    return cbor_write_byte(enc, byte);
}

/**
 * Encode float (IEEE 754 half-precision, single-precision, or double-precision)
 * For simplicity, we'll encode as single-precision float (major type 7, additional info 26)
 */
static int cbor_encode_float(cbor_encoder_t *enc, float value)
{
    // CBOR float: major type 7, additional info 26 (single-precision)
    uint8_t byte = (CBOR_MT_SIMPLE << 5) | CBOR_AI_FOUR_BYTES;
    if (cbor_write_byte(enc, byte) < 0) return -1;
    
    // Convert float to IEEE 754 single-precision bytes
    union {
        float f;
        uint32_t u;
    } converter;
    converter.f = value;
    
    uint8_t bytes[4] = {
        (uint8_t)((converter.u >> 24) & 0xFF),
        (uint8_t)((converter.u >> 16) & 0xFF),
        (uint8_t)((converter.u >> 8) & 0xFF),
        (uint8_t)(converter.u & 0xFF)
    };
    return cbor_write_bytes(enc, bytes, 4);
}

/**
 * Serialize entity_light_t to CBOR
 */
static int serialize_light_entity(cbor_encoder_t *enc, const entity_light_t *light)
{
    // Start map (indefinite length for flexibility)
    if (cbor_start_indefinite_map(enc) < 0) return -1;
    
    // Base fields
    if (cbor_encode_text_string(enc, "entity_id") < 0) return -1;
    if (cbor_encode_text_string(enc, light->base.entity_id) < 0) return -1;
    
    if (cbor_encode_text_string(enc, "name") < 0) return -1;
    if (cbor_encode_text_string(enc, light->base.name) < 0) return -1;
    
    if (cbor_encode_text_string(enc, "type") < 0) return -1;
    if (cbor_encode_text_string(enc, "light") < 0) return -1;
    
    if (cbor_encode_text_string(enc, "device_class") < 0) return -1;
    if (cbor_encode_text_string(enc, light->base.device_class) < 0) return -1;
    
    if (cbor_encode_text_string(enc, "available") < 0) return -1;
    if (cbor_encode_bool(enc, light->base.available) < 0) return -1;
    
    if (cbor_encode_text_string(enc, "last_update") < 0) return -1;
    if (cbor_encode_uint(enc, light->base.last_update) < 0) return -1;
    
    // Light-specific fields
    if (cbor_encode_text_string(enc, "state") < 0) return -1;
    if (cbor_encode_bool(enc, light->state) < 0) return -1;
    
    if (cbor_encode_text_string(enc, "brightness") < 0) return -1;
    if (cbor_encode_uint(enc, light->brightness) < 0) return -1;
    
    if (cbor_encode_text_string(enc, "mode") < 0) return -1;
    const char *mode_str = "on_off";
    switch (light->mode) {
        case LIGHT_MODE_DIMMABLE: mode_str = "dimmable"; break;
        case LIGHT_MODE_RGB: mode_str = "rgb"; break;
        case LIGHT_MODE_RGBW: mode_str = "rgbw"; break;
        case LIGHT_MODE_CCT: mode_str = "cct"; break;
        default: break;
    }
    if (cbor_encode_text_string(enc, mode_str) < 0) return -1;
    
    // RGB array (if RGB or RGBW mode)
    if (light->mode == LIGHT_MODE_RGB || light->mode == LIGHT_MODE_RGBW) {
        if (cbor_encode_text_string(enc, "rgb") < 0) return -1;
        if (cbor_start_array(enc, 3) < 0) return -1;
        if (cbor_encode_uint(enc, light->rgb[0]) < 0) return -1;
        if (cbor_encode_uint(enc, light->rgb[1]) < 0) return -1;
        if (cbor_encode_uint(enc, light->rgb[2]) < 0) return -1;
    }
    
    // Color temperature (if CCT mode)
    if (light->mode == LIGHT_MODE_CCT) {
        if (cbor_encode_text_string(enc, "color_temp") < 0) return -1;
        if (cbor_encode_uint(enc, light->color_temp) < 0) return -1;
    }
    
    // End map
    if (cbor_end_indefinite_map(enc) < 0) return -1;
    
    return 0;
}

/**
 * Serialize entity_sensor_t to CBOR
 */
static int serialize_sensor_entity(cbor_encoder_t *enc, const entity_sensor_t *sensor)
{
    // Start map (indefinite length)
    if (cbor_start_indefinite_map(enc) < 0) return -1;
    
    // Base fields
    if (cbor_encode_text_string(enc, "entity_id") < 0) return -1;
    if (cbor_encode_text_string(enc, sensor->base.entity_id) < 0) return -1;
    
    if (cbor_encode_text_string(enc, "name") < 0) return -1;
    if (cbor_encode_text_string(enc, sensor->base.name) < 0) return -1;
    
    if (cbor_encode_text_string(enc, "type") < 0) return -1;
    if (cbor_encode_text_string(enc, "sensor") < 0) return -1;
    
    if (cbor_encode_text_string(enc, "device_class") < 0) return -1;
    if (cbor_encode_text_string(enc, sensor->base.device_class) < 0) return -1;
    
    if (cbor_encode_text_string(enc, "available") < 0) return -1;
    if (cbor_encode_bool(enc, sensor->base.available) < 0) return -1;
    
    if (cbor_encode_text_string(enc, "last_update") < 0) return -1;
    if (cbor_encode_uint(enc, sensor->base.last_update) < 0) return -1;
    
    // Sensor-specific fields
    if (cbor_encode_text_string(enc, "value") < 0) return -1;
    if (cbor_encode_float(enc, sensor->value) < 0) return -1;
    
    if (cbor_encode_text_string(enc, "unit") < 0) return -1;
    if (cbor_encode_text_string(enc, sensor->unit) < 0) return -1;
    
    // End map
    if (cbor_end_indefinite_map(enc) < 0) return -1;
    
    return 0;
}

/**
 * Serialize device model to CBOR format.
 * 
 * CBOR structure:
 * {
 *   "device_id": string,
 *   "device_name": string,
 *   "device_type": string,
 *   "manufacturer": string,
 *   "model": string,
 *   "sw_version": string,
 *   "hw_version": string,
 *   "mac_address": uint64,
 *   "network": {
 *     "rloc16": uint16,
 *     "role": string,
 *     "ipv6_addr": bytes(16)
 *   },
 *   "entities": [
 *     { entity objects... }
 *   ]
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

    // Start main map (indefinite length for flexibility)
    if (cbor_start_indefinite_map(&enc) < 0) {
        ESP_LOGE(TAG, "Failed to start main map");
        return -1;
    }

    // Get device model from Device Model Manager
    device_model_t *device = device_model_get();
    if (!device) {
        ESP_LOGE(TAG, "Device Model not initialized, call device_model_init() first");
        return -1;
    }
    
    // Sync entities from Entity Model to Device Model
    if (device_model_sync_entities() < 0) {
        ESP_LOGW(TAG, "Failed to sync entities, continuing anyway");
    }
    
    // Device info fields (from Device Model)
    if (cbor_encode_text_string(&enc, "device_id") < 0) return -1;
    if (cbor_encode_text_string(&enc, device->info.device_id) < 0) return -1;
    
    if (cbor_encode_text_string(&enc, "device_name") < 0) return -1;
    if (cbor_encode_text_string(&enc, device->info.device_name) < 0) return -1;
    
    if (cbor_encode_text_string(&enc, "device_type") < 0) return -1;
    if (cbor_encode_text_string(&enc, device->info.device_type) < 0) return -1;
    
    if (device->info.manufacturer[0] != '\0') {
        if (cbor_encode_text_string(&enc, "manufacturer") < 0) return -1;
        if (cbor_encode_text_string(&enc, device->info.manufacturer) < 0) return -1;
    }
    
    if (device->info.model[0] != '\0') {
        if (cbor_encode_text_string(&enc, "model") < 0) return -1;
        if (cbor_encode_text_string(&enc, device->info.model) < 0) return -1;
    }
    
    if (device->info.sw_version[0] != '\0') {
        if (cbor_encode_text_string(&enc, "sw_version") < 0) return -1;
        if (cbor_encode_text_string(&enc, device->info.sw_version) < 0) return -1;
    }
    
    if (device->info.hw_version[0] != '\0') {
        if (cbor_encode_text_string(&enc, "hw_version") < 0) return -1;
        if (cbor_encode_text_string(&enc, device->info.hw_version) < 0) return -1;
    }
    
    if (device->info.mac_address != 0) {
        if (cbor_encode_text_string(&enc, "mac_address") < 0) return -1;
        if (cbor_encode_uint(&enc, device->info.mac_address) < 0) return -1;
    }
    
    // Network info (from Device Model, fallback to parameters if not set)
    if (cbor_encode_text_string(&enc, "network") < 0) return -1;
    if (cbor_start_indefinite_map(&enc) < 0) return -1;
    
    if (cbor_encode_text_string(&enc, "rloc16") < 0) return -1;
    uint16_t net_rloc16 = (device->rloc16 != 0) ? device->rloc16 : rloc16;
    if (cbor_encode_uint(&enc, net_rloc16) < 0) return -1;
    
    if (cbor_encode_text_string(&enc, "role") < 0) return -1;
    const char *role_str = "unknown";
    switch (device->role) {
        case 0: role_str = "child"; break;
        case 1: role_str = "leader"; break;
        case 2: role_str = "router"; break;
        default: break;
    }
    if (cbor_encode_text_string(&enc, role_str) < 0) return -1;
    
    if (cbor_encode_text_string(&enc, "ipv6_addr") < 0) return -1;
    // Use device_model ipv6_addr if set, otherwise try to parse ml_eid_str
    const uint8_t *ipv6_addr = device->ipv6_addr;
    bool ipv6_is_zero = true;
    for (int i = 0; i < 16; i++) {
        if (device->ipv6_addr[i] != 0) {
            ipv6_is_zero = false;
            break;
        }
    }
    if (ipv6_is_zero && ml_eid_str) {
        // TODO: Parse ml_eid_str to bytes if needed
        // For now, use placeholder
        ipv6_addr = NULL;
    }
    if (ipv6_addr) {
        if (cbor_encode_byte_string(&enc, ipv6_addr, 16) < 0) return -1;
    } else {
        uint8_t ipv6_placeholder[16] = {0};
        if (cbor_encode_byte_string(&enc, ipv6_placeholder, 16) < 0) return -1;
    }
    
    // Parent RLOC16 (from parameters, not stored in device_model yet)
    if (parent_rloc16 != 0) {
        if (cbor_encode_text_string(&enc, "parent") < 0) return -1;
        if (cbor_encode_uint(&enc, parent_rloc16) < 0) return -1;
    }
    
    if (cbor_end_indefinite_map(&enc) < 0) return -1; // End network map
    
    // Entities array
    if (cbor_encode_text_string(&enc, "entities") < 0) return -1;
    if (cbor_start_indefinite_array(&enc) < 0) return -1;
    
    // Serialize all entities
    int entity_count = entity_get_count();
    for (int i = 0; i < entity_count; i++) {
        entity_type_t type_enum;
        void *entity_ptr = entity_get_by_index(i, &type_enum);
        if (!entity_ptr) continue;
        
        switch (type_enum) {
            case ENTITY_TYPE_LIGHT: {
                entity_light_t *light = (entity_light_t *)entity_ptr;
                if (serialize_light_entity(&enc, light) < 0) {
                    ESP_LOGE(TAG, "Failed to serialize light entity %d", i);
                    return -1;
                }
                break;
            }
            case ENTITY_TYPE_SENSOR: {
                entity_sensor_t *sensor = (entity_sensor_t *)entity_ptr;
                if (serialize_sensor_entity(&enc, sensor) < 0) {
                    ESP_LOGE(TAG, "Failed to serialize sensor entity %d", i);
                    return -1;
                }
                break;
            }
            // TODO: Add other entity types (switch, fan, climate, binary_sensor)
            default:
                ESP_LOGW(TAG, "Unsupported entity type %d, skipping", type_enum);
                break;
        }
    }
    
    if (cbor_end_indefinite_array(&enc) < 0) return -1; // End entities array
    
    // End main map
    if (cbor_end_indefinite_map(&enc) < 0) return -1;
    
    ESP_LOGI(TAG, "CBOR encoded %zu bytes", enc.pos);
    return (int)enc.pos;
}

/**
 * Serialize partial entity updates to CBOR.
 * Only includes changed entity attributes.
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
