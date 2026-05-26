import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import type { ProductRecord } from '../types';

export interface ExportBatchWorkbookInput {
  outputPath: string;
  products: ProductRecord[];
  errors: Array<{ styleNumber: string; reason: string }>;
}

function columnName(index: number): string {
  let name = '';
  let current = index;

  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }

  return name;
}

function addHeader(sheet: ExcelJS.Worksheet, headers: string[]): void {
  sheet.addRow(headers);

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E79' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: 'A1',
    to: `${columnName(headers.length)}1`
  };

  headers.forEach((header, index) => {
    sheet.getColumn(index + 1).width = Math.min(Math.max(header.length * 2 + 6, 14), 32);
  });
}

function finishSheet(sheet: ExcelJS.Worksheet): void {
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    row.alignment = { vertical: 'middle', wrapText: true };
    row.height = 22;
  });
}

function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function taskSkuJson(product: ProductRecord): string {
  return JSON.stringify(
    product.skuItems.map((sku) => ({
      color: sku.color,
      size: sku.size,
      merchantCode: sku.merchantCode,
      price: sku.finalStorePrice,
      suggestedWeight: sku.suggestedWeight,
      note: sku.note
    }))
  );
}

export async function exportBatchWorkbook(input: ExportBatchWorkbookInput): Promise<void> {
  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'zhongkongtai';
  workbook.created = new Date();

  const productsSheet = workbook.addWorksheet('商品总表');
  addHeader(productsSheet, [
    '处理状态',
    '失败/提示原因',
    '款号',
    '图片路径',
    '供应商',
    '品牌',
    '大类（系统类目）',
    '颜色',
    '原始名称',
    '税后价',
    '公司定价',
    '最终店铺售价',
    '面料名称',
    '成分',
    '尺码表图片路径',
    '来源文件',
    '来源行',
    '人工备注',
    '后续商品链接'
  ]);

  for (const product of input.products) {
    productsSheet.addRow([
      product.warnings.length ? '有提示' : '成功',
      product.warnings.join('；'),
      product.styleNumber,
      product.imagePath || '',
      product.supplier,
      product.brand,
      product.systemCategory,
      product.colors.join('/'),
      product.originalName,
      product.taxPrice,
      product.companyPrice,
      product.finalStorePrice,
      product.fabricName,
      product.composition,
      product.sizeChartImagePath || '',
      product.sourceFile,
      product.sourceRow,
      '',
      ''
    ]);
  }
  productsSheet.getColumn(4).width = 38;
  productsSheet.getColumn(9).width = 34;
  productsSheet.getColumn(14).width = 42;
  productsSheet.getColumn(16).width = 38;
  finishSheet(productsSheet);

  const taskSheet = workbook.addWorksheet('上架任务表');
  addHeader(taskSheet, [
    '任务状态',
    '款号',
    '商品图片路径',
    '尺码表图片路径',
    '颜色',
    '尺码',
    'SKU数量',
    'SKU明细JSON',
    '供应商',
    '品牌',
    '大类（系统类目）',
    '原始名称',
    '最终店铺售价',
    '面料名称',
    '成分',
    '处理提示',
    '来源文件',
    '人工备注',
    '抖店商品链接'
  ]);

  for (const product of input.products) {
    const colors = uniqueValues(product.skuItems.map((sku) => sku.color));
    const sizes = uniqueValues(product.skuItems.map((sku) => sku.size));

    taskSheet.addRow([
      product.warnings.length ? '待人工确认' : '待创建',
      product.styleNumber,
      product.imagePath || '',
      product.sizeChartImagePath || '',
      (colors.length > 0 ? colors : product.colors).join('/'),
      sizes.join('/'),
      product.skuItems.length,
      taskSkuJson(product),
      product.supplier,
      product.brand,
      product.systemCategory,
      product.originalName,
      product.finalStorePrice,
      product.fabricName,
      product.composition,
      product.warnings.join('；'),
      product.sourceFile,
      '',
      ''
    ]);
  }
  taskSheet.getColumn(3).width = 38;
  taskSheet.getColumn(4).width = 38;
  taskSheet.getColumn(8).width = 52;
  taskSheet.getColumn(12).width = 34;
  taskSheet.getColumn(15).width = 42;
  taskSheet.getColumn(17).width = 38;
  finishSheet(taskSheet);

  const skuSheet = workbook.addWorksheet('SKU明细');
  addHeader(skuSheet, ['款号', '颜色', '尺码', '商家编码', '最终店铺售价', '建议体重', 'SKU备注']);

  for (const product of input.products) {
    for (const sku of product.skuItems) {
      skuSheet.addRow([
        sku.styleNumber,
        sku.color,
        sku.size,
        sku.merchantCode,
        sku.finalStorePrice,
        sku.suggestedWeight,
        sku.note
      ]);
    }
  }
  finishSheet(skuSheet);

  const sizeSheet = workbook.addWorksheet('尺码表');
  addHeader(sizeSheet, ['款号', '尺码', '适用身高/体型', '建议体重', '尺寸项', '尺寸值']);

  for (const product of input.products) {
    for (const sizeRow of product.sizeRows) {
      const measurements = Object.entries(sizeRow.measurements);

      if (measurements.length === 0) {
        sizeSheet.addRow([
          sizeRow.styleNumber,
          sizeRow.size,
          sizeRow.bodyType,
          sizeRow.suggestedWeight,
          '',
          ''
        ]);
        continue;
      }

      for (const [label, value] of measurements) {
        sizeSheet.addRow([
          sizeRow.styleNumber,
          sizeRow.size,
          sizeRow.bodyType,
          sizeRow.suggestedWeight,
          label,
          value
        ]);
      }
    }
  }
  finishSheet(sizeSheet);

  const errorSheet = workbook.addWorksheet('异常记录');
  addHeader(errorSheet, ['款号', '原因']);

  for (const error of input.errors) {
    errorSheet.addRow([error.styleNumber, error.reason]);
  }
  errorSheet.getColumn(2).width = 36;
  finishSheet(errorSheet);

  await workbook.xlsx.writeFile(input.outputPath);
}
