# 构建、验证与发行

本配方独立工作，所有路径相对本 port 或由参数提供。支持文件不依赖原 demo 目录。先阅读 [包内容和覆盖范围](../README.md)。

## 重建同一候选

由第一阶段保留的 `native-artifacts/` 提供 core、binding 和 native-artifacts.json；或使用 `tools/acquire-native.py --url HTTPS_URL --output NEW_DIRECTORY` 下载并核验 `native-artifact.lock.json` 锁定的归档。归档已在 native-artifact.lock.json 的 HTTPS 地址托管并回下载验证；可用 `--archive /absolute/path/to/archive.tar.gz` 离线验收。它们的 SHA 必须匹配本 port 的 release-evidence.json 和 native-inputs.lock.json。不将这些二进制提交到 Git。

```sh
bash build.sh --native-artifacts /absolute/path/to/native-artifacts --output /absolute/path/to/new-bundle
# 已有锁定基线可显式复用，省去下载：--baseline /absolute/path/to/baseline.tgz
python3 electron-oh/tools/release.py verify --bundle /absolute/path/to/new-bundle
python3 electron-oh/tests/release-contract.py --bundle /absolute/path/to/new-bundle
python3 electron-oh/tools/test-host.py --tgz /absolute/path/to/new-bundle/candidate.tgz --output /absolute/path/to/new-host-test
```

以上命令从本 port 目录执行，输出目录必须尚不存在。build.sh 校验配方，下载/核验基线，按 packagePatches 顺序应用补丁，加入已冻结原生文件和 22 项许可，确定性生成 tgz，并用当前配方/checkout SHA 封装 bundle.json。验证包内全部 72 项后才形成交接。只把 candidate.tgz、candidate.json、bundle.json 交接给后续作业；暂存 package/ 与 baseline.tgz 可在校验完成后删除以节省空间。

`test-host.py` 在新目录复制完整断言/模型和锁，执行允许 postinstall 的正常 npm ci，再做 20 项真实推理、类型、错误、Worker、释放与并发测试。其结果明确标为 execution=host；不把这一步称为鸿蒙真机验证。手动安装冻结包可执行 `npm install /absolute/path/to/candidate.tgz`；当前目标版本尚未发行。

## 从源码重编译原生文件

需要 CMake >=3.28、Ninja、宿主 C++ 编译器、可用的鸿蒙 SDK native 目录、大量临时空间及锁定的官方 shim。源码、依赖、node-addon-api 和 shim 哈希均来自未更改的 native-inputs.lock.json。

```sh
python3 electron-oh/tools/build-native.py \
  --sdk-native /absolute/path/to/sdk/native \
  --shim-library /absolute/path/to/libshim.a \
  --work-dir /absolute/path/to/new-native-work --jobs 4
```

node-addon-api 6.1.0 默认从 npm registry 下载并验 SHA；离线时加 `--node-addon-api-archive /absolute/path/to/node-addon-api-6.1.0.tgz`。`--cache-root` 可显式指向保存了锁内 cachePath 的缓存根目录，否则下载源码和 12 项锁定依赖。`--check-support-inputs` 只暂存/核验头文件、shim 与 node-addon-api，明确不会编译。shim 官方父归档、内嵌 zip 路径和哈希见锁及 [vendor 来源说明](native/vendor/electron-napi-library/README.md)。

完整构建先编宿主 protoc，再交叉编 core 和 Electron binding，最后 freeze-native.py 检查 ELF 依赖、导出、注册方式、私有 C++ ABI 及 cleanup hook。独立 Node/其他平台原生文件来自已锁定基线，不由此脚本重编译。重编译的 ELF 不承诺跨 SDK/路径逐字节可复现；若产生不同 native manifest/tgz，必须返回第一阶段生成新修订并重新跑设备矩阵，不能复用当前证据或手改 SHA 放行。

本次贡献迁移及解阻复现的是“锁定基线 + 原生冻结产物 → 同一候选”的打包过程；没有在迁移阶段再执行完整 native 重编译。第一阶段的真实 native 编译与五目标设备报告仍独立保留。

## CI 和发布门禁

