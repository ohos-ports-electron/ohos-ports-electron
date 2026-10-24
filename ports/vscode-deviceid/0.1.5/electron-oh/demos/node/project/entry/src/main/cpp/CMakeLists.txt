# CMakeLists.txt — cli-hnp-runner：私有 HNP 执行器的原生模块。
#
# 产物：libs/arm64-v8a/libnode_demo.so（NAPI modname = ArkTS import 名 = 'node_demo'）。
# 自包含：只链系统 NAPI/hilog——runner **不链接**被验证的 CLI，而是 fork+execv 它
#（那是个独立可执行文件，装在私有 HNP 里，不是 .so），所以这里通常无需追加任何库。
cmake_minimum_required(VERSION 3.16)
project(node_demo)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# 工作区根：本文件在 harmony-demo/entry/src/main/cpp/，向上 5 级（供引用 deps/ 下的适配产物）。
get_filename_component(WS "${CMAKE_CURRENT_SOURCE_DIR}/../../../../.." ABSOLUTE)

add_library(node_demo SHARED napi_stub.cpp)

target_link_libraries(node_demo PUBLIC
    libace_napi.z.so
    libhilog_ndk.z.so
    # runner 一般不需要追加库；确需链接辅助 .so 时在此加
)

# 强制 4KB 页对齐，避免 dlopen SIGSEGV（鸿蒙 PC 4KB 页）。
target_link_options(node_demo PRIVATE "-Wl,-z,max-page-size=0x1000")
