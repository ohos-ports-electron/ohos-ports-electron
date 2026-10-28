cmake_minimum_required(VERSION 3.20)
project(onnxruntime_electron_binding LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
foreach(variable ORT_SOURCE_DIR ORT_CORE_DIR ELECTRON_NAPI_DIR NODE_ADDON_API_DIR)
  if(NOT DEFINED ${variable})
    message(FATAL_ERROR "Missing ${variable}")
  endif()
endforeach()
file(GLOB sources "${ORT_SOURCE_DIR}/js/node/src/*.cc")
add_library(onnxruntime_binding_electron SHARED ${sources})
target_compile_definitions(onnxruntime_binding_electron PRIVATE NAPI_VERSION=6 ORT_API_MANUAL_INIT HIDE_NAPI_AND_UV)
target_include_directories(onnxruntime_binding_electron PRIVATE
  "${ELECTRON_NAPI_DIR}/include/electron_node/src" "${NODE_ADDON_API_DIR}"
  "${ORT_SOURCE_DIR}/include/onnxruntime/core/session"
  "${ORT_SOURCE_DIR}/include/onnxruntime" "${ORT_SOURCE_DIR}/onnxruntime")
target_link_libraries(onnxruntime_binding_electron PRIVATE "${ORT_CORE_DIR}/libonnxruntime.so.1.27.0" "${ELECTRON_NAPI_DIR}/lib/libshim.a")
target_link_options(onnxruntime_binding_electron PRIVATE -static-libstdc++
  "-Wl,--version-script=${CMAKE_CURRENT_SOURCE_DIR}/binding.lds"
  "-Wl,--exclude-libs,libc++_static.a:libc++abi.a:libunwind.a" "-Wl,-z,max-page-size=0x1000")
set_target_properties(onnxruntime_binding_electron PROPERTIES PREFIX "" SUFFIX ".node"
  BUILD_WITH_INSTALL_RPATH TRUE INSTALL_RPATH "$ORIGIN/" )
