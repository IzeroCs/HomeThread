idf_component_register(
  SRCS "br_rcp_ctrl.c" "br_main.c" "br_launch.c" "br_console.c"
  "hardware/led_status.c"
  "hardware/boot_btn.c"
  "coap_controller/leader_control_client.c"
  "coap_controller/device_registry_server.c"
  "coap_controller/device_registry_handler.c"
  "communicate/communicate.c"
  "communicate/communicate_command.c"
  "communicate/communicate_queue.c"
  "communicate/communicate_task.c"
  "communicate/transport_uart.c"
  "communicate/transport_usb.c"
  "openthread/dataset_init.c"
  INCLUDE_DIRS "../include"
  REQUIRES mdns esp_timer
  PRIV_REQUIRES console cmd_system openthread nvs_flash driver
)
