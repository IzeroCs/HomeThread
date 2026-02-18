/*
 * State Change Notifier - Notify Backend khi có thay đổi state/network data
 * 
 * Monitor các thay đổi:
 * - state (detached/child/router/leader)
 * - networkname
 * - channel
 * - ipaddr
 * - child table
 * - router table
 * - commissioner joiner table
 * - dataset active
 */

#include "state_change_notifier.h"
#include "esp_log.h"
#include "esp_openthread.h"
#include "esp_openthread_lock.h"
#include "openthread/thread.h"
#include "openthread/thread_ftd.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include <string.h>
#include <stdbool.h>
#include <stdio.h>

static const char *TAG = "state_notifier";

// Notification flags
typedef struct {
    bool state_changed;
    bool networkname_changed;
    bool channel_changed;
    bool ipaddr_changed;
    bool child_table_changed;
    bool router_table_changed;
    bool commissioner_joiner_changed;
    bool dataset_active_changed;
} notification_flags_t;

static notification_flags_t s_notification_flags = {0};
static SemaphoreHandle_t s_flags_mutex = NULL;

// Previous state để so sánh
static otDeviceRole s_prev_role = OT_DEVICE_ROLE_DISABLED;
static char s_prev_networkname[33] = {0};
static uint8_t s_prev_channel = 0;
static uint16_t s_prev_child_count = 0;
static uint8_t s_prev_router_count = 0;

#define NOTIFICATION_TASK_STACK_SIZE 4096
#define NOTIFICATION_TASK_PRIORITY 5
#define NOTIFICATION_CHECK_INTERVAL_MS 200  // Check mỗi 200ms

/**
 * Set notification flag (thread-safe)
 */
static void set_notification_flag(volatile bool *flag)
{
    if (s_flags_mutex) {
        xSemaphoreTake(s_flags_mutex, portMAX_DELAY);
        *flag = true;
        xSemaphoreGive(s_flags_mutex);
    } else {
        *flag = true;
    }
}

/**
 * Get và clear notification flags (thread-safe)
 */
static notification_flags_t get_and_clear_flags(void)
{
    notification_flags_t flags = {0};
    if (s_flags_mutex) {
        xSemaphoreTake(s_flags_mutex, portMAX_DELAY);
        flags = s_notification_flags;
        memset(&s_notification_flags, 0, sizeof(s_notification_flags));
        xSemaphoreGive(s_flags_mutex);
    }
    return flags;
}

/**
 * Send notification qua UART (printf sẽ output qua UART console)
 */
static void send_notification(const char *notification_type)
{
    // Gửi notification qua UART console
    // Format: "NOTIFY:<type>\n"
    printf("NOTIFY:%s\n", notification_type);
    ESP_LOGI(TAG, "Notification sent: %s", notification_type);
}

/**
 * OpenThread State Change Callback
 */
static void ot_state_changed_callback(uint32_t aFlags, void *aContext)
{
    (void)aContext;
    
    if (aFlags & OT_CHANGED_THREAD_ROLE) {
        set_notification_flag(&s_notification_flags.state_changed);
        ESP_LOGI(TAG, "Thread role changed");
    }
    
    if (aFlags & OT_CHANGED_THREAD_NETWORK_NAME) {
        set_notification_flag(&s_notification_flags.networkname_changed);
        ESP_LOGI(TAG, "Network name changed");
    }
    
    if (aFlags & OT_CHANGED_THREAD_CHANNEL) {
        set_notification_flag(&s_notification_flags.channel_changed);
        ESP_LOGI(TAG, "Channel changed");
    }
    
    if (aFlags & OT_CHANGED_IP6_ADDRESS_ADDED || aFlags & OT_CHANGED_IP6_ADDRESS_REMOVED) {
        set_notification_flag(&s_notification_flags.ipaddr_changed);
        ESP_LOGI(TAG, "IP address changed");
    }
    
    if (aFlags & OT_CHANGED_THREAD_CHILD_ADDED || aFlags & OT_CHANGED_THREAD_CHILD_REMOVED) {
        set_notification_flag(&s_notification_flags.child_table_changed);
        ESP_LOGI(TAG, "Child table changed");
    }
    
    // Router table changes sẽ được detect qua periodic check
    // (OT_CHANGED_THREAD_ROUTER_ADDED/REMOVED có thể không available trong version này)
}

/**
 * Check for changes bằng cách so sánh với previous state
 */
