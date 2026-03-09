/*
 * Entity Serialization - CBOR binary serialization for entity model.
 * Serializes entity model to CBOR format for CoAP payloads.
 */
#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Serialize device + network only (keys 0–8) to CBOR. No entities.
 * For POST /device/register (first step).
 */
int entity_serialize_device_cbor(uint16_t rloc16, const char *ml_eid_str,
                                 uint16_t parent_rloc16,
                                 uint8_t *buffer, size_t buffer_size);

/**
 * Serialize entities only: map with device_id (key 0) + entities array (key 9).
 * For POST /device/entities.
 */
int entity_serialize_entities_cbor(uint8_t *buffer, size_t buffer_size);

/**
 * Serialize entity model to CBOR binary format (full: device + network + entities).
 * 
 * @param rloc16 Thread RLOC16 of this device
 * @param ml_eid_str Mesh-Local EID as string (IPv6 address)
 * @param parent_rloc16 Parent router RLOC16 (0 if not a child)
 * @param buffer Output buffer for CBOR data
 * @param buffer_size Size of output buffer
 * @return Number of bytes written, or -1 on error
 */
int entity_serialize_cbor(uint16_t rloc16, const char *ml_eid_str, 
                         uint16_t parent_rloc16,
                         uint8_t *buffer, size_t buffer_size);

/**
 * Serialize partial entity updates to CBOR.
 * Only includes changed entity attributes.
 * 
 * @param buffer Output buffer for CBOR data
 * @param buffer_size Size of output buffer
 * @return Number of bytes written, or -1 on error
 */
int entity_serialize_updates_cbor(uint8_t *buffer, size_t buffer_size);

#ifdef __cplusplus
}
#endif
