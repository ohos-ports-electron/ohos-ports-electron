'use strict';
// Host-side contract: install the frozen candidate tgz and exercise core SQLite
// + encryption paths without a device. Runs on any supported Node (>=22 / N-API 10).
const Database = require('@ohos-ports-electron/better-sqlite3-multiple-ciphers');
const assert = require('node:assert');

const db = new Database(':memory:');
db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
db.prepare('INSERT INTO t (name) VALUES (?)').run('hello');
assert.deepStrictEqual(db.prepare('SELECT * FROM t').get(), { id: 1, name: 'hello' });
db.close();

// encryption: sqleet default cipher round-trip on a temporary file
const os = require('node:os');
const path = require('node:path');
const f = path.join(os.tmpdir(), 'bs3mc-host-' + process.pid + '.db');
const enc = new Database(f);
enc.pragma("key='secret'");
enc.exec('CREATE TABLE s (v TEXT)');
enc.prepare('INSERT INTO s (v) VALUES (?)').run('x');
enc.close();
const dec = new Database(f);
dec.pragma("key='secret'");
assert.strictEqual(dec.prepare('SELECT v FROM s').get().v, 'x');
dec.close();
require('node:fs').rmSync(f, { force: true });
console.log('bs3mc host contract passed');
