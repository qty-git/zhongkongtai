# 稳定性与尺码表图片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有中控台 MVP 上加入资料文件夹自动扫描、处理进度、日志、增强异常提示，并把解析出的尺码表渲染成可上传抖店识别的 PNG 图片。

**Architecture:** 主进程服务层继续负责文件系统、Excel 解析、图片生成和导出；渲染层只负责选择输入、展示进度和展示结果。新增的文件夹扫描、日志和尺码表图片生成都是独立服务，由 `batchProcessor` 串联，最终把 `sizeChartImagePath` 写回导出总表。

**Tech Stack:** Electron, React, TypeScript, Vitest, ExcelJS, sharp, electron-builder.

---

## 文件结构

- 创建 `src/main/services/workbookScanner.ts`: 扫描资料文件夹，返回 `.xlsx` / `.xlsm` 文件，忽略临时文件。
- 创建 `src/main/services/batchLog.ts`: 收集处理日志并写入 `logs/中控台日志_<timestamp>.txt`。
- 创建 `src/main/services/sizeChartImage.ts`: 把 `ProductRecord.sizeRows` 渲染成 PNG。
- 修改 `src/main/services/batchProcessor.ts`: 接收文件夹输入，合并手选 Excel，发送进度，写日志，生成尺码表图片。
- 修改 `src/main/services/exportWorkbook.ts`: 保持 `尺码表图片路径` 写入 `商品总表`。
- 修改 `src/main/types.ts`: 增加 `BatchProgress`、`BatchLogEntry` 和批次返回字段。
- 修改 `src/main/ipc.ts`: 增加选择资料文件夹 IPC，并把进度事件转发到渲染层。
- 修改 `src/main/preload.ts`: 暴露 `selectWorkbookDirectory` 和 `onBatchProgress`。
- 修改 `src/renderer/types.ts`: 增加进度、日志和扫描路径类型。
- 修改 `src/renderer/App.tsx`: 增加选择文件夹按钮、进度条、日志路径、异常提示。
- 修改 `package.json` / `package-lock.json`: 增加 `sharp` 依赖并升级版本到 `0.2.0`。
- 创建测试：
  - `tests/unit/workbookScanner.test.ts`
  - `tests/unit/sizeChartImage.test.ts`
  - 更新 `tests/unit/batchProcessor.test.ts`

---

### Task 1: 资料文件夹扫描

**Files:**
- Create: `src/main/services/workbookScanner.ts`
- Create: `tests/unit/workbookScanner.test.ts`

- [ ] **Step 1: 编写失败测试**

```ts
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
    expect(files.map((file) => path.relative(root, file)).sort()).toEqual(['a.xlsx', 'b.xlsm', path.join('nested', 'c.xlsx')].sort());
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm run test -- tests/unit/workbookScanner.test.ts
```

Expected: FAIL because `src/main/services/workbookScanner.ts` does not exist.

- [ ] **Step 3: 实现扫描器**

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```bash
npm run test -- tests/unit/workbookScanner.test.ts
```

Expected: PASS.

- [ ] **Step 5: 提交**

```bash
git add src/main/services/workbookScanner.ts tests/unit/workbookScanner.test.ts
git commit -m "feat: scan workbook folders"
```

---

### Task 2: 尺码表 PNG 生成

**Files:**
- Create: `src/main/services/sizeChartImage.ts`
- Create: `tests/unit/sizeChartImage.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 安装 sharp**

Run:

```bash
npm install sharp
```

Expected: `sharp` appears in `dependencies`.

- [ ] **Step 2: 编写失败测试**

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderSizeChartImage } from '../../src/main/services/sizeChartImage';
import type { ProductRecord } from '../../src/main/types';

describe('renderSizeChartImage', () => {
  it('writes a png size chart image for one product', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-size-chart-'));
    const product = {
      styleNumber: '24324',
      originalName: '设计感条纹假两件叠穿短袖针织衫',
      sizeRows: [
        { styleNumber: '24324', size: 'L', bodyType: '160/95', suggestedWeight: '100-120', measurements: { 衣长: '61', 肩宽: '39' } },
        { styleNumber: '24324', size: 'XL', bodyType: '165/100B', suggestedWeight: '120-140', measurements: { 衣长: '62', 肩宽: '40.5' } }
      ]
    } as ProductRecord;

    const imagePath = await renderSizeChartImage(product, outputDir);
    expect(path.basename(imagePath)).toBe('24324_尺码表.png');
    expect(fs.existsSync(imagePath)).toBe(true);
    expect(fs.readFileSync(imagePath).subarray(0, 4).toString('hex')).toBe('89504e47');
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
npm run test -- tests/unit/sizeChartImage.test.ts
```

Expected: FAIL because `sizeChartImage.ts` does not exist.

- [ ] **Step 4: 实现 PNG 渲染器**

实现要求：
- 输出路径为 `size-charts/款号_尺码表.png`。
- 表头包含 `尺码`、`建议体重`、`适用身高/体型` 和所有尺寸项。
- 使用 SVG 表格由 `sharp` 转 PNG。
- 空尺码表时抛出 `未解析到尺码表，无法生成尺码表图片`。

- [ ] **Step 5: 运行测试确认通过**

Run:

