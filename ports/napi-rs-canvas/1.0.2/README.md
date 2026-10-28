# napi-rs-canvas 1.0.2 · Electron-OH

目标包：`@ohos-ports-electron/napi-rs-canvas@1.0.2-electron-oh.5`。该配方描述已冻结候选；实际发布结果以 registry integrity 和受信任工作流为准。发行门禁见 [release-evidence.json](electron-oh/release-evidence.json)。

从锁定的 `@ohos-ports/napi-rs-canvas@1.0.2-beta.0` 提取 JavaScript、类型与元数据，零 fuzz 应用三份包补丁。Node 和 Electron 原生文件均使用匹配 Canvas 1.0.2 的源码、Skia、四份源码补丁与锁定依赖重建，包含 drawImage 参数作用域及 Lottie recorder 修复。

## npm 内容与配方的关系

准确包内文件及 SHA256 全列在 [package-inventory.json](electron-oh/package-inventory.json)。分组如下：

| npm 文件 | 来源与用途 |
|---|---|
| package.json | 基线加包补丁；明确发行名称、版本、仓库目录和公开发布属性 |
| index.js、js-binding.js | 基线加 OHOS 平台、系统字体和签名原生目录加载补丁 |
| geometry.js、load-image.js、node-canvas.js | 保留的基线 JavaScript |
| index.d.ts、node-canvas.d.ts | 保留的基线类型 |
| skia.openharmony-arm64.node | 重建的独立 Node 绑定，由 Node 宿主提供 Node-API |
| native/electron/skia.electron-oh-arm64.node | 重建的 Electron 绑定，静态链接项目 C 转发 shim |
| native-source.json | 两个 native 的源码、补丁、工具链和产物哈希记录 |
| README.md | 从 electron-oh/PACKAGE_README.md 复制的安装与集成说明 |
| LICENSE、licenses/** | 上游 Canvas 许可及按锁定依赖收集的通知原文与来源记录 |

包中没有 Electron 引擎、HAP、SDK、Windows/macOS/Linux 平台 native、测试依赖锁或构建工具。它面向 OpenHarmony arm64。安装依赖由基线 package.json 决定；宿主和 demo 的 package-lock.json 分别记录测试安装，不作为库发布文件。

## 配方文件

| 配方 | 职责及入包关系 |
|---|---|
| patchs/** | 三份包补丁；不入包，生成上述 JS 和元数据 |
| build.sh、publish.sh | 构建交接与冻结包发布入口；不入包 |
| LICENSE.upstream | 校验上游 LICENSE 的配方镜像 |
| electron-oh/PACKAGE_README.md、licenses/** | 分别复制为包内 README.md、licenses/** |
| electron-oh/inputs.lock.json、native-artifact.lock.json、licenses.lock.json | 基线、补丁、native 归档和通知的校验锁；不入包 |
| electron-oh/native-source/** | 完整源码构建配方、锁定头文件、shim、Cargo.lock 和四份补丁；不入包 |
| electron-oh/tools/**、tests/** | 重建、完整性、宿主 JS/加载器和发行拒绝条件检查；不入包 |
| electron-oh/release-policy.json、release-evidence.json、package-inventory.json | 发行身份、精简真机证据、包清单；不入包 |
| README.md、electron-oh/README.md | 贡献配方说明；根 README 不替换包内 README |

完整源码构建、失败尝试、demo 工程、签名 HAP 和原始报告保留在单库工程，通过精简证据的包哈希及归档链接关联。构建 bundle 是 candidate.tgz、candidate.json、bundle.json；实际 npm 发布对象仅为其中已验证的 candidate.tgz。

构建、宿主检查及发行流程见 [electron-oh/README.md](electron-oh/README.md)、[仓库发布说明](../../../docs/RELEASING.md) 和 [本库工作流](../../../.github/workflows/napi-rs-canvas-electron-oh.yml)。37/40 的应用引擎修复和 Electron 25 Worker 路径要求见包内说明。
