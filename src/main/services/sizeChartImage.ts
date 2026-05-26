import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { ProductRecord, SizeChartRow } from '../types';

const TITLE_HEIGHT = 64;
const HEADER_HEIGHT = 48;
const ROW_HEIGHT = 46;
const CELL_MIN_WIDTH = 118;
const PADDING_X = 18;
const BORDER_COLOR = '#111111';
const HEADER_FILL = '#fff200';

function safeFileStem(value: string): string {
  const cleaned = value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim();
  return cleaned || '未命名款号';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function collectMeasurementLabels(sizeRows: SizeChartRow[]): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const row of sizeRows) {
    for (const label of Object.keys(row.measurements)) {
      if (seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
    }
  }

  return labels;
}

function estimateCellWidth(header: string, values: string[]): number {
  const longest = [header, ...values].reduce((max, text) => Math.max(max, text.length), 0);
  return Math.max(CELL_MIN_WIDTH, longest * 18 + PADDING_X * 2);
}

function svgCell(input: {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fill?: string;
  color?: string;
  fontSize?: number;
  bold?: boolean;
}): string {
  const text = escapeXml(input.text);
  const fontSize = input.fontSize ?? 20;
  const weight = input.bold ? 700 : 400;
  const fill = input.fill ?? '#ffffff';
  const color = input.color ?? '#111111';
  const textY = input.y + input.height / 2 + fontSize * 0.34;

  return `
    <rect x="${input.x}" y="${input.y}" width="${input.width}" height="${input.height}" fill="${fill}" stroke="${BORDER_COLOR}" stroke-width="2"/>
    <text x="${input.x + input.width / 2}" y="${textY}" text-anchor="middle" font-size="${fontSize}" font-weight="${weight}" fill="${color}">${text}</text>
  `;
}

function buildSizeChartSvg(product: ProductRecord): string {
  const measurementLabels = collectMeasurementLabels(product.sizeRows);
  const headers = ['尺码', '建议体重', '适用身高/体型', ...measurementLabels];
  const bodyRows = product.sizeRows.map((row) => [
    row.size,
    row.suggestedWeight,
    row.bodyType,
    ...measurementLabels.map((label) => row.measurements[label] ?? '')
  ]);

  const columnWidths = headers.map((header, index) =>
    estimateCellWidth(
      header,
      bodyRows.map((row) => row[index] ?? '')
    )
  );
  const width = columnWidths.reduce((total, columnWidth) => total + columnWidth, 0);
  const height = TITLE_HEIGHT + HEADER_HEIGHT + bodyRows.length * ROW_HEIGHT;
  const title = `${product.styleNumber} 尺码表`;
  const subtitle = product.originalName ? ` - ${product.originalName}` : '';

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    text {
      font-family: "Microsoft YaHei", "SimHei", Arial, sans-serif;
      dominant-baseline: auto;
    }
  </style>
  <rect width="100%" height="100%" fill="#ffffff"/>
  <rect x="0" y="0" width="${width}" height="${TITLE_HEIGHT}" fill="${HEADER_FILL}" stroke="${BORDER_COLOR}" stroke-width="2"/>
  <text x="${width / 2}" y="40" text-anchor="middle" font-size="28" font-weight="700" fill="#111111">${escapeXml(title + subtitle)}</text>`;

  let x = 0;
  for (let index = 0; index < headers.length; index += 1) {
    svg += svgCell({
      x,
      y: TITLE_HEIGHT,
      width: columnWidths[index],
      height: HEADER_HEIGHT,
      text: headers[index],
      fill: '#f7f7f7',
      fontSize: 20,
      bold: true
    });
    x += columnWidths[index];
  }

  for (let rowIndex = 0; rowIndex < bodyRows.length; rowIndex += 1) {
    const row = bodyRows[rowIndex];
    x = 0;

    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      svg += svgCell({
        x,
        y: TITLE_HEIGHT + HEADER_HEIGHT + rowIndex * ROW_HEIGHT,
        width: columnWidths[columnIndex],
        height: ROW_HEIGHT,
        text: row[columnIndex] ?? '',
        color: columnIndex >= 3 ? '#e60000' : '#111111',
        fontSize: 19
      });
      x += columnWidths[columnIndex];
    }
  }

  return `${svg}</svg>`;
}

export async function renderSizeChartImage(
  product: ProductRecord,
  outputDir: string
): Promise<string> {
  if (product.sizeRows.length === 0) {
    throw new Error('未解析到尺码表，无法生成尺码表图片');
  }

  await fs.mkdir(outputDir, { recursive: true });

  const imagePath = path.join(outputDir, `${safeFileStem(product.styleNumber)}_尺码表.png`);
  const svg = buildSizeChartSvg(product);

  await sharp(Buffer.from(svg)).png().toFile(imagePath);

  return imagePath;
}
