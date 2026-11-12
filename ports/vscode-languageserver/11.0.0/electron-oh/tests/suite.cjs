'use strict';
// vscode-languageserver 公开 API 验证 suite（基线/候选共用）。
//
// 设计依据：npm 发布包 vscode-languageserver@11.0.0 是已编译 JS 分发（lib/common、lib/node、
// lib/browser），不含 monorepo 上游内部测试（那些依赖 source 树）。本 suite 只走公开 API：
//   - 服务端连接生命周期（createConnection 内存流 initialize/shutdown/request/notification）
//   - TextDocuments 文档同步（open/change/close 经真实连接通知）
//   - 协议类型（Position/Range/Location/LocationLink/Diagnostic/TextEdit/WorkspaceEdit/TextDocument）
//   - 枚举与错误码（DiagnosticSeverity/SymbolKind/CompletionItemKind/CodeActionKind/LSPErrorCodes）
//   - JSON-RPC 原语（Emitter/Event/Disposable/CancellationToken/ResponseError/LinkedMap）
//   - 传输工厂（createServerPipeTransport）与 SemanticTokensBuilder/Trace/URI guards
//
// 基线段用 require('vscode-languageserver')，候选段用 require('@ohos-ports-electron/vscode-languageserver')
// ——由装配脚本按阶段生成对应版本（build-demo 注入 LSP_LIB_IDENTITY）。
// 测试供给 vscode-languageserver-textdocument@1.0.16 为 TextDocuments 标准文档工厂
// （上游 TextDocuments 公开契约要求宿主提供该工厂，属测试供给、非库补丁、不入候选包）。
'use strict';

const LIB_IDENTITY = '@ohos-ports-electron/vscode-languageserver';
const api = require(LIB_IDENTITY);
const nodeEntry = require(LIB_IDENTITY + '/node');
const { TextDocument } = require('vscode-languageserver-textdocument');
const { Duplex } = require('node:stream');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { TextDocuments, createConnection, createServerPipeTransport } = nodeEntry;

class SelfStream extends Duplex {
	_write(c, e, cb) { this.emit('data', c); cb(); }
	_read() {}
}
function pair() { const up = new SelfStream(); const down = new SelfStream(); return { up, down }; }

const _suite = {};

// 断言辅助：每个 case 至少一次 check（防空断言）
function makeChecker(check) {
	let cp = 0;
	return function (actual, expected) {
		let ok;
		try { ok = require('node:util').isDeepStrictEqual(actual, expected); } catch (e) { ok = actual === expected; }
		check(cp++, ok, String(actual), String(expected));
	};
}

