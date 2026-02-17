idf_component_register(
    SRCS "main.c" "led_udp_server.c"
    INCLUDE_DIRS "."
    PRIV_REQUIRES esp_event nvs_flash openthread driver lwip ot_examples_common
)
