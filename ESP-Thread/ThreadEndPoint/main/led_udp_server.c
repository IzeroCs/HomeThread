/*
 * UDP server nhận lệnh "on" / "off" để bật/tắt LED trên Thread.
 * Chạy sau khi device đã join Thread (có IPv6).
 */
#include <string.h>
#include <strings.h>
#include "lwip/sockets.h"
#include "lwip/netdb.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "driver/gpio.h"
#include "led_udp_server.h"

static const char *TAG = "led_udp";
static int s_sock = -1;
static gpio_num_t s_led_gpio = GPIO_NUM_8;  /* ESP32-C6 DevKit: LED trên GPIO8 (có thể đổi nếu dùng LED ngoài) */

#define LED_UDP_STACK 4096

static void led_set(bool on)
{
    gpio_set_level(s_led_gpio, on ? 1 : 0);
}

static void udp_server_task(void *pvParameters)
{
    struct sockaddr_in6 addr;
    socklen_t addr_len = sizeof(addr);
    uint8_t buf[32];
    int len;

    memset(&addr, 0, sizeof(addr));
    addr.sin6_family = AF_INET6;
    addr.sin6_addr = in6addr_any;
    addr.sin6_port = htons(LED_UDP_PORT);

    s_sock = socket(AF_INET6, SOCK_DGRAM, IPPROTO_UDP);
    if (s_sock < 0) {
        ESP_LOGE(TAG, "socket: %d", s_sock);
        vTaskDelete(NULL);
        return;
    }

    if (bind(s_sock, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
        ESP_LOGE(TAG, "bind failed");
        close(s_sock);
        s_sock = -1;
        vTaskDelete(NULL);
        return;
    }

    ESP_LOGI(TAG, "UDP LED server listening on port %d", LED_UDP_PORT);

    for (;;) {
        len = recvfrom(s_sock, buf, sizeof(buf) - 1, 0, (struct sockaddr *)&addr, &addr_len);
        if (len <= 0) continue;
        buf[len] = '\0';

        /* Chuẩn hóa: bỏ \r\n, so sánh không phân biệt hoa thường */
        while (len > 0 && (buf[len - 1] == '\r' || buf[len - 1] == '\n')) buf[--len] = '\0';

        if (strcasecmp((char *)buf, "on") == 0) {
            led_set(true);
            ESP_LOGI(TAG, "LED ON");
        } else if (strcasecmp((char *)buf, "off") == 0) {
            led_set(false);
            ESP_LOGI(TAG, "LED OFF");
        } else {
            ESP_LOGD(TAG, "unknown cmd: %s", buf);
        }
    }
}

esp_err_t led_udp_server_start(void)
{
    /* GPIO cho LED - ESP32-C6 DevKit thường LED trên GPIO8 */
    gpio_reset_pin(s_led_gpio);
    gpio_set_direction(s_led_gpio, GPIO_MODE_OUTPUT);
    led_set(false);

    if (xTaskCreate(udp_server_task, "led_udp", LED_UDP_STACK, NULL, 5, NULL) != pdPASS) {
        ESP_LOGE(TAG, "task create failed");
        return ESP_ERR_NO_MEM;
    }
    return ESP_OK;
}

void led_udp_server_stop(void)
{
    if (s_sock >= 0) {
        close(s_sock);
        s_sock = -1;
    }
}
