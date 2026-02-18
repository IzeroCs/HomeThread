# Example: light_on_off - Thread Joiner + entity model + LED on/off qua UDP
cmake_minimum_required(VERSION 3.16)

# Trỏ thẳng vào thư mục components (không dùng repo root) để tránh CMake 3.28
# "define_property is not scriptable" khi script include project CMakeLists.
# Thư mục thread chứa component joiner, endpoint, và coap.
# Thư mục entity chứa component entity_model và entity_coap_server.
set(EXTRA_COMPONENT_DIRS 
    "${CMAKE_CURRENT_SOURCE_DIR}/../../components" 
    "${CMAKE_CURRENT_SOURCE_DIR}/../../components/thread"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../components/thread/coap"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../components/thread/device_registry"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../components/thread/status_led"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../components/thread/boot_btn"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../components/entity"
)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(light_on_off)
