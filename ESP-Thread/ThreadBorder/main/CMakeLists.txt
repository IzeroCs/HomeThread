idf_component_register(SRCS "led_status.c" 
                             "main.c" 
                             "leader_control_client.c"
                             "state_change_notifier.c"
                             "device_registry/device_registry_server.c"
                             "device_registry/device_register_handler.c"
                             "device_registry/device_update_handler.c"
                             "device_registry/device_ping_handler.c"
                       PRIV_REQUIRES esp_coex esp_event nvs_flash openthread driver esp_driver_rmt
                       INCLUDE_DIRS "." "device_registry/include")
