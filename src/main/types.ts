export type RowStatus = 'pending' | 'success' | 'warning' | 'error';

export type AiRecognitionStatus = 'pending' | 'success' | 'skipped' | 'error';

export interface ProductAiResult {
  status: AiRecognitionStatus;
  productName: string;
  title: string;
  subtitle: string;
  attributes: Record<string, string>;
  error: string;
  model: string;
}

export interface AiBatchConfig {
  enabled: boolean;
  apiKey: string;
  model: string;
}

export interface ProductRecord {
  styleNumber: string;
  supplier: string;
  brand: string;
  systemCategory: string;
  colors: string[];
  originalName: string;
  taxPrice: number | null;
  companyPrice: number | null;
  finalStorePrice: number | null;
  fabricName: string;
  composition: string;
  sourceFile: string;
  sourceSheet: string;
  sourceRow: number;
  imagePath?: string;
  sizeChartImagePath?: string;
  aiResult?: ProductAiResult;
  skuItems: SkuItem[];
  sizeRows: SizeChartRow[];
  warnings: string[];
}

export interface SkuItem {
  styleNumber: string;
  color: string;
  size: string;
  merchantCode: string;
  finalStorePrice: number | null;
  suggestedWeight: string;
  note: string;
}

export interface SizeChartRow {
  styleNumber: string;
  size: string;
  bodyType: string;
  suggestedWeight: string;
  measurements: Record<string, string>;
}

export interface BatchRow {
  styleNumber: string;
  status: RowStatus;
  reason: string;
  product?: ProductRecord;
}

export interface BatchProgress {
  stage: 'idle' | 'scan' | 'parse' | 'image' | 'size-chart' | 'ai' | 'export' | 'done' | 'error';
  message: string;
  current: number;
  total: number;
  styleNumber?: string;
}

export interface BatchLogEntry {
  time: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  styleNumber?: string;
}
