# ThreadEndPoint - OpenThread Joiner + Entity model (ESP32-C6 / ESP32-H2)
cmake_minimum_required(VERSION 3.16)

# Component joiner, endpoint nằm trong components/thread/
set(EXTRA_COMPONENT_DIRS "${CMAKE_CURRENT_SOURCE_DIR}/components/thread")
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
idf_build_set_property(MINIMAL_BUILD ON)
project(ThreadEndPoint)

if(NOT (IDF_TARGET STREQUAL "esp32c6" OR IDF_TARGET STREQUAL "esp32h2"))
    message(FATAL_ERROR "Project ThreadEndPoint chi ho tro esp32c6 va esp32h2. Hien tai: ${IDF_TARGET}. Chay: idf.py set-target esp32c6 hoac idf.py set-target esp32h2")
endif()
