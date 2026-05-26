import path from 'node:path';
import ExcelJS from 'exceljs';
import type { ProductRecord, SizeChartRow, SkuItem } from '../types';

export interface HandcardParseResult {
  products: ProductRecord[];
  duplicateStyleNumbers: string[];
}

const SHEET_NAME = '手卡资料';
const SIZE_PATTERN = /(10XL|9XL|8XL|7XL|6XL|5XL|4XL|3XL|2XL|XL|L|M|S|均码)$/;
const SIZE_TEXT_PATTERN = /^(10XL|9XL|8XL|7XL|6XL|5XL|4XL|3XL|2XL|XL|L|M|S|均码)$/;

function valueText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('').trim();
    }

    if ('result' in value) {
      return valueText(value.result as ExcelJS.CellValue);
    }

    if ('text' in value) {
      return String(value.text ?? '').trim();
    }
  }

  return '';
}

function cellText(row: ExcelJS.Row, column: number): string {
  return valueText(row.getCell(column).value);
}

function toNumber(value: string): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitColors(value: string): string[] {
  return value
    .split(/[\/、,，\s]+/g)
    .map((color) => color.trim())
    .filter(Boolean);
}

function splitSpec(spec: string): { color: string; size: string } {
  const match = spec.match(SIZE_PATTERN);
  if (!match || match.index == null) return { color: spec, size: '' };
  return { color: spec.slice(0, match.index).trim(), size: match[1] };
}

function rowIncludes(row: ExcelJS.Row, text: string, maxColumn: number): boolean {
  for (let col = 1; col <= maxColumn; col += 1) {
    if (cellText(row, col) === text) return true;
  }

  return false;
}

function findSkuHeaderRow(sheet: ExcelJS.Worksheet, startRow: number, nextStartRow: number): number | null {
  const endRow = Math.min(nextStartRow, startRow + 22);

  for (let rowNumber = startRow; rowNumber < endRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    if (rowIncludes(row, '颜色规格', 18) && rowIncludes(row, '商家编码', 18)) {
      return rowNumber;
    }
  }

  return null;
}

function parseSkuItems(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  nextStartRow: number,
  styleNumber: string,
  finalStorePrice: number | null
): SkuItem[] {
  const headerRowNumber = findSkuHeaderRow(sheet, startRow, nextStartRow);
  if (!headerRowNumber) return [];

  const headerRow = sheet.getRow(headerRowNumber);
  const columnPairs: Array<{ specCol: number; codeCol: number }> = [];

  for (let col = 1; col <= 18; col += 1) {
    if (cellText(headerRow, col) === '颜色规格' && cellText(headerRow, col + 1) === '商家编码') {
      columnPairs.push({ specCol: col, codeCol: col + 1 });
      col += 1;
    }
  }

  const items: SkuItem[] = [];
  const endRow = Math.min(nextStartRow, headerRowNumber + 14);

  for (let rowNumber = headerRowNumber + 1; rowNumber < endRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);

    for (const pair of columnPairs) {
      const spec = cellText(row, pair.specCol);
      const merchantCode = cellText(row, pair.codeCol);
      if (!spec || !merchantCode) continue;

      const { color, size } = splitSpec(spec);
      items.push({
        styleNumber,
        color,
        size,
        merchantCode,
        finalStorePrice,
        suggestedWeight: '',
        note: ''
      });
    }
  }

  return items;
}

function findMeasurementLabel(row: ExcelJS.Row, firstSizeColumn: number, styleNumber: string): string {
  for (let col = 21; col < firstSizeColumn; col += 1) {
    const label = cellText(row, col);
    if (!label) continue;
    if (label === styleNumber || label.includes('度量方式') || label === '误差') continue;
    return label;
  }

  return '';
}

function parseSizeRows(sheet: ExcelJS.Worksheet, startRow: number, nextStartRow: number, styleNumber: string): SizeChartRow[] {
  const headerRow = sheet.getRow(startRow);
  const bodyTypeRow = sheet.getRow(startRow + 1);
  const sizeColumns: Array<{ size: string; col: number; bodyType: string }> = [];

  for (let col = 20; col <= Math.min(sheet.columnCount, 40); col += 1) {
    const size = cellText(headerRow, col);
    if (SIZE_TEXT_PATTERN.test(size)) {
      sizeColumns.push({ size, col, bodyType: cellText(bodyTypeRow, col) });
    }
  }

  if (sizeColumns.length === 0) return [];

  const rowsBySize = new Map<string, SizeChartRow>();
  for (const item of sizeColumns) {
    rowsBySize.set(item.size, {
      styleNumber,
      size: item.size,
      bodyType: item.bodyType,
      suggestedWeight: '',
      measurements: {}
    });
  }

  const firstSizeColumn = sizeColumns[0].col;
  const endRow = Math.min(nextStartRow, startRow + 18);

  for (let rowNumber = startRow + 2; rowNumber < endRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const label = findMeasurementLabel(row, firstSizeColumn, styleNumber);
    if (!label) continue;

    for (const item of sizeColumns) {
      const value = cellText(row, item.col);
      if (!value) continue;

      const target = rowsBySize.get(item.size);
      if (!target) continue;

      if (label === '建议体重') {
        target.suggestedWeight = value;
      } else {
        target.measurements[label] = value;
      }
    }
  }

  return Array.from(rowsBySize.values()).filter(
    (row) => Boolean(row.suggestedWeight) || Object.keys(row.measurements).length > 0
  );
}

