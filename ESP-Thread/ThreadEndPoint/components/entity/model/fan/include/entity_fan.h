/*
 * Entity Type: Fan
 * Fan control entity with speed and oscillation control.
 */
#pragma once

#include "entity_model.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Fan Mode Enumeration
 * Different fan speed modes.
 */
typedef enum {
    FAN_MODE_OFF = 0,
    FAN_MODE_LOW,
    FAN_MODE_MEDIUM,
    FAN_MODE_HIGH,
    FAN_MODE_AUTO
} fan_mode_t;

/**
 * Fan Entity Structure
 * Inherits from entity_base_t and adds fan-specific attributes.
 */
typedef struct {
    entity_base_t base;        // Inherited base structure
    
    // State
    bool state;                // on/off
    uint8_t speed;             // 0-100% or 0-5 levels
    fan_mode_t mode;           // Low/Medium/High/Auto
    bool oscillation;          // Oscillation on/off
    int16_t direction;         // 0-360° (if supported)
    
    // Capabilities
    uint8_t speed_levels;      // 3, 5, or 100 (continuous)
    bool supports_oscillation;
    bool supports_direction;
    bool supports_timer;
    uint16_t timer_remaining;  // Minutes remaining
} entity_fan_t;

#ifdef __cplusplus
}
#endif
