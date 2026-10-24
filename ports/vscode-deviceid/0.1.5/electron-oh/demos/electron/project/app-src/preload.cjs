'use strict';
const {contextBridge,ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('pilot', {run: () => ipcRenderer.invoke('pilot:run')});
