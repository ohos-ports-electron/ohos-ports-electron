'use strict';
// The only native target is the upstream Windows registry helper.
if (process.platform === 'win32') {
  const {spawnSync} = require('node:child_process');
  const gyp = process.env.npm_config_node_gyp;
  const result = spawnSync(gyp ? process.execPath : 'node-gyp', gyp ? [gyp, 'rebuild'] : ['rebuild'], {stdio:'inherit'});
  if (result.error) throw result.error;
  process.exit(result.status === null ? 1 : result.status);
}
