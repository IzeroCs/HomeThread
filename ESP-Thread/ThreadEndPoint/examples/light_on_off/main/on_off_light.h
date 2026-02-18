/*
 * Entity Type: on_off_light
 * 
 * Điều khiển đèn LED đơn giản (bật/tắt) qua GPIO.
 * 
 * TODO: Migrate to struct-based approach (see MIGRATION_TO_STRUCT_BASED.md)
 * 
 * Attributes:
 *   - state: "on" hoặc "off"
 */
#pragma once

#include "esp_err.h"
#include "driver/gpio.h"

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Cấu hình cho một instance đèn on/off
 * 
 * TODO: This config struct will be used to create entity_light_t struct
 *       during migration to struct-based approach.
 */
typedef struct {
    gpio_num_t gpio;              ///< GPIO pin để điều khiển đèn
    bool initial_state;            ///< Trạng thái ban đầu (true = on, false = off)
    bool invert_logic;             ///< Đảo logic GPIO (true = LOW = on, false = HIGH = on)
    const char *entity_id;        ///< Entity ID (vd: "light.0", "light.1")
    const char *name;              ///< Tên hiển thị (vd: "LED", "Living Room Light")
} on_off_light_config_t;

/**
 * Đăng ký type "on_off_light" vào Entity Model (chỉ cần gọi 1 lần).
 * 
 * TODO: Update to struct-based registration
 *   - Include: #include "entity_model.h"
 *   - Include: #include "entity_light.h"
 *   - Call: entity_register_type("on_off_light", ENTITY_TYPE_LIGHT)
 * 
 * @return ESP_OK nếu thành công, ESP_FAIL nếu đã đăng ký rồi
 */
esp_err_t on_off_light_register_type(void);

/**
 * Thêm một instance đèn vào Entity Model.
 * 
 * TODO: Update to struct-based approach
 *   - Create entity_light_t struct (or wrapper with GPIO info)
 *   - Fill all fields from config
 *   - Call entity_add() with struct pointer
 * 
 * @param config Cấu hình cho instance đèn
 * @return ESP_OK nếu thành công, ESP_ERR_INVALID_ARG nếu config không hợp lệ
 * 
 * @note Phải gọi on_off_light_register_type() trước khi thêm instance.
 * @note Có thể gọi nhiều lần để thêm nhiều đèn (light.0, light.1, ...).
 * 
 * @example
 *   on_off_light_config_t cfg = {
 *       .gpio = GPIO_NUM_2,
 *       .initial_state = false,
 *       .invert_logic = false,
 *       .entity_id = "light.0",
 *       .name = "Main LED"
 *   };
 *   on_off_light_add(&cfg);
 */
esp_err_t on_off_light_add(const on_off_light_config_t *config);

/**
 * Helper function: Đăng ký type và thêm một instance đèn đơn giản.
 * 
 * TODO: Update implementation after migration
 * 
 * @param gpio_num GPIO pin
 * @param entity_id Entity ID (vd: "light.0")
 * @param name Tên hiển thị (vd: "LED")
 * @return ESP_OK nếu thành công
 * 
 * @note Đây là hàm tiện ích cho trường hợp đơn giản (1 đèn).
 *       Để thêm nhiều đèn hoặc cấu hình phức tạp hơn, dùng on_off_light_add().
 */
esp_err_t on_off_light_register(int gpio_num, const char *entity_id, const char *name);

#ifdef __cplusplus
}
#endif
