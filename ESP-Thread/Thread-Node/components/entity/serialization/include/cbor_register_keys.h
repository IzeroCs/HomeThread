/*
 * CBOR numeric keys for /device/register payload.
 * Shared between Thread-Node (encoder) and backend (parser).
 * Use these defines so both sides stay in sync.
 */
#ifndef CBOR_REGISTER_KEYS_H
#define CBOR_REGISTER_KEYS_H

/* Device register top-level map keys */
#define CBOR_K_DEVICE_ID      0
#define CBOR_K_DEVICE_NAME    1
#define CBOR_K_DEVICE_TYPE    2
#define CBOR_K_MANUFACTURER   3
#define CBOR_K_MODEL          4
#define CBOR_K_SW_VERSION     5
#define CBOR_K_HW_VERSION     6
#define CBOR_K_MAC_ADDRESS    7
#define CBOR_K_NETWORK        8
#define CBOR_K_ENTITIES       9

/* Network sub-map keys */
#define CBOR_K_NET_RLOC16     0
#define CBOR_K_NET_ROLE       1
#define CBOR_K_NET_IPV6       2
#define CBOR_K_NET_PARENT     3

/* Entity map keys (light, sensor, etc.) */
#define CBOR_K_ENT_ENTITY_ID  0
#define CBOR_K_ENT_NAME       1
#define CBOR_K_ENT_TYPE       2
#define CBOR_K_ENT_DEVICE_CLASS 3
#define CBOR_K_ENT_AVAILABLE  4
#define CBOR_K_ENT_LAST_UPDATE 5
#define CBOR_K_ENT_STATE      6
#define CBOR_K_ENT_BRIGHTNESS 7
#define CBOR_K_ENT_MODE       8
#define CBOR_K_ENT_RGB        9
#define CBOR_K_ENT_COLOR_TEMP 10
#define CBOR_K_ENT_VALUE      11
#define CBOR_K_ENT_UNIT       12

#endif /* CBOR_REGISTER_KEYS_H */
