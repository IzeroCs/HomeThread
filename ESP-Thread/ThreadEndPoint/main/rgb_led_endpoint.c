/*
 * SPDX-FileCopyrightText: 2025
 *
 * SPDX-License-Identifier: CC0-1.0
 *
 * OpenThread CoAP Endpoint for RGB LED Control on ESP32-C6
 */

#include "rgb_led_endpoint.h"
#include "esp_log.h"
#include "esp_err.h"
#include "driver/ledc.h"
#include "cJSON.h"
#include "openthread/coap.h"
#include "openthread/message.h"
#include <string.h>

static const char *TAG = "rgb_led_endpoint";

// CoAP endpoint URI
#define RGB_LED_URI_PATH "rgb/led"

// LEDC configuration
#define LEDC_TIMER              LEDC_TIMER_0
#define LEDC_MODE               LEDC_LOW_SPEED_MODE
#define LEDC_RESOLUTION          LEDC_TIMER_8_BIT
#define LEDC_FREQUENCY          5000
#define LEDC_DUTY_RES           LEDC_TIMER_8_BIT

// Channel definitions
#define LEDC_CHANNEL_RED        LEDC_CHANNEL_0
#define LEDC_CHANNEL_GREEN      LEDC_CHANNEL_1
#define LEDC_CHANNEL_BLUE       LEDC_CHANNEL_2

// Static variables
static otInstance *s_instance = NULL;
static otCoapResource s_resource;
static rgb_led_pins_t s_pins = {0};
static rgb_led_color_t s_current_color = {0, 0, 0, 255};
static bool s_initialized = false;

/**
 * @brief Set LEDC channel duty cycle
 */
static esp_err_t set_ledc_duty(ledc_channel_t channel, uint8_t duty)
{
    return ledc_set_duty(LEDC_MODE, channel, duty);
}

/**
 * @brief Update LEDC output
 */
static esp_err_t update_ledc_output(void)
{
    esp_err_t ret;
    
    // Calculate actual duty based on brightness
    uint8_t red_duty = (s_current_color.red * s_current_color.brightness) / 255;
    uint8_t green_duty = (s_current_color.green * s_current_color.brightness) / 255;
    uint8_t blue_duty = (s_current_color.blue * s_current_color.brightness) / 255;
    
    ret = set_ledc_duty(LEDC_CHANNEL_RED, red_duty);
    if (ret != ESP_OK) return ret;
    
    ret = set_ledc_duty(LEDC_CHANNEL_GREEN, green_duty);
    if (ret != ESP_OK) return ret;
    
    ret = set_ledc_duty(LEDC_CHANNEL_BLUE, blue_duty);
    if (ret != ESP_OK) return ret;
    
    ret = ledc_update_duty(LEDC_MODE, LEDC_CHANNEL_RED);
    if (ret != ESP_OK) return ret;
    
    ret = ledc_update_duty(LEDC_MODE, LEDC_CHANNEL_GREEN);
    if (ret != ESP_OK) return ret;
    
    ret = ledc_update_duty(LEDC_MODE, LEDC_CHANNEL_BLUE);
    if (ret != ESP_OK) return ret;
    
    return ESP_OK;
}

/**
 * @brief Parse JSON color from CoAP message payload
 */
static esp_err_t parse_color_json(const char *json_str, rgb_led_color_t *color)
{
    cJSON *json = cJSON_Parse(json_str);
    if (json == NULL) {
        ESP_LOGE(TAG, "Failed to parse JSON");
        return ESP_ERR_INVALID_ARG;
    }
    
    cJSON *item;
    
    item = cJSON_GetObjectItem(json, "r");
    if (cJSON_IsNumber(item)) {
        color->red = (uint8_t)cJSON_GetNumberValue(item);
    }
    
    item = cJSON_GetObjectItem(json, "g");
    if (cJSON_IsNumber(item)) {
        color->green = (uint8_t)cJSON_GetNumberValue(item);
    }
    
    item = cJSON_GetObjectItem(json, "b");
    if (cJSON_IsNumber(item)) {
        color->blue = (uint8_t)cJSON_GetNumberValue(item);
    }
    
    item = cJSON_GetObjectItem(json, "brightness");
    if (cJSON_IsNumber(item)) {
        color->brightness = (uint8_t)cJSON_GetNumberValue(item);
    } else {
        color->brightness = 255; // Default brightness
    }
    
    cJSON_Delete(json);
    return ESP_OK;
}

/**
 * @brief Create JSON response with current color
 */
static char* create_color_json(const rgb_led_color_t *color)
{
    cJSON *json = cJSON_CreateObject();
    cJSON_AddNumberToObject(json, "r", color->red);
    cJSON_AddNumberToObject(json, "g", color->green);
    cJSON_AddNumberToObject(json, "b", color->blue);
    cJSON_AddNumberToObject(json, "brightness", color->brightness);
    
    char *json_str = cJSON_Print(json);
    cJSON_Delete(json);
    return json_str;
}

