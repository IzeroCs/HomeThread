/*
 * Entity Type: on_off_light
 * 
 * Điều khiển đèn LED đơn giản (bật/tắt) qua GPIO.
 * Hỗ trợ nhiều instance, invert logic, initial state.
 * 
 * Struct-based approach: Tạo wrapper struct với entity_light_t ở đầu.
 */
#include <string.h>
#include <stdlib.h>
#include <time.h>
#include "driver/gpio.h"
#include "esp_err.h"
#include "esp_log.h"
#include "on_off_light.h"
#include "entity_model.h"
#include "entity_light.h"

static const char *TAG = "on_off_light";

/**
 * Wrapper struct để lưu entity_light_t + driver-specific data (GPIO).
 * entity_light_t phải ở đầu để có thể cast về entity_base_t.
 */
typedef struct {
    entity_light_t entity;      // Entity struct ở đầu (có entity_base_t base)
    gpio_num_t gpio;            // Driver-specific: GPIO pin
    bool invert_logic;          // Driver-specific: Invert GPIO logic
} on_off_light_wrapper_t;

/**
 * Update GPIO pin dựa trên state của entity.
 */
static void update_gpio(on_off_light_wrapper_t *wrapper)
{
    if (wrapper == NULL) {
        return;
    }
    
    // Tính toán GPIO level dựa trên state và invert_logic
    int level = wrapper->invert_logic 
        ? (!wrapper->entity.state ? 1 : 0)  // Invert: state=false -> HIGH, state=true -> LOW
        : (wrapper->entity.state ? 1 : 0);  // Normal: state=true -> HIGH, state=false -> LOW
    
    gpio_set_level(wrapper->gpio, level);
}

/**
 * Đăng ký type "on_off_light" vào Entity Model.
 * 
 * @return ESP_OK nếu thành công, ESP_FAIL nếu đã đăng ký rồi
 */
esp_err_t on_off_light_register_type(void)
{
    int ret = entity_register_type("on_off_light", ENTITY_TYPE_LIGHT);
    if (ret == 0) {
        ESP_LOGI(TAG, "Registered type: on_off_light");
        return ESP_OK;
    } else {
        ESP_LOGW(TAG, "Type registration failed or already registered");
        return ESP_FAIL;
    }
}

/**
 * Thêm một instance đèn vào Entity Model.
 * 
 * @param config Cấu hình cho instance đèn
 * @return ESP_OK nếu thành công, ESP_ERR_INVALID_ARG nếu config không hợp lệ
 * 
 * @note Phải gọi on_off_light_register_type() trước khi thêm instance.
 * @note Có thể gọi nhiều lần để thêm nhiều đèn (light.0, light.1, ...).
 */
esp_err_t on_off_light_add(const on_off_light_config_t *config)
{
    if (config == NULL || config->entity_id == NULL || config->name == NULL) {
        ESP_LOGE(TAG, "Invalid config: NULL pointer");
        return ESP_ERR_INVALID_ARG;
    }
    
    if (config->gpio < 0) {
        ESP_LOGE(TAG, "Invalid GPIO: %d", config->gpio);
        return ESP_ERR_INVALID_ARG;
    }
    
    // Allocate wrapper struct (heap allocation)
    on_off_light_wrapper_t *wrapper = calloc(1, sizeof(on_off_light_wrapper_t));
    if (wrapper == NULL) {
        ESP_LOGE(TAG, "Failed to allocate wrapper");
        return ESP_ERR_NO_MEM;
    }
    
    // Fill entity_base_t fields
    strncpy(wrapper->entity.base.entity_id, config->entity_id, sizeof(wrapper->entity.base.entity_id) - 1);
    wrapper->entity.base.entity_id[sizeof(wrapper->entity.base.entity_id) - 1] = '\0';
    
    strncpy(wrapper->entity.base.name, config->name, sizeof(wrapper->entity.base.name) - 1);
    wrapper->entity.base.name[sizeof(wrapper->entity.base.name) - 1] = '\0';
    
    wrapper->entity.base.type = ENTITY_TYPE_LIGHT;
    strncpy(wrapper->entity.base.device_class, "on_off", sizeof(wrapper->entity.base.device_class) - 1);
    wrapper->entity.base.device_class[sizeof(wrapper->entity.base.device_class) - 1] = '\0';
    
    wrapper->entity.base.available = true;
    wrapper->entity.base.last_update = (uint32_t)time(NULL);
    
    // Fill entity_light_t specific fields
    wrapper->entity.state = config->initial_state;
    wrapper->entity.brightness = 100;  // Default 100% (on/off light always at max brightness)
    wrapper->entity.mode = LIGHT_MODE_ON_OFF;
    wrapper->entity.color_temp = 0;  // Not supported for on/off light
    memset(wrapper->entity.rgb, 0, sizeof(wrapper->entity.rgb));
    
    // Capabilities
    wrapper->entity.min_brightness = 0;
    wrapper->entity.max_brightness = 100;
    wrapper->entity.min_color_temp = 0;
    wrapper->entity.max_color_temp = 0;
    
    // Effects
    strncpy(wrapper->entity.effect, "none", sizeof(wrapper->entity.effect) - 1);
    wrapper->entity.transition_time = 0;
    
    // Driver-specific data
    wrapper->gpio = config->gpio;
    wrapper->invert_logic = config->invert_logic;
    
    // Setup GPIO pin
    gpio_reset_pin(wrapper->gpio);
    gpio_set_direction(wrapper->gpio, GPIO_MODE_OUTPUT);
    update_gpio(wrapper);
    
    // Add to entity model
    int ret = entity_add(wrapper, ENTITY_TYPE_LIGHT);
    if (ret != 0) {
        ESP_LOGE(TAG, "Failed to add entity to model");
        free(wrapper);
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "Added light: %s (%s) on GPIO %d, state=%s, invert=%s",
             wrapper->entity.base.entity_id, wrapper->entity.base.name, wrapper->gpio,
             wrapper->entity.state ? "on" : "off",
             wrapper->invert_logic ? "yes" : "no");
    
    return ESP_OK;
}

/**
 * Helper function: Đăng ký type và thêm một instance đèn đơn giản.
 * 
 * @param gpio_num GPIO pin
 * @param entity_id Entity ID (vd: "light.0")
 * @param name Tên hiển thị (vd: "LED")
 * @return ESP_OK nếu thành công
 * 
 * @note Đây là hàm tiện ích cho trường hợp đơn giản (1 đèn).
 *       Để thêm nhiều đèn hoặc cấu hình phức tạp hơn, dùng on_off_light_add().
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
