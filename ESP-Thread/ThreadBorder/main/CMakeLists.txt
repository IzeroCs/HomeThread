idf_component_register(SRCS "led_status.c" "main.c" "device_registry_server.c" "leader_control_client.c"
                       PRIV_REQUIRES esp_coex esp_event nvs_flash openthread driver esp_driver_rmt
                       INCLUDE_DIRS ".")
