import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { extractProductImages } from '../../src/main/services/workbookImages';

const fixture = path.join(process.cwd(), 'tests/fixtures/handcard-sample.xlsx');
const runIfFixture = fs.existsSync(fixture) ? it : it.skip;
const onePixelPngBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function writeWorkbookWithImage(sheetName: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.getRow(2).getCell(4).value = '款号';
  sheet.getRow(3).getCell(4).value = '24555';
  const imageId = workbook.addImage({ base64: onePixelPngBase64, extension: 'png' });
  sheet.addImage(imageId, { tl: { col: 0, row: 2 }, ext: { width: 16, height: 16 } });

  const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zk-image-sheet-')), `${sheetName}.xlsx`);
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

describe('extractProductImages', () => {
  runIfFixture('extracts product image for style 24324', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-images-'));
    const images = await extractProductImages(fixture, outputDir, [{ styleNumber: '24324', sourceRow: 3 }]);
    const imagePath = images.get('24324');

    expect(imagePath).toBeTruthy();
    expect(fs.existsSync(imagePath!)).toBe(true);
    expect(path.basename(imagePath!)).toBe('24324.png');
  });

  it('extracts product image from a 测款资料 sheet', async () => {
    const workbookPath = await writeWorkbookWithImage('测款资料');
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-images-'));
    const images = await extractProductImages(workbookPath, outputDir, [{ styleNumber: '24555', sourceRow: 3 }]);
    const imagePath = images.get('24555');

    expect(imagePath).toBeTruthy();
    expect(fs.existsSync(imagePath!)).toBe(true);
    expect(path.basename(imagePath!)).toBe('24555.png');
  });
});
