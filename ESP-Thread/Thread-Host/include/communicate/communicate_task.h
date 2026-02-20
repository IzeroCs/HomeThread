/*
 * Communicate task: RX callback (PING→ACK, khác→NACK) + ping watchdog.
 * Backend ping interval để check. Nếu không nhận ping trong 5 lần × 15s → restart ESP.
 */

#ifndef COMMUNICATE_TASK_H
#define COMMUNICATE_TASK_H

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Khởi tạo communicate và start task (RX handler + ping watchdog).
 * Gọi communicate_init() với callback nội bộ; tạo task ping watchdog (mỗi 15s check, 5 lần miss → esp_restart).
 */
esp_err_t communicate_task_start(void);

#ifdef __cplusplus
}
#endif

#endif /* COMMUNICATE_TASK_H */
