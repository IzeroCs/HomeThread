/*
 * Device role (OpenThread): giá trị 1 byte gửi trong CMD_STATE (BR → backend).
 * Copy enum này sang backend để dùng chung.
 */

#ifndef DEVICE_ROLE_H
#define DEVICE_ROLE_H

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    DEVICE_ROLE_DISABLED = 0,
    DEVICE_ROLE_DETACHED = 1,
    DEVICE_ROLE_CHILD    = 2,
    DEVICE_ROLE_ROUTER   = 3,
    DEVICE_ROLE_LEADER   = 4,
} device_role_t;

#ifdef __cplusplus
}
#endif

#endif /* DEVICE_ROLE_H */
