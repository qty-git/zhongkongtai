import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractProductImages } from '../../src/main/services/workbookImages';

const fixture = path.join(process.cwd(), 'tests/fixtures/handcard-sample.xlsx');
const runIfFixture = fs.existsSync(fixture) ? it : it.skip;

describe('extractProductImages', () => {
  runIfFixture('extracts product image for style 24324', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-images-'));
    const images = await extractProductImages(fixture, outputDir, [{ styleNumber: '24324', sourceRow: 3 }]);
    const imagePath = images.get('24324');

    expect(imagePath).toBeTruthy();
    expect(fs.existsSync(imagePath!)).toBe(true);
    expect(path.basename(imagePath!)).toBe('24324.png');
  });
});
