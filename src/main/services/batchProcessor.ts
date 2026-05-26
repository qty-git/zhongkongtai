import path from 'node:path';
import { createBatchLog, writeBatchLog } from './batchLog';
import { exportBatchWorkbook } from './exportWorkbook';
import { parseHandcardWorkbook } from './handcardParser';
import { renderSizeChartImage } from './sizeChartImage';
import { parseStyleNumbers } from './styleNumber';
import { extractProductImages } from './workbookImages';
import { scanWorkbookFiles } from './workbookScanner';
import type { BatchProgress, BatchRow, ProductRecord } from '../types';

export interface ProcessBatchWithoutAiInput {
  styleNumberText: string;
  workbookPaths: string[];
  workbookDirectory?: string;
  outputDir: string;
  onProgress?: (progress: BatchProgress) => void;
}

export interface ProcessBatchWithoutAiResult {
  rows: BatchRow[];
  workbookPath: string;
  logPath: string;
  scannedWorkbookPaths: string[];
}

function exportFileName(): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  return `中控台导出_${timestamp}.xlsx`;
}

function uniquePaths(paths: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of paths) {
    const resolved = path.resolve(item);
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    result.push(resolved);
  }

  return result;
}

function emitProgress(input: ProcessBatchWithoutAiInput, progress: BatchProgress): void {
  input.onProgress?.(progress);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function processBatchWithoutAi(
  input: ProcessBatchWithoutAiInput
): Promise<ProcessBatchWithoutAiResult> {
  const log = createBatchLog();
  const requestedStyleNumbers = parseStyleNumbers(input.styleNumberText);
  const productByStyleNumber = new Map<string, ProductRecord>();
  const workbookDirectory = input.workbookDirectory?.trim();

  emitProgress(input, {
    stage: 'scan',
    message: workbookDirectory ? '正在扫描资料文件夹' : '未选择资料文件夹，使用手动选择的 Excel',
    current: 0,
    total: 1
  });

  let scannedWorkbookPaths: string[] = [];
  if (workbookDirectory) {
    try {
      scannedWorkbookPaths = await scanWorkbookFiles(workbookDirectory);
      log.info(`资料文件夹扫描完成，共找到 ${scannedWorkbookPaths.length} 个 Excel`);
    } catch (error) {
      const message = errorMessage(error);
      log.error(`资料文件夹扫描失败：${message}`);
      emitProgress(input, {
        stage: 'error',
        message: `资料文件夹扫描失败：${message}`,
        current: 1,
        total: 1
      });
    }
  }

  const workbookPaths = uniquePaths([...scannedWorkbookPaths, ...input.workbookPaths]);
  const imageOutputDir = path.join(input.outputDir, 'images');
  const sizeChartOutputDir = path.join(input.outputDir, 'size-charts');

  log.info(`本次输入款号 ${requestedStyleNumbers.length} 个，待解析 Excel ${workbookPaths.length} 个`);

  for (let index = 0; index < workbookPaths.length; index += 1) {
    const workbookPath = workbookPaths[index];
    emitProgress(input, {
      stage: 'parse',
      message: `正在解析 Excel：${path.basename(workbookPath)}`,
      current: index + 1,
      total: workbookPaths.length
    });

    let parsed: Awaited<ReturnType<typeof parseHandcardWorkbook>>;
    try {
      parsed = await parseHandcardWorkbook(workbookPath);
      log.info(`解析完成：${path.basename(workbookPath)}，读取到 ${parsed.products.length} 个商品`);
    } catch (error) {
      log.error(`Excel 解析失败：${path.basename(workbookPath)}：${errorMessage(error)}`);
      continue;
    }

    for (const duplicateStyleNumber of parsed.duplicateStyleNumbers) {
      log.warning('同一个 Excel 内存在重复款号，已优先使用首次出现的数据', duplicateStyleNumber);
    }

    for (const product of parsed.products) {
      if (productByStyleNumber.has(product.styleNumber)) {
        log.warning('款号在多个资料文件中重复，已保留首次解析结果', product.styleNumber);
        continue;
      }

      productByStyleNumber.set(product.styleNumber, product);
    }

    const resolvedWorkbookPath = path.resolve(workbookPath);
    const matchesInWorkbook = requestedStyleNumbers
      .map((styleNumber) => productByStyleNumber.get(styleNumber))
      .filter((product): product is ProductRecord => Boolean(product))
      .filter((product) => product.sourceFile === resolvedWorkbookPath);

    emitProgress(input, {
      stage: 'image',
      message: `正在提取商品图片：${path.basename(workbookPath)}`,
      current: index + 1,
      total: workbookPaths.length
    });

    let images = new Map<string, string>();
    try {
      images = await extractProductImages(
        workbookPath,
        imageOutputDir,
        matchesInWorkbook.map((product) => ({
          styleNumber: product.styleNumber,
          sourceRow: product.sourceRow
        }))
      );
    } catch (error) {
      log.error(`产品图提取失败：${path.basename(workbookPath)}：${errorMessage(error)}`);

      for (const product of matchesInWorkbook) {
        product.warnings.push('产品图提取失败');
      }
    }

    for (const product of matchesInWorkbook) {
      product.imagePath = images.get(product.styleNumber);

      if (!product.imagePath) {
        product.warnings.push('缺少产品图');
        log.warning('缺少产品图', product.styleNumber);
      } else {
        log.info(`产品图已保存：${product.imagePath}`, product.styleNumber);
      }
    }
  }

  const products: ProductRecord[] = [];
  const errors: Array<{ styleNumber: string; reason: string }> = [];

  for (const styleNumber of requestedStyleNumbers) {
    const product = productByStyleNumber.get(styleNumber);

    if (!product) {
      const reason = '款号未找到';
      errors.push({ styleNumber, reason });
      log.error(reason, styleNumber);
      continue;
    }

    products.push(product);
  }

  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    emitProgress(input, {
      stage: 'size-chart',
      message: `正在生成尺码表图片：${product.styleNumber}`,
      current: index + 1,
      total: products.length,
      styleNumber: product.styleNumber
    });

    if (product.sizeRows.length === 0) {
      log.warning('未解析到尺码表，跳过尺码表图片生成', product.styleNumber);
      continue;
    }

    try {
      product.sizeChartImagePath = await renderSizeChartImage(product, sizeChartOutputDir);
      log.info(`尺码表图片已保存：${product.sizeChartImagePath}`, product.styleNumber);
    } catch (error) {
      const message = errorMessage(error);
      product.warnings.push(`尺码表图片生成失败：${message}`);
      log.error(`尺码表图片生成失败：${message}`, product.styleNumber);
    }
  }

  const rows: BatchRow[] = requestedStyleNumbers.map((styleNumber) => {
    const product = productByStyleNumber.get(styleNumber);

    if (!product) {
      return { styleNumber, status: 'error', reason: '款号未找到' };
    }

    return {
      styleNumber,
      status: product.warnings.length ? 'warning' : 'success',
      reason: product.warnings.join('；'),
      product
    };
  });

  const workbookPath = path.join(input.outputDir, exportFileName());
  emitProgress(input, {
    stage: 'export',
    message: '正在导出总表',
    current: 1,
    total: 1
  });
  await exportBatchWorkbook({ outputPath: workbookPath, products, errors });
  log.info(`总表已导出：${workbookPath}`);

  const logPath = await writeBatchLog(input.outputDir, log.entries);
  emitProgress(input, {
    stage: 'done',
    message: '处理完成',
    current: 1,
    total: 1
  });

  return { rows, workbookPath, logPath, scannedWorkbookPaths };
}
