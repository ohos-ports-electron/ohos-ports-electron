# Electron-OH N-API shim 输入

本目录仅保留 native-inputs.lock.json 中逐项锁定的公开头文件，参与编译，不复制入 npm 包。构建时必须显式传入 `--shim-library`；不将 libshim.a、运行时或原始归档提交到本 port。

官方来源由该锁的 shim.officialArchive 记录：父归档 SHA256 `57bf0314ce3f5be80fc7a7ebc4f47a2fe82a5e4afcf5fe856ad9cfc342618946`，嵌套 `libelectron_138.tar.gz` 内 `libelectron/ohos_hap/docs/electron-napi-library.zip`，zip SHA256 `837d41353aab2b0cc30f56a8f55064db0c7aea73ee7fd47389740639c7b581fc`，成员 `electron-napi-library/lib/libshim.a` 的 SHA256 为 `6c8b3134b858c505b1741fd182f921dd092774558addabc8848d71287edf5d52`。

这是第一阶段已核验的官方嵌入材料；上面的哈希/成员路径不等同于已上传远端的归档地址。维护者需从已核验官方归档或授权制品存储提供准确输入，构建工具拒绝不同字节。

链接时使用 HIDE_NAPI_AND_UV，shim 在运行时解析 libelectron.so 中的 N-API/libuv 导出。它不是完整 libuv 实现；每个宿主版本仍须实际验证。Electron MIT 许可与相关 notice 位于 ../../licenses/ 并随候选分发。
