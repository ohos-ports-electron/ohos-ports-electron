// entry/src/main/ets/pages/Index.ets — cli-hnp-runner 宿主页：拉起即 fork+execv 私有 HNP 里的
// vscode-deviceid Node regression 跑用例。全套跑在 C++ worker 线程（不阻塞 ArkUI 主线程——长测试冻屏会被系统判无响应），
// 本页 pollStatus() 每 2 秒轮询取 TAP 结果显示到屏幕（供 ohpt verify-demo 截图佐证；主证据仍是
// hilog 原始输出）。
// 'libnode_demo.so' 的 node_demo 必须与 CMake target / napi_stub.cpp nm_modname 三处全等。
import demo from 'libnode_demo.so';
import { common } from '@kit.AbilityKit';

@Entry
@Component
struct Index {
  @State message: string = '(未运行)';
  @State running: boolean = false;
  private timer: number = -1;

  private filesDir(): string {
    const ctx = this.getUIContext().getHostContext() as common.UIAbilityContext;
    return ctx.filesDir;
  }

  private startRun(): void {
    let started: string = '(空)';
    try {
      started = demo.runTool(this.filesDir());
    } catch (e) {
      this.message = 'runTool 失败: ' + JSON.stringify(e);
      return;
    }
    if (started === 'busy') {
      this.message = '上一轮还在跑…（TAP 行正实时打 hilog，可 grep 查看）';
      return;
    }
    this.running = true;
    this.message = started + ' …运行中（长测试不冻屏，完成自动更新）';
    if (this.timer >= 0) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(() => {
      let s: string = 'RUNNING';
      try {
        s = demo.pollStatus();
      } catch (e) {
        s = 'pollStatus 失败: ' + JSON.stringify(e);
      }
      if (s !== 'RUNNING') {
        if (this.timer >= 0) {
          clearInterval(this.timer);
          this.timer = -1;
        }
        this.running = false;
        this.message = s;
      }
    }, 2000);
  }

  aboutToAppear(): void {
    // 拉起即自动跑一轮（`hdc shell "aa start …"` 后无需交互即可取证）
    this.startRun();
  }

  build() {
    Column({ space: 12 }) {
      Text('vscode-deviceid Node regression · 私有 HNP 执行器')
        .fontSize(20)
        .fontWeight(FontWeight.Bold)
      Scroll() {
        Text(this.message)
          .fontSize(13)
          .fontFamily('monospace')
          .textAlign(TextAlign.Start)
      }
      .layoutWeight(1)
      Button('重跑用例')
        .enabled(!this.running)
        .onClick(() => this.startRun())
    }
    .width('100%')
    .height('100%')
    .padding(16)
  }
}