function applySuggestedWeights(skuItems: SkuItem[], sizeRows: SizeChartRow[]): void {
  const suggestedWeightBySize = new Map(sizeRows.map((row) => [row.size, row.suggestedWeight]));

  for (const sku of skuItems) {
    sku.suggestedWeight = suggestedWeightBySize.get(sku.size) || '';
    sku.note = sku.suggestedWeight ? `建议体重${sku.suggestedWeight}斤` : '';
  }
}

function filterSkuItemsBySizeRows(skuItems: SkuItem[], sizeRows: SizeChartRow[]): SkuItem[] {
  if (sizeRows.length === 0) return skuItems;

  const validSizes = new Set(sizeRows.map((row) => row.size));
  return skuItems.filter((sku) => !sku.size || validSizes.has(sku.size));
}

function parseComposition(sheet: ExcelJS.Worksheet, startRow: number): string {
  const parts = new Set<string>();

  for (let rowNumber = startRow + 2; rowNumber <= startRow + 5; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);

    for (let col = 1; col <= 14; col += 1) {
      const text = cellText(row, col);
      if (text.includes('%')) {
        parts.add(text);
      }
    }
  }

  return Array.from(parts).join('；');
}

function findProductRows(sheet: ExcelJS.Worksheet): number[] {
  const productRows: number[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (cellText(row, 4) !== '款号') return;

    const dataRow = sheet.getRow(rowNumber + 1);
    if (cellText(dataRow, 4)) {
      productRows.push(rowNumber + 1);
    }
  });

  return productRows;
}

export async function parseHandcardWorkbook(filePath: string): Promise<HandcardParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) return { products: [], duplicateStyleNumbers: [] };

  const productRows = findProductRows(sheet);
  const products: ProductRecord[] = [];
  const seenStyleNumbers = new Set<string>();
  const duplicateStyleNumbers = new Set<string>();

  for (let index = 0; index < productRows.length; index += 1) {
    const rowNumber = productRows[index];
    const nextStartRow = productRows[index + 1] || sheet.rowCount + 1;
    const row = sheet.getRow(rowNumber);
    const styleNumber = cellText(row, 4);

    if (seenStyleNumbers.has(styleNumber)) {
      duplicateStyleNumbers.add(styleNumber);
    }
    seenStyleNumbers.add(styleNumber);

    const finalStorePrice = toNumber(cellText(row, 13));
    const rawSkuItems = parseSkuItems(sheet, rowNumber, nextStartRow, styleNumber, finalStorePrice);
    const sizeRows = parseSizeRows(sheet, rowNumber, nextStartRow, styleNumber);
    const skuItems = filterSkuItemsBySizeRows(rawSkuItems, sizeRows);
    applySuggestedWeights(skuItems, sizeRows);

    const warnings: string[] = [];
    if (skuItems.length === 0) warnings.push('未解析到 SKU 明细');
    if (sizeRows.length === 0) warnings.push('未解析到尺码表');
    if (skuItems.length < rawSkuItems.length) warnings.push('已跳过缺少尺码表数据的 SKU');

    products.push({
      styleNumber,
      supplier: cellText(row, 3),
      brand: cellText(row, 7),
      systemCategory: cellText(row, 6),
      colors: splitColors(cellText(row, 5)),
      originalName: cellText(row, 16),
      taxPrice: toNumber(cellText(row, 10)),
      companyPrice: toNumber(cellText(row, 11)),
      finalStorePrice,
      fabricName: cellText(sheet.getRow(rowNumber + 1), 16),
      composition: parseComposition(sheet, rowNumber),
      sourceFile: path.resolve(filePath),
      sourceSheet: SHEET_NAME,
      sourceRow: rowNumber,
      skuItems,
      sizeRows,
      warnings
    });
  }

  return { products, duplicateStyleNumbers: Array.from(duplicateStyleNumbers) };
}
