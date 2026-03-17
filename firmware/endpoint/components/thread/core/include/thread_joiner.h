/*
 * Thread Joiner - Core: start OpenThread Joiner với PSKd, callback khi join xong.
 * App cần đã gọi esp_openthread_start() và set default netif trước khi gọi thread_joiner_start.
 */
#pragma once

#include <stdbool.h>
#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

/** Callback khi thiết bị đã join Thread thành công (đã attach). */
typedef void (*thread_joiner_on_joined_fn)(void *ctx);

/** Cấu hình joiner. */
typedef struct {
    const char *pskd;                    /**< PSKd (phải trùng Commissioner joiner add). */
    thread_joiner_on_joined_fn on_joined; /**< Gọi khi join xong (có thể NULL). */
    void *ctx;                           /**< Context truyền vào on_joined. */
} thread_joiner_config_t;

/**
 * Bắt đầu joiner: đăng ký OpenThread event, khi IF_UP/START sẽ gọi otJoinerStart(pskd).
 * Khi Commissioner chấp nhận và join xong, gọi on_joined(ctx).
 * Nếu đã attached sẵn (vd. reboot trong mạng), gọi on_joined ngay.
 *
 * @param config pskd, on_joined, ctx (không được NULL, config->pskd không được NULL).
 * @return ESP_OK khi đăng ký thành công.
 */
esp_err_t thread_joiner_start(const thread_joiner_config_t *config);

/**
 * Trạng thái đã join (attach) vào Thread chưa.
 */
bool thread_joiner_is_joined(void);

/**
 * Ưu tiên không làm Leader: khi prefer_not_leader = true, đặt Leader Weight adjustment = -16
 * (thiết bị rất khó thắng leader election). Gọi khi endpoint không kết nối được (vd. mất backbone);
 * gọi với false khi đã kết nối được. Chỉ có hiệu lực với FTD và khi build có
 * OPENTHREAD_CONFIG_MLE_DEVICE_PROPERTY_LEADER_WEIGHT_ENABLE.
 *
 * @param prefer_not_leader true = không muốn làm Leader (giảm Leader Weight), false = bình thường.
 */
void thread_joiner_set_prefer_not_leader(bool prefer_not_leader);

/**
 * Factory reset: xóa dataset và mọi persistent info OpenThread (NVS).
 * Thiết bị phải detach trước (gọi khi đã attach hoặc chưa đều được; nếu đang attach sẽ tạm detach).
 * Sau khi xóa, lần boot sau sẽ không có dataset -> chạy Joiner lại.
 *
 * @param reboot true = gọi esp_restart() sau khi xóa; false = chỉ xóa, app tự reboot nếu cần.
 * @return ESP_OK khi xóa thành công; ESP_ERR_INVALID_STATE nếu không xóa được (OT yêu cầu role disabled).
 */
esp_err_t thread_joiner_factory_reset(bool reboot);

#ifdef __cplusplus
}
#endif
