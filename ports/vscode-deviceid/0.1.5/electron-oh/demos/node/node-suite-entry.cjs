'use strict';
const path = require('node:path');
const emit = (kind,value)=>console.log('OHDEVICEID '+JSON.stringify({kind,pid:process.pid,...value}));
require('./suite.cjs')({userData:path.join(process.cwd(),'deviceid-regression'),runId:Date.now()+'-'+process.pid,emit})
  .then(report=>{emit('summary',report);if(report.fail)process.exitCode=1;})
  .catch(error=>{emit('fatal',{error:String(error.stack||error)});process.exitCode=1;});
