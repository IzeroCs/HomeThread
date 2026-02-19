idf_component_register(
  SRCS "br_rcp_ctrl.c" "br_main.c" "br_launch.c" "br_console.c"
  INCLUDE_DIRS "." "include"
  REQUIRES mdns
  PRIV_REQUIRES console cmd_system openthread nvs_flash
)
