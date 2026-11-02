'use strict';
const fs=require('fs'),path=require('path');
module.exports=function createCases(RELEASE_DIR){
const {
  loadWASM,
  OnigString,
  OnigScanner,
  createOnigString,
  createOnigScanner,
  setDefaultDebugCall,
} = require(path.join(RELEASE_DIR, 'main.js'));

// FindOption / Syntax 是 const enum，在 UMD 打包后内联为数字字面量、不作为运行时对象导出。
const FindOption = {
  Default: 0, None: 1, Ignorecase: 2, Extend: 3, Multiline: 4, Singleline: 5,
  FindLongest: 6, FindNotEmpty: 7, NegateSingleline: 8, DontCaptureGroup: 9,
  CaptureGroup: 10, Notbol: 11, Noteol: 12, CheckValidityOfString: 13,
  IgnorecaseIsAscii: 14, WordIsAscii: 15, DigitIsAscii: 16, SpaceIsAscii: 17,
  PosixIsAscii: 18, TextSegmentExtendedGraphemeCluster: 19, TextSegmentWord: 20,
  NotBeginString: 21, NotEndString: 22, NotBeginPosition: 23,
  CallbackEachMatch: 24, DebugCall: 25,
};
const Syntax = {
  Default: 0, Asis: 1, PosixBasic: 2, PosixExtended: 3, Emacs: 4,
  Grep: 5, GnuRegex: 6, Java: 7, Perl: 8, PerlNg: 9,
  Ruby: 10, Python: 11, Oniguruma: 12,
};

// 使用 ArrayBuffer 数据路径初始化 WASM 引擎（覆盖 F-01-01 data 路径）
const wasmBuffer = fs.readFileSync(path.join(RELEASE_DIR, 'onig.wasm'));
const wasmArrayBuffer = wasmBuffer.buffer.slice(
  wasmBuffer.byteOffset,
  wasmBuffer.byteOffset + wasmBuffer.byteLength
);
let loadPromise = null;
let wasmError = null;
function initWasm() {
  if (loadPromise) return loadPromise;
  try {
    loadPromise = loadWASM(wasmArrayBuffer);
  } catch (e) {
    wasmError = e;
    loadPromise = Promise.reject(e);
  }
  return loadPromise;
}

const suite = {};

// 1. simple1 -> F-02-01, F-01-02
suite['simple1'] = async (ctx) => {
  await initWasm();
  const scanner = new OnigScanner(['ell', 'wo']);
  const s = new OnigString('Hello world!');
  const r1 = scanner.findNextMatchSync(s, 0);
  ctx.check(0, JSON.stringify(r1) === JSON.stringify({ index: 0, captureIndices: [{ start: 1, end: 4, length: 3 }] }), JSON.stringify(r1), JSON.stringify({ index: 0, captureIndices: [{ start: 1, end: 4, length: 3 }] }));
  const r2 = scanner.findNextMatchSync(s, 2);
  ctx.check(1, JSON.stringify(r2) === JSON.stringify({ index: 1, captureIndices: [{ start: 6, end: 8, length: 2 }] }), JSON.stringify(r2), JSON.stringify({ index: 1, captureIndices: [{ start: 6, end: 8, length: 2 }] }));
  s.dispose();
  scanner.dispose();
};

// 2. simple2 -> F-02-02, F-02-03
suite['simple2'] = async (ctx) => {
  const scanner = new OnigScanner(['a', 'b', 'c']);
  const r1 = scanner.findNextMatchSync('x', 0);
  ctx.check(0, r1 === null, JSON.stringify(r1), 'null');
  const r2 = scanner.findNextMatchSync('xxaxxbxxc', 0);
  ctx.check(1, JSON.stringify(r2) === JSON.stringify({ index: 0, captureIndices: [{ start: 2, end: 3, length: 1 }] }), JSON.stringify(r2), JSON.stringify({ index: 0, captureIndices: [{ start: 2, end: 3, length: 1 }] }));
  const r3 = scanner.findNextMatchSync('xxaxxbxxc', 4);
  ctx.check(2, JSON.stringify(r3) === JSON.stringify({ index: 1, captureIndices: [{ start: 5, end: 6, length: 1 }] }), JSON.stringify(r3), JSON.stringify({ index: 1, captureIndices: [{ start: 5, end: 6, length: 1 }] }));
  const r4 = scanner.findNextMatchSync('xxaxxbxxc', 7);
  ctx.check(3, JSON.stringify(r4) === JSON.stringify({ index: 2, captureIndices: [{ start: 8, end: 9, length: 1 }] }), JSON.stringify(r4), JSON.stringify({ index: 2, captureIndices: [{ start: 8, end: 9, length: 1 }] }));
  const r5 = scanner.findNextMatchSync('xxaxxbxxc', 9);
  ctx.check(4, r5 === null, JSON.stringify(r5), 'null');
  scanner.dispose();
};

// 3. unicode1 -> F-03-01
suite['unicode1'] = async (ctx) => {
  const scanner1 = new OnigScanner(['1', '2']);
  const r1 = scanner1.findNextMatchSync('ab\u2026cde21', 5);
  ctx.check(0, JSON.stringify(r1) === JSON.stringify({ index: 1, captureIndices: [{ start: 6, end: 7, length: 1 }] }), JSON.stringify(r1), JSON.stringify({ index: 1, captureIndices: [{ start: 6, end: 7, length: 1 }] }));
  scanner1.dispose();

  const scanner2 = new OnigScanner(['"']);
  const r2 = scanner2.findNextMatchSync('{"\u2026": 1}', 1);
  ctx.check(1, JSON.stringify(r2) === JSON.stringify({ index: 0, captureIndices: [{ start: 1, end: 2, length: 1 }] }), JSON.stringify(r2), JSON.stringify({ index: 0, captureIndices: [{ start: 1, end: 2, length: 1 }] }));
  scanner2.dispose();
};

// 4. unicode2 -> F-03-02
suite['unicode2'] = async (ctx) => {
  const scanner = new OnigScanner(['Y', 'X']);
  const r1 = scanner.findNextMatchSync('a\ud83d\ude0bbYX', 0);
  ctx.check(0, JSON.stringify(r1) === JSON.stringify({ index: 0, captureIndices: [{ start: 4, end: 5, length: 1 }] }), JSON.stringify(r1), JSON.stringify({ index: 0, captureIndices: [{ start: 4, end: 5, length: 1 }] }));
  const r2 = scanner.findNextMatchSync('a\ud83d\ude0bbYX', 5);
  ctx.check(1, JSON.stringify(r2) === JSON.stringify({ index: 1, captureIndices: [{ start: 5, end: 6, length: 1 }] }), JSON.stringify(r2), JSON.stringify({ index: 1, captureIndices: [{ start: 5, end: 6, length: 1 }] }));
  scanner.dispose();
};

// 5. unicode3 (Russian text)
suite['unicode3'] = async (ctx) => {
  const scanner = new OnigScanner(['\u0412\u043e\u0437\u0432\u0440\u0430\u0442']);
  const r = scanner.findNextMatchSync('\u0412\u043e\u0437\u0432\u0440\u0430\u0442 long_var_name;', 0);
  ctx.check(0, JSON.stringify(r) === JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 7, length: 7 }] }), JSON.stringify(r), JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 7, length: 7 }] }));
  scanner.dispose();
};

