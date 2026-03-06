# Thread-Node - OpenThread Joiner + Entity model (ESP32-C6 / ESP32-H2)
cmake_minimum_required(VERSION 3.16)

# Component thread (joiner, node, coap, discovery) nằm trong components/thread/
# Entity: model, serialization, coap_server (mỗi thư mục con là một component)
set(EXTRA_COMPONENT_DIRS 
    "${CMAKE_CURRENT_SOURCE_DIR}/components/thread"
    "${CMAKE_CURRENT_SOURCE_DIR}/components/thread/device"
    "${CMAKE_CURRENT_SOURCE_DIR}/components/thread/status_led"
    "${CMAKE_CURRENT_SOURCE_DIR}/components/thread/boot_btn"
    "${CMAKE_CURRENT_SOURCE_DIR}/components/entity/model"
    "${CMAKE_CURRENT_SOURCE_DIR}/components/entity/serialization"
    "${CMAKE_CURRENT_SOURCE_DIR}/components/entity/coap_server"
)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
idf_build_set_property(MINIMAL_BUILD ON)
project(ThreadNode)

if(NOT (IDF_TARGET STREQUAL "esp32c6" OR IDF_TARGET STREQUAL "esp32h2"))
    message(FATAL_ERROR "Project Thread-Node chi ho tro esp32c6 va esp32h2. Hien tai: ${IDF_TARGET}. Chay: idf.py set-target esp32c6 hoac idf.py set-target esp32h2")
endif()
