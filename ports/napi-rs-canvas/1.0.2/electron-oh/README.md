# 构建、验证与发行

`inputs.lock.json` 锁定基线、三份包补丁、四份源码补丁、两个 native 及冻结 tgz。`native-source/` 可在锁定 macOS arm64 工具链上从源码构建；不使用本机 1.0.13 的预编译 native。详见 [源码构建说明](native-source/README.md)。

```sh
python3 electron-oh/tools/acquire-native.py --output /tmp/canvas-native
bash build.sh --native-artifacts /tmp/canvas-native --output /tmp/canvas-bundle
python3 electron-oh/tools/release.py verify --bundle /tmp/canvas-bundle
python3 electron-oh/tools/test-host.py --tgz /tmp/canvas-bundle/candidate.tgz --output /tmp/canvas-host
python3 electron-oh/tests/release-contract.py --bundle /tmp/canvas-bundle --evidence-archive /path/to/evidence.tar.gz
```

npm 打包工具链固定为 Node 24.20.0 / npm 11.19.0；它与发布作业的工具链分别锁定。

归档 URL 和每个成员均被 `native-artifact.lock.json` 锁定。离线时可向 acquire-native.py 传 `--archive`。构建零 fuzz 应用包补丁，正常 npm pack 一次，核对冻结 SHA256、全部包内字节及 SHA512；bundle 另绑定当前 Git commit 与配方文件哈希。发布作业下载同一 bundle，不重新打包。

宿主检查覆盖真实纯 JS geometry 和受控 native 替身的加载器选择，不执行 OHOS native。精确 Node 版本来自真机运行时：18.15.0、20.18.1、22.17.0、24.11.1、24.13.0。Node 18 使用 npm 9.5.0，其余宿主使用支持对应 Node 的 npm。CI 不声称运行了新一轮真机；它校验锁定归档中的设备报告。

设备验收使用同一 candidate.tgz，覆盖独立 Node 与 Electron-OH 25/34/37/40、主线程与 Worker、每目标两次不同 PID 的启动、Worker 退出码及主进程正常退出。用例名称、数量、准确框架哈希与条件见 release-evidence.json。它是代表性功能验收，不声称 API 穷举、远程图片网络、JIT/WASM 或资源压力测试通过。

`publish.sh` 默认禁发。脚本只接受指定仓库、main push、准确 workflow/environment、当前 checkout SHA、已通过的本地/归档门禁和 OIDC；同版本同 integrity 跳过，不同字节拒绝，只有 registry 404 被识别为新版本。Fork、PR、手动构建和其他分支不能发布。

线上使用 GitHub-hosted runner、Node 24.13.0、npm 11.21.0 和 npm-publish environment；该 environment 限 main 分支。还须设置本包 Trusted Publisher：owner/repo 为 ohos-ports-electron/ohos-ports-electron，workflow 为 napi-rs-canvas-electron-oh.yml，environment 为 npm-publish，并明确允许 direct publish。仓库变量 NAPI_RS_CANVAS_PUBLISH_MODE 只有在账号侧配置核实后才设为 oidc。

新包尚不存在时，npm Trusted Publisher 不能仅凭 YAML 创建。首发或创建公开 staged 占位包均需明确执行授权；配置建立后应按 npm 当前要求及时完成首次成功发布。详见 [npm 官方 Trusted Publishing 文档](https://docs.npmjs.com/trusted-publishers/)。本配方不包含 token、签名材料或账号权限。
