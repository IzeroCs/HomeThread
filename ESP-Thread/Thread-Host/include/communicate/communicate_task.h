/*
 * Communicate task: RX callback (STATE→ACK, khác→NACK) + state watchdog.
 * Backend gửi STATE interval để check. Nếu không nhận state trong 5 lần × 15s → restart ESP.
 */

#ifndef COMMUNICATE_TASK_H
#define COMMUNICATE_TASK_H

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Khởi tạo communicate và start task (RX handler + state watchdog).
 * Gọi communicate_queue_init(), communicate_init() với callback đẩy frame vào queue; tạo task state watchdog.
 */
esp_err_t communicate_task_start(void);

/** Gọi từ communicate_queue process task khi xử lý CMD_STATE (báo state watchdog). */
void communicate_task_mark_state_received(void);

/**
 * Gửi CMD_STATE tới backend kèm 1 byte state (0=disabled, 1=detached, 2=child, 3=router, 4=leader).
 * Nếu không nhận ACK trong 1s thì gửi lại (retry).
 */
void communicate_task_send_state_to_backend(uint8_t state_byte);

#ifdef __cplusplus
}
#endif

#endif /* COMMUNICATE_TASK_H */
