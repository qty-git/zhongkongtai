import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { processBatchWithoutAi } from '../../src/main/services/batchProcessor';
import type { BatchProgress } from '../../src/main/types';

const fixture = path.join(process.cwd(), 'tests/fixtures/handcard-sample.xlsx');
const runIfFixture = fs.existsSync(fixture) ? it : it.skip;

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
});
