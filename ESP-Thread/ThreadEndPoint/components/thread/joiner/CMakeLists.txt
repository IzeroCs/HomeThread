idf_component_register(
    SRCS "thread_joiner.c"
    INCLUDE_DIRS "include"
    REQUIRES esp_event esp_timer nvs_flash openthread
)
