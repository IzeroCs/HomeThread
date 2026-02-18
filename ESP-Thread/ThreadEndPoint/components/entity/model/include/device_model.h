/*
 * Device Model
 * Complete device model structure including device info, entities, and network info.
 */
#pragma once

#include "entity_model.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Maximum number of entities per device
 * Fixed at compile time. Adjust based on device capabilities.
 */
#define MAX_ENTITIES 8

/**
 * Device Info Structure
 * Basic device metadata that identifies and describes the device.
 */
typedef struct {
    char device_id[16];        // Unique identifier: "living-room-001"
    char device_name[32];      // Human-readable: "Living Room Controller"
    char device_type[16];      // Type: "light_controller", "sensor_hub"
    char manufacturer[32];     // Manufacturer name: "MyCompany"
    char model[32];            // Model number: "LC-100"
    char sw_version[16];       // Software version: "1.2.3"
    char hw_version[16];       // Hardware version: "v2.0"
    uint64_t mac_address;      // IEEE EUI-64 address (8 bytes)
} device_info_t;

/**
 * Complete Device Model Structure
 * Contains device info, entities array, and network information.
 * 
 * Note: Entities are stored as void* pointers with a parallel type array
 * for type safety. This allows polymorphic storage of different entity types.
 */
typedef struct {
    device_info_t info;        // Device metadata
    
    // Entities (polymorphic array)
    void *entities[MAX_ENTITIES];              // Pointers to entity_light_t, entity_sensor_t, etc.
    entity_type_t entity_types[MAX_ENTITIES]; // Type for each entity
    uint8_t entity_count;                     // Actual count (0 to MAX_ENTITIES)
    
    // Network info
    uint8_t ipv6_addr[16];     // Thread IPv6 address
    uint16_t rloc16;           // Thread RLOC16
    uint8_t role;              // 0=Child, 1=Leader, 2=Router
} device_model_t;

#ifdef __cplusplus
}
#endif
