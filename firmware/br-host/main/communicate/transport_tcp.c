/*
 * Transport TCP cho frame (Phase 2): BR listen trên port, accept 1 client, đọc/ghi byte stream.
 */

#include "communicate/transport_tcp.h"
#include "br_config.h"
#include "esp_log.h"
#include "lwip/err.h"
#include "lwip/sockets.h"
#include "lwip/sys.h"
#include <fcntl.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <string.h>
#include <errno.h>

#define TAG "transport_tcp"

#define RX_READ_CHUNK      256
#define RX_READ_TIMEOUT_MS 50
#define LISTEN_BACKLOG     1

static transport_tcp_rx_cb_t s_rx_cb;
static void *s_rx_ctx;
static TaskHandle_t s_rx_task_handle;
static int s_listen_fd = -1;
static int s_client_fd = -1;
static volatile bool s_inited;
static volatile bool s_stop_rx;

static void tcp_rx_task(void *pv)
{
    (void)pv;
    uint8_t buf[RX_READ_CHUNK];
    while (!s_stop_rx) {
        if (s_client_fd < 0) {
            vTaskDelay(pdMS_TO_TICKS(500));
            continue;
        }
        int len = recv(s_client_fd, buf, sizeof(buf), 0);
        if (len > 0) {
            ESP_LOGD(TAG, "tcp rx %d bytes", len);
            if (s_rx_cb) {
                s_rx_cb(buf, (size_t)len, s_rx_ctx);
            }
        }
        if (len <= 0) {
            if (len == 0 || (errno != EAGAIN && errno != EWOULDBLOCK)) {
                ESP_LOGW(TAG, "client disconnect");
                close(s_client_fd);
                s_client_fd = -1;
            } else {
                vTaskDelay(pdMS_TO_TICKS(RX_READ_TIMEOUT_MS));
            }
        }
    }
    if (s_client_fd >= 0) {
        close(s_client_fd);
        s_client_fd = -1;
    }
    s_rx_task_handle = NULL;
    vTaskDelete(NULL);
}

static void accept_task(void *pv)
{
    (void)pv;
    const int port = CONFIG_BR_FRAME_TCP_PORT;
    struct sockaddr_in listen_addr = { 0 };
    listen_addr.sin_family = AF_INET;
    listen_addr.sin_addr.s_addr = htonl(INADDR_ANY);
    listen_addr.sin_port = htons((uint16_t)port);

    s_listen_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (s_listen_fd < 0) {
        ESP_LOGE(TAG, "socket failed %d", errno);
        s_inited = true;
        return;
    }
    int opt = 1;
    if (setsockopt(s_listen_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt)) < 0) {
        ESP_LOGW(TAG, "setsockopt SO_REUSEADDR %d", errno);
    }
    if (bind(s_listen_fd, (struct sockaddr *)&listen_addr, sizeof(listen_addr)) < 0) {
        ESP_LOGE(TAG, "bind port %d failed %d", port, errno);
        close(s_listen_fd);
        s_listen_fd = -1;
        s_inited = true;
        return;
    }
    if (listen(s_listen_fd, LISTEN_BACKLOG) < 0) {
        ESP_LOGE(TAG, "listen failed %d", errno);
        close(s_listen_fd);
        s_listen_fd = -1;
        s_inited = true;
        return;
    }
    ESP_LOGI(TAG, "listen on port %d", port);
    s_inited = true;

    while (s_inited && s_listen_fd >= 0) {
        struct sockaddr_in client_addr;
        socklen_t addr_len = sizeof(client_addr);
        int client = accept(s_listen_fd, (struct sockaddr *)&client_addr, &addr_len);
        if (client < 0) {
            vTaskDelay(pdMS_TO_TICKS(200));
            continue;
        }
        if (s_client_fd >= 0) {
            close(client);
            continue;
        }
        int flags = fcntl(client, F_GETFL, 0);
        if (flags >= 0) {
            fcntl(client, F_SETFL, flags | O_NONBLOCK);
        }
        s_client_fd = client;
        ESP_LOGI(TAG, "client connected");
        while (s_inited && s_client_fd >= 0) {
            vTaskDelay(pdMS_TO_TICKS(500));
        }
        s_client_fd = -1;
    }
    if (s_listen_fd >= 0) {
        close(s_listen_fd);
        s_listen_fd = -1;
    }
    vTaskDelete(NULL);
}

esp_err_t transport_tcp_init(transport_tcp_rx_cb_t rx_cb, void *rx_ctx)
{
    if (s_inited) {
        return ESP_ERR_INVALID_STATE;
    }
    s_rx_cb = rx_cb;
    s_rx_ctx = rx_ctx;
    s_stop_rx = false;
    s_client_fd = -1;
    s_listen_fd = -1;

    BaseType_t ok = xTaskCreate(accept_task, "tcp_accept", 2048, NULL, 4, NULL);
    if (ok != pdPASS) {
        return ESP_ERR_NO_MEM;
    }
    while (!s_inited) {
        vTaskDelay(pdMS_TO_TICKS(50));
    }
    if (s_listen_fd < 0) {
        return ESP_FAIL;
    }

    ok = xTaskCreate(tcp_rx_task, TASK_NAME_TCP_RX, TASK_STACK_TCP_RX, NULL, 5, &s_rx_task_handle);
    if (ok != pdPASS) {
        transport_tcp_deinit();
        return ESP_ERR_NO_MEM;
    }
    ESP_LOGI(TAG, "TCP frame transport init OK (port %d)", CONFIG_BR_FRAME_TCP_PORT);
    return ESP_OK;
}

esp_err_t transport_tcp_send(const uint8_t *data, size_t len)
{
    if (!data || s_client_fd < 0) {
        return ESP_ERR_INVALID_STATE;
    }
    ssize_t n = send(s_client_fd, data, len, 0);
    if (n != (ssize_t)len) {
        return ESP_FAIL;
    }
    ESP_LOGD(TAG, "tcp tx %zu bytes", len);
    return ESP_OK;
}

void transport_tcp_deinit(void)
{
    s_inited = false;
    s_stop_rx = true;
    if (s_client_fd >= 0) {
        shutdown(s_client_fd, SHUT_RDWR);
        close(s_client_fd);
        s_client_fd = -1;
    }
    int listen_fd = s_listen_fd;
    s_listen_fd = -1;
    if (listen_fd >= 0) {
        close(listen_fd);
    }
    while (s_rx_task_handle != NULL) {
        vTaskDelay(pdMS_TO_TICKS(20));
    }
}
