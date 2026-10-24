# 全新双宿主验证工程

两个工程普通 npm install 同一个冻结 candidate.tgz，不从旧 demo 拷贝目标包或 node_modules。
Electron 使用主进程调用库，通过 contextBridge/IPC 接入 renderer；contextIsolation=true、nodeIntegration=false。
Node 由独立 HAP 的私有 HNP 启动真实 Node 子进程，不能用 Electron 内置 Node 冒充独立 Node。

需要 DevEco SDK、Java、ohpm、hvigorw、hdc，以及本机提供 SDK debug 签名准备的 ohpt-agent。
该 CLI 用于生成合法签名材料；其他机器可用 DevEco 为对应工程准备自己的签名，不能只安装 Python 就复现 HAP。
构建、签名、验签、安装日志均记录到显式 --output 指定的新目录。

```sh
python3 ports/vscode-deviceid/0.1.5/electron-oh/demos/build-demo.py \
  --host node --bundle .local/new-build --sdk /path/to/DevEco/sdk \
  --java-home /path/to/jdk --node-runtime /path/to/node-runtime \
  --output .local/demos/node --install

python3 ports/vscode-deviceid/0.1.5/electron-oh/demos/build-demo.py \
  --host electron --bundle .local/new-build --sdk /path/to/DevEco/sdk \
  --java-home /path/to/jdk --runtime-dir /path/to/Electron-OH/ohos_hap \
  --output .local/demos/electron --install
```

Node runtime 目录须提供 node、libc++_shared.so、libsyscall_fallback.so，哈希匹配 node/runtime.lock.json。
该 runtime 与原本地 demo 同为 24.13.0；沿用 better-sqlite3 已验明的 syscall fallback，
对 io_uring 三个调用和 close_range 返回 ENOSYS 让运行时走正常后备，其他系统调用保留 ABI 透传。
兼容层源码位于 node/runtime-support，不修改设备 ID 的文件 API 或测试断言。
原本地 demo 的 io_uring shim 目录结构不同，不能把文件随意改名来冒充相同已锁定环境。

Electron runtime-dir 为官方 37.2.0 ohos_hap 模板；构建器校验 libelectron.so，记录四个实际引擎库的哈希。
Electron 工程只提交本次定制配置和应用代码；158 个与官方模板相同的文件由 electron/template.lock.json
锁定源文件与重建字节哈希，构建时从同一个 runtime-dir 校验并导入，避免把整个模板复制进每个 port。
已逐文件验证导入后与本次真机 HAP 使用的源模板字节相同。
从调用者提供的模板导入浏览器资源，不在源码仓库单独托管完整运行时。
构建时对普通安装后的包及最终签名 HAP/HNP 内 19 个包文件逐个校验，防止验证了错误 scope 或旧内容。

```sh
python3 ports/vscode-deviceid/0.1.5/electron-oh/demos/verify-device.py \
  --identity .local/demos/node/identity.json --output .local/verification/node
python3 ports/vscode-deviceid/0.1.5/electron-oh/demos/verify-device.py \
  --identity .local/demos/electron/identity.json --output .local/verification/electron
```

每个验证实际 force-stop / start 两次，要求不同 PID、两次各 10/10、相同持久化 ID、准确包文件哈希。
仅采集本 demo 的 OHDEVICEID 事件，不清空设备日志，不把旧 PID 的结果当成新运行通过证据。
十项包含：准确包身份、已有 ID、生成与写盘、BOM 清理、空文件、XDG 目录、HOME 回退、
明确模拟的读失败恢复、明确模拟的平台别名/不支持平台，以及应用冷启动持久化。
临时 HOME/XDG 目录在用例结束后恢复；持久化用例使用本 demo 独立沙箱，不改写其他应用的缓存 ID。

本地 HAP、debug profile 和运行时位于仓库 .local/；公开报告只保存必要的哈希、断言和验签输出。
不提交签名私钥、单独设备 profile、完整构建缓存或 node_modules。
