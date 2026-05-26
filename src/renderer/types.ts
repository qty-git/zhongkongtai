export interface BatchRowView {
  styleNumber: string;
  status: 'pending' | 'success' | 'warning' | 'error';
  reason: string;
}

export interface BatchResultView {
  rows: BatchRowView[];
  workbookPath: string;
  logPath: string;
  scannedWorkbookPaths: string[];
}

export interface BatchProgressView {
  stage: 'idle' | 'scan' | 'parse' | 'image' | 'size-chart' | 'export' | 'done' | 'error';
  message: string;
  current: number;
  total: number;
  styleNumber?: string;
}

declare global {
  interface Window {
    zhongkongtai: {
      selectWorkbooks: () => Promise<string[]>;
      selectWorkbookDirectory: () => Promise<string>;
      selectOutputDir: () => Promise<string>;
      processWithoutAi: (input: {
        styleNumberText: string;
        workbookPaths: string[];
        workbookDirectory?: string;
        outputDir: string;
      }) => Promise<BatchResultView>;
      onBatchProgress: (callback: (progress: BatchProgressView) => void) => () => void;
      showItemInFolder: (filePath: string) => Promise<void>;
    };
  }
}
