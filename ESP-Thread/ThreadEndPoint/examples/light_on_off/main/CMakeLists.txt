idf_component_register(
    SRCS "main.c" "on_off_light.c"
    INCLUDE_DIRS "."
    PRIV_REQUIRES
        driver
        entity_model
        entity_coap_server
        thread
)
