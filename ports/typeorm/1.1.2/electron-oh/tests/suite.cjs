'use strict';
/* Host-safe regression suite for @ohos-ports-electron/typeorm (CI compatibility job).
 * Runs on plain Node (Linux CI, engines-satisfying versions) against the installed
 * candidate tgz. Cases mirror the device roster's host-safe subset: package identity,
 * unchanged distributed JS entry hashes, runtime dependency closure, exported surface
 * contracts and DefaultNamingStrategy/DataSource construction behavior. No device or
 * OHOS-specific behavior is claimed. */
const native = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

const definitions = [
  ['package identity', async c => {
    const meta = JSON.parse(native.readFileSync(path.join(c.pkg, 'package.json'), 'utf8'));
    c.equal(meta.name, c.config.packageName);
    c.equal(meta.version, c.config.packageVersion);
  }],
  ['unchanged distributed JavaScript entries', async c => {
    const hashes = {};
    for (const [rel, expected] of Object.entries(c.config.libraryFiles)) {
      const actual = crypto.createHash('sha256').update(native.readFileSync(path.join(c.pkg, rel))).digest('hex');
      assert.strictEqual(actual, expected, rel);
      hashes[rel] = actual;
    }
    c.equal(Object.keys(hashes).length, Object.keys(c.config.libraryFiles).length);
  }],
  ['runtime dependency closure resolves the ten upstream dependencies', async c => {
    const deps = ['@sqltools/formatter', 'ansis', 'dayjs', 'debug', 'dedent', 'reflect-metadata', 'sql-highlight', 'tinyglobby', 'tslib', 'yargs'];
    for (const dep of deps) {
      c.equal(typeof require.resolve(dep), 'string');
    }
    c.equal(deps.length, 10);
  }],
  ['exported surface contracts', async c => {
    const typeorm = c.typeorm;
    for (const symbol of ['DataSource', 'DefaultNamingStrategy', 'QueryBuilder', 'SelectQueryBuilder', 'InsertQueryBuilder', 'UpdateQueryBuilder', 'DeleteQueryBuilder', 'Brackets', 'EntitySchema', 'EntityManager', 'Repository', 'TreeRepository', 'Index', 'Unique', 'Column', 'Entity', 'PrimaryColumn', 'ManyToOne', 'OneToMany', 'OneToOne', 'ManyToMany', 'AbstractLogger']) {
      c.equal(`${symbol}:${typeof typeorm[symbol]}`, `${symbol}:function`);
    }
  }],
  ['DefaultNamingStrategy behavior', async c => {
    const strategy = new c.typeorm.DefaultNamingStrategy();
    c.equal(strategy.tableName('UserProfile', undefined), 'user_profile');
    c.equal(strategy.tableName('UserProfile', 'custom_tbl'), 'custom_tbl');
    c.equal(strategy.columnName('firstName', undefined, []), 'firstName');
    c.equal(strategy.columnName('firstName', 'first_name', []), 'first_name');
  }],
  ['DataSource construction contract (or explicit driver-missing error)', async c => {
    let outcome;
    try {
      const ds = new c.typeorm.DataSource({ type: 'better-sqlite3', database: ':memory:', synchronize: false, entities: [] });
      outcome = ds.isInitialized === false ? 'constructed' : 'constructed-initialized';
    } catch (e) {
      const named = String(e && e.message || e).includes('better-sqlite3');
      outcome = named ? 'driver-error:named' : 'driver-error:other';
    }
    c.equal(outcome.startsWith('constructed') || outcome === 'driver-error:named', true);
  }],
  ['EntitySchema metadata construction', async c => {
    const schema = new c.typeorm.EntitySchema({ name: 'HostCheck', tableName: 'host_check', columns: { id: { type: Number, primary: true }, name: { type: String } } });
    c.equal(schema.options.tableName, 'host_check');
  }],
  ['CLI entrypoint subpath loads', async c => {
    const cli = path.join(c.pkg, 'cli.js');
    c.equal(native.existsSync(cli), true);
    const head = native.readFileSync(cli, 'utf8').slice(0, 64);
    c.equal(head.includes('require') || head.includes('#!/usr/bin/env node'), true);
  }],
];

async function run(config, resultsDir) {
  const results = [];
  let passed = 0;
  const pkg = path.dirname(require.resolve(config.packageName));
  const typeorm = require(config.packageName);
  const c = {
    config, pkg, typeorm,
    equal(actual, expected) {
      assert.strictEqual(actual, expected);
    },
  };
  for (const [name, fn] of definitions) {
    const started = Date.now();
    let status = 'passed', error = null;
    try { await fn(c); passed += 1; } catch (e) { status = 'failed'; error = String(e && e.message || e); }
    results.push({ name, status, expected: 'contract holds', actual: status === 'passed' ? 'contract holds' : error, durationMs: Date.now() - started });
    console.log(`[host-suite] ${status} ${name}${error ? ' :: ' + error : ''}`);
  }
  const report = {
    phase: 'candidate-host',
    targetId: config.targetId,
    packageName: config.packageName,
    packageVersion: config.packageVersion,
    packageSha256: config.packageSha256,
    total: results.length, pass: passed, fail: results.length - passed,
    status: passed === results.length ? 'passed' : 'failed',
    results,
  };
  native.mkdirSync(resultsDir, { recursive: true });
  native.writeFileSync(path.join(resultsDir, 'results.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

module.exports = { run };
