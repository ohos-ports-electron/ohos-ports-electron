# 鸿蒙平台Electron加载Addon指导文档（基于node-sqlite3-5.1.7）

[返回主文档](../../README.md)

## 目录

- [前置要求](#前置要求)
- [一、获取node-sqlite3源码](#一获取node-sqlite3源码)
- [二、修改node-sqlite3源码](#二修改node-sqlite3源码)
- [三、配置编译环境](#三配置编译环境)
- [四、编译](#四编译)
- [五、在Electron工程中使用编译得到的sqlite3](#五在electron工程中使用编译得到的sqlite3)
- [六、头文件和样例](#六头文件和样例)
- [编译报错处理](#编译报错处理)

---

## 前置要求

- ubuntu22.04上已安装node.js
- 已拉取electron源码仓库

---

## 一、获取node-sqlite3源码

将node-sqlite3源码拉到Ubuntu环境下，本教程使用的是5.1.7版本（此版本无漏洞）。

GitHub地址：https://github.com/TryGhost/node-sqlite3

![node-sqlite3 GitHub页面](./res/image001.jpg)

---

## 二、修改node-sqlite3源码

### a) 修改文件 node-sqlite3/lib/sqlite3-binding.js

修改为如下图所示：

```javascript
const binding = require('/data/storage/el1/bundle/libs/arm64/node_sqlite3.node');
module.exports = exports = binding;
```

![修改sqlite3-binding.js](./res/image003.jpg)

### b) 将electron-napi-library文件拷贝到node-sqlite3目录下

如下图所示：

![拷贝electron-napi-library](./res/image005.png)

### c) 修改文件 node-sqlite3/binding.gyp

![修改binding.gyp](./res/image007.jpg)

如下图所示：

在"include_dirs"添加："electron-napi-library/include"，在"include_dirs"下一行：

```json
"libraries": [ "<(module_root_dir)/electron-napi-library/lib/libshim.a" ],
```

在"conditions"的"include_dirs"添加："electron-napi-library/include"

![binding.gyp配置示例1](./res/image009.jpg)

如下图所示：

在"defines"添加："HIDE_NAPI_AND_UV"

![binding.gyp配置示例2](./res/image010.jpg)

### d) 修改文件 node-sqlite3/package.json

![修改package.json](./res/image011.png)

如下图所示：

将"napi_versions"修改为8

---

## 三、配置编译环境

Electron的addon编译需使用相同的编译工具链。

例如，electron源码路径是：/opt/code/dev_chromium/dev_electron/，那么编译工具链路径是：

```
/opt/code/dev_chromium/dev_electron/src/ohos_sdk/openharmony/native/llvm/bin/
```

请根据自己的编译环境进行设置：

```bash
export CC="/opt/code/dev_chromium/dev_electron/src/ohos_sdk/openharmony/native/llvm/bin/clang --target=aarch64-linux-ohos"
export CXX="/opt/code/dev_chromium/dev_electron/src/ohos_sdk/openharmony/native/llvm/bin/clang++ --target=aarch64-linux-ohos"
export LD="/opt/code/dev_chromium/dev_electron/src/ohos_sdk/openharmony/native/llvm/bin/lld --target=aarch64-linux-ohos"
export STRIP="/opt/code/dev_chromium/dev_electron/src/ohos_sdk/openharmony/native/llvm/bin/llvm-strip"
export RANLIB="/opt/code/dev_chromium/dev_electron/src/ohos_sdk/openharmony/native/llvm/bin/llvm-ranlib"
export OBJDUMP="/opt/code/dev_chromium/dev_electron/src/ohos_sdk/openharmony/native/llvm/bin/llvm-objdump"
export OBJCOPY="/opt/code/dev_chromium/dev_electron/src/ohos_sdk/openharmony/native/llvm/bin/llvm-objcopy"
export NM="/opt/code/dev_chromium/dev_electron/src/ohos_sdk/openharmony/native/llvm/bin/llvm-nm"
export AR="/opt/code/dev_chromium/dev_electron/src/ohos_sdk/openharmony/native/llvm/bin/llvm-ar"
export CFLAGS="-fPIC -D__MUSL__=1"
export CXXFLAGS="-fPIC -D__MUSL__=1"
```

---

## 四、编译

### 1. 进入node-sqlite3目录并设置为华为仓库

```bash
cd ~/node-sqlite3
npm config set registry http://mirrors.tools.huawei.com/npm/
```

### 2. 初始化编译

```bash
npm install --verbose --build-from-source --runtime=electron --debug --target=18.18.2 --dist-url=https://electronjs.org/headers
```

**注意：** `--target=18.18.2` 不是随意写的，需要根据自己安装的nodejs版本填写，执行 `node --version` 可以查询当前安装的nodejs版本。

---

## 六、头文件和样例

- [头文件](./electron-napi-library)
- [使用样例](./demo)
---

## 编译报错处理

### (一) 关于编译时出现错误

出现如下错误：
```
audit error FetchError: request to https://registry.npmjs.org/-/npm/v1/security/audits/quick failed, reason: self-signed certificate in certificate chain
```

可以尝试关闭npm的SSL证书验证来解决这个问题：

```bash
npm config set strict-ssl false
```

### (二) 如遇到如下图所示的错误

![编译错误示例](./res/image015.jpg)

此时要检查编译工具链的环境变量是否配置成功。

### (三) 遇到下载 node-v18.0.0-headers.tar.gz 失败的编译错误

这是网络问题，可以在Linux环境使用其他网络下载成功后再进行编译即可。

---

## 五、在Electron工程中使用编译得到的sqlite3

### A. 在Electron源码目录DevEco工程打开

在Windows系统上打开，如下图所示路径：

```
~/chromium-electron-release/src/ohos/app/ohos_hap
```

![DevEco工程目录](./res/image017.png)

**注意：最新electron路径已发生改动，图中的product目录已变更为electron**

### B. 将Electron项目中的.so等文件从Ubuntu传输到DevEco工程中

具体请参考Electron鸿蒙化指导文档，此处不进行赘述。

### C. 解压electron-example.zip压缩文件

如下图所示进行操作：

![解压electron-example](./res/image019.png)

放在以下目录：

```
ohos_hap/web_engine/src/main/resources/resfile/resources/app/
```

如下图所示：

![app目录结构](./res/image021.png)

**注意：最新electron路径已发生改动，图中的product目录已变更为electron**

### D. 将node_sqlite3.node拷贝到libs目录

在Ubuntu系统中的 `node-sqlite3/build/Debug/node_sqlite3.node` 目录找到node_sqlite3.node，如下图所示将它拷贝到Electron工程项目目录：

```
ohos_hap\product\pc\libs\arm64-v8a\

# 注意，新版路径为：
ohos_hap\electron\libs\arm64-v8a\
```

![拷贝node_sqlite3.node](./res/image023.png)

上图为Ubuntu，下图为Windows

![libs目录结构](./res/image025.png)

### E. 将lib目录和package.json文件拷贝

在ubuntu系统中的node-sqlite3/lib目录和node-sqlite3/package.json文件拷贝过去：

```
ohos_hap\web_engine\src\main\resources\resfile\resources\app\node_modules\sqlite3
```

目录下

![sqlite3目录结构](./res/image027.png)

### F. 重新安装hap包并运行electron

在electron的console打印有如下日志，表示成功：

![运行成功日志](./res/image029.jpg)

---

## 相关文档

- [Electron鸿蒙化指导文档（主文档）](../../README.md)
- [Electron调用ETS指导文档](../electron-calling-ets-guide/README.md)
- [命令行参数支持说明](../command-line-parameters/README.md)
- [项目升级说明](../upgrade/README.md)
- [日志说明文档](../logging-guide/README.md)