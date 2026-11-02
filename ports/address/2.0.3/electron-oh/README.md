# electron-oh/ — 本库构建与验证支撑

本目录位于 `ports/address/2.0.3/electron-oh/`，是 02 阶段聚合仓库配方的最小支持集，**不进入 npm 包**。

| 文件 | 作用 |
| --- | --- |
| `inputs.lock.json` | 锁定基线（address 2.0.3 npm tgz/哈希）、候选身份与哈希（tgz + 规范 tar）、运行时来源（node 24.13.0 / Electron-OH 37.2.0 / 34.8.6 / 40.0.1 及其哈希） |
| `PACKAGE_README.md` | 面向 npm 使用者的包说明（用法、平台契约、消费提示） |
| `tests/assertions.cjs` | 宿主契约断言子集（mock/纯逻辑用例，fixtures 内联） |
| `tests/regression.cjs` | 宿主回归入口：加载安装的 scoped 包并跑宿主断言子集 |
| `tests/host-contract.py` | CI 契约：npm install + 两进程跑宿主断言 + release 守卫回归 |
| `tests/dependencies.lock.json` | 宿主契约的依赖锁（file:./candidate.tgz） |
| `tools/build.cjs` | 可复现候选构建：锁定基线 npm tgz + 元数据改写 → 冻结 tgz |
| `tools/suite.cjs` | host-contract 调用的断言 runner（返回 {pass,total,fail}） |
| `tools/release.py` | 候选校验 + CI 五元组守卫 + OIDC 发布（同版本幂等/异字节拒绝） |
| `tools/verify-candidate.cjs` | 候选校验工具：核对最终 tgz SHA256 与身份 |
| `release-evidence.json` | 发行状态证据（ready；四角色真机 26/26 ×2） |

真实设备证据（每目标报告、HAP 哈希、运行日志）留在第一阶段工程 `E:\jsAdaptPublish\address 2.0.3\reports/` 与 `.local/`；
精简证据通过 `release-evidence.json` 与 `inputs.lock.json` 指向。

> 测试夹具说明：库 npm 包不含 `test/`；upstream `test/fixtures`（darwin/linux/win32 exec 输出、dns 文件、ts tsconfig）
> 与 suite-support 闭包（typescript/mm/@types/node 等）为测试宿主供给（recipe payload 装配），不入 npm 包。

## 矩阵结论（详见第一阶段 reports/validation-matrix.json）

| 目标 | baseline 2.0.3 | candidate 2.0.3-electron-oh.0 |
| --- | --- | --- |
| node (设备 Node 24.13.0) | 26/26 ×2 | 26/26 ×2（真机） |
| electron-reference (Electron-OH 37.2.0) | 26/26 ×2 | 26/26 ×2（真机） |
| electron34 (Electron-OH 34.8.6) | 26/26 ×2 | 26/26 ×2（真机） |
| electron40 (Electron-OH 40.0.1) | 26/26 ×2 | 26/26 ×2（真机） |

发行状态：**ready**（候选哈希一致、四必需角色设备证据齐、零功能补丁）；`publish.sh` 默认禁发，
CI 在 main push 且全部检查通过、`ENABLE_ELECTRON_OH_PUBLISH=1` 时才放行 OIDC 发布。