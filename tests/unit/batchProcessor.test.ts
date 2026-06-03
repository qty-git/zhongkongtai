import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { processBatch, processBatchWithoutAi } from '../../src/main/services/batchProcessor';
import type { BatchProgress, ProductAiResult, ProductRecord } from '../../src/main/types';

const fixture = path.join(process.cwd(), 'tests/fixtures/handcard-sample.xlsx');
const runIfFixture = fs.existsSync(fixture) ? it : it.skip;

const successfulAiResult: ProductAiResult = {
  status: 'success',
  productName: '云朵小衫',
  title: '宽松显瘦遮肉圆领短袖上衣',
  subtitle: '微胖穿上很显瘦',
  attributes: { 品牌: '无品牌' },
  error: '',
  model: 'vision-model'
};

describe('processBatchWithoutAi', () => {
  runIfFixture(
    'scans a workbook folder, reports progress, writes logs, exports images, size chart images, and xlsx',
    async () => {
      const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-batch-'));
      const progressEvents: BatchProgress[] = [];

      const result = await processBatchWithoutAi({
        styleNumberText: '24324\n24501\nnot-found',
        workbookPaths: [],
        workbookDirectory: path.dirname(fixture),
        outputDir,
        onProgress: (progress) => progressEvents.push(progress)
      });

      expect(result.rows).toEqual([
        expect.objectContaining({ styleNumber: '24324', status: 'success' }),
        expect.objectContaining({ styleNumber: '24501', status: 'success' }),
        expect.objectContaining({ styleNumber: 'not-found', status: 'error' })
      ]);
      expect(result.scannedWorkbookPaths).toContain(fixture);
      expect(fs.existsSync(path.join(outputDir, 'images', '24324.png'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'size-charts', '24324_尺码表.png'))).toBe(true);
      expect(fs.existsSync(result.workbookPath)).toBe(true);
      expect(fs.existsSync(result.logPath)).toBe(true);
      expect(progressEvents.map((event) => event.stage)).toEqual(
        expect.arrayContaining(['scan', 'parse', 'image', 'size-chart', 'export', 'done'])
      );
    },
    15_000
  );

  runIfFixture('does not call ai recognizer when ai is disabled', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-batch-no-ai-'));
    const recognizeProduct = vi.fn();

    await processBatch({
      styleNumberText: '24324',
      workbookPaths: [fixture],
      outputDir,
      ai: { enabled: false, apiKey: '', model: '' },
      recognizeProduct
    });

    expect(recognizeProduct).not.toHaveBeenCalled();
  });

  runIfFixture('runs ai stage and stores successful results', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-batch-ai-'));
    const progressEvents: BatchProgress[] = [];
    const recognizeProduct = vi.fn(async (_product: ProductRecord) => successfulAiResult);

    const result = await processBatch({
      styleNumberText: '24324',
      workbookPaths: [fixture],
      outputDir,
      ai: { enabled: true, apiKey: 'secret', model: 'vision-model' },
      onProgress: (progress) => progressEvents.push(progress),
      recognizeProduct
    });

    expect(result.rows[0].product?.aiResult).toEqual(successfulAiResult);
    expect(progressEvents.map((event) => event.stage)).toContain('ai');
  });

  runIfFixture('keeps exporting when ai recognizer fails for one product', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-batch-ai-error-'));
    const recognizeProduct = vi.fn(async () => {
      throw new Error('模型供应商临时不可用');
    });

    const result = await processBatch({
      styleNumberText: '24324',
      workbookPaths: [fixture],
      outputDir,
      ai: { enabled: true, apiKey: 'secret', model: 'vision-model' },
      recognizeProduct
    });

    expect(result.rows[0]).toMatchObject({
      styleNumber: '24324',
      status: 'warning'
    });
    expect(result.rows[0].reason).toContain('AI识别失败：模型供应商临时不可用');
    expect(result.rows[0].product?.aiResult).toMatchObject({
      status: 'error',
      error: '模型供应商临时不可用',
      model: 'vision-model'
    });
    expect(fs.existsSync(result.workbookPath)).toBe(true);
    expect(fs.existsSync(result.logPath)).toBe(true);
  });
});
