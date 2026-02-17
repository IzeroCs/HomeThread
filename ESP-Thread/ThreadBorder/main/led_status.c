/*
 * LED status cho ot-br trên ESP32-H2.
 * WS2812 (1 chân data, mặc định GPIO 8) qua RMT.
 * Boot: đỏ nhấp nháy | Detached: xanh dương nhấp nháy | Leader: xanh lá tĩnh.
 */

#include "led_status.h"
#include "driver/rmt_encoder.h"
#include "driver/rmt_tx.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "openthread/thread.h"

static const char *TAG = "led_status";

#if CONFIG_LED_STATUS_ENABLE

#define RMT_RESOLUTION_HZ  10000000
#define BYTES_PER_PIXEL    3   /* GRB */
#define BRIGHTNESS         20  /* 0..255 */

static rmt_symbol_word_t s_ws2812_zero;
static rmt_symbol_word_t s_ws2812_one;
static rmt_symbol_word_t s_ws2812_reset;

static size_t ws2812_encoder_cb(const void *data, size_t data_size,
                                size_t symbols_written, size_t symbols_free,
                                rmt_symbol_word_t *symbols, bool *done, void *arg)
{
    (void)arg;
    if (symbols_free < 8) {
        return 0;
    }
    size_t data_pos = symbols_written / 8;
    const uint8_t *bytes = (const uint8_t *)data;
    if (data_pos < data_size) {
        for (int m = 0x80; m != 0; m >>= 1) {
            *symbols++ = (bytes[data_pos] & m) ? s_ws2812_one : s_ws2812_zero;
        }
        return 8;
    }
    symbols[0] = s_ws2812_reset;
    *done = true;
    return 1;
}

static rmt_channel_handle_t s_chan;
static rmt_encoder_handle_t s_encoder;
static uint8_t s_pixel[BYTES_PER_PIXEL];  /* GRB */

static void set_rgb(uint8_t r, uint8_t g, uint8_t b)
{
    s_pixel[0] = g;
    s_pixel[1] = r;
    s_pixel[2] = b;
}

static void flush_led(void)
{
    rmt_transmit_config_t tx_cfg = { .loop_count = 0 };
    if (rmt_transmit(s_chan, s_encoder, s_pixel, sizeof(s_pixel), &tx_cfg) == ESP_OK) {
        rmt_tx_wait_all_done(s_chan, pdMS_TO_TICKS(100));
    }
}

#define BLINK_MS    1200   /* nửa chu kỳ nhấp nháy (ms): 800 = ~0.8s sáng, 0.8s tắt */
#define TASK_MS     100

static void led_status_task(void *arg)
{
    (void)arg;
    uint32_t tick = 0;

    while (1) {
        otDeviceRole role = OT_DEVICE_ROLE_DISABLED;
        otInstance *instance = esp_openthread_get_instance();
        if (instance && esp_openthread_lock_acquire(pdMS_TO_TICKS(200))) {
            role = otThreadGetDeviceRole(instance);
            esp_openthread_lock_release();
        }

        bool blink_on = (tick / (BLINK_MS / TASK_MS)) % 2;

        if (role == OT_DEVICE_ROLE_DISABLED) {
            set_rgb(blink_on ? BRIGHTNESS : 0, 0, 0);
        } else if (role == OT_DEVICE_ROLE_DETACHED) {
            set_rgb(0, 0, blink_on ? BRIGHTNESS : 0);
        } else {
            /* Leader / Router / Child: xanh lá tĩnh */
            set_rgb(0, BRIGHTNESS, 0);
        }
        flush_led();
        tick += TASK_MS;
        vTaskDelay(pdMS_TO_TICKS(TASK_MS));
    }
}

#endif /* CONFIG_LED_STATUS_ENABLE */

esp_err_t led_status_start(const led_status_config_t *config)
{
#if !CONFIG_LED_STATUS_ENABLE
    (void)config;
    return ESP_OK;
#else
    int gpio = (config && config->gpio_data != 0) ? config->gpio_data : CONFIG_LED_STATUS_GPIO;

    uint32_t res = RMT_RESOLUTION_HZ;
    s_ws2812_zero = (rmt_symbol_word_t){
        .level0 = 1, .duration0 = (uint16_t)(3 * res / 10000000),
        .level1 = 0, .duration1 = (uint16_t)(9 * res / 10000000),
    };
    s_ws2812_one = (rmt_symbol_word_t){
        .level0 = 1, .duration0 = (uint16_t)(9 * res / 10000000),
        .level1 = 0, .duration1 = (uint16_t)(3 * res / 10000000),
    };
    s_ws2812_reset = (rmt_symbol_word_t){
        .level0 = 0, .duration0 = (uint16_t)(res / 1000000 * 50 / 2),
        .level1 = 0, .duration1 = (uint16_t)(res / 1000000 * 50 / 2),
    };

    rmt_tx_channel_config_t tx_cfg = {
        .clk_src = RMT_CLK_SRC_DEFAULT,
        .gpio_num = gpio,
        .mem_block_symbols = 64,
        .resolution_hz = res,
        .trans_queue_depth = 2,
    };
    esp_err_t err = rmt_new_tx_channel(&tx_cfg, &s_chan);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "rmt_new_tx_channel: %s", esp_err_to_name(err));
        return err;
    }

    rmt_simple_encoder_config_t enc_cfg = {
        .callback = ws2812_encoder_cb,
        .min_chunk_size = 32,
    };
    err = rmt_new_simple_encoder(&enc_cfg, &s_encoder);
    if (err != ESP_OK) {
        rmt_del_channel(s_chan);
        return err;
    }
    err = rmt_enable(s_chan);
    if (err != ESP_OK) {
        rmt_del_encoder(s_encoder);
        rmt_del_channel(s_chan);
        return err;
    }

    set_rgb(0, 0, 0);
    flush_led();

    if (xTaskCreate(led_status_task, "led_status", 2048, NULL, 5, NULL) != pdPASS) {
        rmt_disable(s_chan);
        rmt_del_encoder(s_encoder);
        rmt_del_channel(s_chan);
        return ESP_ERR_NO_MEM;
    }
    ESP_LOGI(TAG, "LED status started (WS2812 GPIO %d)", gpio);
    return ESP_OK;
#endif
}