```bash
npm run test -- tests/unit/sizeChartImage.test.ts
```

Expected: PASS.

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json src/main/services/sizeChartImage.ts tests/unit/sizeChartImage.test.ts
git commit -m "feat: render size chart images"
```

---

### Task 3: 批次进度、日志、文件夹输入

**Files:**
- Create: `src/main/services/batchLog.ts`
- Modify: `src/main/types.ts`
- Modify: `src/main/services/batchProcessor.ts`
- Modify: `tests/unit/batchProcessor.test.ts`

- [ ] **Step 1: 更新批次处理测试**

测试要求：
- `processBatchWithoutAi` 接收 `workbookDirectory`。
- 返回 `logPath`。
- 返回 `scannedWorkbookPaths`。
- 为成功商品生成 `sizeChartImagePath`。

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
npm run test -- tests/unit/batchProcessor.test.ts
```

Expected: FAIL because new fields and folder scan are not implemented.

- [ ] **Step 3: 增加类型**

在 `src/main/types.ts` 增加：

```ts
export interface BatchProgress {
  stage: 'idle' | 'scan' | 'parse' | 'image' | 'size-chart' | 'export' | 'done' | 'error';
  message: string;
  current: number;
  total: number;
  styleNumber?: string;
}

export interface BatchLogEntry {
  time: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  styleNumber?: string;
}
```

- [ ] **Step 4: 实现日志服务**

`batchLog.ts` 提供：
- `createBatchLog()`
- `logInfo`
- `logWarning`
- `logError`
- `writeBatchLog(outputDir, entries)`

日志文件路径为 `logs/中控台日志_<timestamp>.txt`。

- [ ] **Step 5: 修改批次处理器**

`ProcessBatchWithoutAiInput` 增加：

```ts
workbookDirectory?: string;
onProgress?: (progress: BatchProgress) => void;
```

`ProcessBatchWithoutAiResult` 增加：

```ts
logPath: string;
scannedWorkbookPaths: string[];
```

处理顺序：
1. 解析款号。
2. 扫描 `workbookDirectory`。
3. 合并扫描文件和手选文件。
4. 解析 Excel。
5. 提取产品图。
6. 生成尺码表图片。
7. 导出总表。
8. 写日志。

- [ ] **Step 6: 运行测试确认通过**

Run:

```bash
npm run test -- tests/unit/batchProcessor.test.ts
```

Expected: PASS.

- [ ] **Step 7: 提交**

```bash
git add src/main/types.ts src/main/services/batchLog.ts src/main/services/batchProcessor.ts tests/unit/batchProcessor.test.ts
git commit -m "feat: add batch progress logs and folder input"
```

---

### Task 4: IPC 和界面接入

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/types.ts`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: 主进程增加选择文件夹和进度事件**

新增 IPC:
- `dialog:select-workbook-directory`
- `batch:progress`

`batch:process-without-ai` 调用时把 `onProgress` 映射为 `event.sender.send('batch:progress', progress)`。

- [ ] **Step 2: preload 暴露 API**

新增：

```ts
selectWorkbookDirectory: () => Promise<string>;
onBatchProgress: (callback: (progress: BatchProgressView) => void) => () => void;
```

- [ ] **Step 3: 渲染层增加 UI**

界面要求：
- 增加“选择资料文件夹”。
- 保留“手动选择 Excel”。
- 显示扫描到的 Excel 数量。
- 显示进度条和当前步骤文案。
- 完成后显示导出表路径和日志路径。
- 异常提示使用红色信息条。

- [ ] **Step 4: 运行类型检查**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: 手动冒烟**

Run:

```bash
npm run dev
```

Expected:
- 选择资料文件夹可用。
- 选择输出目录可用。
- 运行后出现进度。
- 输出目录存在 `images/`、`size-charts/`、`logs/` 和 `.xlsx`。

- [ ] **Step 6: 提交**

```bash
git add src/main/ipc.ts src/main/preload.ts src/renderer/types.ts src/renderer/App.tsx
git commit -m "feat: show folder scan progress and logs"
```

---

### Task 5: 最终验证和版本发布

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: 更新 README**

说明：
- 选择资料文件夹自动扫描多个 Excel。
- 输出目录结构：`images/`、`size-charts/`、`logs/`。
- `size-charts/款号_尺码表.png` 用于抖店 AI 尺码识别。

- [ ] **Step 2: 运行最终验证**

Run:

```bash
npm run test
npm run build
```

Expected: PASS.

- [ ] **Step 3: 提交和推送**

```bash
git add README.md package.json package-lock.json
git commit -m "docs: document folder scan and size chart images"
git push origin main
```

Expected: GitHub Actions builds new Windows package.

---

## 自查

**规格覆盖：** 本计划覆盖资料文件夹扫描、多个 Excel 合并、进度显示、日志、增强异常提示、尺码表 PNG 生成、写回总表和 Windows 包验证。

**占位检查：** 没有 `TBD`、`TODO`、`implement later`。实现细节已拆到明确文件和测试。

**类型一致性：** `BatchProgress`、`BatchLogEntry`、`sizeChartImagePath`、`logPath`、`scannedWorkbookPaths` 在服务层、IPC 和渲染层保持同名字段。
