import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';

export interface ImageAnchorRequest {
  styleNumber: string;
  sourceRow: number;
}

interface WorkbookMedia {
  index?: number | string;
  buffer?: unknown;
  base64?: string;
}

function safeFileStem(value: string): string {
  const safe = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim();
  return safe || 'unknown';
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

  const sheet = workbook.getWorksheet('手卡资料');
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
