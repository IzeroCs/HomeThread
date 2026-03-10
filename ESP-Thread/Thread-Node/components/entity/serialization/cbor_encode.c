/*
 * CBOR Encoder - Minimal RFC 7049 implementation.
 * No external library. Primitives for encoding to a buffer.
 */
#include <string.h>
#include <stdint.h>
#include <stdbool.h>
#include "esp_log.h"
#include "cbor_encode.h"

static const char *TAG = "cbor_enc";

// CBOR Major Types (RFC 7049)
#define CBOR_MT_UNSIGNED_INT  0
#define CBOR_MT_NEGATIVE_INT  1
#define CBOR_MT_BYTE_STRING   2
#define CBOR_MT_TEXT_STRING   3
#define CBOR_MT_ARRAY         4
#define CBOR_MT_MAP           5
#define CBOR_MT_SIMPLE        7

#define CBOR_AI_ONE_BYTE      24
#define CBOR_AI_TWO_BYTES     25
#define CBOR_AI_FOUR_BYTES    26
#define CBOR_AI_EIGHT_BYTES   27
#define CBOR_AI_INDEFINITE    31

#define CBOR_TRUE             21
#define CBOR_FALSE            20
#define CBOR_BREAK            31

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

int cbor_write_byte(cbor_encoder_t *enc, uint8_t byte)
{
    if (enc->pos >= enc->buffer_size) {
        ESP_LOGE(TAG, "Buffer overflow at pos %zu", enc->pos);
        return -1;
    }
    enc->buffer[enc->pos++] = byte;
    return 0;
}

int cbor_write_bytes(cbor_encoder_t *enc, const uint8_t *data, size_t len)
{
    if (enc->pos + len > enc->buffer_size) {
        ESP_LOGE(TAG, "Buffer overflow: pos=%zu, len=%zu, size=%zu", enc->pos, len, enc->buffer_size);
        return -1;
    }
    memcpy(&enc->buffer[enc->pos], data, len);
    enc->pos += len;
    return 0;
}

int cbor_encode_uint(cbor_encoder_t *enc, uint64_t value)
{
    return cbor_encode_type_length(enc, CBOR_MT_UNSIGNED_INT, value);
}

int cbor_encode_int(cbor_encoder_t *enc, int64_t value)
{
    if (value >= 0) {
        return cbor_encode_type_length(enc, CBOR_MT_UNSIGNED_INT, (uint64_t)value);
    }
    return cbor_encode_type_length(enc, CBOR_MT_NEGATIVE_INT, (uint64_t)(-1 - value));
}

int cbor_encode_text_string(cbor_encoder_t *enc, const char *str)
{
    size_t len = strlen(str);
    if (cbor_encode_type_length(enc, CBOR_MT_TEXT_STRING, len) < 0) return -1;
    return cbor_write_bytes(enc, (const uint8_t *)str, len);
}

int cbor_encode_bool(cbor_encoder_t *enc, bool value)
{
    uint8_t byte = (CBOR_MT_SIMPLE << 5) | (value ? CBOR_TRUE : CBOR_FALSE);
    return cbor_write_byte(enc, byte);
}

int cbor_encode_byte_string(cbor_encoder_t *enc, const uint8_t *data, size_t len)
{
    if (cbor_encode_type_length(enc, CBOR_MT_BYTE_STRING, len) < 0) return -1;
    return cbor_write_bytes(enc, data, len);
}

int cbor_encode_float(cbor_encoder_t *enc, float value)
{
    uint8_t byte = (CBOR_MT_SIMPLE << 5) | CBOR_AI_FOUR_BYTES;
    if (cbor_write_byte(enc, byte) < 0) return -1;

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

int cbor_start_indefinite_array(cbor_encoder_t *enc)
{
    uint8_t byte = (CBOR_MT_ARRAY << 5) | CBOR_AI_INDEFINITE;
    return cbor_write_byte(enc, byte);
}

int cbor_start_array(cbor_encoder_t *enc, size_t count)
{
    return cbor_encode_type_length(enc, CBOR_MT_ARRAY, count);
}

int cbor_end_indefinite_array(cbor_encoder_t *enc)
{
    uint8_t byte = (CBOR_MT_SIMPLE << 5) | CBOR_BREAK;
    return cbor_write_byte(enc, byte);
}

int cbor_start_indefinite_map(cbor_encoder_t *enc)
{
    uint8_t byte = (CBOR_MT_MAP << 5) | CBOR_AI_INDEFINITE;
    return cbor_write_byte(enc, byte);
}

int cbor_start_map(cbor_encoder_t *enc, size_t count)
{
    return cbor_encode_type_length(enc, CBOR_MT_MAP, count);
}

int cbor_end_indefinite_map(cbor_encoder_t *enc)
{
    uint8_t byte = (CBOR_MT_SIMPLE << 5) | CBOR_BREAK;
    return cbor_write_byte(enc, byte);
}
