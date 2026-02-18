/*
 * Entity Type: Climate (Air Conditioner)
 * Climate control entity for air conditioners and heaters.
 */
#pragma once

#include "entity_model.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Climate Mode Enumeration
 * Different climate control modes.
 */
typedef enum {
    CLIMATE_MODE_OFF = 0,
    CLIMATE_MODE_AUTO,
    CLIMATE_MODE_COOL,
    CLIMATE_MODE_HEAT,
    CLIMATE_MODE_DRY,
    CLIMATE_MODE_FAN_ONLY
} climate_mode_t;

/**
 * Climate Fan Speed Enumeration
 * Fan speed settings for climate control.
 */
typedef enum {
    FAN_SPEED_AUTO = 0,
    FAN_SPEED_LOW,
    FAN_SPEED_MEDIUM,
    FAN_SPEED_HIGH
} climate_fan_speed_t;

/**
 * Climate Entity Structure
 * Inherits from entity_base_t and adds climate-specific attributes.
 */
typedef struct {
    entity_base_t base;        // Inherited base structure
    
    // Current state
    climate_mode_t mode;
    float current_temp;        // Current temperature (°C)
    float target_temp;         // Target temperature (°C)
    uint8_t current_humidity;  // Current humidity (%)
    
    // Control
    climate_fan_speed_t fan_speed;
    bool swing;                // Swing mode (louver)
    bool eco_mode;             // Eco/energy saving mode
    bool turbo_mode;           // Turbo/powerful mode
    
    // Capabilities
    float min_temp;            // Min temperature (16°C)
    float max_temp;            // Max temperature (30°C)
    bool supports_heat;
    bool supports_cool;
    bool supports_dry;
    bool supports_swing;
} entity_climate_t;

#ifdef __cplusplus
}
#endif
