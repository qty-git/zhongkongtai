import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { exportBatchWorkbook } from '../../src/main/services/exportWorkbook';
import type { ProductRecord } from '../../src/main/types';

describe('exportBatchWorkbook', () => {
  it('writes product, sku, size chart, and error sheets', async () => {
    const product: ProductRecord = {
      styleNumber: '24324',
      supplier: '大女孩',
      brand: '梦丞',
      systemCategory: '短袖针织衫',
      colors: ['白色', '灰色'],
      originalName: '设计感条纹假两件叠穿短袖针织衫',
      taxPrice: 45.36,
      companyPrice: 119.9,
      finalStorePrice: 99.9,
      fabricName: '针织',
      composition: '面料：64.9%棉 35.1%聚酯纤维',
      sourceFile: '/tmp/source.xlsx',
      sourceSheet: '手卡资料',
      sourceRow: 3,
      imagePath: '/tmp/24324.png',
      sizeChartImagePath: '/tmp/24324_尺码表.png',
      warnings: [],
      skuItems: [
        {
          styleNumber: '24324',
          color: '白色',
          size: 'L',
          merchantCode: '24324白色L',
          finalStorePrice: 99.9,
          suggestedWeight: '100-120',
          note: '建议体重100-120斤'
        }
      ],
      sizeRows: [
        {
          styleNumber: '24324',
          size: 'L',
          bodyType: '160/95',
          suggestedWeight: '100-120',
          measurements: { 衣长: '61', 肩宽: '39' }
        }
      ]
    };

    const outputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zk-export-')), 'result.xlsx');
    await exportBatchWorkbook({
      outputPath,
      products: [product],
      errors: [{ styleNumber: '99999', reason: '款号未找到' }]
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);

    expect(workbook.getWorksheet('商品总表')).toBeTruthy();
    expect(workbook.getWorksheet('上架任务表')).toBeTruthy();
    expect(workbook.getWorksheet('SKU明细')).toBeTruthy();
    expect(workbook.getWorksheet('尺码表')).toBeTruthy();
    expect(workbook.getWorksheet('异常记录')).toBeTruthy();
    expect(workbook.getWorksheet('商品总表')?.getCell('H2').value).toBe('白色/灰色');
    expect(workbook.getWorksheet('上架任务表')?.getCell('A2').value).toBe('待创建');
    expect(workbook.getWorksheet('上架任务表')?.getCell('B2').value).toBe('24324');
    expect(workbook.getWorksheet('上架任务表')?.getCell('G2').value).toBe(1);
    expect(String(workbook.getWorksheet('上架任务表')?.getCell('H2').value)).toContain('24324白色L');
    expect(workbook.getWorksheet('SKU明细')?.getCell('G2').value).toBe('建议体重100-120斤');
  });
});