- PR 在 GitHub 托管机核验锁、语法和发布边界，并从公开且哈希锁定的归档构建同一 tgz、运行五版本宿主兼容检查，不接触发布 Secret。
- 受信任仓库 main 的 push 或 main 手动运行在 Ubuntu 24.04 托管机打包，不需要自建 runner。`ONNXRUNTIME_NATIVE_URL` 仓库变量应指向锁定的原生归档 HTTPS 地址；下载后校验整包 SHA256、三个成员及各文件 SHA256。CI 组合冻结原生文件，不执行完整 native 编译，也不接受机器上未锁定的二进制。
- 构建一次，artifact 名带 commit SHA / run ID / attempt。兼容作业在 Node 18.15.0、20.18.1、22.17.0、24.11.1、24.13.0 安装同一 tgz 并推理；这是 Linux 宿主矩阵。首次贡献的 PR 和 main 已实际运行该矩阵，各版本 20/20。设备报告来自真实鸿蒙 PC，不会被宿主测试替代。
- 只有可信 main push、构建和全部兼容作业成功且 release ready，才进入 GitHub 托管 `npm-publish` 环境。PR/Fork/其他分支/手动运行不能发布。publish.sh 默认禁发；脚本核对仓库、事件、ref、workflow、environment、commit、配方、证据及同一 tgz。
- 默认 `ONNXRUNTIME_PUBLISH_MODE=oidc`。包尚不存在时可临时设为 `bootstrap`，由 `npm-publish` environment 的 `NPM_BOOTSTRAP_TOKEN` 完成首次 CI 发布。脚本要求 Token 非空、认证查询确认整包不存在；只有明确 404 可以继续，401/403/429/5xx 全部拒绝。Token 不提供给 build/compatibility/PR，不写入制品和仓库。首发后删除 Secret，变量恢复 oidc，并为本包配置 Trusted Publisher。
- 同版本同 integrity 跳过；不同字节拒绝；最终上传 candidate.tgz，绝不重新 pack。Token 只解决首次认证，不能绕过证据门禁。
- npm 成功接受上传后可能先返回“正在处理”，版本查询仍为 404。发布后最多查询 61 次，间隔 10 秒；只有 404 会等待，真实 integrity 不一致或其他查询错误立即失败。等待耗尽会明确提示已接受上传但尚未公开；先检查 npm 处理状态和 Staged Packages，不要改版本或候选字节。`0.0.0-stage` 是占位包，不能当作候选已发布；若目标版本在暂存列表等待批准，由维护者按 [npm staged publishing 说明](https://docs.npmjs.com/staged-publishing/) 完成 2FA 审批。版本可见且同 integrity 后，完整重跑该 main 工作流会幂等跳过上传（不要仅重跑失败 job，artifact 绑定 run attempt）。

当前 release=ready：技术证据、公开归档及其回下载哈希已核验，首次发布环境 Secret 的名称和更新时间已确认，未读取 Token 值。实际认证、上传和 registry 验收由 main 发布作业完成；尚未验证后续 OIDC 上传。完整操作见仓库文档及第一阶段 `pr/PUBLISHING.md`。

## 设备 npm 验证边界

使用官方 DevNode-OH Node 24.13.0 / npm 11.6.2 作为安装器；Electron 内嵌 Node 的版本单独记录。每次冷启动创建空目录，从同一 tgz 执行 `npm ci --offline --no-bin-links --foreground-scripts`，实际执行 postinstall，核验全部 72 文件，再运行消费者的 20 项测试。离线缓存来自锁定的 16 个 registry tarball；没有禁用生命周期脚本。`--no-bin-links` 是因设备应用文件系统拒绝依赖 CLI 软链接，本库不使用那些 CLI。

鸿蒙 PC 对普通应用数据目录的 native dlopen 有限制。Electron 从签名 HAP 中加载与 npm 安装一致的 Electron 原生库；独立 Node 使用从真实设备 npm 安装导出的签名 HNP 部署副本，并在每轮比较其全部 72 文件与新安装完全一致。不能据此宣称普通 app-data 目录直接 `require` 原生库可用。所有测试使用禁用 JIT 的启动参数，25 保留签名 Worker 别名配置。

[仓库发布与一次性配置](../../../../docs/RELEASING.md) · [精简证据](release-evidence.json) · [发行身份](release-policy.json)
