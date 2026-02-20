/*
 * Communicate command: handler cho CMD STATE, DATASET_ACTIVE, IP_ADDR.
 * Gọi từ communicate_task RX callback.
 */

#ifndef COMMUNICATE_COMMAND_H
#define COMMUNICATE_COMMAND_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Xử lý CMD_STATE: gửi CMD_ACK (không payload).
 * Trả 0 nếu gửi thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_state(uint8_t frame_id);

/**
 * Xử lý CMD_DATASET_ACTIVE: lấy Active Dataset TLV từ OpenThread, gửi CMD_ACK + TLV.
 * Trả 0 nếu thành công, khác 0 nếu lỗi (detached, lock fail, ...).
 */
int communicate_command_handle_dataset_active(uint8_t frame_id);

/**
 * Xử lý CMD_IP_ADDR: lấy IPv6 Leader RLOC (16 bytes), gửi CMD_ACK + 16 bytes.
 * Trả 0 nếu thành công, khác 0 nếu lỗi.
 */
int communicate_command_handle_ipaddr(uint8_t frame_id);

#ifdef __cplusplus
}
#endif

#endif /* COMMUNICATE_COMMAND_H */
