# Canvas 1.0.2：shim 来源与完整原生源码构建

此目录从锁定的 Canvas 1.0.2、Skia 和依赖源码构建 Electron 原生文件。设备证据和发行状态见 ../release-evidence.json；源码构建本身不代表功能验收。

## 来源和实现边界

上游 Canvas 固定提交为 `826600b258db693d98a652c935e2b94107b41bb2`，源码 package.json 为 1.0.2；Skia 固定提交为 `634e970210b7f8233cec53510bf82a3c9c18a80d`。本地 1.0.13 仅提供适配方法，没有复制其 `.node`、Skia 静态库或较新核心代码。

鸿蒙 npm 基线未声明其 native 构建提交。因此这里建立的是从准确上游版本出发、依赖和补丁均锁定的新构建链，不声称还原了发布者原来的编译环境。原版没有提交 Cargo.lock，本配方冻结了这次实际解析结果；源码/Skia 归档、14 项构建依赖、Rust、NDK 和 GN 均有版本及 SHA256。

已补齐官方预编译 shim 的准确出处：仓库 `https://gitcode.com/openharmony-sig/electron.git`，提交 `d95f6e72a5460911807d34369e7099006721cf88`，路径 `src/electron/docs/ohos/libshim.a`；Git blob 为 `ccbc75fd006224a28e78190391e79c18623427c6`，SHA256 为 `6c8b3134b858c505b1741fd182f921dd092774558addabc8848d71287edf5d52`，与原官方发行归档/旧候选使用的文件相同。

许可证依据也从该固定提交保存：Electron 子树的 MIT LICENSE、Node LICENSE 和 libuv LICENSE，见 shim-provenance/。没有发现原 libshim.a 的 C 源码，也不把这些文件描述为“shim 单独附带的源码/许可证”。

**本次实际构建使用 `shim/canvas_electron_shim.c`，不链接官方预编译 libshim.a。** 它是项目维护的 MIT 源码实现，由锁定官方头文件生成类型正确的 C wrapper。19 个头文件同时匹配官方 Git 树 blob 和原发行 ZIP；对应关系见 official-headers-correspondence.json。

转发实现包含 145 个已声明 Node-API/N-API 入口，按实际调用惰性解析；pthread_once 初始化模块句柄，原子缓存函数地址，显式验证解析结果属于 libelectron.so，拒绝缺失接口或其他依赖库的同名实现。它不缓存 napi_env / napi_value，不跨 Worker 复用 JS 状态。当前 Canvas 无直接 uv 导入；这不是可替代官方全部 libuv 转发能力的通用库。

宿主控制 provider 的真实 C 测试已验证：8 线程 / 80,000 次转发保留各自环境指针；缺符号被拒绝；来自依赖库的错误 provider 被拒绝。它是 shim 单元测试，不是 V8、Worker 或鸿蒙真机验收。

## 构建入口

当前锁定的构建宿主为 macOS arm64，目标为 aarch64-unknown-linux-ohos。需要 Rust 1.99.1 及 OHOS target、CMake、Ninja、Git、patch、Python >=3.9，以及锁定的 OHOS NDK 和 GN。

```sh
./build.sh \
  --ndk /path/to/ohos/native \
  --gn /path/to/locked/gn \
  --cache /path/to/source-cache \
  --output /path/to/new-build-directory \
  --jobs 6
```

SDK/GN/cache/output 都是显式参数，不在脚本中写死本机路径。输入必须匹配 source-inputs.lock.json；输出目录必须是新目录，且位于配方及输入缓存之外。可选 --local-git-root 只读使用指定 Skia Git 缓存的准确 commit，不读取其工作区改动。

构建会校验/下载源码，重建 14 项依赖源码目录，零 fuzz 应用四份补丁，生成并编译源码 shim，再真实编译 Skia、AVIF/AOM 和 Rust 绑定。GN 保留 PDF、SVG、skottie、skparagraph、字体和图片 codec 功能；AVIF 没有关闭。Skia 的 NDK C++20 不兼容只在该提交实际需要的 PDF 两处改写；没有直接套用 1.0.13 的 SVG 改动。

