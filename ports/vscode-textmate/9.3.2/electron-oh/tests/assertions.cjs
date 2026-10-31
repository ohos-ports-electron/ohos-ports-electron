'use strict';
// vscode-textmate 公开 API 共享断言（9 条；第一阶段设备验证与 CI 宿主回归共用）。
//
// 设计依据：npm 发布包 vscode-textmate@9.3.2 是 webpack bundle，仅公开 6 个导出
// （INITIAL, Registry, applyStateStackDiff, diffStateStacksRefEq, disposeOnigString,
// parseRawGrammar）。本地适配的 268 条内部模块名册依赖 out/src/* 与 test-cases/，
// 在 npm 发布布局中不存在，故按公开 API 面重建本 9 条名册：
//   - parseRawGrammar(content, filePath)
//   - Registry({onigLib, loadGrammar, getInjections}) -> loadGrammar / addGrammar /
//     loadGrammarWithConfiguration / setTheme / getColorMap / dispose
//   - IGrammar.tokenizeLine / tokenizeLine2
//   - INITIAL / applyStateStackDiff / diffStateStacksRefEq / disposeOnigString
//
// onigLib 注入（库公开契约 RegistryOptions.onigLib，库本身不捆绑 oniguruma）：
//   - 本文件（CI 宿主回归）：vscode-oniguruma WASM——上游自身测试使用的引擎绑定，
//     纯测试依赖，tests/dependencies.lock.json 锁定 1.7.0。
//   - 真机验证（第一阶段）：本地交叉编译 oniglib N-API addon（oniguruma 6.9.8，
//     node/electron 双 ABI，NAPI_VERSION=8），运行时宿主供给、非库补丁。
//   两种供给满足同一 IOnigLib 契约；真机证据见 release-evidence.json。
//
// 契约：module.exports = { '<caseId>': ({case, check}) => void }
const fs = require('fs');
const path = require('path');
const oniguruma = require('vscode-oniguruma');
const {
	Registry, parseRawGrammar, INITIAL,
	applyStateStackDiff, diffStateStacksRefEq, disposeOnigString,
} = require('@ohos-ports-electron/vscode-textmate');

// ---- onigLib 宿主供给（CI 宿主：vscode-oniguruma WASM）----
let _onigLibPromise = null;
function onigLib() {
	if (!_onigLibPromise) {
		_onigLibPromise = (async () => {
			const wasmPath = path.join(path.dirname(require.resolve('vscode-oniguruma')), 'onig.wasm');
			await oniguruma.loadWASM(fs.readFileSync(wasmPath));
			return {
				createOnigScanner: (patterns) => new oniguruma.OnigScanner(patterns),
				createOnigString: (s) => new oniguruma.OnigString(s),
			};
		})();
	}
	return _onigLibPromise;
}

// ---- 内嵌 fixture（JSON grammar + theme）----
// 上游 test-cases/themes 不在 npm 发布包；此处内嵌等价的精简 JSON grammar（source.json）
// 与 tmTheme，断言来自公开 API 的真实 tokenization 输出。
const JSON_GRAMMAR = {
	name: 'JSON',
	scopeName: 'source.json',
	fileTypes: ['json'],
	patterns: [
		{ include: '#value' },
		{ match: '/\\*.*\\*/', name: 'comment.block.json' },
		{ match: '//.*$', name: 'comment.line.json' },
	],
	repository: {
		value: { patterns: [{ include: '#string' }, { include: '#constant' }, { include: '#number' }, { include: '#object' }, { include: '#array' }] },
		string: { begin: '"', end: '"', name: 'string.json', patterns: [{ match: '\\\\.', name: 'constant.character.escape.json' }] },
		constant: { match: '\\b(?:true|false|null)\\b', name: 'constant.language.json' },
		number: { match: '-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b', name: 'constant.numeric.json' },
		object: { begin: '{', end: '}', name: 'meta.structure.dictionary.json', patterns: [{ include: '#key' }, { include: '#value' }] },
		key: { match: '"(?:[^"\\\\]|\\\\.)*"\\s*:', name: 'support.type.property-name.json' },
		array: { begin: '\\[', end: '\\]', name: 'meta.structure.array.json', patterns: [{ include: '#value' }] },
	},
};

const DARK_THEME = {
	settings: [
		{ settings: { foreground: '#111111', background: '#222222' } },
		{ scope: 'string', settings: { foreground: '#00FF00' } },
		{ scope: 'constant.numeric', settings: { foreground: '#0000FF' } },
	],
};

function makeRegistry() {
	return new Registry({
		onigLib: onigLib(),
		loadGrammar: (scopeName) => {
			if (scopeName === 'source.json') {
				return Promise.resolve(parseRawGrammar(JSON.stringify(JSON_GRAMMAR), 'source.json'));
			}
			return Promise.resolve(null);
		},
	});
}

function tokensToString(line, tokens) {
	return tokens.map((t) => line.substring(t.startIndex, t.endIndex) + '|' + t.scopes.join(' ')).join(',');
}

const _suite = {};

// ---- 公开 API 代表功能 ----

_suite['parseRawGrammar parses JSON grammar'] = async function (env) {
	const { check } = env;
	let cp = 0;
	const raw = parseRawGrammar(JSON.stringify(JSON_GRAMMAR), 'source.json');
	check(cp++, raw.scopeName === 'source.json', raw.scopeName, 'source.json');
	check(cp++, typeof raw.repository === 'object' && !!raw.repository.string, typeof raw.repository, 'object');
	check(cp++, Array.isArray(raw.patterns) && raw.patterns.length > 0, Array.isArray(raw.patterns), true);
};

