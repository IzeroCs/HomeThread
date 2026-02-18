/*
 * Entity Type: Switch
 * Physical switch or button control entity.
 */
#pragma once

#include "entity_model.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Switch Type Enumeration
 * Different types of switches supported.
 */
typedef enum {
    SWITCH_TYPE_TOGGLE = 0,    // Toggle on/off switch
    SWITCH_TYPE_PUSH,          // Momentary push button
    SWITCH_TYPE_MULTI_GANG     // Multi-gang switch (2-gang, 3-gang, etc.)
} switch_type_t;

/**
 * Switch Entity Structure
 * Inherits from entity_base_t and adds switch-specific attributes.
 */
typedef struct {
    entity_base_t base;        // Inherited base structure
    
    // State
    bool state;                // on/off (for toggle)
    bool pressed;              // true when pressed (for push button)
    uint8_t gang_states[4];    // State of each gang (multi-gang)
    uint8_t gang_count;        // Number of gangs (1-4)
    
    // Config
    switch_type_t type;
    bool momentary;            // true = push button
    bool interlock;            // true = only one gang ON at a time
} entity_switch_t;

#ifdef __cplusplus
}
#endif
