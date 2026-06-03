import { contextBridge, ipcRenderer } from 'electron';
import type { AiConnectionTestResult } from './services/ai/openRouterClient';
import type {
  ProcessBatchInput,
  ProcessBatchResult,
  ProcessBatchWithoutAiInput,
  ProcessBatchWithoutAiResult
} from './services/batchProcessor';
import type { AiBatchConfig } from './types';
import type { BatchProgress } from './types';

contextBridge.exposeInMainWorld('zhongkongtai', {
  selectWorkbooks: (): Promise<string[]> => ipcRenderer.invoke('dialog:select-workbooks'),
  selectWorkbookDirectory: (): Promise<string> => ipcRenderer.invoke('dialog:select-workbook-directory'),
  selectOutputDir: (): Promise<string> => ipcRenderer.invoke('dialog:select-output-dir'),
  processWithoutAi: (input: ProcessBatchWithoutAiInput): Promise<ProcessBatchWithoutAiResult> =>
    ipcRenderer.invoke('batch:process-without-ai', input),
  processBatch: (input: ProcessBatchInput): Promise<ProcessBatchResult> =>
    ipcRenderer.invoke('batch:process', input),
  testAiConnection: (input: AiBatchConfig): Promise<AiConnectionTestResult> =>
    ipcRenderer.invoke('ai:test-connection', input),
  onBatchProgress: (callback: (progress: BatchProgress) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: BatchProgress) => callback(progress);
    ipcRenderer.on('batch:progress', listener);
    return () => ipcRenderer.removeListener('batch:progress', listener);
  },
  showItemInFolder: (filePath: string): Promise<void> => ipcRenderer.invoke('shell:show-item-in-folder', filePath)
});
