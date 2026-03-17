/*
 * CBOR numeric keys for /device/ payloads.
 * Aligned with backend device.payload.ts (DEVICE_INFO_KEYS, TOPOLOGY_KEYS, ENTITY_KEYS, STATE_KEYS).
 * Four separate key sets (info, topology, entity, state) for clarity.
 */
#ifndef CBOR_REGISTER_KEYS_H
#define CBOR_REGISTER_KEYS_H

/* --- Info (POST /device/register/info): DeviceInfoPayload, keys 0–6 --- */
#define CBOR_K_INFO_MAC_ADDRESS  0
#define CBOR_K_INFO_DEVICE_NAME  1
#define CBOR_K_INFO_DEVICE_TYPE  2
#define CBOR_K_INFO_MANUFACTURER 3
#define CBOR_K_INFO_MODEL        4
#define CBOR_K_INFO_SW_VERSION   5
#define CBOR_K_INFO_HW_VERSION   6

/* --- Topology (POST /device/update/topology): DeviceTopologyPayload ---
 * Child: keys 0–5 (mac, rloc16, role, parent_rloc16, parent_rssi, parent_lq).
 * Router/Leader: keys 0, 1, 2, 6 (mac, rloc16, role, neighbors array). --- */
#define CBOR_K_TOPOLOGY_MAC_ADDRESS   0
#define CBOR_K_TOPOLOGY_RLOC16        1
#define CBOR_K_TOPOLOGY_ROLE          2   /* 0=child, 1=router, 2=leader */
#define CBOR_K_TOPOLOGY_PARENT        3   /* child only */
#define CBOR_K_TOPOLOGY_RSSI          4   /* child only: parent RSSI dBm, optional */
#define CBOR_K_TOPOLOGY_LINK_QUALITY  5   /* child only: 0–255, optional */
#define CBOR_K_TOPOLOGY_NEIGHBORS     6   /* router/leader only: array of TopologyNeighbor */

/* Neighbor item (element of key 6 array): align TOPOLOGY_NEIGHBOR_KEYS backend 0–4 */
#define CBOR_K_NEIGHBOR_RLOC16    0
#define CBOR_K_NEIGHBOR_RSSI      1   /* optional dBm */
#define CBOR_K_NEIGHBOR_LQ_IN     2   /* optional */
#define CBOR_K_NEIGHBOR_LQ_OUT    3   /* optional */
#define CBOR_K_NEIGHBOR_IS_CHILD  4

/* --- Entity (POST /device/register/entity): top-level key 0 = mac, key 1 = array --- */
#define CBOR_K_ENTITY_MAC    0
#define CBOR_K_ENTITY_ARRAY 1

/* Entity item (element of array key 1): ENTITY_KEYS 0–6 --- */
#define CBOR_K_ENTITY_ITEM_ENTITY_ID   0
#define CBOR_K_ENTITY_ITEM_NAME        1
#define CBOR_K_ENTITY_ITEM_TYPE        2
#define CBOR_K_ENTITY_ITEM_DEVICE_CLASS 3
#define CBOR_K_ENTITY_ITEM_UNIT        4
#define CBOR_K_ENTITY_ITEM_RESTORE_MODE 5
#define CBOR_K_ENTITY_ITEM_DISABLED    6

/* --- State (POST /device/update/state): top-level key 0 = mac, key 1 = array --- */
#define CBOR_K_STATE_MAC    0
#define CBOR_K_STATE_ARRAY  1

/* State item (element of array key 1): STATE_KEYS 0–6 --- */
#define CBOR_K_STATE_ITEM_ENTITY_ID  0
#define CBOR_K_STATE_ITEM_STATE     1
#define CBOR_K_STATE_ITEM_BRIGHTNESS 2
#define CBOR_K_STATE_ITEM_MODE      3
#define CBOR_K_STATE_ITEM_RGB       4
#define CBOR_K_STATE_ITEM_COLOR_TEMP 5
#define CBOR_K_STATE_ITEM_VALUE     6

#endif /* CBOR_REGISTER_KEYS_H */
