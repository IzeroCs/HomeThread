/*
 * Entity Model - Implementation.
 * Type registry + entity list; describe / get / set.
 * Struct-based approach: entities stored as structs (entity_light_t, etc.)
 */
#include <stdio.h>
#include <string.h>
#include <time.h>
#include "esp_log.h"
#include "entity_model.h"
#include "entity_model_priv.h"

// Include entity type headers for casting
#include "entity_light.h"
#include "entity_switch.h"
#include "entity_fan.h"
#include "entity_sensor.h"
#include "entity_climate.h"
#include "entity_binary_sensor.h"

static const char *TAG = "entity_model";

static size_t s_num_types;
static entity_type_registry_t s_types[CONFIG_ENTITY_MODEL_MAX_TYPES];

static size_t s_num_entities;
static entity_entry_t s_entities[CONFIG_ENTITY_MODEL_MAX_ENTITIES];

void entity_model_init(void)
{
    s_num_types = 0;
    s_num_entities = 0;
    memset(s_types, 0, sizeof(s_types));
    memset(s_entities, 0, sizeof(s_entities));
}

/**
 * Register an entity type.
 * type_id: String identifier (e.g. "on_off_light", "temperature_sensor")
 * type_enum: Entity type enum (ENTITY_TYPE_LIGHT, etc.)
 */
int entity_register_type(const char *type_id, entity_type_t type_enum)
{
    if (type_id == NULL || s_num_types >= CONFIG_ENTITY_MODEL_MAX_TYPES) {
        return -1;
    }
    
    // Check if type_id already registered
    for (size_t i = 0; i < s_num_types; i++) {
        if (strcmp(s_types[i].type_id, type_id) == 0) {
            return -1; /* already registered */
        }
    }
    
    // Validate type_enum
    if (type_enum >= ENTITY_TYPE_BINARY_SENSOR + 1) {
        ESP_LOGE(TAG, "Invalid type_enum: %d", type_enum);
        return -1;
    }
    
    s_types[s_num_types].type_id = type_id;
    s_types[s_num_types].type_enum = type_enum;
    s_num_types++;
    
    ESP_LOGI(TAG, "Registered type: %s (enum=%d)", type_id, type_enum);
    return 0;
}

static const entity_type_registry_t *find_type_by_id(const char *type_id)
{
    for (size_t i = 0; i < s_num_types; i++) {
        if (strcmp(s_types[i].type_id, type_id) == 0) {
            return &s_types[i];
        }
    }
    return NULL;
}

static const char *get_type_id_string(entity_type_t type_enum)
{
    for (size_t i = 0; i < s_num_types; i++) {
        if (s_types[i].type_enum == type_enum) {
            return s_types[i].type_id;
        }
    }
    return "unknown";
}

/**
 * Add an entity.
 * entity_struct: Pointer to entity struct (entity_light_t*, etc.) - must have entity_base_t base at start
 * type_enum: Entity type enum for validation
 */
int entity_add(void *entity_struct, entity_type_t type_enum)
{
    if (entity_struct == NULL || s_num_entities >= CONFIG_ENTITY_MODEL_MAX_ENTITIES) {
        return -1;
    }
    
    // Cast to get base structure
    entity_base_t *base = (entity_base_t *)entity_struct;
    
    // Validate base structure
    if (base->entity_id[0] == '\0') {
        ESP_LOGE(TAG, "entity_id is empty");
        return -1;
    }
    
    if (base->type != type_enum) {
        ESP_LOGE(TAG, "Type mismatch: base.type=%d, type_enum=%d", base->type, type_enum);
        return -1;
    }
    
    // Check if entity_id already exists
    for (size_t i = 0; i < s_num_entities; i++) {
        if (strcmp(s_entities[i].base.entity_id, base->entity_id) == 0) {
            ESP_LOGE(TAG, "Entity ID already exists: %s", base->entity_id);
            return -1; /* id already used */
        }
    }
    
    // Copy base structure
    memcpy(&s_entities[s_num_entities].base, base, sizeof(entity_base_t));
    s_entities[s_num_entities].type_enum = type_enum;
    s_entities[s_num_entities].entity_struct = entity_struct;
    
    s_num_entities++;
    
    ESP_LOGI(TAG, "Added entity: %s (type=%d)", base->entity_id, type_enum);
    return 0;
}

