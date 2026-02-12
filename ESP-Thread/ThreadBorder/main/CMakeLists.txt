idf_component_register(SRCS "main.c"
                       PRIV_REQUIRES esp_coex esp_event nvs_flash openthread
                       INCLUDE_DIRS ".")
