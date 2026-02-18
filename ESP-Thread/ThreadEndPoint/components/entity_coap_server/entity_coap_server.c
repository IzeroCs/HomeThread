/*
 * Entity CoAP Server - CoAP server để điều khiển entities.
 * Resources:
 *   GET /entities → describe all entities
 *   GET /entities/{entity_id} → get entity info (default attr)
 *   GET /entities/{entity_id}/{attr} → get attribute value
 *   PUT /entities/{entity_id}/{attr} → set attribute value
 */
#include <string.h>
#include <stdbool.h>
#include "esp_err.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "openthread/coap.h"
#include "openthread/error.h"
#include "openthread/instance.h"
#include "openthread/ip6.h"
#include "openthread/message.h"
#include "openthread/thread.h"
#include "entity_coap_server.h"
#include "entity_model.h"
#include "thread_coap.h"

static const char *TAG = "entity_coap";

static bool s_resource_registered = false;

/* Parse URI path: /entities/{entity_id}[/{attr}]
 * Returns: entity_id (out), attr (out, can be NULL), success
 */
static bool parse_entity_path(otMessage *message, char *entity_id_buf, size_t entity_id_len,
                               char *attr_buf, size_t attr_len)
{
    otCoapOptionIterator iterator;
    otCoapOptionIteratorInit(&iterator, message);
    
    /* Find URI path options */
    bool found_entities = false;
    int path_segments = 0;
    char segments[3][64] = {{0}};  /* entities, entity_id, attr */
    
    const otCoapOption *option;
    uint16_t value_start_offset = 0;
    while ((option = otCoapOptionIteratorGetNextOption(&iterator)) != NULL) {
        if (option->mNumber == OT_COAP_OPTION_URI_PATH) {
            if (path_segments >= 3) {
                break;  /* Too many segments */
            }
            
            uint16_t path_len = option->mLength;
            if (path_len >= sizeof(segments[0])) {
                path_len = sizeof(segments[0]) - 1;
            }
            
            /* Read option value from message */
            /* mNextOptionOffset points to start of next option after GetNextOption */
            /* Current option value ends at mNextOptionOffset, starts at mNextOptionOffset - path_len */
            value_start_offset = iterator.mNextOptionOffset - path_len;
            otMessageRead(message, value_start_offset, segments[path_segments], path_len);
            segments[path_segments][path_len] = '\0';
            
            if (path_segments == 0 && strcmp(segments[0], "entities") == 0) {
                found_entities = true;
            }
            
            path_segments++;
        }
    }
    
    if (!found_entities || path_segments < 2) {
        return false;  /* Not /entities path or missing entity_id */
    }
    
    /* segments[0] = "entities", segments[1] = entity_id, segments[2] = attr (optional) */
    size_t id_len = strlen(segments[1]);
    if (id_len >= entity_id_len) {
        id_len = entity_id_len - 1;
    }
    strncpy(entity_id_buf, segments[1], id_len);
    entity_id_buf[id_len] = '\0';
    
    if (path_segments >= 3 && attr_buf) {
        size_t attr_str_len = strlen(segments[2]);
        if (attr_str_len >= attr_len) {
            attr_str_len = attr_len - 1;
        }
        strncpy(attr_buf, segments[2], attr_str_len);
        attr_buf[attr_str_len] = '\0';
    } else if (attr_buf) {
        attr_buf[0] = '\0';
    }
    
    return true;
}

