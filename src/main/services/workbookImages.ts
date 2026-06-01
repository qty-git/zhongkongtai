import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

export interface ImageAnchorRequest {
  styleNumber: string;
  sourceRow: number;
}

const PREFERRED_SHEET_NAMES = ['手卡资料', '测款资料'];

interface WorkbookMedia {
  index?: number | string;
  buffer?: unknown;
  base64?: string;
}

function safeFileStem(value: string): string {
  const safe = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim();
  return safe || 'unknown';
}

function valueText(value: ExcelJS.CellValue): string {
  if (value == null) return '';

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }

  if (typeof value === 'object') {
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('').trim();
    }

    if ('result' in value) {
      return valueText(value.result as ExcelJS.CellValue);
    }

    if ('text' in value) {
      return String(value.text ?? '').trim();
    }
  }

  return '';
}

function cellText(row: ExcelJS.Row, column: number): string {
  return valueText(row.getCell(column).value);
}

function hasProductRows(sheet: ExcelJS.Worksheet): boolean {
  let found = false;

  sheet.eachRow((row, rowNumber) => {
    if (found) return;
    if (cellText(row, 4) !== '款号') return;

    const dataRow = sheet.getRow(rowNumber + 1);
    if (cellText(dataRow, 4)) found = true;
  });

  return found;
}

function findImageSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | null {
  for (const sheetName of PREFERRED_SHEET_NAMES) {
    const sheet = workbook.getWorksheet(sheetName);
    if (sheet && hasProductRows(sheet)) return sheet;
  }

  for (const sheet of workbook.worksheets) {
    if (hasProductRows(sheet)) return sheet;
  }

  return null;
}

function mediaBuffer(media: WorkbookMedia | undefined): Buffer | null {
  if (!media) return null;

  if (Buffer.isBuffer(media.buffer)) return Buffer.from(media.buffer);
  if (media.buffer instanceof Uint8Array) return Buffer.from(media.buffer);
  if (media.buffer instanceof ArrayBuffer) return Buffer.from(media.buffer);
  if (media.base64) return Buffer.from(media.base64, 'base64');

  return null;
}

export async function extractProductImages(
  workbookPath: string,
  outputDir: string,
  requests: ImageAnchorRequest[]
): Promise<Map<string, string>> {
  await fs.mkdir(outputDir, { recursive: true });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);

  const sheet = findImageSheet(workbook);
  const result = new Map<string, string>();
  if (!sheet) return result;

  const styleNumberByRow = new Map(requests.map((request) => [request.sourceRow, request.styleNumber]));
  const mediaById = new Map<string, WorkbookMedia>();

  for (const media of workbook.model.media as unknown as WorkbookMedia[]) {
    if (typeof media.index === 'number' || typeof media.index === 'string') {
      mediaById.set(String(media.index), media);
    }
  }

  for (const image of sheet.getImages()) {
    const topRow = image.range.tl.nativeRow + 1;
    const styleNumber = styleNumberByRow.get(topRow);
    if (!styleNumber) continue;

    const buffer = mediaBuffer(mediaById.get(String(image.imageId)));
    if (!buffer) continue;

    const outputPath = path.join(outputDir, `${safeFileStem(styleNumber)}.png`);
    await fs.writeFile(outputPath, buffer);
    result.set(styleNumber, outputPath);
  }

  return result;
}
