import { contextBridge, ipcRenderer } from 'electron';
import type { ProcessBatchWithoutAiInput, ProcessBatchWithoutAiResult } from './services/batchProcessor';

contextBridge.exposeInMainWorld('zhongkongtai', {
  selectWorkbooks: (): Promise<string[]> => ipcRenderer.invoke('dialog:select-workbooks'),
  selectOutputDir: (): Promise<string> => ipcRenderer.invoke('dialog:select-output-dir'),
  processWithoutAi: (input: ProcessBatchWithoutAiInput): Promise<ProcessBatchWithoutAiResult> =>
    ipcRenderer.invoke('batch:process-without-ai', input),
  showItemInFolder: (filePath: string): Promise<void> => ipcRenderer.invoke('shell:show-item-in-folder', filePath)
});
