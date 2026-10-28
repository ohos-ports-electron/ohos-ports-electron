'use strict';
const emit=(kind,value)=>console.log('OHORT '+JSON.stringify({kind,pid:process.pid,time:new Date().toISOString(),...value}));
const runId=Date.now()+'-'+process.pid;
emit('startup',{runId,versions:process.versions,platform:process.platform,arch:process.arch});
require('./suite.cjs')({emit,runId}).then(report=>{emit('summary',{...report,results:undefined});process.exitCode=report.fail?1:0;}).catch(e=>{emit('fatal',{runId,error:String(e.stack||e)});process.exitCode=1;});
