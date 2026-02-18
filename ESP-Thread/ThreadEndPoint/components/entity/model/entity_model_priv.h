/*
 * Entity Model - Private definitions (internal to component).
 */
#pragma once

#include "entity_model.h"
#include "sdkconfig.h"

/* Internal type registry entry (callback-based approach) */
typedef struct entity_type_registry {
    const char *type_id;
    entity_get_attr_fn get_cb;
    entity_set_attr_fn set_cb;
} entity_type_registry_t;

/* Internal entity entry (callback-based approach) */
typedef struct entity_entry {
    const char *entity_id;
    const char *name;
    const entity_type_registry_t *type;
    void *instance_data;
} entity_entry_t;
