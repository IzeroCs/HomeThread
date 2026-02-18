/*
 * Entity CoAP Server - CoAP server để điều khiển entities.
 * Resources:
 *   GET /entities → describe all entities
 *   GET /entities/{entity_id} → get entity info (default attr)
 *   GET /entities/{entity_id}/{attr} → get attribute value
 *   PUT /entities/{entity_id}/{attr} → set attribute value
 * 
 * TODO: Migrate to struct-based approach (see MIGRATION_TO_STRUCT_BASED.md)
 *       - Use device_model_t and entity structs
 *       - Replace entity_describe/get/set with struct-based APIs
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
        /* TODO: Migrate to struct-based approach
         *   - Get device_model_t from entity model
         *   - Serialize to JSON/CBOR
         *   - Send response
         */
        ESP_LOGW(TAG, "GET /entities - Not implemented yet (migration pending)");
        thread_coap_send_response(aMessage, aMessageInfo, OT_COAP_CODE_NOT_IMPLEMENTED, NULL, 0);
        return;
    }
    
    /* GET /entities/{entity_id}[/{attr}] → get entity/attribute */
    if (request_code == OT_COAP_CODE_GET && has_entity_id) {
        /* TODO: Migrate to struct-based approach
         *   - Find entity by ID from device_model_t
         *   - Get attribute value from entity struct
         *   - Serialize to JSON/CBOR
         *   - Send response
         */
        const char *attr_name = (attr[0] != '\0') ? attr : "state";
        ESP_LOGW(TAG, "GET /entities/%s/%s - Not implemented yet (migration pending)", entity_id, attr_name);
        thread_coap_send_response(aMessage, aMessageInfo, OT_COAP_CODE_NOT_IMPLEMENTED, NULL, 0);
        return;
    }
    
    /* PUT /entities/{entity_id}/{attr} → set attribute value */
    if ((request_code == OT_COAP_CODE_PUT || request_code == OT_COAP_CODE_POST) && has_entity_id) {
        if (attr[0] == '\0') {
            /* Attr required for PUT */
            thread_coap_send_response(aMessage, aMessageInfo, OT_COAP_CODE_BAD_REQUEST, NULL, 0);
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
        
        /* TODO: Migrate to struct-based approach
         *   - Find entity by ID from device_model_t
         *   - Parse value and update entity struct field
         *   - Call driver callback if needed
         *   - Send response
         */
        ESP_LOGW(TAG, "PUT /entities/%s/%s = %s - Not implemented yet (migration pending)", entity_id, attr, value_buf);
        thread_coap_send_response(aMessage, aMessageInfo, OT_COAP_CODE_NOT_IMPLEMENTED, NULL, 0);
        return;
    }
    
    /* Unsupported method */
    thread_coap_send_response(aMessage, aMessageInfo, OT_COAP_CODE_METHOD_NOT_ALLOWED, NULL, 0);
}

esp_err_t entity_coap_server_start(void)
{
    if (s_resource_registered) {
        ESP_LOGW(TAG, "Entity CoAP resource already registered");
        return ESP_OK;
    }
    
    /* Register resource: OpenThread CoAP match exact full path */
    /* Chỉ đăng ký resource "entities" để match /entities (GET all entities) */
    /* Các path /entities/{id} và /entities/{id}/{attr} sẽ KHÔNG match vì OpenThread không hỗ trợ prefix/wildcard */
    /* Handler hiện tại có parse path nhưng sẽ không được gọi cho các path này */
    /* TODO: Cần đăng ký resource động khi entity được thêm vào (ví dụ: "entities/light.0", "entities/light.0/state") */
    static otCoapResource s_entities_resource;
    esp_err_t err = thread_coap_register_resource(&s_entities_resource, "entities", entities_handler, NULL);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "thread_coap_add_resource failed: %s", esp_err_to_name(err));
        return err;
    }
    
    s_resource_registered = true;
    ESP_LOGW(TAG, "WARNING: OpenThread CoAP match exact full path only. Paths like /entities/{id} will return 4.04 Not Found");
    
    return ESP_OK;
}
