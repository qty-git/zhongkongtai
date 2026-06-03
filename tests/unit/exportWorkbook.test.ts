import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { exportBatchWorkbook } from '../../src/main/services/exportWorkbook';
import type { ProductRecord } from '../../src/main/types';

const AI_HEADERS = [
  'AI识别状态',
  'AI商品名',
  'AI抖音主标题',
  'AI副标题',
  'AI属性JSON',
  'AI识别错误'
];

type ProductAiResult = NonNullable<ProductRecord['aiResult']>;

function createAiResult(
  status: ProductAiResult['status'],
  overrides: Partial<ProductAiResult> = {}
): ProductAiResult {
  return {
    status,
    productName: '云朵小衫',
    title: '宽松显瘦遮肉圆领短袖上衣',
    subtitle: '微胖穿上很显瘦',
    attributes: { 品牌: '无品牌', 风格: '甜美风' },
    error: '',
    model: 'vision-model',
    ...overrides
  };
}

function createProduct(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
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
    ],
    ...overrides
  };
}

describe('exportBatchWorkbook', () => {
  it('writes product, sku, size chart, and error sheets', async () => {
    const product = createProduct({ aiResult: createAiResult('success') });

    const outputPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zk-export-')), 'result.xlsx');
    await exportBatchWorkbook({
      outputPath,
      products: [product],
      errors: [{ styleNumber: '99999', reason: '款号未找到' }]
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);

    const productsSheet = workbook.getWorksheet('商品总表');
    const taskSheet = workbook.getWorksheet('上架任务表');

    expect(workbook.getWorksheet('商品总表')).toBeTruthy();
    expect(taskSheet).toBeTruthy();
    expect(workbook.getWorksheet('SKU明细')).toBeTruthy();
    expect(workbook.getWorksheet('尺码表')).toBeTruthy();
    expect(workbook.getWorksheet('异常记录')).toBeTruthy();
    expect(productsSheet?.getCell('H2').value).toBe('白色/灰色');
    expect(taskSheet?.getCell('A2').value).toBe('待创建');
    expect(taskSheet?.getCell('B2').value).toBe('24324');
    expect(taskSheet?.getCell('G2').value).toBe(1);
    expect(String(taskSheet?.getCell('H2').value)).toContain('24324白色L');
    expect(workbook.getWorksheet('SKU明细')?.getCell('G2').value).toBe('建议体重100-120斤');
    expect(AI_HEADERS.map((_, index) => productsSheet?.getCell(1, 20 + index).value)).toEqual(
      AI_HEADERS
    );
    expect(AI_HEADERS.map((_, index) => taskSheet?.getCell(1, 20 + index).value)).toEqual(
      AI_HEADERS
    );
    expect(taskSheet?.getCell('T2').value).toBe('成功');
    expect(taskSheet?.getCell('U2').value).toBe('云朵小衫');
    expect(taskSheet?.getCell('V2').value).toBe('宽松显瘦遮肉圆领短袖上衣');
    expect(taskSheet?.getCell('W2').value).toBe('微胖穿上很显瘦');
    expect(String(taskSheet?.getCell('X2').value)).toContain('"品牌":"无品牌"');
    expect(taskSheet?.getCell('Y2').value).toBe('');
    expect(productsSheet?.getCell('T2').value).toBe('成功');
    expect(productsSheet?.getCell('X2').value).toBe(
      JSON.stringify({ 品牌: '无品牌', 风格: '甜美风' })
    );
  });

  it('maps AI recognition statuses to export labels', async () => {
    const products = [
      createProduct({ styleNumber: 'no-ai' }),
      createProduct({ styleNumber: 'success-ai', aiResult: createAiResult('success') }),
      createProduct({ styleNumber: 'skipped-ai', aiResult: createAiResult('skipped') }),
      createProduct({
        styleNumber: 'error-ai',
        aiResult: createAiResult('error', { error: '图片缺失' })
      }),
      createProduct({ styleNumber: 'pending-ai', aiResult: createAiResult('pending') })
    ];

    const outputPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'zk-export-ai-')),
      'result.xlsx'
    );
    await exportBatchWorkbook({
      outputPath,
      products,
      errors: []
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(outputPath);

    const productsSheet = workbook.getWorksheet('商品总表');
    const taskSheet = workbook.getWorksheet('上架任务表');

    expect(productsSheet?.getColumn('T').values.slice(2)).toEqual([
      '未启用',
      '成功',
      '跳过',
      '失败',
      '待处理'
    ]);
    expect(taskSheet?.getColumn('T').values.slice(2)).toEqual([
      '未启用',
      '成功',
      '跳过',
      '失败',
      '待处理'
    ]);
    expect(taskSheet?.getCell('Y5').value).toBe('图片缺失');
    expect(taskSheet?.getCell('X2').value).toBe('');
  });
});