// 6. unicode4 -> F-03-03
suite['unicode4'] = async (ctx) => {
  const scanner = new OnigScanner(['X']);
  const r1 = scanner.findNextMatchSync(`X${String.fromCharCode(0xd83c)}X`, 0);
  ctx.check(0, JSON.stringify(r1) === JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 1, length: 1 }] }), JSON.stringify(r1), JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 1, length: 1 }] }));
  const r2 = scanner.findNextMatchSync(`X${String.fromCharCode(0xd83c)}X`, 1);
  ctx.check(1, JSON.stringify(r2) === JSON.stringify({ index: 0, captureIndices: [{ start: 2, end: 3, length: 1 }] }), JSON.stringify(r2), JSON.stringify({ index: 0, captureIndices: [{ start: 2, end: 3, length: 1 }] }));
  const r3 = scanner.findNextMatchSync(`X${String.fromCharCode(0xdfff)}X`, 0);
  ctx.check(2, JSON.stringify(r3) === JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 1, length: 1 }] }), JSON.stringify(r3), JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 1, length: 1 }] }));
  const r4 = scanner.findNextMatchSync(`X${String.fromCharCode(0xd800)}${String.fromCharCode(0xdc00)}X`, 2);
  ctx.check(3, JSON.stringify(r4) === JSON.stringify({ index: 0, captureIndices: [{ start: 3, end: 4, length: 1 }] }), JSON.stringify(r4), JSON.stringify({ index: 0, captureIndices: [{ start: 3, end: 4, length: 1 }] }));
  scanner.dispose();
};

