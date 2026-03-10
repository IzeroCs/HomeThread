/*
 * CBOR Encoder - Minimal RFC 7049 encoding for embedded.
 * No external library. Used by entity serialization and other CBOR producers.
 */
#ifndef CBOR_ENCODE_H
#define CBOR_ENCODE_H

#include <stddef.h>
#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Encoder context: output buffer and write position.
 */
typedef struct {
    uint8_t *buffer;
    size_t buffer_size;
    size_t pos;
} cbor_encoder_t;

int cbor_write_byte(cbor_encoder_t *enc, uint8_t byte);
int cbor_write_bytes(cbor_encoder_t *enc, const uint8_t *data, size_t len);

int cbor_encode_uint(cbor_encoder_t *enc, uint64_t value);
int cbor_encode_int(cbor_encoder_t *enc, int64_t value);
int cbor_encode_text_string(cbor_encoder_t *enc, const char *str);
int cbor_encode_bool(cbor_encoder_t *enc, bool value);
int cbor_encode_byte_string(cbor_encoder_t *enc, const uint8_t *data, size_t len);
int cbor_encode_float(cbor_encoder_t *enc, float value);

int cbor_start_indefinite_array(cbor_encoder_t *enc);
int cbor_start_array(cbor_encoder_t *enc, size_t count);
int cbor_end_indefinite_array(cbor_encoder_t *enc);

int cbor_start_indefinite_map(cbor_encoder_t *enc);
int cbor_start_map(cbor_encoder_t *enc, size_t count);
int cbor_end_indefinite_map(cbor_encoder_t *enc);

#ifdef __cplusplus
}
#endif

#endif /* CBOR_ENCODE_H */
