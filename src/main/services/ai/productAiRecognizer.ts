import fs from 'node:fs/promises';
import path from 'node:path';
import { attributesForCategory } from './attributeLibrary';
import { buildProductRecognitionPrompt } from './prompts';
import type { ProductAiResult, ProductRecord } from '../../types';

export interface ChatCompletionInput {
  apiKey: string;
  model: string;
  prompt: string;
  imageDataUrl: string;
}

export interface RecognizeProductWithAiInput {
  product: ProductRecord;
  apiKey: string;
  model: string;
  callChatCompletion: (input: ChatCompletionInput) => Promise<string>;
}

export function extractFirstJsonObject(text: string): unknown | null {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');

  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = inString;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
    }

    if (char === '}') {
      depth -= 1;

      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function emptyResult(
  status: ProductAiResult['status'],
  model: string,
  error = ''
): ProductAiResult {
  return {
    status,
    productName: '',
    title: '',
    subtitle: '',
    attributes: {},
    error,
    model
  };
}

async function imageToDataUrl(imagePath: string): Promise<string> {
  const bytes = await fs.readFile(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';

  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, typeof item === 'string' ? item : String(item)])
  );
}

export async function recognizeProductWithAi(
  input: RecognizeProductWithAiInput
): Promise<ProductAiResult> {
  if (!input.product.imagePath) {
    return emptyResult('skipped', input.model, '缺少商品图片，已跳过 AI 识别');
  }

  const prompt = buildProductRecognitionPrompt({
    category: input.product.systemCategory,
    styleNumber: input.product.styleNumber,
    originalName: input.product.originalName,
    colors: input.product.colors,
    fabricName: input.product.fabricName,
    composition: input.product.composition,
    attributes: attributesForCategory(input.product.systemCategory)
  });

  const raw = await input.callChatCompletion({
    apiKey: input.apiKey,
    model: input.model,
    prompt,
    imageDataUrl: await imageToDataUrl(input.product.imagePath)
  });
  const parsed = extractFirstJsonObject(raw);

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return emptyResult('error', input.model, 'AI 返回不是合法 JSON');
  }

  const data = parsed as Record<string, unknown>;

  return {
    status: 'success',
    productName: typeof data.productName === 'string' ? data.productName : String(data.productName || ''),
    title: typeof data.title === 'string' ? data.title : String(data.title || ''),
    subtitle: typeof data.subtitle === 'string' ? data.subtitle : String(data.subtitle || ''),
    attributes: stringRecord(data.attributes),
    error: '',
    model: input.model
  };
}
