export type RowStatus = 'pending' | 'success' | 'warning' | 'error';

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
