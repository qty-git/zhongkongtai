import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { processBatchWithoutAi } from '../../src/main/services/batchProcessor';

const fixture = path.join(process.cwd(), 'tests/fixtures/handcard-sample.xlsx');
const runIfFixture = fs.existsSync(fixture) ? it : it.skip;

describe('processBatchWithoutAi', () => {
  runIfFixture(
    'matches pasted style numbers, exports images, and writes xlsx',
    async () => {
      const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-batch-'));
      const result = await processBatchWithoutAi({
        styleNumberText: '24324\n24501\nnot-found',
        workbookPaths: [fixture],
        outputDir
      });

      expect(result.rows).toEqual([
        expect.objectContaining({ styleNumber: '24324', status: 'success' }),
        expect.objectContaining({ styleNumber: '24501', status: 'success' }),
        expect.objectContaining({ styleNumber: 'not-found', status: 'error' })
      ]);
      expect(fs.existsSync(path.join(outputDir, 'images', '24324.png'))).toBe(true);
      expect(fs.existsSync(result.workbookPath)).toBe(true);
    },
    15_000
  );
});
