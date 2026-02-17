/*
 * Entity Driver Helper - Wrapper và utilities để tạo entity driver dễ dàng hơn.
 * 
 * Cung cấp các helper functions và macros để đơn giản hóa việc tạo entity driver:
 * - Parse giá trị (bool, int, float)
 * - Format giá trị (bool, int, float)
 * - Attribute validation
 * - Common patterns
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include "entity_model.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Parse giá trị boolean từ string.
 * Hỗ trợ: "on"/"off", "1"/"0", "true"/"false", "yes"/"no"
 * 
 * @param value String value
 * @param result Output boolean value
 * @return 0 nếu thành công, -1 nếu không parse được
 */
int entity_driver_parse_bool(const char *value, bool *result);

/**
 * Format boolean thành string.
 * 
 * @param value Boolean value
 * @param buf Output buffer
 * @param buf_len Buffer size
 * @return 0 nếu thành công, -1 nếu buffer quá nhỏ
 */
int entity_driver_format_bool(bool value, char *buf, size_t buf_len);

/**
 * Parse giá trị integer từ string.
 * 
 * @param value String value
 * @param result Output integer value
 * @return 0 nếu thành công, -1 nếu không parse được
 */
int entity_driver_parse_int(const char *value, int *result);

/**
 * Format integer thành string.
 * 
 * @param value Integer value
 * @param buf Output buffer
 * @param buf_len Buffer size
 * @return 0 nếu thành công, -1 nếu buffer quá nhỏ
 */
int entity_driver_format_int(int value, char *buf, size_t buf_len);

/**
 * Parse giá trị float từ string.
 * 
 * @param value String value
 * @param result Output float value
 * @return 0 nếu thành công, -1 nếu không parse được
 */
int entity_driver_parse_float(const char *value, float *result);

/**
 * Format float thành string.
 * 
 * @param value Float value
 * @param buf Output buffer
 * @param buf_len Buffer size
 * @param precision Số chữ số thập phân
 * @return 0 nếu thành công, -1 nếu buffer quá nhỏ
 */
int entity_driver_format_float(float value, char *buf, size_t buf_len, int precision);

/**
 * Validate attribute name (case-insensitive).
 * 
 * @param attr Attribute name từ request
 * @param expected Expected attribute name
 * @return true nếu khớp, false nếu không khớp
 */
bool entity_driver_attr_match(const char *attr, const char *expected);

/**
 * Validate input parameters cho get_attr callback.
 * 
 * @param attr Attribute name
 * @param value_buf Output buffer
 * @param value_buf_len Buffer size
 * @param instance_data Instance data
 * @return 0 nếu valid, -1 nếu invalid
 */
int entity_driver_validate_get_params(const char *attr, char *value_buf, 
                                      size_t value_buf_len, void *instance_data);

/**
 * Validate input parameters cho set_attr callback.
 * 
 * @param attr Attribute name
 * @param value Value string
 * @param instance_data Instance data
 * @return 0 nếu valid, -1 nếu invalid
 */
int entity_driver_validate_set_params(const char *attr, const char *value, 
                                      void *instance_data);

/**
 * Macro helper: Tạo get_attr callback đơn giản cho boolean attribute.
 * 
 * Usage:
 *   ENTITY_DRIVER_GET_BOOL(inst, state, value_buf, value_buf_len)
 */
#define ENTITY_DRIVER_GET_BOOL(instance, field, value_buf, value_buf_len) \
    do { \
        typeof(instance) inst = (typeof(instance))instance; \
        if (inst == NULL) return -1; \
        return entity_driver_format_bool(inst->field, value_buf, value_buf_len); \
    } while (0)

/**
 * Macro helper: Tạo set_attr callback đơn giản cho boolean attribute.
 * 
 * Usage:
 *   ENTITY_DRIVER_SET_BOOL(inst, state, value)
 */
#define ENTITY_DRIVER_SET_BOOL(instance, field, value) \
    do { \
        typeof(instance) inst = (typeof(instance))instance; \
        if (inst == NULL) return -1; \
        bool new_value; \
        if (entity_driver_parse_bool(value, &new_value) != 0) return -1; \
        inst->field = new_value; \
        return 0; \
    } while (0)

/**
 * Macro helper: Tạo get_attr callback đơn giản cho integer attribute.
 * 
 * Usage:
 *   ENTITY_DRIVER_GET_INT(inst, brightness, value_buf, value_buf_len)
 */
#define ENTITY_DRIVER_GET_INT(instance, field, value_buf, value_buf_len) \
    do { \
        typeof(instance) inst = (typeof(instance))instance; \
        if (inst == NULL) return -1; \
        return entity_driver_format_int(inst->field, value_buf, value_buf_len); \
    } while (0)

/**
 * Macro helper: Tạo set_attr callback đơn giản cho integer attribute.
 * 
 * Usage:
 *   ENTITY_DRIVER_SET_INT(inst, brightness, value, min, max)
 */
#define ENTITY_DRIVER_SET_INT(instance, field, value, min_val, max_val) \
    do { \
        typeof(instance) inst = (typeof(instance))instance; \
        if (inst == NULL) return -1; \
        int new_value; \
        if (entity_driver_parse_int(value, &new_value) != 0) return -1; \
        if (new_value < (min_val) || new_value > (max_val)) return -1; \
        inst->field = new_value; \
        return 0; \
    } while (0)

#ifdef __cplusplus
}
#endif
