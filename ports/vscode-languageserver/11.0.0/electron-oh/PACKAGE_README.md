# @ohos-ports-electron/vscode-languageserver

HarmonyOS PC (OpenHarmony arm64) ready distribution of
[`vscode-languageserver`](https://www.npmjs.com/package/vscode-languageserver) `11.0.0`.

This package is a repack of the upstream `vscode-languageserver@11.0.0` npm tarball.
The JavaScript sources are byte-identical to upstream (`lib/common`, `lib/node`,
`lib/browser`); only the package name, version, repository metadata and this README
differ. No native modules and no source patches are involved.

## Install

```sh
npm install @ohos-ports-electron/vscode-languageserver
```

The runtime dependency `vscode-languageserver-protocol` (→ `vscode-jsonrpc`,
`vscode-languageserver-types`) is resolved from the public npm registry unchanged
and is pure JavaScript, so it works on OpenHarmony as-is.

## Usage

```js
const { createConnection, TextDocuments, ProposedFeatures, InitializeRequest,
        InitializeParams, TextDocumentSyncKind } = require('@ohos-ports-electron/vscode-languageserver/node');
// TextDocuments needs a document factory:
const { TextDocument } = require('vscode-languageserver-textdocument');

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize((params) => ({ capabilities: { textDocumentSync: TextDocumentSyncKind.Incremental } }));
documents.listen(connection);
connection.listen();
```

`vscode-languageserver-textdocument` is the standard document factory required by the
`TextDocuments` public contract; install it alongside this package (upstream declares it
as a dev dependency for the same reason).

## Compatibility

Verified on OpenHarmony-7.0.0.109 (aarch64) under the standalone DevNode-OH Node 24.13.0
runtime and Electron-OH 34.8.6 / 37.2.0 / 40.0.1. The package is plain CommonJS/ESM-safe
JavaScript; the only platform caveat is that the host app may run under `--jitless`
(W^X) — this library does not require JIT or WebAssembly.

Upstream project: <https://github.com/microsoft/vscode-languageserver-node>.
License: MIT (see `License.txt` and `thirdpartynotices.txt`).

Port maintained in the [ohos-ports-electron](https://github.com/ohos-ports-electron/ohos-ports-electron)
repository at `ports/vscode-languageserver/11.0.0`.
