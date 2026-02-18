/*
 * Entity Type: on_off_light
 * 
 * Điều khiển đèn LED đơn giản (bật/tắt) qua GPIO.
 * Hỗ trợ nhiều instance, invert logic, initial state.
 * 
 * TODO: Migrate to struct-based approach (see MIGRATION_TO_STRUCT_BASED.md)
 *       - Use entity_light_t struct from entity/light/include/entity_light.h
 *       - Register type: entity_register_type("on_off_light", ENTITY_TYPE_LIGHT)
 *       - Add entity: entity_add(wrapper_struct, ENTITY_TYPE_LIGHT)
 */
#include <string.h>
#include "driver/gpio.h"
#include "esp_err.h"
#include "esp_log.h"
#include "on_off_light.h"

static const char *TAG = "on_off_light";

/**
 * Đăng ký type "on_off_light" vào Entity Model.
 * 
 * TODO: Implement struct-based registration
 *   - Include: #include "entity_model.h"
 *   - Include: #include "entity_light.h"
 *   - Call: entity_register_type("on_off_light", ENTITY_TYPE_LIGHT)
 */
esp_err_t on_off_light_register_type(void)
{
    ESP_LOGW(TAG, "on_off_light_register_type() - Not implemented yet (migration pending)");
    return ESP_ERR_NOT_SUPPORTED;
}

/**
 * Thêm một instance đèn vào Entity Model.
 * 
 * TODO: Implement struct-based approach
 *   1. Create wrapper struct:
 *      typedef struct {
 *          entity_light_t entity;
 *          gpio_num_t gpio;
 *          bool invert_logic;
 *      } on_off_light_wrapper_t;
 *   
 *   2. Allocate wrapper (stack or heap)
 *   3. Fill entity_light_t fields:
 *      - base.entity_id, base.name, base.type, base.device_class
 *      - state, brightness, mode, etc.
 *   4. Store GPIO info in wrapper
 *   5. Setup GPIO pin
 *   6. Call entity_add(wrapper, ENTITY_TYPE_LIGHT)
 */
esp_err_t on_off_light_add(const on_off_light_config_t *config)
{
    if (config == NULL || config->entity_id == NULL || config->name == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    
    if (config->gpio < 0) {
        return ESP_ERR_INVALID_ARG;
    }
    
    ESP_LOGW(TAG, "on_off_light_add() - Not implemented yet (migration pending)");
    ESP_LOGI(TAG, "Would add: %s (%s) on GPIO %d, initial_state=%s, invert=%s",
             config->entity_id, config->name, config->gpio,
             config->initial_state ? "on" : "off",
             config->invert_logic ? "yes" : "no");
    
    return ESP_ERR_NOT_SUPPORTED;
}

/**
 * Helper function: Đăng ký type và thêm một instance đèn đơn giản.
 * 
 * TODO: Update implementation after migration
 */
esp_err_t on_off_light_register(int gpio_num, const char *entity_id, const char *name)
{
    on_off_light_config_t config = {
        .gpio = gpio_num,
        .initial_state = false,
        .invert_logic = false,
        .entity_id = entity_id ? entity_id : "light.0",
        .name = name ? name : "LED"
    };
    
    return on_off_light_add(&config);
}
