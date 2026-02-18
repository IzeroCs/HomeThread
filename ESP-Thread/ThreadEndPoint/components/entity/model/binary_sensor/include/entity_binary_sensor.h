/*
 * Entity Type: Binary Sensor
 * Binary sensor entity for on/off, true/false, detected/clear states.
 */
#pragma once

#include "entity_model.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Binary Sensor Class Enumeration
 * Different types of binary sensors supported.
 */
typedef enum {
    BINARY_SENSOR_MOTION = 0,
    BINARY_SENSOR_DOOR,
    BINARY_SENSOR_WINDOW,
    BINARY_SENSOR_SMOKE,
    BINARY_SENSOR_GAS,
    BINARY_SENSOR_OCCUPANCY,
    BINARY_SENSOR_TAMPER,
    BINARY_SENSOR_WATER_LEAK
} binary_sensor_class_t;

/**
 * Binary Sensor Entity Structure
 * Inherits from entity_base_t and adds binary sensor-specific attributes.
 */
typedef struct {
    entity_base_t base;        // Inherited base structure
    
    // State
    bool state;                // true/false, on/off, detected/clear
    binary_sensor_class_t sensor_class;
    
    // Metadata
    uint32_t last_triggered;   // Last trigger timestamp
    uint16_t trigger_count;    // Trigger count in last 24h
    uint16_t debounce_time;    // Debounce time in ms
} entity_binary_sensor_t;

#ifdef __cplusplus
}
#endif
