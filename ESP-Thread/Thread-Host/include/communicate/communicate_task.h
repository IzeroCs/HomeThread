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
 * Gọi sau khi đã gửi ACK (16 byte leader RLOC) cho CMD_IP_ADDR.
 * BR chờ backend gửi ACK xác nhận; không nhận trong 1s thì gửi lại (retry).
 */
void communicate_task_mark_ip_response_pending(uint8_t frame_id);

/**
 * Gửi CMD_DATA (push) lên backend và chờ CMD_ACK (cùng Frame ID) trong timeout_ms.
 * Dùng cho forward CoAP device/register|update|ping: BR chỉ trả CoAP ACK cho child khi backend đã ACK.
 * @param data Payload (CBOR), có thể NULL nếu len == 0.
 * @param len Độ dài payload (tối đa COMMUNICATE_FRAME_MAX_DATA_LEN).
 * @param timeout_ms Timeout chờ CMD_ACK (ms). Khuyến nghị 2000–3000.
 * @return ESP_OK nếu nhận CMD_ACK đúng Frame ID trong thời gian; ESP_ERR_TIMEOUT nếu hết timeout; ESP_ERR_* khác nếu gửi lỗi.
 */
esp_err_t communicate_task_send_cmd_data_and_wait_ack(const uint8_t *data, size_t len, uint32_t timeout_ms);

#ifdef __cplusplus
}
#endif

#endif /* COMMUNICATE_TASK_H */
