/*
 * Status LED - Implementation.
 * WS2812 (1 pixel) qua RMT, mau GRB.
 */
#include <string.h>
#include "status_led.h"
#include "driver/rmt_tx.h"
#include "driver/rmt_encoder.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "status_led";

#define RMT_RESOLUTION_HZ  10000000
#define NUM_PIXELS         1
#define BYTES_PER_PIXEL    3   /* GRB */
#define BRIGHTNESS         20  /* 0..255, do yeu hon 255 */

/* WS2812 timing (0.3us / 0.9us) */
static rmt_symbol_word_t s_ws2812_zero;
static rmt_symbol_word_t s_ws2812_one;
static rmt_symbol_word_t s_ws2812_reset;

static size_t ws2812_encoder_cb(const void *data, size_t data_size,
                                 size_t symbols_written, size_t symbols_free,
                                 rmt_symbol_word_t *symbols, bool *done, void *arg)
{
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
static volatile status_led_state_t s_state = STATUS_LED_BOOT;
static volatile status_led_attached_role_t s_attached_role = STATUS_LED_ATTACHED_CHILD;
static unsigned s_blink_ms;

/* GRB buffer cho 1 pixel */
static uint8_t s_pixel[BYTES_PER_PIXEL];

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
        rmt_tx_wait_all_done(s_chan, pdMS_TO_TICKS(500));
    }
}

static void status_led_task(void *arg)
{
    unsigned blink_ms = s_blink_ms;
    unsigned tick = 0;
    while (1) {
        status_led_state_t st = s_state;
        if (st == STATUS_LED_ATTACHED) {
            /* Leader = tim, Router = xanh duong, Child = xanh la */
            switch (s_attached_role) {
                case STATUS_LED_ATTACHED_LEADER:
                    set_rgb(BRIGHTNESS, 0, BRIGHTNESS);  /* tim */
                    break;
                case STATUS_LED_ATTACHED_ROUTER:
                    set_rgb(0, 0, BRIGHTNESS);  /* xanh duong */
                    break;
                default:
                    set_rgb(0, BRIGHTNESS, 0);  /* xanh la (child) */
                    break;
            }
            flush_led();
        } else {
            /* Boot=do, NotJoined=vang, Detached=xanh duong */
            uint8_t r = 0, g = 0, b = 0;
            switch (st) {
                case STATUS_LED_BOOT:       r = BRIGHTNESS; g = 0;   b = 0;   break;
                case STATUS_LED_NOT_JOINED: r = BRIGHTNESS; g = BRIGHTNESS; b = 0;   break;
                case STATUS_LED_DETACHED:   r = 0;   g = 0;   b = BRIGHTNESS; break;
                default: break;
            }
            if ((tick & 1) == 0) {
                set_rgb(r, g, b);
            } else {
                set_rgb(0, 0, 0);
            }
            flush_led();
            tick++;
        }
        vTaskDelay(pdMS_TO_TICKS(blink_ms));
    }
}

esp_err_t status_led_start(const status_led_config_t *config)
{
    int gpio = (config && config->gpio_num != 0) ? config->gpio_num : CONFIG_STATUS_LED_GPIO_DEFAULT;
    unsigned blink_ms = (config && config->blink_ms != 0) ? config->blink_ms : CONFIG_STATUS_LED_BLINK_MS;
    uint32_t stack = (config && config->task_stack != 0) ? config->task_stack : 2048;
    UBaseType_t prio = (config && config->task_prio != 0) ? config->task_prio : 2;

    uint32_t res = RMT_RESOLUTION_HZ;
    /* 0.3us, 0.9us (WS2812) */
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
        .mem_block_symbols = 128,  /* 1 pixel ~25 symbols + margin */
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
        .min_chunk_size = 32,  /* 8 symbols/byte * 3 bytes + reset */
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

    s_blink_ms = blink_ms;
    s_state = STATUS_LED_BOOT;
    set_rgb(BRIGHTNESS, 0, 0);
    flush_led();

    if (xTaskCreate(status_led_task, "status_led", stack, NULL, prio, NULL) != pdPASS) {
        rmt_disable(s_chan);
        rmt_del_encoder(s_encoder);
        rmt_del_channel(s_chan);
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGI(TAG, "Status LED GPIO %d, blink %u ms", gpio, (unsigned)blink_ms);
    return ESP_OK;
}

void status_led_set_state(status_led_state_t state)
{
    s_state = state;
}

void status_led_set_attached_role(status_led_attached_role_t role)
{
    s_attached_role = role;
}
