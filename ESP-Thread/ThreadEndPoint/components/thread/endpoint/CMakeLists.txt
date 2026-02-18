idf_component_register(
    SRCS "thread_endpoint_core.c" "network_stop_handler.c"
    INCLUDE_DIRS "include"
    REQUIRES
        esp_event
        esp_netif
        openthread
        nvs_flash
        vfs
        freertos
        joiner
        boot_btn
        status_led
        device_registry
        thread_coap
)
