# electron-oh/ · 构建与验证支持

本目录位于 `ports/electron-context-menu/5.1.0/electron-oh/`，是 02 阶段聚合仓库配方的最小支持集，**不进入 npm 包**。

| 文件 | 作用 |
| --- | --- |
| `inputs.lock.json` | 锁定基线（electron-context-menu 5.1.0 npm tgz/哈希）、候选身份与哈希（tgz + integrity）、repository 与期望 dist-tags |
| `PACKAGE_README.md` | 面向 npm 使用者的包说明（recipe-only 参考；候选包内 README 为上游原样） |
| `package-inventory.json` | 候选包内 5 文件逐一 SHA256 |
| `tests/suite.cjs` | 宿主身份/字节契约（不加载 electron-only 库：identity + 全部文件哈希 + repository + 无生命周期脚本 + esm exports 入口在位） |
| `tests/release-contract.py` | 发布守卫回归（unittest；OIDC 交换/双 dist-tag 写权限/禁用默认） |
| `tools/build.py` | 可复现候选构建：锁定基线 tgz + 元数据改写 + 确定性 ustar/gzip；gzip 与锁不一致时冻结归档兜底 |
| `tools/release.py` | 冻结候选/当前配方/设备证据核验 + OIDC 双标签发布（同版本幂等/异字节拒绝） |
| `release-evidence.json` | 发行状态证据（ready；electron34/37/40 各 44/44 ×2 冷启动） |

真实设备证据（每目标报告、HAP 哈希、运行日志）留在第一阶段工程
`E:\jsAdaptPublish\electron-context-menu-5.1.0` 的 `reports/` 与 `.local/`；精简证据通过
`release-evidence.json` 的 archive URL/SHA256 指向。

## 矩阵结论

| 目标 | baseline 5.1.0 | candidate 5.1.0-electron-oh.0 |
| --- | --- | --- |
| electron34 (Electron-OH 34.8.6) | 44/44 ×2 | 44/44 ×2（真机） |
| electron37 (Electron-OH 37.2.0, reference) | 44/44 ×2 | 44/44 ×2（真机） |
| electron40 (Electron-OH 40.0.1) | 44/44 ×2 | 44/44 ×2（真机） |

`node` 角色 electron-only 不适用（index.js 顶层 `import('electron')`）；`electron25` 非默认矩阵（按需目标，
本次未请求）。`publish.sh` 默认禁发；CI 仅在 main push、全部检查通过且
`ENABLE_ELECTRON_OH_PUBLISH=1` 时放行 OIDC 发布并核验 `latest` + `beta` 双标签。
