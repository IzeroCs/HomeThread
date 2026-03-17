/*
 * Entity Type: Light
 * Light control entity with support for on/off, dimming, and color control.
 */
#pragma once

#include "entity_model.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Light Mode Enumeration
 * Different types of light control modes.
 */
typedef enum {
    LIGHT_MODE_ON_OFF = 0,     // Simple on/off only
    LIGHT_MODE_DIMMABLE,       // Brightness control
    LIGHT_MODE_RGB,            // RGB color
    LIGHT_MODE_RGBW,           // RGB + White
    LIGHT_MODE_CCT             // Color temperature (warm/cool white)
} light_mode_t;

/**
 * Light Entity Structure
 * Inherits from entity_base_t and adds light-specific attributes.
 */
typedef struct {
    entity_base_t base;        // Inherited base structure
    
    // State
    bool state;                // on/off
    uint8_t brightness;        // 0-100%
    uint16_t color_temp;       // 2700-6500K (if supported)
    uint8_t rgb[3];            // R, G, B (0-255)
    
    // Capabilities
    light_mode_t mode;         // Light type
    uint8_t min_brightness;    // 1-100
    uint8_t max_brightness;    // 1-100
    uint16_t min_color_temp;   // 2700K
    uint16_t max_color_temp;   // 6500K
    
    // Effects (optional)
    char effect[16];           // "none", "blink", "rainbow"
    uint8_t transition_time;   // Transition time (seconds)
} entity_light_t;

#ifdef __cplusplus
}
#endif
