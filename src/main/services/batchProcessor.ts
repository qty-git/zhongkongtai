import path from 'node:path';
import { exportBatchWorkbook } from './exportWorkbook';
import { parseHandcardWorkbook } from './handcardParser';
import { parseStyleNumbers } from './styleNumber';
import { extractProductImages } from './workbookImages';
import type { BatchRow, ProductRecord } from '../types';

export interface ProcessBatchWithoutAiInput {
  styleNumberText: string;
  workbookPaths: string[];
  outputDir: string;
}

export interface ProcessBatchWithoutAiResult {
  rows: BatchRow[];
  workbookPath: string;
}

function exportFileName(): string {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  return `中控台导出_${timestamp}.xlsx`;
}

export async function processBatchWithoutAi(
  input: ProcessBatchWithoutAiInput
): Promise<ProcessBatchWithoutAiResult> {
  const requestedStyleNumbers = parseStyleNumbers(input.styleNumberText);
  const productByStyleNumber = new Map<string, ProductRecord>();
  const imageOutputDir = path.join(input.outputDir, 'images');

  for (const workbookPath of input.workbookPaths) {
    const parsed = await parseHandcardWorkbook(workbookPath);

    for (const product of parsed.products) {
      if (!productByStyleNumber.has(product.styleNumber)) {
        productByStyleNumber.set(product.styleNumber, product);
      }
    }

    const resolvedWorkbookPath = path.resolve(workbookPath);
    const matchesInWorkbook = requestedStyleNumbers
      .map((styleNumber) => productByStyleNumber.get(styleNumber))
      .filter((product): product is ProductRecord => Boolean(product))
      .filter((product) => product.sourceFile === resolvedWorkbookPath);

    const images = await extractProductImages(
      workbookPath,
      imageOutputDir,
      matchesInWorkbook.map((product) => ({
        styleNumber: product.styleNumber,
        sourceRow: product.sourceRow
      }))
    );

    for (const product of matchesInWorkbook) {
      product.imagePath = images.get(product.styleNumber);

      if (!product.imagePath) {
        product.warnings.push('缺少产品图');
      }
    }
  }

  const products: ProductRecord[] = [];
  const errors: Array<{ styleNumber: string; reason: string }> = [];

  const rows: BatchRow[] = requestedStyleNumbers.map((styleNumber) => {
    const product = productByStyleNumber.get(styleNumber);

    if (!product) {
      const reason = '款号未找到';
      errors.push({ styleNumber, reason });
      return { styleNumber, status: 'error', reason };
    }

    products.push(product);
    return {
      styleNumber,
      status: product.warnings.length ? 'warning' : 'success',
      reason: product.warnings.join('；'),
      product
    };
  });

  const workbookPath = path.join(input.outputDir, exportFileName());
  await exportBatchWorkbook({ outputPath: workbookPath, products, errors });

  return { rows, workbookPath };
}
