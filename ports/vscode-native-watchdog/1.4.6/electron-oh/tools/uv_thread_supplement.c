/* Electron-OH 宿主的 uv_thread_create 补充定义（plugin-maintained，库专用）。
 *
 * 背景：vendored libshim.a（electron-napi-library）只覆盖 9 个 uv_* 符号
 * （uv_close / uv_mutex_* / uv_async_*），不包含 uv_thread_create。watchdog.cc
 * 的监控线程用 uv_thread_create 创建；在 HIDE_NAPI_AND_UV 下该引用是 hidden，
 * 必须在链接期给出定义。
 *
 * 实现选择：直接 pthread_create 实现（libuv 的 uv_thread_create 内部就是
 * pthread_create 的薄封装，语义一致：创建原生线程运行 void(*)(void*) 入口）。
 * 不转发 libelectron.so 的 uv_thread_create——Electron 主进程的 addon 由 libelectron
 * 装载，其 libuv 实例与主进程一致；但子进程（同 bundle 私有 HNP 的独立 node）有
 * 自己的 libuv，跨库线程实例会在退出期引发竞态（实测 start 后立即 exit 的
 * 子进程 SIGSEGV）。统一用 pthread 创建可同时覆盖主进程与子进程两种装载面。
 *
 * 失败保底：解析/创建失败直接 abort —— 不能静默地让看门狗线程缺失而假装可用。
 */
#ifndef HIDE_NAPI_AND_UV
#define HIDE_NAPI_AND_UV
#endif
#include <uv.h>
#include <pthread.h>
#include <stdlib.h>
#include <stdio.h>

__attribute__((visibility("hidden")))
int uv_thread_create(uv_thread_t *tid, void (*entry)(void *arg), void *arg) {
    /* uv_thread_t 在 aarch64 musl 上即 pthread_t；入口函数签名与 pthread 等价 */
    int rc = pthread_create(tid, NULL, (void *(*)(void *))entry, arg);
    if (rc != 0) {
        fprintf(stderr, "native-watchdog: uv_thread_create (pthread_create) failed: %d\n", rc);
        abort();
    }
    return 0;
}
