import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderSizeChartImage } from '../../src/main/services/sizeChartImage';
import type { ProductRecord } from '../../src/main/types';

describe('renderSizeChartImage', () => {
  it('writes a png size chart image for one product', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-size-chart-'));
    const product: ProductRecord = {
      styleNumber: '24324',
      supplier: '大女孩',
      brand: '梦丞',
      systemCategory: '短袖针织衫',
      colors: ['白色'],
      originalName: '设计感条纹假两件叠穿短袖针织衫',
      taxPrice: 45.36,
      companyPrice: 119.9,
      finalStorePrice: 99.9,
      fabricName: '针织',
      composition: '面料：64.9%棉 35.1%聚酯纤维',
      sourceFile: '/tmp/source.xlsx',
      sourceSheet: '手卡资料',
      sourceRow: 3,
      skuItems: [],
      sizeRows: [
        {
          styleNumber: '24324',
          size: 'L',
          bodyType: '160/95',
          suggestedWeight: '100-120',
          measurements: { 衣长: '61', 肩宽: '39' }
        },
        {
          styleNumber: '24324',
          size: 'XL',
          bodyType: '165/100B',
          suggestedWeight: '120-140',
          measurements: { 衣长: '62', 肩宽: '40.5' }
        }
      ],
      warnings: []
    };

    const imagePath = await renderSizeChartImage(product, outputDir);

    expect(path.basename(imagePath)).toBe('24324_尺码表.png');
    expect(fs.existsSync(imagePath)).toBe(true);
    expect(fs.readFileSync(imagePath).subarray(0, 4).toString('hex')).toBe('89504e47');
  }, 15_000);
});