/* Unified handler for all /entities/... requests */
static void entities_handler(void *aContext, otMessage *aMessage, const otMessageInfo *aMessageInfo)
{
    (void)aContext;
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        return;
    }
    
    otCoapCode request_code = otCoapMessageGetCode(aMessage);
    
    /* Parse URI path to determine request type */
    char entity_id[64];
    char attr[32];
    bool has_entity_id = parse_entity_path(aMessage, entity_id, sizeof(entity_id), attr, sizeof(attr));
    
    otMessage *response = otCoapNewMessage(instance, NULL);
    if (!response) {
        return;
    }
    
    /* Check if this is GET /entities (only "entities" path, no entity_id) */
    otCoapOptionIterator iterator;
    otCoapOptionIteratorInit(&iterator, aMessage);
    int path_segment_count = 0;
    const otCoapOption *option;
    while ((option = otCoapOptionIteratorGetNextOption(&iterator)) != NULL) {
        if (option->mNumber == OT_COAP_OPTION_URI_PATH) {
            path_segment_count++;
        }
    }
    
    /* GET /entities → describe all entities (only 1 path segment: "entities") */
    if (request_code == OT_COAP_CODE_GET && path_segment_count == 1) {
        char desc_buf[512];
        int desc_len = entity_describe(desc_buf, sizeof(desc_buf));
        
        otCoapCode response_code = (desc_len >= 0) ? OT_COAP_CODE_CONTENT : OT_COAP_CODE_INTERNAL_ERROR;
        otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT, response_code);
        
        if (desc_len >= 0) {
            otCoapMessageAppendContentFormatOption(response, OT_COAP_OPTION_CONTENT_FORMAT_TEXT_PLAIN);
            otCoapMessageSetPayloadMarker(response);
            otMessageAppend(response, desc_buf, desc_len);
        }
        
        otCoapSendResponse(instance, response, aMessageInfo);
        ESP_LOGI(TAG, "GET /entities -> %d bytes", desc_len);
        return;
    }
    
    /* GET /entities/{entity_id}[/{attr}] → get entity/attribute */
    if (request_code == OT_COAP_CODE_GET && has_entity_id) {
        /* Default attr to "state" if not specified */
        const char *attr_name = (attr[0] != '\0') ? attr : "state";
        
        char value_buf[64];
        int ret = entity_get(entity_id, attr_name, value_buf, sizeof(value_buf));
        
        otCoapCode response_code;
        if (ret == 0) {
            response_code = OT_COAP_CODE_CONTENT;
            otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT, response_code);
            otCoapMessageAppendContentFormatOption(response, OT_COAP_OPTION_CONTENT_FORMAT_TEXT_PLAIN);
            otCoapMessageSetPayloadMarker(response);
            /* Format: entity_id attr value */
            char payload[128];
            int payload_len = snprintf(payload, sizeof(payload), "%s %s %s", entity_id, attr_name, value_buf);
            if (payload_len > 0 && (size_t)payload_len < sizeof(payload)) {
                otMessageAppend(response, payload, payload_len);
            }
            ESP_LOGI(TAG, "GET /entities/%s/%s -> %s", entity_id, attr_name, value_buf);
        } else {
            response_code = OT_COAP_CODE_NOT_FOUND;
            otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT, response_code);
            ESP_LOGW(TAG, "GET /entities/%s/%s -> not found", entity_id, attr_name);
        }
        
        otCoapSendResponse(instance, response, aMessageInfo);
        return;
    }
    
    /* PUT /entities/{entity_id}/{attr} → set attribute value */
    if ((request_code == OT_COAP_CODE_PUT || request_code == OT_COAP_CODE_POST) && has_entity_id) {
        if (attr[0] == '\0') {
            /* Attr required for PUT */
            otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT, OT_COAP_CODE_BAD_REQUEST);
            otCoapSendResponse(instance, response, aMessageInfo);
            return;
        }
        
        /* Read payload (value) */
        uint16_t offset = otMessageGetOffset(aMessage);
        uint16_t payload_len = otMessageGetLength(aMessage) - offset;
        char value_buf[64];
        if (payload_len >= sizeof(value_buf)) {
            payload_len = sizeof(value_buf) - 1;
        }
        if (payload_len > 0) {
            otMessageRead(aMessage, offset, value_buf, payload_len);
            value_buf[payload_len] = '\0';
            /* Trim whitespace */
            while (payload_len > 0 && (value_buf[payload_len - 1] == '\r' || 
                                        value_buf[payload_len - 1] == '\n' || 
                                        value_buf[payload_len - 1] == ' ')) {
                value_buf[--payload_len] = '\0';
            }
        } else {
            value_buf[0] = '\0';
        }
        
        int ret = entity_set(entity_id, attr, value_buf);
        
        otCoapCode response_code;
        if (ret == 0) {
            response_code = OT_COAP_CODE_CHANGED;
            ESP_LOGI(TAG, "PUT /entities/%s/%s = %s -> ok", entity_id, attr, value_buf);
        } else {
            response_code = OT_COAP_CODE_BAD_REQUEST;
            ESP_LOGW(TAG, "PUT /entities/%s/%s = %s -> failed", entity_id, attr, value_buf);
        }
        
        otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT, response_code);
        otCoapSendResponse(instance, response, aMessageInfo);
        return;
    }
    
    /* Unsupported method */
    otCoapMessageInit(response, OT_COAP_TYPE_ACKNOWLEDGMENT, OT_COAP_CODE_METHOD_NOT_ALLOWED);
    otCoapSendResponse(instance, response, aMessageInfo);
}

esp_err_t entity_coap_server_start(void)
{
    otInstance *instance = esp_openthread_get_instance();
    if (!instance) {
        ESP_LOGE(TAG, "OpenThread instance NULL");
        return ESP_ERR_INVALID_STATE;
    }
    
    if (s_resource_registered) {
        ESP_LOGW(TAG, "Entity CoAP resource already registered");
        return ESP_OK;
    }
    
    /* Start CoAP server (dùng chung với các component khác) */
    esp_err_t err = thread_coap_server_start();
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "thread_coap_server_start failed: %s", esp_err_to_name(err));
        return err;
    }
    
    if (!esp_openthread_lock_acquire(pdMS_TO_TICKS(500))) {
        ESP_LOGE(TAG, "Failed to acquire OpenThread lock");
        return ESP_ERR_TIMEOUT;
    }
    
    /* Register resource: /entities (handles all /entities paths) */
    static otCoapResource s_entities_resource;
    memset(&s_entities_resource, 0, sizeof(s_entities_resource));
    s_entities_resource.mUriPath = "entities";
    s_entities_resource.mHandler = entities_handler;
    s_entities_resource.mContext = NULL;
    
    otCoapAddResource(instance, &s_entities_resource);
    
    esp_openthread_lock_release();
    
    s_resource_registered = true;
    ESP_LOGI(TAG, "Entity CoAP resource registered: GET /entities, GET /entities/{id}[/{attr}], PUT /entities/{id}/{attr}");
    
    return ESP_OK;
}
