# electron-oh/ — 本库构建与验证支撑

本目录位于 `ports/windows-foreground-love/0.6.1/electron-oh/`，是 02 阶段聚合仓库配方的最小支持集，**不进入 npm 包**。

| 文件 | 作用 |
| --- | --- |
| `inputs.lock.json` | 锁定基线（windows-foreground-love 0.6.1 npm tgz/哈希）、候选身份与哈希（tgz + 规范 tar）、运行时来源（node 24.13.0 / Electron-OH 37.2.0 / 34.8.6 / 40.0.1 及其哈希） |
| `PACKAGE_README.md` | 面向 npm 使用者的包说明（用法、平台契约、消费提示） |
| `tests/assertions.cjs` | 本库共享断言（2 条，与上游 test.js 非 win32 分支断言一一对应） |
| `tests/regression.cjs` | 宿主回归入口：加载安装的 scoped 包并跑 2 条断言 |
| `tests/host-contract.py` | CI 契约：--ignore-scripts npm install + 两进程跑 suite + release 守卫回归 |
| `tests/dependencies.lock.json` | 宿主契约的依赖锁（file:./candidate.tgz） |
| `tools/build.cjs` | 可复现候选构建：锁定基线 npm tgz + 元数据改写 → 冻结 tgz |
| `tools/suite.cjs` | host-contract 调用的断言 runner（返回 {pass,total,fail}） |
| `tools/release.py` | 候选校验 + CI 五元组守卫 + OIDC 发布（同版本幂等/异字节拒绝） |
| `tools/verify-candidate.cjs` | 候选校验工具：核对最终 tgz SHA256 与身份 |
| `release-evidence.json` | 发行状态证据（ready；四角色真机 2/2 ×2） |

真实设备证据（每目标报告、HAP 哈希、运行日志）留在第一阶段工程 `E:\jsAdaptPublish\windows-foreground-love 0.6.1\reports/` 与 `.local/`；
精简证据通过 `release-evidence.json` 与 `inputs.lock.json` 指向。

> **--ignore-scripts 说明**：库含 binding.gyp，npm 默认 install 触发 `node-gyp rebuild`（win32 真实 addon /
> 其他平台占位编译）。addon 在非 win32 平台**永不加载**（index.js 平台守卫），宿主契约回归只验证 JS 契约
> （恒 false、不抛异常），故 install 用 `--ignore-scripts` 并如实标注；真实 node-gyp 编译路径由上游 CI 背书，
> 鸿蒙侧消费经 tarball 装配即可（第一阶段设备矩阵已实证）。

## 矩阵结论（详见第一阶段 reports/validation-matrix.json）

| 目标 | baseline 0.6.1 | candidate 0.6.1-electron-oh.0 |
| --- | --- | --- |
| node (设备 Node 24.13.0) | 2/2 ×2 | 2/2 ×2（真机） |
| electron-reference (Electron-OH 37.2.0) | 2/2 ×2 | 2/2 ×2（真机） |
| electron34 (Electron-OH 34.8.6) | 2/2 ×2 | 2/2 ×2（真机） |
| electron40 (Electron-OH 40.0.1) | 2/2 ×2 | 2/2 ×2（真机） |

发行状态：**ready**（候选哈希一致、四必需角色设备证据齐、零功能补丁）；`publish.sh` 默认禁发，
CI 在 main push 且全部检查通过、`ENABLE_ELECTRON_OH_PUBLISH=1` 时才放行 OIDC 发布。
