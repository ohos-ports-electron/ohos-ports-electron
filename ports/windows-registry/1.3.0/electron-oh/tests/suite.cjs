'use strict';
// @ohos-ports-electron/windows-registry 公开契约验证 suite（候选身份）。
const LIB_IDENTITY = '@ohos-ports-electron/windows-registry';
const reg = require(LIB_IDENTITY);

function throwsWithMessage(fn) {
  try {
    fn();
    return { thrown: false, message: '' };
  } catch (e) {
    return { thrown: true, message: String((e && e.message) || e) };
  }
}

const _suite = {};

_suite['Windows Registry Tests @GetStringRegKey Throws an error when not on Windows'] = async ({ check }) => {
  const hive = 'HKEY_LOCAL_MACHINE';
  const path = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion';
  const name = 'ProgramFilesPath';
  const r = throwsWithMessage(() => reg.GetStringRegKey(hive, path, name));
  check(0, r.thrown, r.thrown ? r.message : 'no-throw', 'throw');
  check(1, r.thrown && r.message.includes('only available on Windows'), r.message, 'GetStringRegKey is only available on Windows.');
};

_suite['Windows Registry Tests @GetDWORDRegKey Throws an error when not on Windows'] = async ({ check }) => {
  const hive = 'HKEY_LOCAL_MACHINE';
  const path = 'SOFTWARE\\Microsoft\\Windows\\CurrentVersion';
  const name = 'SomeValue';
  const r = throwsWithMessage(() => reg.GetDWORDRegKey(hive, path, name));
  check(0, r.thrown, r.thrown ? r.message : 'no-throw', 'throw');
  check(1, r.thrown && r.message.includes('only available on Windows'), r.message, 'GetDWORDRegKey is only available on Windows.');
};

_suite['export-surface-f-01-01'] = async ({ check }) => {
  check(1, typeof reg.GetStringRegKey === 'function', typeof reg.GetStringRegKey, 'function');
  check(2, typeof reg.GetDWORDRegKey === 'function', typeof reg.GetDWORDRegKey, 'function');
};

module.exports = _suite;