// 7. out of bounds -> F-02-04, F-02-05
suite['out of bounds'] = async (ctx) => {
  const scanner = new OnigScanner(['X']);
  const r1 = scanner.findNextMatchSync(`X\ud83d\ude0bX`, -1000);
  ctx.check(0, JSON.stringify(r1) === JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 1, length: 1 }] }), JSON.stringify(r1), JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 1, length: 1 }] }));
  const r2 = scanner.findNextMatchSync(`X\ud83d\ude0bX`, 1000);
  ctx.check(1, r2 === null, JSON.stringify(r2), 'null');
  scanner.dispose();
};

// 8. regex with \G
suite['regex with \\G'] = async (ctx) => {
  const str = new OnigString('first-and-second');
  const scanner = new OnigScanner(['\\G-and']);
  const r1 = scanner.findNextMatchSync(str, 0);
  ctx.check(0, r1 === null, JSON.stringify(r1), 'null');
  const r2 = scanner.findNextMatchSync(str, 5);
  ctx.check(1, JSON.stringify(r2) === JSON.stringify({ index: 0, captureIndices: [{ start: 5, end: 9, length: 4 }] }), JSON.stringify(r2), JSON.stringify({ index: 0, captureIndices: [{ start: 5, end: 9, length: 4 }] }));
  scanner.dispose();
  str.dispose();
};

// 9. kkos/oniguruma#192
suite['kkos/oniguruma#192'] = async (ctx) => {
  const str = new OnigString('    while (i < len && f(array[i]))');
  const scanner = new OnigScanner(["(?x)\n  (?<!\\+\\+|--)(?<=[({\\[,?=>:*]|&&|\\|\\||\\?|\\*\\/|^await|[^\\._$[:alnum:]]await|^return|[^\\._$[:alnum:]]return|^default|[^\\._$[:alnum:]]default|^yield|[^\\._$[:alnum:]]yield|^)\\s*\n  (?!<\\s*[_$[:alpha:]][_$[:alnum:]]*((\\s+extends\\s+[^=>])|,)) # look ahead is not type parameter of arrow\n  (?=(<)\\s*(?:([_$[:alpha:]][-_$[:alnum:].]*)(?<!\\.|-)(:))?((?:[a-z][a-z0-9]*|([_$[:alpha:]][-_$[:alnum:].]*))(?<!\\.|-))(?=((<\\s*)|(\\s+))(?!\\?)|\\/?>))"]);
  const r = scanner.findNextMatchSync(str, 0);
  ctx.check(0, r === null, JSON.stringify(r), 'null');
  scanner.dispose();
  str.dispose();
};