成功输出：

- `native/skia.openharmony-arm64.node`：同源重建的独立 Node 绑定；Node-API 由宿主解析。
- `native/skia.electron-oh-arm64.node`：本次源码编译的 Electron 绑定，单文件原生布局；不是旧 ELF 改名/改字符串。
- `native/native-manifest.json`：输入锁、shim、28 个 Skia 静态归档、最终 native 和全部成功日志的哈希。
- `native/undefined.txt`、`exports.txt`、`dynamic.txt`：真实 ELF 检查结果。
- `source/`、`logs/`：保留完整源码构建目录和日志，不以删除工作目录替代交接。

独立 Node 和 Electron 原生文件均从相同的补丁源码构建，分别使用隔离的 Cargo target 目录。Node 变体不链接 Electron shim，保留由宿主 Node 解析的 Node-API 导入；Electron 变体使用源码 shim 严格链接。两者均静态包含 Skia、AVIF 依赖。基线 Node 二进制的 Lottie 空白缺陷已通过重编修复；基线 tgz 和原哈希保留为对照输入。

## 校验入口

```sh
python3 tools/test-shim.py --output /path/to/new-host-shim-test
cargo +1.99.1 metadata --manifest-path /path/to/build/source/Cargo.toml \
  --locked --filter-platform aarch64-unknown-linux-ohos --format-version 1 \
  > /path/to/build/cargo-metadata.json
python3 tools/audit-cargo-sources.py \
  --metadata /path/to/build/cargo-metadata.json \
  --lock /path/to/build/source/Cargo.lock \
  --output /path/to/build/cargo-source-audit.json
```

Cargo 审计实际比较 Cargo.lock checksum、缓存 crate 归档 SHA256 和解包后的每个源码文件，不只查看版本名称。已完成的一次审计覆盖 83 个 registry 依赖、5,218 个源码文件。许可证副本按依赖收集在构建输出中；源归档保留完整原始材料。配方 ../licenses/ 保存 176 份通知材料，按 ../licenses.lock.json 校验后复制入包。这些材料涵盖构建和运行依赖，不表示每项均静态链接。

## 文件用途

| 文件 | 用途 |
|---|---|
| source-inputs.lock.json | 上游/Skia 归档、工具链、Cargo、补丁、源码 shim 的输入锁 |
| skia-dependencies.lock.json | 来自准确 Skia DEPS 的 14 项 URL/commit/归档 SHA256 |
| Cargo.lock | 本次构建冻结的 Rust 依赖解析结果 |
| patchs/0001-*.patch | 对 Canvas 源码 build.rs 应用 OHOS 工具链、AVIF、源码 shim 严格链接 |
| patchs/0002-*.patch | 对匹配 Skia 源码应用 libc++15 兼容改写 |
| skia-args.gn.in / ohos-deps.toolchain.cmake | 显式 NDK 参数化的 GN/CMake 配置 |
| shim/ | 新转发层 C 源码、官方头文件及各自哈希 |
| shim-provenance/ | 官方预编译文件的来源记录与许可原文；不携带或链接官方 .a |
| tools/ | 可执行构建、生成、测试及 Cargo 源码审计入口 |
| patchs/0003-*.patch | drawImage 使用 napi 自动生成的参数转换作用域，兼容 Electron 25 |
| patchs/0004-*.patch | Lottie 写入活动 Canvas recorder，防止读取像素时被旧记录覆盖 |

## 验收边界

完整源码构建保留 Skia、AVIF、字体、PDF、SVG、Lottie 功能。Electron 37/40 仍需要应用侧的引擎 N-API 绑定修复；npm 安装不会修改 SDK。见 ../PACKAGE_README.md 和 ../tools/bind-electron37-napi.py、bind-electron40-napi.py。

最终候选、测试范围和每个目标的准确运行时由 ../release-evidence.json 锁定；历史 `.0`、`.2`、`.3` 候选报告不能替代 `.5` 的验收。
