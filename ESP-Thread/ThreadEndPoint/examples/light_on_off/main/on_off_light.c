/*
 * Entity Type: on_off_light
 * 
 * Điều khiển đèn LED đơn giản (bật/tắt) qua GPIO.
 * Hỗ trợ nhiều instance, invert logic, initial state.
 */
#include <string.h>
#include <strings.h>
#include "driver/gpio.h"
#include "esp_err.h"
#include "esp_log.h"
#include "entity_model.h"
#include "entity_driver_helper.h"
#include "on_off_light.h"

static const char *TAG = "on_off_light";

/* Instance data cho mỗi đèn */
typedef struct {
    gpio_num_t gpio;
    bool state;              /* Trạng thái hiện tại (true = on, false = off) */
    bool invert_logic;        /* Đảo logic GPIO */
} on_off_light_instance_t;

/* Kiểm tra xem type đã được đăng ký chưa */
static bool s_type_registered = false;

/**
 * Đọc giá trị attribute của đèn.
 */
static int get_attr(const char *entity_id, const char *attr,
                    void *instance_data, char *value_buf, size_t value_buf_len)
{
    (void)entity_id;
    
    if (entity_driver_validate_get_params(attr, value_buf, value_buf_len, instance_data) != 0) {
        return -1;
    }
    
    if (!entity_driver_attr_match(attr, "state")) {
        return -1;
    }
    
    on_off_light_instance_t *inst = (on_off_light_instance_t *)instance_data;
    return entity_driver_format_bool(inst->state, value_buf, value_buf_len);
}

/**
 * Ghi giá trị attribute của đèn.
 */
static int set_attr(const char *entity_id, const char *attr,
                    const char *value, void *instance_data)
{
    (void)entity_id;
    
    if (entity_driver_validate_set_params(attr, value, instance_data) != 0) {
        return -1;
    }
    
    if (!entity_driver_attr_match(attr, "state")) {
        return -1;
    }
    
    on_off_light_instance_t *inst = (on_off_light_instance_t *)instance_data;
    
    bool new_state;
    if (entity_driver_parse_bool(value, &new_state) != 0) {
        return -1;
    }
    
    inst->state = new_state;
    
    /* Điều khiển GPIO với invert logic */
    int gpio_level = inst->invert_logic ? (!new_state ? 1 : 0) : (new_state ? 1 : 0);
    gpio_set_level(inst->gpio, gpio_level);
    
    ESP_LOGI(TAG, "%s: state = %s (GPIO %d = %d)", 
             entity_id ? entity_id : "light", 
             new_state ? "on" : "off", 
             inst->gpio, gpio_level);
    
    return 0;
}

esp_err_t on_off_light_register_type(void)
{
    /* Idempotent: nếu đã đăng ký rồi thì return OK */
    if (s_type_registered) {
        ESP_LOGD(TAG, "Type 'on_off_light' already registered");
        return ESP_OK;
    }
    
    if (entity_register_type("on_off_light", get_attr, set_attr) != 0) {
        return ESP_FAIL;
    }
    
    s_type_registered = true;
    ESP_LOGI(TAG, "Type 'on_off_light' registered");
    return ESP_OK;
}

esp_err_t on_off_light_add(const on_off_light_config_t *config)
{
    if (config == NULL || config->entity_id == NULL || config->name == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    
    if (!s_type_registered) {
        return ESP_ERR_INVALID_STATE;
    }
    
    if (config->gpio < 0) {
        return ESP_ERR_INVALID_ARG;
    }
    
    /* Allocate instance data (static allocation để tránh heap) */
    static on_off_light_instance_t instances[8];  /* Max 8 instances */
    static size_t instance_count = 0;
    
    if (instance_count >= sizeof(instances) / sizeof(instances[0])) {
        ESP_LOGE(TAG, "Too many instances (max %d)", 
                 (int)(sizeof(instances) / sizeof(instances[0])));
        return ESP_ERR_NO_MEM;
    }
    
    on_off_light_instance_t *inst = &instances[instance_count++];
    
    /* Khởi tạo instance */
    inst->gpio = config->gpio;
    inst->state = config->initial_state;
    inst->invert_logic = config->invert_logic;
    
    /* Setup GPIO */
    gpio_reset_pin(inst->gpio);
    gpio_set_direction(inst->gpio, GPIO_MODE_OUTPUT);
    
    /* Set initial state */
    int initial_level = inst->invert_logic ? (!inst->state ? 1 : 0) : (inst->state ? 1 : 0);
    gpio_set_level(inst->gpio, initial_level);
    
    if (entity_add(config->entity_id, "on_off_light", config->name, inst) != 0) {
        instance_count--;
        return ESP_FAIL;
    }
    
    ESP_LOGI(TAG, "Added %s (%s) on GPIO %d, initial_state=%s, invert=%s",
             config->entity_id, config->name, config->gpio,
             config->initial_state ? "on" : "off",
             config->invert_logic ? "yes" : "no");
    
    return ESP_OK;
}

esp_err_t on_off_light_register(int gpio_num, const char *entity_id, const char *name)
{
    if (!s_type_registered) {
        esp_err_t err = on_off_light_register_type();
        if (err != ESP_OK) {
            return err;
        }
    }
    
    on_off_light_config_t config = {
        .gpio = gpio_num,
        .initial_state = false,
        .invert_logic = false,
        .entity_id = entity_id ? entity_id : "light.0",
        .name = name ? name : "LED"
    };
    
    return on_off_light_add(&config);
}
