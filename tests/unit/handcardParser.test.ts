import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseHandcardWorkbook } from '../../src/main/services/handcardParser';

const fixture = path.join(process.cwd(), 'tests/fixtures/handcard-sample.xlsx');
const runIfFixture = fs.existsSync(fixture) ? it : it.skip;

describe('parseHandcardWorkbook', () => {
  runIfFixture('finds product blocks by 款号 header and parses core fields', async () => {
    const result = await parseHandcardWorkbook(fixture);
    expect(result.products.length).toBeGreaterThanOrEqual(90);

    const item = result.products.find((product) => product.styleNumber === '24324');
    expect(item).toMatchObject({
      styleNumber: '24324',
      supplier: '大女孩',
      brand: '梦丞',
      systemCategory: '短袖针织衫',
      originalName: '设计感条纹假两件叠穿短袖针织衫',
      taxPrice: 45.36,
      companyPrice: 119.9,
      finalStorePrice: 99.9,
      fabricName: '针织'
    });
    expect(item?.colors).toEqual(['白色', '灰色', '黄色', '蓝色']);
  });

  runIfFixture('parses SKU items and suggested weight for one style number', async () => {
    const result = await parseHandcardWorkbook(fixture);
    const item = result.products.find((product) => product.styleNumber === '24324');
    expect(item?.skuItems).toContainEqual(
      expect.objectContaining({
        styleNumber: '24324',
        color: '白色',
        size: 'L',
        merchantCode: '24324白色L',
        suggestedWeight: '100-120',
        note: '建议体重100-120斤'
      })
    );
  });

  runIfFixture('ignores size columns that have no actual measurement values', async () => {
    const result = await parseHandcardWorkbook(fixture);
    const item = result.products.find((product) => product.styleNumber === '24548');

    expect(item).toBeTruthy();
    expect(item?.sizeRows.map((row) => row.size)).not.toContain('5XL');
    expect(item?.skuItems.map((sku) => sku.size)).not.toContain('5XL');
  });
});
