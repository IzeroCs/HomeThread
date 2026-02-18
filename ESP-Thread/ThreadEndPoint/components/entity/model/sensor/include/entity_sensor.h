/*
 * Entity Type: Sensor
 * Environmental sensor entity for analog measurements.
 */
#pragma once

#include "entity_model.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Sensor Class Enumeration
 * Different types of sensors supported.
 */
typedef enum {
    SENSOR_CLASS_TEMPERATURE = 0,
    SENSOR_CLASS_HUMIDITY,
    SENSOR_CLASS_PRESSURE,
    SENSOR_CLASS_CO2,
    SENSOR_CLASS_PM25,
    SENSOR_CLASS_PM10,
    SENSOR_CLASS_TVOC,
    SENSOR_CLASS_ILLUMINANCE,
    SENSOR_CLASS_BATTERY,
    SENSOR_CLASS_POWER,
    SENSOR_CLASS_ENERGY
} sensor_class_t;

/**
 * Sensor Entity Structure
 * Inherits from entity_base_t and adds sensor-specific attributes.
 */
typedef struct {
    entity_base_t base;        // Inherited base structure
    
    // Value
    float value;               // Current value
    char unit[8];              // "°C", "%", "ppm", "lux", "W", "kWh"
    sensor_class_t sensor_class;
    
    // Statistics (optional)
    float min_value;           // Min value in last 24h
    float max_value;           // Max value in last 24h
    float avg_value;           // Average value
    
    // Config
    float accuracy;            // ±0.5°C
    uint16_t update_interval;  // Update interval in seconds
} entity_sensor_t;

#ifdef __cplusplus
}
#endif
