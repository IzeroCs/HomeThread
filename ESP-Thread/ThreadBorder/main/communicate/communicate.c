/*
 * Communicate: build/parse frame, init transport (UART = frame port).
 */

#include "communicate.h"
#include "communicate_config.h"
#include "transport_uart.h"
#include "esp_log.h"
#include <stdlib.h>
#include <string.h>

#define TAG "communicate"

#define SOF  0xAA
#define EOF_MARK 0x55

#define FRAME_HEADER_LEN  5   /* SOF + FrameID + CMD + LEN_H + LEN_L */
#define FRAME_TAIL_LEN    2   /* CRC8 + EOF */
#define FRAME_MIN_LEN     (FRAME_HEADER_LEN + FRAME_TAIL_LEN)

#if !COMMUNICATE_FRAME_PORT_IS_UART
#error "communicate.c currently only supports FRAME_PORT_IS_UART=1"
#endif

/* CRC-8/MAXIM: poly 0x31, init 0x00. Input = [Frame ID, CMD, LEN_H, LEN_L, DATA...] */
static uint8_t crc8_maxim(const uint8_t *data, size_t len)
{
    uint8_t crc = 0x00;
    while (len--) {
        crc ^= *data++;
        for (int i = 0; i < 8; i++) {
            if (crc & 0x80) {
                crc = (crc << 1) ^ 0x31;
            } else {
                crc = crc << 1;
            }
        }
    }
    return crc;
}

static communicate_rx_frame_cb_t s_rx_cb;
static void *s_rx_ctx;

/* RX buffer: tích lũy byte, tìm SOF...EOF và parse. */
#define RX_BUF_SIZE  (COMMUNICATE_FRAME_MAX_DATA_LEN + FRAME_MIN_LEN + 64)
static uint8_t s_rx_buf[RX_BUF_SIZE];
static size_t s_rx_len;

static void on_uart_rx(uint8_t *data, size_t len, void *ctx)
{
    (void)ctx;
    for (size_t i = 0; i < len; i++) {
        if (s_rx_len >= RX_BUF_SIZE) {
            s_rx_len = 0;
            continue;
        }
        s_rx_buf[s_rx_len++] = data[i];

        /* Tìm SOF ở đầu buffer hiện tại (có thể bỏ byte thừa trước SOF). */
        size_t start = 0;
        while (start < s_rx_len && s_rx_buf[start] != SOF) {
            start++;
        }
        if (start > 0) {
            memmove(s_rx_buf, s_rx_buf + start, s_rx_len - start);
            s_rx_len -= start;
        }
        if (s_rx_len < FRAME_HEADER_LEN) {
            continue;
        }
        uint16_t data_len = (uint16_t)((s_rx_buf[3] << 8) | s_rx_buf[4]);
        if (data_len > COMMUNICATE_FRAME_MAX_DATA_LEN) {
            s_rx_len = 0;
            continue;
        }
        size_t frame_len = FRAME_HEADER_LEN + data_len + FRAME_TAIL_LEN;
        if (s_rx_len < frame_len) {
            continue;
        }
        if (s_rx_buf[frame_len - 1] != EOF_MARK) {
            s_rx_len = 0;
            continue;
        }
        uint8_t crc = crc8_maxim(s_rx_buf + 1, (size_t)FRAME_HEADER_LEN - 1 + data_len);
        if (crc != s_rx_buf[frame_len - 2]) {
            s_rx_len = 0;
            continue;
        }
        uint8_t frame_id = s_rx_buf[1];
        uint8_t cmd = s_rx_buf[2];
        const uint8_t *payload = data_len > 0 ? (s_rx_buf + FRAME_HEADER_LEN) : NULL;
        if (s_rx_cb) {
            s_rx_cb(frame_id, cmd, payload, data_len, s_rx_ctx);
        }
        memmove(s_rx_buf, s_rx_buf + frame_len, s_rx_len - frame_len);
        s_rx_len -= frame_len;
    }
}

esp_err_t communicate_init(communicate_rx_frame_cb_t rx_cb, void *rx_ctx)
{
    s_rx_cb = rx_cb;
    s_rx_ctx = rx_ctx;
    s_rx_len = 0;

    esp_err_t err = transport_uart_init(on_uart_rx, NULL);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "transport_uart_init failed %s", esp_err_to_name(err));
        return err;
    }
    ESP_LOGI(TAG, "communicate init OK (frame on UART, log on CDC)");
    return ESP_OK;
}

esp_err_t communicate_send_frame(uint8_t frame_id, uint8_t cmd, const uint8_t *data, size_t len)
{
    if (len > COMMUNICATE_FRAME_MAX_DATA_LEN) {
        return ESP_ERR_INVALID_SIZE;
    }
    uint8_t header[FRAME_HEADER_LEN];
    header[0] = SOF;
    header[1] = frame_id;
    header[2] = cmd;
    header[3] = (uint8_t)(len >> 8);
    header[4] = (uint8_t)(len & 0xFF);

    /* CRC8 over [Frame ID, CMD, LEN_H, LEN_L, DATA...] */
    size_t crc_len = 4 + len;
    uint8_t *crc_buf = (uint8_t *)malloc(crc_len);
    if (!crc_buf) return ESP_ERR_NO_MEM;
    crc_buf[0] = frame_id;
    crc_buf[1] = cmd;
    crc_buf[2] = header[3];
    crc_buf[3] = header[4];
    if (len > 0 && data) {
        memcpy(crc_buf + 4, data, len);
    }
    uint8_t crc = crc8_maxim(crc_buf, crc_len);
    free(crc_buf);

    esp_err_t err = transport_uart_send(header, sizeof(header));
    if (err != ESP_OK) return err;
    if (len > 0 && data) {
        err = transport_uart_send(data, len);
        if (err != ESP_OK) return err;
    }
    uint8_t tail[2] = { crc, EOF_MARK };
    return transport_uart_send(tail, 2);
}
