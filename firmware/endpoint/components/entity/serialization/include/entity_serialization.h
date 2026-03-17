/*
 * Entity Serialization - CBOR binary serialization for entity model.
 * Serializes entity model to CBOR format for CoAP payloads.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Serialize device info to CBOR (keys 0–6, key 0 = mac). DeviceInfoPayload.
 * For POST /device/register/info (backend contract).
 */
int entity_serialize_info_cbor(uint8_t *buffer, size_t buffer_size);

/** One neighbor entry for topology key 6 (Router/Leader). Align backend TopologyNeighbor. */
typedef struct {
    uint16_t rloc16;
    int16_t  rssi_dbm;   /* optional; use 0x7FFF for N/A */
    int16_t  lq_in;      /* 0–255 or -1 for N/A */
    int16_t  lq_out;     /* 0–255 or -1 for N/A */
    bool     is_child;
} topology_neighbor_t;

/**
 * Serialize topology for Child role: keys 0–5 (mac, rloc16, role=0, parent_rloc16, parent_rssi, parent_lq).
 * For POST /device/update/topology when device is Child.
 */
int entity_serialize_topology_child_cbor(uint16_t rloc16, const char *ml_eid_str,
                                         uint16_t parent_rloc16,
                                         int16_t rssi_dbm,
                                         int16_t link_quality,
                                         uint8_t *buffer, size_t buffer_size);

/**
 * Serialize topology for Router/Leader: keys 0, 1, 2, 6 (mac, rloc16, role, neighbors array).
 * role: 1=router, 2=leader. neighbors/neighbor_count filled by caller from OpenThread.
 */
int entity_serialize_topology_router_leader_cbor(uint16_t rloc16, uint8_t role,
                                                const topology_neighbor_t *neighbors,
                                                size_t neighbor_count,
                                                uint8_t *buffer, size_t buffer_size);

/**
 * Serialize entities to CBOR: map key 0 = mac, key 1 = array (ENTITY_KEYS 0–6 per item).
 * For POST /device/register/entity (backend contract).
 */
int entity_serialize_entities_cbor(uint8_t *buffer, size_t buffer_size);

/**
 * Serialize current entity state to CBOR (key 0 = mac, key 1 = array, STATE_KEYS 0–6 per item).
 * For POST /device/update/state.
 */
int entity_serialize_state_cbor(uint8_t *buffer, size_t buffer_size);

#ifdef __cplusplus
}
#endif
