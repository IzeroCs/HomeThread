/*
 * Entity Driver Helper - Implementation.
 */
#include <string.h>
#include <strings.h>
#include <stdlib.h>
#include <stdio.h>
#include "entity_driver_helper.h"

int entity_driver_parse_bool(const char *value, bool *result)
{
    if (value == NULL || result == NULL) {
        return -1;
    }
    
    if (strcasecmp(value, "on") == 0 ||
        strcmp(value, "1") == 0 ||
        strcasecmp(value, "true") == 0 ||
        strcasecmp(value, "yes") == 0) {
        *result = true;
        return 0;
    }
    
    if (strcasecmp(value, "off") == 0 ||
        strcmp(value, "0") == 0 ||
        strcasecmp(value, "false") == 0 ||
        strcasecmp(value, "no") == 0) {
        *result = false;
        return 0;
    }
    
    return -1;
}

int entity_driver_format_bool(bool value, char *buf, size_t buf_len)
{
    if (buf == NULL || buf_len == 0) {
        return -1;
    }
    
    const char *str = value ? "on" : "off";
    size_t len = strlen(str);
    
    if (len >= buf_len) {
        return -1;
    }
    
    strcpy(buf, str);
    return 0;
}

int entity_driver_parse_int(const char *value, int *result)
{
    if (value == NULL || result == NULL) {
        return -1;
    }
    
    char *endptr;
    long val = strtol(value, &endptr, 10);
    
    if (*endptr != '\0' && *endptr != '\n' && *endptr != '\r') {
        return -1;  /* Invalid characters */
    }
    
    *result = (int)val;
    return 0;
}

int entity_driver_format_int(int value, char *buf, size_t buf_len)
{
    if (buf == NULL || buf_len == 0) {
        return -1;
    }
    
    int n = snprintf(buf, buf_len, "%d", value);
    
    if (n < 0 || (size_t)n >= buf_len) {
        return -1;
    }
    
    return 0;
}

int entity_driver_parse_float(const char *value, float *result)
{
    if (value == NULL || result == NULL) {
        return -1;
    }
    
    char *endptr;
    float val = strtof(value, &endptr);
    
    if (*endptr != '\0' && *endptr != '\n' && *endptr != '\r') {
        return -1;  /* Invalid characters */
    }
    
    *result = val;
    return 0;
}

int entity_driver_format_float(float value, char *buf, size_t buf_len, int precision)
{
    if (buf == NULL || buf_len == 0) {
        return -1;
    }
    
    int n = snprintf(buf, buf_len, "%.*f", precision, value);
    
    if (n < 0 || (size_t)n >= buf_len) {
        return -1;
    }
    
    return 0;
}

bool entity_driver_attr_match(const char *attr, const char *expected)
{
    if (attr == NULL || expected == NULL) {
        return false;
    }
    
    return strcasecmp(attr, expected) == 0;
}

int entity_driver_validate_get_params(const char *attr, char *value_buf, 
                                      size_t value_buf_len, void *instance_data)
{
    if (attr == NULL || value_buf == NULL || value_buf_len == 0 || instance_data == NULL) {
        return -1;
    }
    return 0;
}

int entity_driver_validate_set_params(const char *attr, const char *value, 
                                      void *instance_data)
{
    if (attr == NULL || value == NULL || instance_data == NULL) {
        return -1;
    }
    return 0;
}