// 10. FindOption.NotBeginPosition -> F-04-02
suite['FindOption.NotBeginPosition'] = async (ctx) => {
  const str = new OnigString('first-and-second');
  const scanner = new OnigScanner(['\\G-and']);
  const r1 = scanner.findNextMatchSync(str, 5);
  ctx.check(0, JSON.stringify(r1) === JSON.stringify({ index: 0, captureIndices: [{ start: 5, end: 9, length: 4 }] }), JSON.stringify(r1), JSON.stringify({ index: 0, captureIndices: [{ start: 5, end: 9, length: 4 }] }));
  const r2 = scanner.findNextMatchSync(str, 5, [FindOption.NotBeginPosition]);
  ctx.check(1, r2 === null, JSON.stringify(r2), 'null');
  scanner.dispose();
  str.dispose();
};

// 11. FindOption.NotBeginString -> F-04-03
suite['FindOption.NotBeginString'] = async (ctx) => {
  const str = new OnigString('first-and-first');
  const scanner = new OnigScanner(['\\Afirst']);
  const r1 = scanner.findNextMatchSync(str, 10);
  ctx.check(0, r1 === null, JSON.stringify(r1), 'null');
  const r2 = scanner.findNextMatchSync(str, 0);
  ctx.check(1, JSON.stringify(r2) === JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 5, length: 5 }] }), JSON.stringify(r2), JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 5, length: 5 }] }));
  const r3 = scanner.findNextMatchSync(str, 0, [FindOption.NotBeginString]);
  ctx.check(2, r3 === null, JSON.stringify(r3), 'null');
  scanner.dispose();
  str.dispose();
};

// 12. FindOption.NotEndString -> F-04-04
suite['FindOption.NotEndString'] = async (ctx) => {
  const str = new OnigString('first-and-first');
  const scanner = new OnigScanner(['first\\z']);
  const r1 = scanner.findNextMatchSync(str, 10);
  ctx.check(0, JSON.stringify(r1) === JSON.stringify({ index: 0, captureIndices: [{ start: 10, end: 15, length: 5 }] }), JSON.stringify(r1), JSON.stringify({ index: 0, captureIndices: [{ start: 10, end: 15, length: 5 }] }));
  const r2 = scanner.findNextMatchSync(str, 10, [FindOption.NotEndString]);
  ctx.check(1, r2 === null, JSON.stringify(r2), 'null');
  scanner.dispose();
  str.dispose();
};

// 13. Configure scanner -> F-04-01
suite['Configure scanner'] = async (ctx) => {
  const str = new OnigString('ABCD');
  const scanner = new OnigScanner(['^[a-z]*$'], { options: [FindOption.Ignorecase] });
  const r = scanner.findNextMatchSync(str, 0);
  ctx.check(0, JSON.stringify(r) === JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 4, length: 4 }] }), JSON.stringify(r), JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 4, length: 4 }] }));
  scanner.dispose();
  str.dispose();
};

// 14. Configure syntax -> F-04-05
suite['Configure syntax'] = async (ctx) => {
  const str = new OnigString('first-and-first');
  const scanner = new OnigScanner(['^(?P<name>.*)$'], { syntax: Syntax.Python });
  const r = scanner.findNextMatchSync(str, 0);
  ctx.check(0, JSON.stringify(r) === JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 15, length: 15 }, { start: 0, end: 15, length: 15 }] }), JSON.stringify(r), JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 15, length: 15 }, { start: 0, end: 15, length: 15 }] }));
  scanner.dispose();
  str.dispose();
};

// 15. Throw error -> F-04-06
suite['Throw error'] = async (ctx) => {
  let threw = false;
  let errMsg = '';
  try {
    new OnigScanner(['(?P<name>a*)']);
  } catch (e) {
    threw = true;
    errMsg = e.message;
  }
  ctx.check(0, threw && /undefined group option/.test(errMsg), 'threw=' + threw + ' msg=' + errMsg, 'throws with undefined group option');
};

