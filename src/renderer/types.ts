export interface BatchRowView {
  styleNumber: string;
  status: 'pending' | 'success' | 'warning' | 'error';
  reason: string;
}

export interface AiConfigView {
  enabled: boolean;
  apiKey: string;
  model: string;
}

export interface AiConnectionTestResultView {
  ok: boolean;
  modelExists: boolean;
  supportsVision: boolean;
  textGenerationOk: boolean;
  warning?: string;
  error?: string;
  errorType?:
    | 'api_key'
    | 'model_missing'
    | 'vision_unsupported'
    | 'quota'
    | 'rate_limit'
    | 'provider'
    | 'network'
    | 'unknown';
}

export interface BatchResultView {
  rows: BatchRowView[];
  workbookPath: string;
  logPath: string;
  scannedWorkbookPaths: string[];
}

export interface BatchProgressView {
  stage: 'idle' | 'scan' | 'parse' | 'image' | 'size-chart' | 'ai' | 'export' | 'done' | 'error';
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
      processBatch: (input: {
        styleNumberText: string;
        workbookPaths: string[];
        workbookDirectory?: string;
        outputDir: string;
        ai?: AiConfigView;
      }) => Promise<BatchResultView>;
      testAiConnection: (input: AiConfigView) => Promise<AiConnectionTestResultView>;
      onBatchProgress: (callback: (progress: BatchProgressView) => void) => () => void;
      showItemInFolder: (filePath: string) => Promise<void>;
    };
  }
}
