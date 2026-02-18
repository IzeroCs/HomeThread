/*
 * Entity Model - Private definitions (internal to component).
 */
#pragma once

#include "entity_model.h"
#include "sdkconfig.h"

/* Internal type registry entry (for type_id mapping) */
typedef struct entity_type_registry {
    const char *type_id;          // String ID: "on_off_light", "temperature_sensor"
    entity_type_t type_enum;       // Enum: ENTITY_TYPE_LIGHT, ENTITY_TYPE_SENSOR
} entity_type_registry_t;

/* Internal entity entry (struct-based approach) */
typedef struct entity_entry {
    entity_base_t base;            // Full base structure with all fields
    entity_type_t type_enum;       // Entity type enum for casting
    void *entity_struct;           // Pointer to entity_light_t, entity_sensor_t, etc.
} entity_entry_t;
