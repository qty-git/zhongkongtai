import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { testOpenRouterConnection } from './services/ai/openRouterClient';
import { processBatch, processBatchWithoutAi } from './services/batchProcessor';
import type { ProcessBatchInput, ProcessBatchWithoutAiInput } from './services/batchProcessor';
import type { AiBatchConfig } from './types';

function isProcessInput(value: unknown): value is ProcessBatchWithoutAiInput {
  if (!value || typeof value !== 'object') return false;

  const input = value as Partial<ProcessBatchWithoutAiInput>;
  return (
    typeof input.styleNumberText === 'string' &&
    Array.isArray(input.workbookPaths) &&
    input.workbookPaths.every((item) => typeof item === 'string') &&
    (input.workbookDirectory === undefined || typeof input.workbookDirectory === 'string') &&
    typeof input.outputDir === 'string'
  );
}

function isAiConfig(value: unknown): value is AiBatchConfig {
  if (!value || typeof value !== 'object') return false;

  const config = value as Partial<AiBatchConfig>;
  return (
    typeof config.enabled === 'boolean' &&
    typeof config.apiKey === 'string' &&
    typeof config.model === 'string'
  );
}

function isProcessBatchInput(value: unknown): value is ProcessBatchInput {
  if (!isProcessInput(value)) return false;

  const input = value as Partial<ProcessBatchInput>;
  return input.ai === undefined || isAiConfig(input.ai);
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

  ipcMain.handle('dialog:select-workbook-directory', async (event) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: '选择商品资料文件夹',
      properties: ['openDirectory']
    };
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);

    return result.canceled ? '' : result.filePaths[0] || '';
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

  ipcMain.handle('batch:process-without-ai', async (event, input: unknown) => {
    if (!isProcessInput(input)) {
      throw new Error('批次处理参数不完整');
    }

    return processBatchWithoutAi({
      styleNumberText: input.styleNumberText,
      workbookPaths: input.workbookPaths,
      workbookDirectory: input.workbookDirectory,
      outputDir: input.outputDir,
      onProgress: (progress) => event.sender.send('batch:progress', progress)
    });
  });

  ipcMain.handle('ai:test-connection', async (_event, input: unknown) => {
    if (!isAiConfig(input) || !input.apiKey.trim() || !input.model.trim()) {
      throw new Error('AI 配置不完整');
    }

    return testOpenRouterConnection({
      apiKey: input.apiKey,
      model: input.model
    });
  });

  ipcMain.handle('batch:process', async (event, input: unknown) => {
    if (!isProcessBatchInput(input)) {
      throw new Error('批次处理参数不完整');
    }

    if (input.ai?.enabled && (!input.ai.apiKey.trim() || !input.ai.model.trim())) {
      throw new Error('启用 AI 时必须填写 API Key 和模型 ID');
    }

    return processBatch({
      styleNumberText: input.styleNumberText,
      workbookPaths: input.workbookPaths,
      workbookDirectory: input.workbookDirectory,
      outputDir: input.outputDir,
      ai: input.ai,
      onProgress: (progress) => event.sender.send('batch:progress', progress)
    });
  });

  ipcMain.handle('shell:show-item-in-folder', (_event, filePath: unknown) => {
    if (typeof filePath === 'string' && filePath) {
      shell.showItemInFolder(filePath);
    }
  });
}
