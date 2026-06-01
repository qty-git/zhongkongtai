import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { parseHandcardWorkbook } from '../../src/main/services/handcardParser';

const fixture = path.join(process.cwd(), 'tests/fixtures/handcard-sample.xlsx');
const runIfFixture = fs.existsSync(fixture) ? it : it.skip;

async function writeMinimalHandcardWorkbook(sheetName: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  ['产品图', '选款日期', '供应商', '款号', '颜色', '大类（系统类目）', '品牌'].forEach((header, index) => {
    sheet.getRow(2).getCell(index + 1).value = header;
  });
  sheet.getRow(2).getCell(10).value = '税后价';
  sheet.getRow(2).getCell(11).value = '公司定价';
  sheet.getRow(2).getCell(13).value = '最终店铺售价';
  sheet.getRow(3).getCell(3).value = '大女孩';
  sheet.getRow(3).getCell(4).value = '24555';
  sheet.getRow(3).getCell(5).value = '灰色';
  sheet.getRow(3).getCell(6).value = '短袖T恤';
  sheet.getRow(3).getCell(7).value = '梦丞';
  sheet.getRow(3).getCell(10).value = 37.8;
  sheet.getRow(3).getCell(11).value = 89.9;
  sheet.getRow(3).getCell(13).value = 79.9;
  sheet.getRow(3).getCell(16).value = '圆领撞色短袖T恤';
  sheet.getRow(3).getCell(27).value = 'L';
  sheet.getRow(3).getCell(28).value = 'XL';
  sheet.getRow(4).getCell(16).value = '针织';
  sheet.getRow(4).getCell(27).value = '160/95';
  sheet.getRow(4).getCell(28).value = '165/100B';
  sheet.getRow(5).getCell(22).value = '衣长';
  sheet.getRow(5).getCell(27).value = '65';
  sheet.getRow(5).getCell(28).value = '66';
  sheet.getRow(6).getCell(3).value = '55.8%棉 40.7%聚酯纤维 3.5%氨纶';
  sheet.getRow(6).getCell(22).value = '肩宽';
  sheet.getRow(6).getCell(27).value = '40.5';
  sheet.getRow(6).getCell(28).value = '42';
  sheet.getRow(11).getCell(22).value = '建议体重';
  sheet.getRow(11).getCell(27).value = '100-120';
  sheet.getRow(11).getCell(28).value = '120-140';
  sheet.getRow(14).getCell(2).value = '颜色规格';
  sheet.getRow(14).getCell(3).value = '商家编码';
  sheet.getRow(15).getCell(2).value = '灰色L';
  sheet.getRow(15).getCell(3).value = '24555灰色L';
  sheet.getRow(16).getCell(2).value = '灰色XL';
  sheet.getRow(16).getCell(3).value = '24555灰色XL';

  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zk-handcard-')), `${sheetName}.xlsx`);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

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

  it('parses product rows from 测款资料 sheets', async () => {
    const filePath = await writeMinimalHandcardWorkbook('测款资料');
    const result = await parseHandcardWorkbook(filePath);

    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({
      styleNumber: '24555',
      sourceSheet: '测款资料',
      supplier: '大女孩',
      originalName: '圆领撞色短袖T恤'
    });
    expect(result.products[0].skuItems).toContainEqual(
      expect.objectContaining({ merchantCode: '24555灰色L', suggestedWeight: '100-120' })
    );
  });
});