_suite['package identity and exports'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const entry = require.resolve(LIB_IDENTITY + '/node');
		const pkgDir = path.join(path.dirname(entry), '..', '..');
		const pj = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
		const expectedName = process.env.LSP_EXPECTED_NAME || LIB_IDENTITY;
		const expectedVersion = '11.0.0-electron-oh.0';
		c(pj.name, expectedName);
		c(pj.version, expectedVersion);
		c(typeof api.createConnection, 'function');
		c(typeof api.TextDocuments, 'function');
		c(typeof api.Position.create, 'function');
		c(typeof nodeEntry.createServerPipeTransport, 'function');
		c(typeof nodeEntry.createServerSocketTransport, 'function');
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['protocol message types carry method names'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		c(api.InitializeRequest.type.method, 'initialize');
		c(api.ShutdownRequest.type.method, 'shutdown');
		c(api.ExitNotification.type.method, 'exit');
		c(api.HoverRequest.type.method, 'textDocument/hover');
		const rt = new api.RegistrationType('workspace/didChangeWatchedFiles');
		c(rt.method, 'workspace/didChangeWatchedFiles');
		const pnt = new api.ProtocolNotificationType('textDocument/publishDiagnostics');
		c(pnt.method, 'textDocument/publishDiagnostics');
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['Position and Range create + guards'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const p = api.Position.create(1, 2);
		c(p.line, 1);
		c(p.character, 2);
		c(api.Position.is(p), true);
		const r = api.Range.create(0, 0, 1, 2);
		c(api.Range.is(r), true);
		c(api.Range.is({ start: { line: 0, character: 0 } }), false);
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['Location / LocationLink create + guards'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const range = api.Range.create(0, 0, 0, 1);
		const loc = api.Location.create('file:///a.ts', range);
		c(api.Location.is(loc), true);
		c(api.Location.is({ uri: 'file:///a.ts' }), false);
		const ll = api.LocationLink.create('file:///a.ts', range, range);
		c(api.LocationLink.is(ll), true);
		c(api.LocationLink.is({ targetUri: 'file:///a.ts' }), false);
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['Diagnostic and severity enums'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		c(api.DiagnosticSeverity.Error, 1);
		c(api.DiagnosticSeverity.Warning, 2);
		c(api.DiagnosticSeverity.Information, 3);
		c(api.DiagnosticSeverity.Hint, 4);
		const d = api.Diagnostic.create(api.Range.create(0, 0, 0, 1), 'msg', api.DiagnosticSeverity.Error);
		c(api.Diagnostic.is(d), true);
		c(d.severity, 1);
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['SymbolKind / CompletionItemKind / CodeActionKind enums'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		c(api.SymbolKind.Function, 12);
		c(api.CompletionItemKind.Method, 2);
		c(api.CodeActionKind.QuickFix, 'quickfix');
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['LSPErrorCodes and ErrorCodes'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		c(api.LSPErrorCodes.RequestFailed, -32803);
		c(api.LSPErrorCodes.ContentModified, -32801);
		c(api.ErrorCodes.ParseError, -32700);
		c(api.ErrorCodes.InvalidParams, -32602);
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['ResponseError carries code and message'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const e = new api.ResponseError(api.ErrorCodes.InvalidParams, 'bad params');
		c(e.code, -32602);
		c(e.message, 'bad params');
	} catch (e2) { c(false, e2.message, 'no-error'); }
};

_suite['Emitter/Event subscribe-fire-dispose'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const em = new api.Emitter();
		const fired = [];
		const d = em.event((v) => fired.push(v));
		em.fire(1); em.fire(2);
		c(fired.join(','), '1,2');
		d.dispose();
		em.fire(3);
		c(fired.join(','), '1,2');
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['Disposable.create'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		let disposed = false;
		const d = api.Disposable.create(() => { disposed = true; });
		d.dispose();
		c(disposed, true);
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['CancellationTokenSource and CancellationToken'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const src = new api.CancellationTokenSource();
		const tok = src.token;
		c(tok.isCancellationRequested, false);
		src.cancel();
		c(tok.isCancellationRequested, true);
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['LinkedMap put-get-has-delete'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const m = new api.LinkedMap();
		m.set('a', 1); m.set('b', 2);
		c(m.get('a'), 1);
		c(m.has('b'), true);
		c(m.size, 2);
		m.delete('a');
		c(m.has('a'), false);
		c(m.size, 1);
		c(m.get('b'), 2);
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['TextEdit and WorkspaceEdit'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const te = api.TextEdit.replace(api.Range.create(0, 0, 0, 5), 'new');
		c(api.TextEdit.is(te), true);
		const we = { changes: { 'file:///a.ts': [te] } };
		c(api.WorkspaceEdit.is(we), true);
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['TextDocument create + applyEdits'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const doc = api.TextDocument.create('file:///a.ts', 'typescript', 1, 'hello\nworld');
		c(doc.languageId, 'typescript');
		c(doc.version, 1);
		c(doc.uri, 'file:///a.ts');
		c(doc.getText(), 'hello\nworld');
		const edited = api.TextDocument.applyEdits(doc, [api.TextEdit.replace(api.Range.create(0, 0, 0, 5), 'hi')]);
		c(edited, 'hi\nworld');
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['createConnection in-memory RPC round trip'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const { up, down } = pair();
		const server = createConnection(up, down);
		const client = createConnection(down, up);
		let initialized = false;
		server.onInitialize(() => { initialized = true; return { capabilities: { hoverProvider: true } }; });
		server.onShutdown(() => {});
		server.listen(); client.listen();
		const res = await client.sendRequest(api.InitializeRequest.type, { processId: null, rootUri: null, capabilities: {} });
		c(res.capabilities.hoverProvider, true);
		c(initialized, true);
		await client.sendRequest(api.ShutdownRequest.type);
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['onRequest / sendRequest custom request'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const { up, down } = pair();
		const server = createConnection(up, down);
		const client = createConnection(down, up);
		const EchoReq = new api.ProtocolRequestType('test/echo');
		server.onRequest(EchoReq, (params) => ({ echo: params.value }));
		server.listen(); client.listen();
		const res = await client.sendRequest(EchoReq, { value: 'hello' });
		c(res.echo, 'hello');
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['notification round trip'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const { up, down } = pair();
		const server = createConnection(up, down);
		const client = createConnection(down, up);
		const seen = [];
		server.onNotification(api.PublishDiagnosticsNotification.type, (p) => seen.push(p));
		server.listen(); client.listen();
		client.sendNotification(api.PublishDiagnosticsNotification.type, { uri: 'file:///a.ts', diagnostics: [] });
		await new Promise((r) => setTimeout(r, 80));
		c(seen.length, 1);
		c(seen[0] && seen[0].uri, 'file:///a.ts');
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['TextDocuments open/change/close over real connection'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const { up, down } = pair();
		const server = createConnection(up, down);
		const client = createConnection(down, up);
		server.onInitialize(() => ({ capabilities: {} }));
		const docs = new TextDocuments(TextDocument);
		const opened = [];
		const changed = [];
		const closed = [];
		docs.onDidOpen((e) => opened.push(e.document.uri));
		docs.onDidChangeContent((e) => changed.push(e.document.getText()));
		docs.onDidClose((e) => closed.push(e.document.uri));
		docs.listen(server);
		server.listen(); client.listen();
		await client.sendRequest(api.InitializeRequest.type, { processId: null, rootUri: null, capabilities: {} });
		client.sendNotification(api.DidOpenTextDocumentNotification.type, { textDocument: { uri: 'file:///d.ts', languageId: 'typescript', version: 1, text: 'const x = 1' } });
		await new Promise((r) => setTimeout(r, 80));
		c(docs.get('file:///d.ts') !== undefined, true);
		c(docs.get('file:///d.ts').languageId, 'typescript');
		c(docs.get('file:///d.ts').getText(), 'const x = 1');
		c(opened.join(','), 'file:///d.ts');
		c(docs.keys().length, 1);
		client.sendNotification(api.DidChangeTextDocumentNotification.type, { textDocument: { uri: 'file:///d.ts', version: 2 }, contentChanges: [{ text: 'const y = 2' }] });
		await new Promise((r) => setTimeout(r, 80));
		c(docs.get('file:///d.ts').getText(), 'const y = 2');
		c(changed.length, 2);
		client.sendNotification(api.DidCloseTextDocumentNotification.type, { textDocument: { uri: 'file:///d.ts' } });
		await new Promise((r) => setTimeout(r, 80));
		c(docs.get('file:///d.ts'), undefined);
		c(closed.length, 1);
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['SemanticTokensBuilder emits token data'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const b = new api.SemanticTokensBuilder();
		b.push(0, 0, 5, api.SemanticTokenTypes.keyword, 0);
		const t = b.build();
		c(Array.isArray(t.data), true);
		c(t.data.length, 5);
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['URI.is guards'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		c(api.URI.is('file:///a.ts'), true);
		c(api.URI.is({}), false);
		c(api.DocumentUri.is('file:///a.ts'), true);
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['Trace and TraceValue constants'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		c(api.TraceValue.Off, 'off');
		c(api.TraceValue.Messages, 'messages');
		c(api.TraceValue.Verbose, 'verbose');
		c(typeof api.Trace.fromString, 'function');
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['ProposedFeatures bundle and feature combinators'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		c(typeof api.ProposedFeatures.all, 'object');
		c(typeof api.combineFeatures, 'function');
		c(typeof api.combineClientFeatures, 'function');
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['DocumentSymbol shape'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const range = api.Range.create(0, 0, 0, 1);
		const ds = api.DocumentSymbol.create('name', undefined, api.SymbolKind.Variable, range, range);
		c(api.DocumentSymbol.is(ds), true);
		c(ds.name, 'name');
		c(ds.kind, api.SymbolKind.Variable);
	} catch (e) { c(false, e.message, 'no-error'); }
};

_suite['pipe transport factory returns reader/writer'] = async function (env) {
	const c = makeChecker(env.check);
	try {
		const name = path.join(os.tmpdir(), 'lsp-' + process.pid + '-' + Date.now() + '.sock');
		const server = await createServerPipeTransport(name);
		c(Array.isArray(server), true);
		c(server.length, 2);
		// 清理探测 socket（不阻塞用例：失败仅记录）
	} catch (e) { c(false, e.message, 'no-error'); }
};

module.exports = _suite;
