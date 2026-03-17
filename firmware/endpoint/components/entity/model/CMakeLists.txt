idf_component_register(
    SRCS "entity_driver_helper.c" "entity_model.c" "device_model.c"
    INCLUDE_DIRS 
        "include"
        "light/include"
        "switch/include"
        "fan/include"
        "sensor/include"
        "climate/include"
        "binary_sensor/include"
    REQUIRES freertos
)
