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
#include "cbor_register_keys.h"
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
 * Encode signed integer (for RSSI dBm etc.)
 */
static int cbor_encode_int(cbor_encoder_t *enc, int64_t value)
{
    if (value >= 0) {
        return cbor_encode_type_length(enc, CBOR_MT_UNSIGNED_INT, (uint64_t)value);
    }
    return cbor_encode_type_length(enc, CBOR_MT_NEGATIVE_INT, (uint64_t)(-1 - value));
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
    if (cbor_encode_uint(enc, CBOR_K_ENT_ENTITY_ID) < 0) return -1;
    if (cbor_encode_text_string(enc, light->base.entity_id) < 0) return -1;
    
    if (cbor_encode_uint(enc, CBOR_K_ENT_NAME) < 0) return -1;
    if (cbor_encode_text_string(enc, light->base.name) < 0) return -1;
    
    if (cbor_encode_uint(enc, CBOR_K_ENT_TYPE) < 0) return -1;
    if (cbor_encode_uint(enc, (uint32_t)ENTITY_TYPE_LIGHT) < 0) return -1;
    
    if (cbor_encode_uint(enc, CBOR_K_ENT_DEVICE_CLASS) < 0) return -1;
    if (cbor_encode_uint(enc, (uint32_t)light->mode) < 0) return -1;
    
    if (cbor_encode_uint(enc, CBOR_K_ENT_AVAILABLE) < 0) return -1;
    if (cbor_encode_bool(enc, light->base.available) < 0) return -1;
    
    if (cbor_encode_uint(enc, CBOR_K_ENT_LAST_UPDATE) < 0) return -1;
    if (cbor_encode_uint(enc, light->base.last_update) < 0) return -1;
    
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
    
    // restore_mode (key 13) for backend register/entity; default 0
    if (cbor_encode_uint(enc, CBOR_K_ENT_RESTORE_MODE) < 0) return -1;
    if (cbor_encode_uint(enc, 0) < 0) return -1;
    
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
    if (cbor_encode_uint(enc, CBOR_K_ENT_ENTITY_ID) < 0) return -1;
    if (cbor_encode_text_string(enc, sensor->base.entity_id) < 0) return -1;
    
    if (cbor_encode_uint(enc, CBOR_K_ENT_NAME) < 0) return -1;
    if (cbor_encode_text_string(enc, sensor->base.name) < 0) return -1;
    
    if (cbor_encode_uint(enc, CBOR_K_ENT_TYPE) < 0) return -1;
    if (cbor_encode_uint(enc, (uint32_t)ENTITY_TYPE_SENSOR) < 0) return -1;
    
    if (cbor_encode_uint(enc, CBOR_K_ENT_DEVICE_CLASS) < 0) return -1;
    if (cbor_encode_uint(enc, (uint32_t)sensor->sensor_class) < 0) return -1;
    
    if (cbor_encode_uint(enc, CBOR_K_ENT_AVAILABLE) < 0) return -1;
    if (cbor_encode_bool(enc, sensor->base.available) < 0) return -1;
    
    if (cbor_encode_uint(enc, CBOR_K_ENT_LAST_UPDATE) < 0) return -1;
    if (cbor_encode_uint(enc, sensor->base.last_update) < 0) return -1;
    
    // Sensor-specific fields
    if (cbor_encode_uint(enc, CBOR_K_ENT_VALUE) < 0) return -1;
    if (cbor_encode_float(enc, sensor->value) < 0) return -1;
    
    if (cbor_encode_uint(enc, CBOR_K_ENT_UNIT) < 0) return -1;
    if (cbor_encode_text_string(enc, sensor->unit) < 0) return -1;
    
    // restore_mode (key 13) for backend register/entity; default 0
    if (cbor_encode_uint(enc, CBOR_K_ENT_RESTORE_MODE) < 0) return -1;
    if (cbor_encode_uint(enc, 0) < 0) return -1;
    
    // End map
    if (cbor_end_indefinite_map(enc) < 0) return -1;
    
    return 0;
}

/**
 * Helper: encode device info + network (keys 1–8, device by mac) into existing encoder.
 * Caller must have started the main map and will close it.
 * Returns 0 on success, -1 on error.
 */
#define RSSI_NA 0x7FFF
static int encode_device_and_network(cbor_encoder_t *enc,
                                    const device_model_t *device,
                                    uint16_t rloc16,
                                    const char *ml_eid_str,
                                    uint16_t parent_rloc16,
                                    int16_t rssi_dbm,
                                    int16_t link_quality)
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
 * Serialize entities only to CBOR: map with mac_address (key 7) + entities array (key 9).
 * For POST /device/register/entity (backend contract).
 */
int entity_serialize_entities_cbor(uint8_t *buffer, size_t buffer_size)
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
            default:
                ESP_LOGW(TAG, "Unsupported entity type %d, skipping", type_enum);
                break;
        }
    }

    if (cbor_end_indefinite_array(&enc) < 0) return -1;
    if (cbor_end_indefinite_map(&enc) < 0) return -1;

    ESP_LOGD(TAG, "Entities CBOR encoded %zu bytes", enc.pos);
    return (int)enc.pos;
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
    
    // Entities array
    if (cbor_encode_uint(&enc, CBOR_K_ENTITIES) < 0) return -1;
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
 * Serialize current entity state to CBOR (for POST /device/update/state).
 * Same structure as register/entity: map with mac_address (7) + entities array (9).
 */
int entity_serialize_updates_cbor(uint8_t *buffer, size_t buffer_size)
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

    int entity_count = entity_get_count();
    for (int i = 0; i < entity_count; i++) {
        entity_type_t type_enum;
        void *entity_ptr = entity_get_by_index(i, &type_enum);
        if (!entity_ptr) continue;

        switch (type_enum) {
            case ENTITY_TYPE_LIGHT: {
                entity_light_t *light = (entity_light_t *)entity_ptr;
                if (serialize_light_entity(&enc, light) < 0) return -1;
                break;
            }
            case ENTITY_TYPE_SENSOR: {
                entity_sensor_t *sensor = (entity_sensor_t *)entity_ptr;
                if (serialize_sensor_entity(&enc, sensor) < 0) return -1;
                break;
            }
            default:
                break;
        }
    }

    if (cbor_end_indefinite_array(&enc) < 0) return -1;
    if (cbor_end_indefinite_map(&enc) < 0) return -1;

    ESP_LOGD(TAG, "Update state CBOR encoded %zu bytes", enc.pos);
    return (int)enc.pos;
}
