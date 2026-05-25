import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('zhongkongtai', {
  version: '0.1.0'
});
