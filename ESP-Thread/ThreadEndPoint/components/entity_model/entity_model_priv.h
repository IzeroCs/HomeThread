/*
 * Entity Model - Private definitions (internal to component).
 */
#pragma once

#include "entity_model.h"
#include "sdkconfig.h"

typedef struct entity_type {
    const char *type_id;
    entity_get_attr_fn get_cb;
    entity_set_attr_fn set_cb;
} entity_type_t;

typedef struct entity {
    const char *entity_id;
    const char *name;
    const entity_type_t *type;
    void *instance_data;
} entity_t;
