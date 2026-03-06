idf_component_register(
    SRCS "main.c" "on_off_light.c"
    INCLUDE_DIRS "."
    PRIV_REQUIRES
        driver
        model
        coap_server
        thread
)
