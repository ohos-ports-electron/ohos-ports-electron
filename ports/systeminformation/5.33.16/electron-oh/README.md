# electron-oh/ — 本库构建与验证支持

本目录位于 ports/systeminformation/5.33.16/electron-oh/，是 02 阶段聚合仓库配方的最小支持集；
不进入 npm 包。

| 文件 | 作用 |
| --- | --- |
| `inputs.lock.json` | 锁定基线（@ohos-ports/systeminformation 5.33.1-beta.0 的 tgz/哈希）、补丁 0001–0005 哈希、候选身份与哈希、运行时来源（node 24.13.0 / Electron-OH 37.2.0、34.8.6、40.0.1 及其哈希） |
| `PACKAGE_README.md` | 面向 npm 使用者的包说明（平台识别、已知限制） |
| `tests/regression.cjs` | 宿主回归入口：加载 `@ohos-ports-electron/systeminformation` 并跑 61 条共享断言（数据形态断言，无 mock） |
| `tools/verify-candidate.cjs` | 候选校验工具：核对最终 tgz 的 SHA256 与包内文件清单 |
| `release-evidence.json` | 发行状态证据：blocked 原因与证据根 |
| `README.md` | 本目录说明 |

真实设备证据（每目标报告、HAP 哈希、运行日志）留在第一阶段工程 `reports/` 与 `.local/`，
精简证据通过 `release-evidence.json` 与 `inputs.lock.json` 指向。

## 矩阵结论（详见第一阶段 reports/validation-matrix.json）

| 目标 | baseline 5.33.1-beta.0 | candidate 5.33.16-electron-oh.0 |
| --- | --- | --- |
| node (设备 Node 24.13.0) | 57/61（cpu/currentLoad/fsSize/versions 失败） | 61/61 |
| electron-reference (Electron-OH 37.2.0) | 57/61 | 61/61 |
| electron34 (Electron-OH 34.8.6) | 57/61 | 61/61 |
| electron40 (Electron-OH 40.0.1) | blocked | blocked（Electron-OH 40 运行时 SIGCHLD/waitpid 平台缺陷，非库问题） |

发行状态 blocked（e40 未全量 + 目标仓库/线上配置未确认），publish.sh 默认禁发。
