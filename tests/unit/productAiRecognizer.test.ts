import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  extractFirstJsonObject,
  recognizeProductWithAi
} from '../../src/main/services/ai/productAiRecognizer';
import type { ProductRecord } from '../../src/main/types';

function product(overrides: Partial<ProductRecord> = {}): ProductRecord {
  return {
    styleNumber: '24324',
    supplier: '大女孩',
    brand: '梦丞',
    systemCategory: '大码T恤',
    colors: ['白色'],
    originalName: '圆领短袖T恤',
    taxPrice: 10,
    companyPrice: 20,
    finalStorePrice: 30,
    fabricName: '针织',
    composition: '棉',
    sourceFile: '/tmp/source.xlsx',
    sourceSheet: '手卡资料',
    sourceRow: 3,
    skuItems: [],
    sizeRows: [],
    warnings: [],
    ...overrides
  };
}

async function writeTempImage(extension = '.png'): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zk-ai-'));
  const imagePath = path.join(dir, `24324${extension}`);
  await fs.writeFile(imagePath, Buffer.from('image-bytes'));

  return imagePath;
}

describe('extractFirstJsonObject', () => {
  it('parses plain and markdown-wrapped JSON', () => {
    expect(extractFirstJsonObject('{"title":"A"}')).toEqual({ title: 'A' });
    expect(extractFirstJsonObject('```json\n{"title":"B"}\n```')).toEqual({ title: 'B' });
  });

  it('returns null for invalid JSON', () => {
    expect(extractFirstJsonObject('not json')).toBeNull();
    expect(extractFirstJsonObject('```json\n{"title":\n```')).toBeNull();
  });
});

describe('recognizeProductWithAi', () => {
  it('skips products without an image', async () => {
    const callChatCompletion = vi.fn();
    const result = await recognizeProductWithAi({
      product: product(),
      apiKey: 'secret',
      model: 'vision-model',
      callChatCompletion
    });

    expect(result).toEqual({
      status: 'skipped',
      productName: '',
      title: '',
      subtitle: '',
      attributes: {},
      error: '缺少商品图片，已跳过 AI 识别',
      model: 'vision-model'
    });
    expect(callChatCompletion).not.toHaveBeenCalled();
  });

  it('returns an error when model content is not valid JSON', async () => {
    const imagePath = await writeTempImage();
    const result = await recognizeProductWithAi({
      product: product({ imagePath }),
      apiKey: 'secret',
      model: 'vision-model',
      callChatCompletion: vi.fn().mockResolvedValue('not json')
    });

    expect(result).toMatchObject({
      status: 'error',
      error: 'AI 返回不是合法 JSON',
      model: 'vision-model'
    });
  });

  it('maps successful model JSON and passes image prompt input', async () => {
    const imagePath = await writeTempImage('.jpg');
    const callChatCompletion = vi.fn().mockResolvedValue(
      JSON.stringify({
        productName: '云朵小衫',
        title: '宽松显瘦圆领短袖上衣',
        subtitle: '微胖穿上显瘦',
        attributes: { 品牌: '无品牌', 袖长: '短袖' }
      })
    );

    const result = await recognizeProductWithAi({
      product: product({ imagePath }),
      apiKey: 'secret',
      model: 'vision-model',
      callChatCompletion
    });

    expect(result).toEqual({
      status: 'success',
      productName: '云朵小衫',
      title: '宽松显瘦圆领短袖上衣',
      subtitle: '微胖穿上显瘦',
      attributes: { 品牌: '无品牌', 袖长: '短袖' },
      error: '',
      model: 'vision-model'
    });
    expect(callChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'secret',
        model: 'vision-model',
        imageDataUrl: expect.stringContaining('data:image/jpeg;base64,')
      })
    );
    expect(callChatCompletion.mock.calls[0][0].prompt).toContain('款号：24324');
    expect(callChatCompletion.mock.calls[0][0].prompt).toContain('品牌: [无品牌]');
  });
});