static const entity_entry_t *find_entity(const char *entity_id)
{
    if (entity_id == NULL) {
        return NULL;
    }
    for (size_t i = 0; i < s_num_entities; i++) {
        if (strcmp(s_entities[i].base.entity_id, entity_id) == 0) {
            return &s_entities[i];
        }
    }
    return NULL;
}

/**
 * Write description of all entities into buf (text format).
 */
int entity_describe(char *buf, size_t buf_len)
{
    if (buf == NULL || buf_len == 0) {
        return -1;
    }
    size_t written = 0;
    for (size_t i = 0; i < s_num_entities && written < buf_len; i++) {
        const entity_entry_t *e = &s_entities[i];
        const char *type_id = get_type_id_string(e->type_enum);
        int n = snprintf(buf + written, buf_len - written,
                         "entity_id=%s type=%s name=%s\n",
                         e->base.entity_id, type_id, e->base.name);
        if (n < 0 || (size_t)n >= buf_len - written) {
            return -1; /* truncation or error */
        }
        written += (size_t)n;
    }
    return (int)written;
}

/**
 * Get attribute value for an entity.
 * Reads directly from entity struct based on type.
 */
int entity_get(const char *entity_id, const char *attr,
               char *value_buf, size_t value_buf_len)
{
    if (entity_id == NULL || attr == NULL || value_buf == NULL || value_buf_len == 0) {
        return -1;
    }
    
    const entity_entry_t *e = find_entity(entity_id);
    if (e == NULL || e->entity_struct == NULL) {
        return -1;
    }
    
    // Cast based on type and read from struct
    switch (e->type_enum) {
        case ENTITY_TYPE_LIGHT: {
            entity_light_t *light = (entity_light_t *)e->entity_struct;
            if (strcmp(attr, "state") == 0) {
                snprintf(value_buf, value_buf_len, "%s", light->state ? "on" : "off");
                return 0;
            } else if (strcmp(attr, "brightness") == 0) {
                snprintf(value_buf, value_buf_len, "%d", light->brightness);
                return 0;
            } else if (strcmp(attr, "mode") == 0) {
                snprintf(value_buf, value_buf_len, "%d", light->mode);
                return 0;
            }
            break;
        }
        case ENTITY_TYPE_SWITCH: {
            entity_switch_t *sw = (entity_switch_t *)e->entity_struct;
            if (strcmp(attr, "state") == 0) {
                snprintf(value_buf, value_buf_len, "%s", sw->state ? "on" : "off");
                return 0;
            }
            break;
        }
        case ENTITY_TYPE_SENSOR: {
            entity_sensor_t *sensor = (entity_sensor_t *)e->entity_struct;
            if (strcmp(attr, "value") == 0) {
                snprintf(value_buf, value_buf_len, "%.2f", sensor->value);
                return 0;
            } else if (strcmp(attr, "unit") == 0) {
                snprintf(value_buf, value_buf_len, "%s", sensor->unit);
                return 0;
            }
            break;
        }
        case ENTITY_TYPE_BINARY_SENSOR: {
            entity_binary_sensor_t *bs = (entity_binary_sensor_t *)e->entity_struct;
            if (strcmp(attr, "state") == 0) {
                snprintf(value_buf, value_buf_len, "%s", bs->state ? "on" : "off");
                return 0;
            }
            break;
        }
        case ENTITY_TYPE_FAN:
        case ENTITY_TYPE_CLIMATE:
            // TODO: Implement get for fan and climate
            break;
    }
    
    return -1; /* attribute not found */
}

/**
 * Set attribute value for an entity.
 * Writes directly to entity struct based on type.
 */