/**
 * @brief CoAP resource handler
 */
static void rgb_led_coap_handler(void *context, otMessage *message, const otMessageInfo *messageInfo)
{
    otError error = OT_ERROR_NONE;
    otMessage *response = NULL;
    otMessageInfo responseInfo;
    uint16_t payload_length = 0;
    uint8_t payload[256] = {0};
    
    (void)context;
    
    ESP_LOGI(TAG, "Received CoAP request");
    
    // Get message code
    otCoapCode code = otCoapMessageGetCode(message);
    
    // Prepare response info
    memset(&responseInfo, 0, sizeof(responseInfo));
    memcpy(&responseInfo.mPeerAddr, &messageInfo->mPeerAddr, sizeof(otIp6Address));
    responseInfo.mPeerPort = messageInfo->mPeerPort;
    responseInfo.mSockAddr = messageInfo->mSockAddr;
    
    if (code == OT_COAP_CODE_GET) {
        // GET request - return current color
        ESP_LOGI(TAG, "GET request - returning current color");
        
        char *json_str = create_color_json(&s_current_color);
        if (json_str) {
            payload_length = strlen(json_str);
            memcpy(payload, json_str, payload_length);
            free(json_str);
        }
        
        response = otCoapNewMessage(s_instance, NULL);
        if (response == NULL) {
            ESP_LOGE(TAG, "Failed to allocate CoAP response message");
            error = OT_ERROR_NO_BUFS;
            goto exit;
        }
        error = otCoapMessageInitResponse(response, message, OT_COAP_TYPE_CONFIRMABLE, OT_COAP_CODE_CONTENT);
        if (error == OT_ERROR_NONE) {
            error = otCoapMessageAppendContentFormatOption(response, OT_COAP_OPTION_CONTENT_FORMAT_JSON);
        }
        if (error == OT_ERROR_NONE) {
            error = otCoapMessageSetPayloadMarker(response);
        }
        if (error == OT_ERROR_NONE && payload_length > 0) {
            error = otMessageAppend(response, payload, (uint16_t)payload_length);
        }
        if (error != OT_ERROR_NONE) {
            otMessageFree(response);
            response = NULL;
        }
        
    } else if (code == OT_COAP_CODE_POST || code == OT_COAP_CODE_PUT) {
        // POST/PUT request - set new color
        ESP_LOGI(TAG, "POST/PUT request - setting new color");
        
        payload_length = otMessageRead(message, otMessageGetOffset(message), payload, sizeof(payload) - 1);
        payload[payload_length] = '\0';
        
        rgb_led_color_t new_color = s_current_color;
        error = parse_color_json((const char *)payload, &new_color);
        
        if (error == ESP_OK) {
            // Update color
            s_current_color = new_color;
            error = update_ledc_output();
            
            if (error == ESP_OK) {
                ESP_LOGI(TAG, "Color set: R=%d G=%d B=%d Brightness=%d", 
                         s_current_color.red, s_current_color.green, 
                         s_current_color.blue, s_current_color.brightness);
                
                // Create response with new color
                char *json_str = create_color_json(&s_current_color);
                if (json_str) {
                    payload_length = strlen(json_str);
                    memcpy(payload, json_str, payload_length);
                    free(json_str);
                }
                
                response = otCoapNewMessage(s_instance, NULL);
                if (response == NULL) {
                    ESP_LOGE(TAG, "Failed to allocate CoAP response message");
                    error = OT_ERROR_NO_BUFS;
                    goto exit;
                }
                error = otCoapMessageInitResponse(response, message, OT_COAP_TYPE_CONFIRMABLE, OT_COAP_CODE_CHANGED);
                if (error == OT_ERROR_NONE) {
                    error = otCoapMessageAppendContentFormatOption(response, OT_COAP_OPTION_CONTENT_FORMAT_JSON);
                }
                if (error == OT_ERROR_NONE) {
                    error = otCoapMessageSetPayloadMarker(response);
                }
                if (error == OT_ERROR_NONE && payload_length > 0) {
                    error = otMessageAppend(response, payload, (uint16_t)payload_length);
                }
                if (error != OT_ERROR_NONE) {
                    otMessageFree(response);
                    response = NULL;
                }
            } else {
                error = OT_ERROR_FAILED;
            }
        } else {
            error = OT_ERROR_PARSE;
        }
        
    } else {
        ESP_LOGW(TAG, "Unsupported CoAP method: %d", code);
        error = OT_ERROR_NOT_IMPLEMENTED;
    }
    
exit:
    if (error == OT_ERROR_NONE && response != NULL) {
        error = otCoapSendResponse(s_instance, response, &responseInfo);
        if (error != OT_ERROR_NONE) {
            ESP_LOGE(TAG, "Failed to send CoAP response: %d", error);
            otMessageFree(response);
        }
    } else if (error != OT_ERROR_NONE && code != 0) {
        // Send error response for invalid requests
        otMessage *error_response = otCoapNewMessage(s_instance, NULL);
        if (error_response != NULL) {
            if (otCoapMessageInitResponse(error_response, message, OT_COAP_TYPE_CONFIRMABLE, OT_COAP_CODE_BAD_REQUEST) == OT_ERROR_NONE) {
                otCoapSendResponse(s_instance, error_response, &responseInfo);
            } else {
                otMessageFree(error_response);
            }
        }
    }
}

