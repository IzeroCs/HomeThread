idf_component_register(
    SRCS "backend_discovery.c"
    INCLUDE_DIRS "include"
    REQUIRES
        openthread
        nvs_flash
        freertos
)

