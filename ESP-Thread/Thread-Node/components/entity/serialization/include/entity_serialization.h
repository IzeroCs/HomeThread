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
 * Serialize device info only (keys 1–7) to CBOR. No network, no entities. Device identified by mac_address.
 * For POST /device/register/info (backend contract).
 */
int entity_serialize_register_info_cbor(uint8_t *buffer, size_t buffer_size);

/**
 * Serialize device + network only (keys 1–8) to CBOR. No entities.
 * For legacy / full payload; topology may be sent via update/topology.
 * rssi_dbm: parent RSSI in dBm (optional; use 0x7FFF for N/A).
 * link_quality: 0–255 (optional; use -1 for N/A). From otRouterInfo LQ scaled.
 */
int entity_serialize_device_cbor(uint16_t rloc16, const char *ml_eid_str,
                                 uint16_t parent_rloc16,
                                 int16_t rssi_dbm,
                                 int16_t link_quality,
                                 uint8_t *buffer, size_t buffer_size);

/**
 * Serialize entities only: map with mac_address (key 7) + entities array (key 9).
 * For POST /device/register/entity (backend contract).
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
 * Serialize current entity state to CBOR (for POST /device/update/state).
 * Map: mac_address (7) + entities array (9). Same structure as register/entity.
 *
 * @param buffer Output buffer for CBOR data
 * @param buffer_size Size of output buffer
 * @return Number of bytes written, or -1 on error
 */
int entity_serialize_updates_cbor(uint8_t *buffer, size_t buffer_size);

#ifdef __cplusplus
}
#endif