esp_err_t rgb_led_endpoint_init(otInstance *instance, const rgb_led_pins_t *pins)
{
    if (instance == NULL || pins == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    
    if (s_initialized) {
        ESP_LOGW(TAG, "RGB LED endpoint already initialized");
        return ESP_OK;
    }
    
    s_instance = instance;
    memcpy(&s_pins, pins, sizeof(rgb_led_pins_t));
    
    // Configure LEDC timer
    ledc_timer_config_t ledc_timer = {
        .speed_mode       = LEDC_MODE,
        .timer_num        = LEDC_TIMER,
        .duty_resolution  = LEDC_RESOLUTION,
        .freq_hz          = LEDC_FREQUENCY,
        .clk_cfg          = LEDC_AUTO_CLK
    };
    ESP_ERROR_CHECK(ledc_timer_config(&ledc_timer));
    
    // Configure LEDC channels
    ledc_channel_config_t ledc_channel[3] = {
        {
            .speed_mode     = LEDC_MODE,
            .channel        = LEDC_CHANNEL_RED,
            .timer_sel      = LEDC_TIMER,
            .intr_type      = LEDC_INTR_DISABLE,
            .gpio_num       = s_pins.red_pin,
            .duty           = 0,
            .hpoint         = 0
        },
        {
            .speed_mode     = LEDC_MODE,
            .channel        = LEDC_CHANNEL_GREEN,
            .timer_sel      = LEDC_TIMER,
            .intr_type      = LEDC_INTR_DISABLE,
            .gpio_num       = s_pins.green_pin,
            .duty           = 0,
            .hpoint         = 0
        },
        {
            .speed_mode     = LEDC_MODE,
            .channel        = LEDC_CHANNEL_BLUE,
            .timer_sel      = LEDC_TIMER,
            .intr_type      = LEDC_INTR_DISABLE,
            .gpio_num       = s_pins.blue_pin,
            .duty           = 0,
            .hpoint         = 0
        }
    };
    
    for (int i = 0; i < 3; i++) {
        ESP_ERROR_CHECK(ledc_channel_config(&ledc_channel[i]));
    }
    
    // Initialize CoAP resource (otCoapResource has mUriPath, mHandler, mContext, mNext)
    s_resource.mUriPath = RGB_LED_URI_PATH;
    s_resource.mHandler = rgb_led_coap_handler;
    s_resource.mContext = NULL;
    s_resource.mNext = NULL;
    otCoapAddResource(s_instance, &s_resource);
    
    s_initialized = true;
    ESP_LOGI(TAG, "RGB LED endpoint initialized on URI: %s", RGB_LED_URI_PATH);
    ESP_LOGI(TAG, "GPIO pins - Red: %d, Green: %d, Blue: %d", 
             s_pins.red_pin, s_pins.green_pin, s_pins.blue_pin);
    
    return ESP_OK;
}

esp_err_t rgb_led_endpoint_deinit(void)
{
    if (!s_initialized) {
        return ESP_OK;
    }
    
    // Turn off LED
    rgb_led_off();
    
    // Remove CoAP resource
    if (s_instance != NULL) {
        otCoapRemoveResource(s_instance, &s_resource);
    }
    
    s_initialized = false;
    s_instance = NULL;
    
    ESP_LOGI(TAG, "RGB LED endpoint deinitialized");
    return ESP_OK;
}

esp_err_t rgb_led_set_color(const rgb_led_color_t *color)
{
    if (color == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    
    if (!s_initialized) {
        return ESP_ERR_INVALID_STATE;
    }
    
    s_current_color = *color;
    return update_ledc_output();
}

esp_err_t rgb_led_get_color(rgb_led_color_t *color)
{
    if (color == NULL) {
        return ESP_ERR_INVALID_ARG;
    }
    
    if (!s_initialized) {
        return ESP_ERR_INVALID_STATE;
    }
    
    *color = s_current_color;
    return ESP_OK;
}

esp_err_t rgb_led_off(void)
{
    rgb_led_color_t off_color = {0, 0, 0, 0};
    return rgb_led_set_color(&off_color);
}
