import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { scanWorkbookFiles } from '../../src/main/services/workbookScanner';

describe('scanWorkbookFiles', () => {
  it('recursively finds workbook files and ignores temporary files', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-scan-'));
    fs.mkdirSync(path.join(root, 'nested'));
    fs.writeFileSync(path.join(root, 'a.xlsx'), '');
    fs.writeFileSync(path.join(root, 'b.xlsm'), '');
    fs.writeFileSync(path.join(root, '~$temp.xlsx'), '');
    fs.writeFileSync(path.join(root, 'ignore.xls'), '');
    fs.writeFileSync(path.join(root, 'nested', 'c.xlsx'), '');

    const files = await scanWorkbookFiles(root);

    expect(files.map((file) => path.relative(root, file)).sort()).toEqual(
      ['a.xlsx', 'b.xlsm', path.join('nested', 'c.xlsx')].sort()
    );
  });
});
