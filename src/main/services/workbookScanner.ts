import fs from 'node:fs/promises';
import path from 'node:path';

const WORKBOOK_EXTENSIONS = new Set(['.xlsx', '.xlsm']);

export async function scanWorkbookFiles(directoryPath: string): Promise<string[]> {
  const root = path.resolve(directoryPath);
  const results: string[] = [];

  async function visit(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (entry.name.startsWith('~$')) continue;
      if (!WORKBOOK_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

      results.push(fullPath);
    }
  }

  await visit(root);
  return results.sort((a, b) => a.localeCompare(b, 'zh-CN'));
}
