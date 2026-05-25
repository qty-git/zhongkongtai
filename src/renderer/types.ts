export interface BatchRowView {
  styleNumber: string;
  status: 'pending' | 'success' | 'warning' | 'error';
  reason: string;
}

export interface BatchResultView {
  rows: BatchRowView[];
  workbookPath: string;
}

declare global {
  interface Window {
    zhongkongtai: {
      selectWorkbooks: () => Promise<string[]>;
      selectOutputDir: () => Promise<string>;
      processWithoutAi: (input: {
        styleNumberText: string;
        workbookPaths: string[];
        outputDir: string;
      }) => Promise<BatchResultView>;
      showItemInFolder: (filePath: string) => Promise<void>;
    };
  }
}
