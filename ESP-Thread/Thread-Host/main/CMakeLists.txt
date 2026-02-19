idf_component_register(
  SRCS "br_rcp_ctrl.c" "br_main.c" "br_launch.c" "br_console.c"
  "hardware/led_status.c"
  "coap_controller/leader_control_client.c"
  "coap_controller/device_registry_server.c"
  "coap_controller/device_registry_handler.c"
  INCLUDE_DIRS "../include"
  REQUIRES mdns
  PRIV_REQUIRES console cmd_system openthread nvs_flash driver
)