_suite['parseRawGrammar rejects invalid content'] = async function (env) {
	const { check } = env;
	let cp = 0;
	let threw = false;
	try {
		parseRawGrammar('not-a-grammar{', 'bad.json');
	} catch (e) {
		threw = true;
	}
	check(cp++, threw === true, threw, true);
};

_suite['Registry loads grammar and tokenizeLine yields scopes'] = async function (env) {
	const { check } = env;
	let cp = 0;
	const registry = makeRegistry();
	try {
		const grammar = await registry.loadGrammar('source.json');
		check(cp++, !!grammar, !!grammar, true);
		const line = '{"name": "test", "flag": true, "n": 42}';
		const r = grammar.tokenizeLine(line, INITIAL);
		const str = tokensToString(line, r.tokens);
		check(cp++, str.indexOf('"name":|source.json') >= 0, str, 'contains property-name token');
		check(cp++, str.indexOf('"|source.json') >= 0 && str.indexOf('string.json') >= 0, str, 'contains string token');
		check(cp++, str.indexOf('true|source.json') >= 0 && str.indexOf('constant.language.json') >= 0, str, 'contains constant token');
		check(cp++, str.indexOf('42|source.json') >= 0 && str.indexOf('constant.numeric.json') >= 0, str, 'contains numeric token');
		check(cp++, str.indexOf('meta.structure.dictionary.json') >= 0, str, 'contains dictionary meta');
	} finally {
		registry.dispose();
	}
};

_suite['Registry.loadGrammar unknown scope rejects'] = async function (env) {
	const { check } = env;
	let cp = 0;
	const registry = makeRegistry();
	try {
		let threw = false;
		try {
			await registry.loadGrammar('source.unknown');
		} catch (e) {
			threw = true;
			check(cp++, String(e).indexOf('No grammar provided') >= 0, String(e), 'No grammar provided ...');
		}
		check(cp++, threw === true, threw, true);
	} finally {
		registry.dispose();
	}
};

_suite['tokenizeLine2 returns encoded tokens'] = async function (env) {
	const { check } = env;
	let cp = 0;
	const registry = makeRegistry();
	try {
		const grammar = await registry.loadGrammar('source.json');
		const r = grammar.tokenizeLine2('{"a": 1}', INITIAL);
		check(cp++, r.tokens instanceof Uint32Array, r.tokens && r.tokens.constructor.name, 'Uint32Array');
		check(cp++, r.tokens.length >= 2, r.tokens.length, '>=2');
		const languageId = (r.tokens[0] & 255) >>> 0;
		check(cp++, languageId === 0, languageId, 0);
	} finally {
		registry.dispose();
	}
};

_suite['cross-line state persists (state stack)'] = async function (env) {
	const { check } = env;
	let cp = 0;
	const registry = makeRegistry();
	try {
		const grammar = await registry.loadGrammar('source.json');
		// 多行字符串：第一行打开 string 状态，第二行仍应在 string 内直到闭合
		const line1 = '{ "a": "start';
		const r1 = grammar.tokenizeLine(line1, INITIAL);
		const line2 = 'still in string" }';
		const r2 = grammar.tokenizeLine(line2, r1.ruleStack);
		const first = r2.tokens[0];
		check(cp++, r1.ruleStack !== INITIAL, r1.ruleStack === INITIAL, false);
		check(cp++, r2.tokens.length > 0, r2.tokens.length, '>0');
		const hasString = r2.tokens.some((t) => t.scopes.indexOf('string.json') >= 0);
		check(cp++, hasString === true, hasString, true);
		// applyStateStackDiff 往返：diff + apply 应还原 ruleStack
		const diff = diffStateStacksRefEq(r1.ruleStack, r2.ruleStack);
		const restored = applyStateStackDiff(r1.ruleStack, diff);
		check(cp++, restored === r2.ruleStack, restored === r2.ruleStack, true);
	} finally {
		registry.dispose();
	}
};

_suite['setTheme and getColorMap'] = async function (env) {
	const { check } = env;
	let cp = 0;
	const registry = makeRegistry();
	try {
		registry.setTheme(DARK_THEME);
		const map = registry.getColorMap();
		check(cp++, Array.isArray(map) && map.length >= 3, Array.isArray(map) && map.length, '>=3');
		check(cp++, map.indexOf('#111111') >= 0, map.indexOf('#111111'), '>=0');
		check(cp++, map.indexOf('#00FF00') >= 0, map.indexOf('#00FF00'), '>=0');
	} finally {
		registry.dispose();
	}
};

_suite['addGrammar API'] = async function (env) {
	const { check } = env;
	let cp = 0;
	const registry = new Registry({
		onigLib: onigLib(),
		loadGrammar: () => Promise.resolve(null),
	});
	try {
		const grammar = await registry.addGrammar({
			scopeName: 'source.inline',
			repository: {},
			patterns: [{ match: '\\bbar\\b', name: 'keyword.bar' }],
		});
		const r = grammar.tokenizeLine('bar foo bar', INITIAL);
		const str = tokensToString('bar foo bar', r.tokens);
		check(cp++, str.indexOf('keyword.bar') >= 0, str, 'contains keyword.bar');
	} finally {
		registry.dispose();
	}
};

_suite['INITIAL constant and disposeOnigString'] = async function (env) {
	const { check } = env;
	let cp = 0;
	check(cp++, typeof INITIAL === 'object' && INITIAL !== null, typeof INITIAL, 'object');
	check(cp++, typeof disposeOnigString === 'function', typeof disposeOnigString, 'function');
};

module.exports = _suite;
