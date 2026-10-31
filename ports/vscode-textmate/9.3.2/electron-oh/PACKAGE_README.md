# PACKAGE_README

`@ohos-ports-electron/vscode-textmate` 9.3.2-electron-oh.0 是鸿蒙 PC (OpenHarmony) 移植的
`vscode-textmate@9.3.2`：TextMate 语法高亮引擎（VS Code / Shiki 等的核心组件）。
纯 JS、零 npm 运行时依赖、MIT。

与上游 `vscode-textmate` **零功能差异**（零补丁）：公开 API 面（webpack bundle `release/main.js`
的 6 个顶层导出 + Registry/IGrammar 实例方法）、类型声明、许可证与 Node 行为完全一致，
仅 `package.json` 分发元数据改为本 scope（name/version/repository/description/bugs）。

## 安装

```sh
npm install @ohos-ports-electron/vscode-textmate
```

## 用法

本包与上游一样**不捆绑 oniguruma**：使用方须按公开契约注入 `IOnigLib`
（`new Registry({ onigLib, loadGrammar })`）。鸿蒙 PC 宿主可注入本地交叉编译的
oniguruma N-API addon（如 `oniglib`，oniguruma 6.9.8，node/electron 双 ABI），
桌面宿主可用 `vscode-oniguruma` WASM——两者满足同一 `IOnigLib` 契约。

```js
const { Registry, parseRawGrammar, INITIAL } = require('@ohos-ports-electron/vscode-textmate');
const onigLib = getOniguruma(); // 宿主注入（如 oniglib / vscode-oniguruma）
const registry = new Registry({ onigLib, loadGrammar: async (scope) => grammarFor(scope) });
const grammar = await registry.loadGrammar('source.js');
const r = grammar.tokenizeLine('const x = 1;', INITIAL);
// r.tokens: [{ startIndex, endIndex, scopes }]
const r2 = grammar.tokenizeLine2('const x = 1;', INITIAL); // Uint32Array 编码 token
```