// 16. gen-loadWASM-data -> F-01-01 (ArrayBuffer data path)
suite['gen-loadWASM-data'] = async (ctx) => {
  const promise = initWasm();
  ctx.check(0, promise instanceof Promise, typeof promise, 'Promise');
  await promise;
  const scanner = new OnigScanner(['test']);
  const s = new OnigString('this is a test');
  const r = scanner.findNextMatchSync(s, 0);
  ctx.check(1, JSON.stringify(r) === JSON.stringify({ index: 0, captureIndices: [{ start: 10, end: 14, length: 4 }] }), JSON.stringify(r), JSON.stringify({ index: 0, captureIndices: [{ start: 10, end: 14, length: 4 }] }));
  s.dispose();
  scanner.dispose();
};

// 17. gen-loadWASM-repeat -> F-01-03 (singleton guard)
suite['gen-loadWASM-repeat'] = async (ctx) => {
  const secondPromise = initWasm();
  ctx.check(0, secondPromise instanceof Promise, typeof secondPromise, 'Promise');
  await secondPromise;
  const scanner = new OnigScanner(['abc']);
  const r = scanner.findNextMatchSync('xyzabc', 0);
  ctx.check(1, JSON.stringify(r) === JSON.stringify({ index: 0, captureIndices: [{ start: 3, end: 6, length: 3 }] }), JSON.stringify(r), JSON.stringify({ index: 0, captureIndices: [{ start: 3, end: 6, length: 3 }] }));
  scanner.dispose();
};

// 18. gen-OnigString-dispose -> F-05-01
suite['gen-OnigString-dispose'] = async (ctx) => {
  const shortStr = new OnigString('hello');
  ctx.check(0, shortStr.content === 'hello', shortStr.content, 'hello');
  ctx.check(1, shortStr.ptr > 0, String(shortStr.ptr), '> 0');
  shortStr.dispose();
  const shortStr2 = new OnigString('world');
  ctx.check(2, shortStr2.content === 'world', shortStr2.content, 'world');
  ctx.check(3, shortStr2.ptr > 0, String(shortStr2.ptr), '> 0');
  shortStr2.dispose();
  const longContent = 'x'.repeat(10001);
  const longStr = new OnigString(longContent);
  ctx.check(4, longStr.utf8Length === 10001, String(longStr.utf8Length), '10001');
  ctx.check(5, longStr.ptr > 0, String(longStr.ptr), '> 0');
  longStr.dispose();
};

// 19. gen-OnigScanner-dispose -> F-05-02
suite['gen-OnigScanner-dispose'] = async (ctx) => {
  const scanner = new OnigScanner(['a', 'b', 'c']);
  ctx.check(0, scanner !== null && scanner !== undefined, String(scanner), 'non-null scanner');
  const r = scanner.findNextMatchSync('abc', 0);
  ctx.check(1, JSON.stringify(r) === JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 1, length: 1 }] }), JSON.stringify(r), JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 1, length: 1 }] }));
  scanner.dispose();
  const scanner2 = new OnigScanner(['x']);
  const r2 = scanner2.findNextMatchSync('xyz', 0);
  ctx.check(2, JSON.stringify(r2) === JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 1, length: 1 }] }), JSON.stringify(r2), JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 1, length: 1 }] }));
  scanner2.dispose();
};

// 20. gen-setDefaultDebugCall -> F-06-01
suite['gen-setDefaultDebugCall'] = async (ctx) => {
  setDefaultDebugCall(true);
  const scanner = new OnigScanner(['hello']);
  const r1 = scanner.findNextMatchSync('hello world', 0);
  ctx.check(0, JSON.stringify(r1) === JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 5, length: 5 }] }), JSON.stringify(r1), JSON.stringify({ index: 0, captureIndices: [{ start: 0, end: 5, length: 5 }] }));
  scanner.dispose();
  setDefaultDebugCall(false);
  const scanner2 = new OnigScanner(['world']);
  const r2 = scanner2.findNextMatchSync('hello world', 0);
  ctx.check(1, JSON.stringify(r2) === JSON.stringify({ index: 0, captureIndices: [{ start: 6, end: 11, length: 5 }] }), JSON.stringify(r2), JSON.stringify({ index: 0, captureIndices: [{ start: 6, end: 11, length: 5 }] }));
  scanner2.dispose();
};

return suite;
};
