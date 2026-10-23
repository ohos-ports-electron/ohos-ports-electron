# 新 scope 的发行依据

目标：@ohos-ports-electron/better-sqlite3@13.0.3-electron-oh.0，tag electron-oh。
用户在当前任务中明确要求“帮我执行并发布上去”，随后完成本机 npm 登录。
实际校验 npm whoami 为 mzsylr，npm org ls ohos-ports-electron 显示其角色为 owner。
此前已说明采用 hap-consumer-signing 路线：npm 携带 ELF，应用方按自身证书完成 HAP 代码签名。
该请求作为本次目标 scope 的执行授权；不代表 ohos-ports 组织或 GitHub PR 维护者已批准原 scope 发布。

## shim 来源取证

仓库：https://gitcode.com/CPF-Electron/Electron.git
固定提交：af515cbf8594f5feb6626f150f8e36fd8bf8f1ec
路径：docs/electron-loading-addon-guide/electron-napi-library/lib/libshim.a
该 Git blob 不是 LFS 指针，长度 50748 字节，SHA-256：
6c8b3134b858c505b1741fd182f921dd092774558addabc8848d71287edf5d52。
与构建锁定的 libshim.a 完全一致。
同一提交根 LICENSE 为 MIT，版权信息为 Electron contributors / GitHub Inc.。
addon guide 目录内未发现替代 LICENSE/NOTICE；readme.txt 仅列出头文件、库路径和宏定义。
对应完整 MIT 文本已原样保存到 licenses/ 并锁定 SHA-256，随最终 notices 分发。

许可证固定链接：
https://gitcode.com/CPF-Electron/Electron/blob/af515cbf8594f5feb6626f150f8e36fd8bf8f1ec/LICENSE

该来源比对解决的是当前 shim 输入的许可材料缺口，不追认旧 tgz 的运行证据。
最终 tgz 仍须单独构建、验证并绑定 Node/Electron/HAP 验签报告。
