/*
 * Entity Model - Implementation.
 * Type registry + entity list; describe / get / set.
 */
#include <stdio.h>
#include <string.h>
#include "entity_model.h"
#include "entity_model_priv.h"

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

int entity_register_type(const char *type_id,
                         entity_get_attr_fn get_cb,
                         entity_set_attr_fn set_cb)
{
    if (type_id == NULL || s_num_types >= CONFIG_ENTITY_MODEL_MAX_TYPES) {
        return -1;
    }
    for (size_t i = 0; i < s_num_types; i++) {
        if (strcmp(s_types[i].type_id, type_id) == 0) {
            return -1; /* already registered */
        }
    }
    s_types[s_num_types].type_id = type_id;
    s_types[s_num_types].get_cb = get_cb;
    s_types[s_num_types].set_cb = set_cb;
    s_num_types++;
    return 0;
}

static const entity_type_registry_t *find_type(const char *type_id)
{
    for (size_t i = 0; i < s_num_types; i++) {
        if (strcmp(s_types[i].type_id, type_id) == 0) {
            return &s_types[i];
        }
    }
    return NULL;
}

int entity_add(const char *entity_id, const char *type_id,
               const char *name, void *instance_data)
{
    if (entity_id == NULL || type_id == NULL || s_num_entities >= CONFIG_ENTITY_MODEL_MAX_ENTITIES) {
        return -1;
    }
    const entity_type_registry_t *t = find_type(type_id);
    if (t == NULL) {
        return -1;
    }
    for (size_t i = 0; i < s_num_entities; i++) {
        if (strcmp(s_entities[i].entity_id, entity_id) == 0) {
            return -1; /* id already used */
        }
    }
    s_entities[s_num_entities].entity_id = entity_id;
    s_entities[s_num_entities].name = name != NULL ? name : "";
    s_entities[s_num_entities].type = t;
    s_entities[s_num_entities].instance_data = instance_data;
    s_num_entities++;
    return 0;
}

static const entity_entry_t *find_entity(const char *entity_id)
{
    for (size_t i = 0; i < s_num_entities; i++) {
        if (strcmp(s_entities[i].entity_id, entity_id) == 0) {
            return &s_entities[i];
        }
    }
    return NULL;
}

int entity_describe(char *buf, size_t buf_len)
{
    if (buf == NULL || buf_len == 0) {
        return -1;
    }
    size_t written = 0;
    for (size_t i = 0; i < s_num_entities && written < buf_len; i++) {
        const entity_entry_t *e = &s_entities[i];
        int n = snprintf(buf + written, buf_len - written,
                         "entity_id=%s type=%s name=%s\n",
                         e->entity_id, e->type->type_id, e->name);
        if (n < 0 || (size_t)n >= buf_len - written) {
            return -1; /* truncation or error */
        }
        written += (size_t)n;
    }
    return (int)written;
}

int entity_get(const char *entity_id, const char *attr,
               char *value_buf, size_t value_buf_len)
{
    if (entity_id == NULL || attr == NULL || value_buf == NULL || value_buf_len == 0) {
        return -1;
    }
    const entity_entry_t *e = find_entity(entity_id);
    if (e == NULL || e->type->get_cb == NULL) {
        return -1;
    }
    return e->type->get_cb(entity_id, attr, e->instance_data, value_buf, value_buf_len);
}

int entity_set(const char *entity_id, const char *attr, const char *value)
{
    if (entity_id == NULL || attr == NULL || value == NULL) {
        return -1;
    }
    const entity_entry_t *e = find_entity(entity_id);
    if (e == NULL || e->type->set_cb == NULL) {
        return -1;
    }
    return e->type->set_cb(entity_id, attr, value, e->instance_data);
}
