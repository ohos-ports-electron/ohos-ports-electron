# 宿主回归材料

package-lock.json 锁测试安装图及 input.tgz 的版本/integrity。构建工具把调用者提供的 tgz 复制到干净输出目录，生成逐文件 input.json，然后正常 npm ci 并执行 20 项推理/生命周期断言。suite.cjs 与 worker-case.cjs 是测试代码，不随 npm 包分发。

fixtures.lock.json 记录模型和参考输入/输出的来源及 SHA256：用户提供的 onnxruntime-node 1.30.0 参考工程 source/js/node/test/testdata。这里只复用测试数据，不用其 1.30.0 native 二进制。完整来源核验记录留在第一阶段 reports/input-comparison/fixture-provenance.json。构建依赖许可见 ../native/licenses/。

release-contract.py 运行发布身份拒绝、blocked 证据、registry 404/错误/冲突语义，以及提供 --bundle 时的实际 artifact/当前配方绑定和篡改检查；不会上传 npm。