int entity_set(const char *entity_id, const char *attr, const char *value)
{
    if (entity_id == NULL || attr == NULL || value == NULL) {
        return -1;
    }
    
    const entity_entry_t *e = find_entity(entity_id);
    if (e == NULL || e->entity_struct == NULL) {
        return -1;
    }
    
    // Cast based on type and write to struct
    switch (e->type_enum) {
        case ENTITY_TYPE_LIGHT: {
            entity_light_t *light = (entity_light_t *)e->entity_struct;
            if (strcmp(attr, "state") == 0) {
                light->state = (strcmp(value, "on") == 0 || strcmp(value, "1") == 0 || strcmp(value, "true") == 0);
                light->base.last_update = (uint32_t)time(NULL);
                return 0;
            } else if (strcmp(attr, "brightness") == 0) {
                int brightness = atoi(value);
                if (brightness >= 0 && brightness <= 100) {
                    light->brightness = (uint8_t)brightness;
                    light->base.last_update = (uint32_t)time(NULL);
                    return 0;
                }
            }
            break;
        }
        case ENTITY_TYPE_SWITCH: {
            entity_switch_t *sw = (entity_switch_t *)e->entity_struct;
            if (strcmp(attr, "state") == 0) {
                sw->state = (strcmp(value, "on") == 0 || strcmp(value, "1") == 0 || strcmp(value, "true") == 0);
                sw->base.last_update = (uint32_t)time(NULL);
                return 0;
            }
            break;
        }
        case ENTITY_TYPE_SENSOR:
        case ENTITY_TYPE_BINARY_SENSOR:
            // Sensors are read-only
            return -1;
        case ENTITY_TYPE_FAN:
        case ENTITY_TYPE_CLIMATE:
            // TODO: Implement set for fan and climate
            break;
    }
    
    return -1; /* attribute not found or invalid */
}

/**
 * Get entity struct pointer by entity_id.
 */
void* entity_get_struct(const char *entity_id, entity_type_t *type_out)
{
    const entity_entry_t *e = find_entity(entity_id);
    if (e == NULL) {
        return NULL;
    }
    if (type_out) {
        *type_out = e->type_enum;
    }
    return e->entity_struct;
}

/**
 * Get total number of entities.
 */
int entity_get_count(void)
{
    return (int)s_num_entities;
}

/**
 * Get entity struct by index.
 */
void* entity_get_by_index(int index, entity_type_t *type_out)
{
    if (index < 0 || (size_t)index >= s_num_entities) {
        return NULL;
    }
    if (type_out) {
        *type_out = s_entities[index].type_enum;
    }
    return s_entities[index].entity_struct;
}

/**
 * Update entity timestamp.
 */
void entity_update_timestamp(const char *entity_id)
{
    const entity_entry_t *e = find_entity(entity_id);
    if (e != NULL && e->entity_struct != NULL) {
        entity_base_t *base = (entity_base_t *)e->entity_struct;
        base->last_update = (uint32_t)time(NULL);
    }
}

/**
 * Set entity available status.
 */
void entity_set_available(const char *entity_id, bool available)
{
    const entity_entry_t *e = find_entity(entity_id);
    if (e != NULL && e->entity_struct != NULL) {
        entity_base_t *base = (entity_base_t *)e->entity_struct;
        base->available = available;
        base->last_update = (uint32_t)time(NULL);
    }
}

/**
 * Remove entity.
 */
int entity_remove(const char *entity_id)
{
    if (entity_id == NULL) {
        return -1;
    }
    
    // Find entity index
    size_t idx = SIZE_MAX;
    for (size_t i = 0; i < s_num_entities; i++) {
        if (strcmp(s_entities[i].base.entity_id, entity_id) == 0) {
            idx = i;
            break;
        }
    }
    
    if (idx == SIZE_MAX) {
        return -1; /* not found */
    }
    
    // Shift remaining entities
    for (size_t i = idx; i < s_num_entities - 1; i++) {
        s_entities[i] = s_entities[i + 1];
    }
    
    s_num_entities--;
    memset(&s_entities[s_num_entities], 0, sizeof(entity_entry_t));
    
    ESP_LOGI(TAG, "Removed entity: %s", entity_id);
    return 0;
}
