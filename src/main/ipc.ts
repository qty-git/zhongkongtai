import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { processBatchWithoutAi } from './services/batchProcessor';
import type { ProcessBatchWithoutAiInput } from './services/batchProcessor';

function isProcessInput(value: unknown): value is ProcessBatchWithoutAiInput {
  if (!value || typeof value !== 'object') return false;

  const input = value as Partial<ProcessBatchWithoutAiInput>;
  return (
    typeof input.styleNumberText === 'string' &&
    Array.isArray(input.workbookPaths) &&
    input.workbookPaths.every((item) => typeof item === 'string') &&
    typeof input.outputDir === 'string'
  );
}

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:select-workbooks', async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: '选择商品资料 Excel',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
    };
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);

    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('dialog:select-output-dir', async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: '选择输出目录',
      properties: ['openDirectory', 'createDirectory', 'promptToCreate']
    };
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);

    return result.canceled ? '' : result.filePaths[0] || '';
  });

  ipcMain.handle('batch:process-without-ai', async (_event, input: unknown) => {
    if (!isProcessInput(input)) {
      throw new Error('批次处理参数不完整');
    }

    return processBatchWithoutAi(input);
  });

  ipcMain.handle('shell:show-item-in-folder', (_event, filePath: unknown) => {
    if (typeof filePath === 'string' && filePath) {
      shell.showItemInFolder(filePath);
    }
  });
}
