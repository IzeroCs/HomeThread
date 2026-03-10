idf_component_register(
    SRCS "device_registry.c" "device_coap.c"
    INCLUDE_DIRS "include"
    REQUIRES openthread model serialization esp_timer
)