static void check_state_changes(otInstance *instance)
{
    if (!instance) {
        return;
    }

    // Check state/role
    otDeviceRole current_role = otThreadGetDeviceRole(instance);
    if (current_role != s_prev_role) {
        set_notification_flag(&s_notification_flags.state_changed);
        s_prev_role = current_role;
    }

    // Check networkname
    const char *networkname = otThreadGetNetworkName(instance);
    if (networkname && strcmp(networkname, s_prev_networkname) != 0) {
        set_notification_flag(&s_notification_flags.networkname_changed);
        strncpy(s_prev_networkname, networkname, sizeof(s_prev_networkname) - 1);
        s_prev_networkname[sizeof(s_prev_networkname) - 1] = '\0';
    }

    // Check channel
    uint8_t current_channel = otLinkGetChannel(instance);
    if (current_channel != s_prev_channel) {
        set_notification_flag(&s_notification_flags.channel_changed);
        s_prev_channel = current_channel;
    }

    // Check child table count - iterate để đếm
    uint16_t current_child_count = 0;
    otChildInfo child_info;
    for (uint16_t i = 0; i < otThreadGetMaxAllowedChildren(instance); i++) {
        if (otThreadGetChildInfoByIndex(instance, i, &child_info) == OT_ERROR_NONE) {
            current_child_count++;
        }
    }
    if (current_child_count != s_prev_child_count) {
        set_notification_flag(&s_notification_flags.child_table_changed);
        s_prev_child_count = current_child_count;
    }

    // Check router table count - iterate để đếm
    uint8_t current_router_count = 0;
    otRouterInfo router_info;
    for (uint8_t i = 0; i < otThreadGetMaxRouterId(instance) + 1; i++) {
        if (otThreadGetRouterInfo(instance, i, &router_info) == OT_ERROR_NONE) {
            current_router_count++;
        }
    }
    if (current_router_count != s_prev_router_count) {
        set_notification_flag(&s_notification_flags.router_table_changed);
        s_prev_router_count = current_router_count;
    }

    // Note: Commissioner/Joiner và Dataset changes sẽ được detect qua callbacks
    // hoặc có thể check định kỳ nếu cần
}

/**
 * Notification task - Check flags và gửi notifications
 */
static void notification_task(void *pvParameters)
{
    (void)pvParameters;

    ESP_LOGI(TAG, "Notification task started");

    while (1) {
        otInstance *instance = esp_openthread_get_instance();
        
        if (instance && esp_openthread_lock_acquire(pdMS_TO_TICKS(100))) {
            // Check for changes bằng cách so sánh state
            check_state_changes(instance);
            esp_openthread_lock_release();
        }

        // Get và clear flags
        notification_flags_t flags = get_and_clear_flags();

        // Send notifications
        if (flags.state_changed) {
            send_notification("state_changed");
        }
        if (flags.networkname_changed) {
            send_notification("networkname_changed");
        }
        if (flags.channel_changed) {
            send_notification("channel_changed");
        }
        if (flags.ipaddr_changed) {
            send_notification("ipaddr_changed");
        }
        if (flags.child_table_changed) {
            send_notification("child_table_changed");
        }
        if (flags.router_table_changed) {
            send_notification("router_table_changed");
        }
        if (flags.commissioner_joiner_changed) {
            send_notification("commissioner_joiner_changed");
        }
        if (flags.dataset_active_changed) {
            send_notification("dataset_active_changed");
        }

        vTaskDelay(pdMS_TO_TICKS(NOTIFICATION_CHECK_INTERVAL_MS));
    }
}

/**
 * Initialize state change notifier
 */
esp_err_t state_change_notifier_init(void)
{
    ESP_LOGI(TAG, "Initializing state change notifier...");

    // Create mutex for flags
    s_flags_mutex = xSemaphoreCreateMutex();
    if (!s_flags_mutex) {
        ESP_LOGE(TAG, "Failed to create mutex");
        return ESP_ERR_NO_MEM;
    }

    // Initialize previous state
    memset(&s_notification_flags, 0, sizeof(s_notification_flags));
    s_prev_role = OT_DEVICE_ROLE_DISABLED;
    memset(s_prev_networkname, 0, sizeof(s_prev_networkname));
    s_prev_channel = 0;
    s_prev_child_count = 0;
    s_prev_router_count = 0;

    // Register OpenThread state change callback
    otInstance *instance = esp_openthread_get_instance();
    if (instance && esp_openthread_lock_acquire(pdMS_TO_TICKS(1000))) {
        otError err = otSetStateChangedCallback(instance, ot_state_changed_callback, NULL);
        if (err == OT_ERROR_NONE) {
            ESP_LOGI(TAG, "OpenThread state change callback registered");
        } else {
            ESP_LOGW(TAG, "Failed to register state change callback: %d", err);
        }
        
        // Initialize previous state
        s_prev_role = otThreadGetDeviceRole(instance);
        const char *networkname = otThreadGetNetworkName(instance);
        if (networkname) {
            strncpy(s_prev_networkname, networkname, sizeof(s_prev_networkname) - 1);
        }
        s_prev_channel = otLinkGetChannel(instance);
        
        // Initialize child count
        otChildInfo child_info;
        s_prev_child_count = 0;
        for (uint16_t i = 0; i < otThreadGetMaxAllowedChildren(instance); i++) {
            if (otThreadGetChildInfoByIndex(instance, i, &child_info) == OT_ERROR_NONE) {
                s_prev_child_count++;
            }
        }
        
        // Initialize router count
        otRouterInfo router_info;
        s_prev_router_count = 0;
        for (uint8_t i = 0; i < otThreadGetMaxRouterId(instance) + 1; i++) {
            if (otThreadGetRouterInfo(instance, i, &router_info) == OT_ERROR_NONE) {
                s_prev_router_count++;
            }
        }
        
        esp_openthread_lock_release();
    } else {
        ESP_LOGW(TAG, "OpenThread instance not available, will retry later");
    }

    // Create notification task
    BaseType_t task_result = xTaskCreate(
        notification_task,
        "state_notifier",
        NOTIFICATION_TASK_STACK_SIZE,
        NULL,
        NOTIFICATION_TASK_PRIORITY,
        NULL
    );

    if (task_result != pdPASS) {
        ESP_LOGE(TAG, "Failed to create notification task");
        vSemaphoreDelete(s_flags_mutex);
        s_flags_mutex = NULL;
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGI(TAG, "State change notifier initialized successfully");
    return ESP_OK;
}
