'use strict';
const {app, BrowserWindow, ipcMain} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app.commandLine.appendSwitch('js-flags', '--jitless');
let window;
let running = false;
let latest;
app.whenReady().then(() => {
  const root = app.getPath('userData');
  fs.mkdirSync(root, {recursive:true});
  const emit = (kind, value) => {
    const line = 'OHDEVICEID ' + JSON.stringify({kind, pid:process.pid, time:new Date().toISOString(), ...value});
    fs.appendFileSync(path.join(root, 'pilot-events.jsonl'), line + '\n');
    console.log(line);
  };
  emit('startup', {versions:process.versions,platform:process.platform,arch:process.arch,userData:root});
  window = new BrowserWindow({width:1100,height:820,title:'vscode-deviceid Electron-OH',
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false}});
  const checkSender = event => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame) {
      throw new Error('unexpected IPC sender');
    }
  };
  ipcMain.handle('pilot:run', async event => {
    checkSender(event);
    if (running) throw new Error('test run already active');
    running = true;
    const runId = Date.now() + '-' + process.pid;
    emit('renderer-ipc', {runId,contextIsolation:true,nodeIntegration:false});
    try {
      latest = await require('./suite.cjs')({userData:root,runId,emit});
      fs.writeFileSync(path.join(root,'pilot-result.json'),JSON.stringify(latest,null,2));
      emit('summary', latest);
      return latest;
    } catch (error) {
      emit('fatal', {runId,error:String(error.stack || error)});
      throw error;
    } finally { running = false; }
  });
  window.loadFile(path.join(__dirname,'index.html'));
});
app.on('window-all-closed', () => app.quit());
