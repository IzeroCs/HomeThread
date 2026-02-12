# Distributed under the OSI-approved BSD 3-Clause License.  See accompanying
# file Copyright.txt or https://cmake.org/licensing for details.

cmake_minimum_required(VERSION 3.5)

file(MAKE_DIRECTORY
  "/home/izerocs/esp/v5.5.2/esp-idf/components/bootloader/subproject"
  "/home/izerocs/Documents/GitHub/HomeThread/ESP-Thread/ThreadBorder/build/bootloader"
  "/home/izerocs/Documents/GitHub/HomeThread/ESP-Thread/ThreadBorder/build/bootloader-prefix"
  "/home/izerocs/Documents/GitHub/HomeThread/ESP-Thread/ThreadBorder/build/bootloader-prefix/tmp"
  "/home/izerocs/Documents/GitHub/HomeThread/ESP-Thread/ThreadBorder/build/bootloader-prefix/src/bootloader-stamp"
  "/home/izerocs/Documents/GitHub/HomeThread/ESP-Thread/ThreadBorder/build/bootloader-prefix/src"
  "/home/izerocs/Documents/GitHub/HomeThread/ESP-Thread/ThreadBorder/build/bootloader-prefix/src/bootloader-stamp"
)

set(configSubDirs )
foreach(subDir IN LISTS configSubDirs)
    file(MAKE_DIRECTORY "/home/izerocs/Documents/GitHub/HomeThread/ESP-Thread/ThreadBorder/build/bootloader-prefix/src/bootloader-stamp/${subDir}")
endforeach()
if(cfgdir)
  file(MAKE_DIRECTORY "/home/izerocs/Documents/GitHub/HomeThread/ESP-Thread/ThreadBorder/build/bootloader-prefix/src/bootloader-stamp${cfgdir}") # cfgdir has leading slash
endif()
