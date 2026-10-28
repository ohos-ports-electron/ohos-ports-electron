# All target dependencies use the same OHOS compiler, sysroot and archive tools.
set(OHOS_ARCH arm64-v8a CACHE STRING "OHOS architecture")
include("$ENV{CANVAS_OHOS_NDK}/build/cmake/ohos.toolchain.cmake")
set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR aarch64)
set(CMAKE_AR "$ENV{CANVAS_OHOS_NDK}/llvm/bin/llvm-ar" CACHE FILEPATH "Target archiver" FORCE)
set(CMAKE_RANLIB "$ENV{CANVAS_OHOS_NDK}/llvm/bin/llvm-ranlib" CACHE FILEPATH "Target ranlib" FORCE)
set(CMAKE_TRY_COMPILE_TARGET_TYPE STATIC_LIBRARY)
