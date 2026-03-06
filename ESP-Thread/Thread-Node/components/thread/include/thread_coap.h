/*
 * Thread CoAP - Shared CoAP server management.
 * 
 * Component để quản lý CoAP server dùng chung cho các component khác
 * (entity_coap_server, ...).
 */
#pragma once

#include "esp_err.h"
#include "openthread/coap.h"
#include "openthread/ip6.h"
#include "openthread/message.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Start CoAP server (idempotent - chỉ start một lần).
 * 
 * @return ESP_OK nếu start thành công hoặc đã start rồi
 * @return ESP_ERR_INVALID_STATE nếu OpenThread instance chưa sẵn sàng
 * @return ESP_FAIL nếu start thất bại
 */
esp_err_t thread_coap_server_start(void);

/**
 * Check xem CoAP server đã start chưa.
 * 
 * @return true nếu đã start, false nếu chưa
 */
bool thread_coap_server_is_started(void);

/**
 * Setup và add CoAP resource (wrapper tối ưu - tự động setup resource structure).
 * Tự động start CoAP server nếu chưa start, setup resource, acquire lock, add resource, release lock.
 * 
 * @param resource Pointer đến otCoapResource structure (phải là static hoặc persistent)
 * @param uri_path URI path string (ví dụ: "entities")
 * @param handler Handler function để xử lý request
 * @param context Context pointer (có thể NULL)
 * @return ESP_OK nếu thành công
 * @return ESP_ERR_INVALID_STATE nếu OpenThread instance chưa sẵn sàng
 * @return ESP_FAIL nếu start server hoặc add resource thất bại
 */
esp_err_t thread_coap_register_resource(otCoapResource *resource, const char *uri_path, 
                                        otCoapRequestHandler handler, void *context);

/**
 * Add CoAP resource (wrapper tối ưu).
 * Tự động start CoAP server nếu chưa start, acquire lock, add resource, release lock.
 * Resource structure phải đã được setup trước.
 * 
 * @param resource Pointer đến otCoapResource structure (phải là static hoặc persistent)
 * @return ESP_OK nếu thành công
 * @return ESP_ERR_INVALID_STATE nếu OpenThread instance chưa sẵn sàng
 * @return ESP_FAIL nếu start server hoặc add resource thất bại
 */
esp_err_t thread_coap_add_resource(otCoapResource *resource);

/**
 * Gửi CoAP response với Message ID + Token copy từ request (wrapper tối ưu).
 * Tự động tạo response message, copy Message ID + Token từ request, thêm payload nếu có.
 * 
 * @param aMessage Request message (để copy Message ID + Token)
 * @param aMessageInfo Message info (để gửi response)
 * @param response_code CoAP response code (ví dụ: OT_COAP_CODE_CONTENT, OT_COAP_CODE_NOT_FOUND)
 * @param payload Payload data (có thể NULL nếu không có payload)
 * @param payload_len Payload length (0 nếu không có payload)
 */
void thread_coap_send_response(otMessage *aMessage, const otMessageInfo *aMessageInfo,
                                otCoapCode response_code, const char *payload, size_t payload_len);

#ifdef __cplusplus
}
#endif
