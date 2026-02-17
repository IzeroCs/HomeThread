/*
 * Entity Model - Core API (ESPHome-like entity/type registry).
 * Describe / get / set by entity_id and attribute.
 */
#pragma once

#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Callback: read attribute value for an entity.
 * Copy the attribute value string into value_buf (at most value_buf_len bytes).
 * Return 0 on success, -1 on error or unknown attr.
 */
typedef int (*entity_get_attr_fn)(const char *entity_id, const char *attr,
                                  void *instance_data, char *value_buf,
                                  size_t value_buf_len);

/**
 * Callback: write attribute value for an entity.
 * value is the new value string (e.g. "on", "off", "100").
 * Return 0 on success, -1 on error or unknown attr.
 */
typedef int (*entity_set_attr_fn)(const char *entity_id, const char *attr,
                                  const char *value, void *instance_data);

/** Opaque type and entity (internal in .c). */
struct entity_type;
struct entity;

/**
 * Initialize the entity model (clear type registry and entity list).
 * Call once before any register_type / entity_add.
 */
void entity_model_init(void);

/**
 * Register an entity type.
 * type_id: e.g. "on_off_light", "temperature_sensor"
 * get_cb / set_cb: can be NULL if not supported (e.g. sensor only get).
 * Return 0 on success, -1 if registry full or type_id already registered.
 */
int entity_register_type(const char *type_id,
                         entity_get_attr_fn get_cb,
                         entity_set_attr_fn set_cb);

/**
 * Add an entity.
 * type_id must have been registered. instance_data is passed to get/set callbacks.
 * Return 0 on success, -1 if type_id unknown or entity list full.
 */
int entity_add(const char *entity_id, const char *type_id,
               const char *name, void *instance_data);

/**
 * Write description of all entities into buf (text format).
 * Format: one line per entity: "entity_id=<id> type=<type_id> name=<name>"
 * Return number of bytes written, or -1 on error (e.g. buf too small).
 */
int entity_describe(char *buf, size_t buf_len);

/**
 * Get attribute value for an entity. Writes value into value_buf.
 * Return 0 on success, -1 if entity or attr not found / error.
 */
int entity_get(const char *entity_id, const char *attr,
               char *value_buf, size_t value_buf_len);

/**
 * Set attribute value for an entity.
 * Return 0 on success, -1 if entity or attr not found / error.
 */
int entity_set(const char *entity_id, const char *attr, const char *value);

#ifdef __cplusplus
}
#endif
