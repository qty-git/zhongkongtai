# OpenRouter AI MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional OpenRouter vision recognition to the local Zhongkongtai desktop batch workflow, writing AI product name, Douyin title, subtitle, attributes, status, and errors into exports without breaking the existing no-AI path.

**Architecture:** Keep OpenRouter calls in Electron main-process services. The renderer only collects AI settings and triggers IPC; `batchProcessor` orchestrates optional AI recognition after image extraction and size-chart generation, before export. AI services are isolated under `src/main/services/ai/` so prompts, attribute data, HTTP calls, response parsing, and product recognition remain independently testable.

**Tech Stack:** Electron, React, TypeScript, Vite/electron-vite, ExcelJS, Vitest, native `fetch`, Node `fs/promises`.

---

## Scope And Guardrails

- Do not modify `/Users/qiyiyi/Downloads/plus-size-fashion-attribute-extractor`; use it only as reference.
- Do not add Google Gemini, Netlify proxy, hotwords, custom prompt editing, history, single-image upload, model marketplace, or Douyin automation.
- Keep API Key out of logs, workbook exports, thrown error messages, and test snapshots.
- Keep the current no-AI flow working through the whole implementation.
- Keep this implementation in one branch/session unless the user asks otherwise.
- Target commits after each task, but only commit if the user has approved implementation and commit actions.

## File Structure

Create:

- `src/main/services/ai/openRouterClient.ts`: OpenRouter model list, tiny text test, chat completion call, model vision check, error classification.
- `src/main/services/ai/prompts.ts`: One combined Zhongkongtai prompt for attributes, product name, title, and subtitle.
- `src/main/services/ai/attributeLibrary.ts`: Local static attribute library migrated from the old web tool.
- `src/main/services/ai/productAiRecognizer.ts`: Build product recognition input, read image as data URL, parse AI JSON, return `ProductAiResult`.
- `tests/unit/openRouterClient.test.ts`: Error classification and model capability tests.
- `tests/unit/productAiRecognizer.test.ts`: JSON extraction, malformed response, skip/error behavior around product recognition.

Modify:

- `src/main/types.ts`: Add `ProductAiResult`, `AiBatchConfig`, and `'ai'` progress stage.
- `src/main/services/batchProcessor.ts`: Rename input/result types to support optional AI while preserving `processBatchWithoutAi`; add AI stage.
- `src/main/services/exportWorkbook.ts`: Add AI columns to `商品总表` and `上架任务表`.
- `src/main/ipc.ts`: Validate AI config, add `ai:test-connection`, add batch handler that accepts optional AI.
- `src/main/preload.ts`: Expose `testAiConnection` and `processBatch`; keep `processWithoutAi` compatibility.
- `src/renderer/types.ts`: Add AI config, connection test result, `'ai'` progress stage, and new API methods.
- `src/renderer/App.tsx`: Add compact AI config UI, test button, validation, and process call with optional AI settings.
- `tests/unit/exportWorkbook.test.ts`: Assert AI export columns and values.
- `tests/unit/batchProcessor.test.ts`: Assert no-AI path remains unchanged and AI stage behavior works with an injected recognizer.

---

### Task 1: Add Shared AI Types

**Files:**
- Modify: `src/main/types.ts`
- Modify: `src/renderer/types.ts`

- [ ] **Step 1: Write the main-process types**

In `src/main/types.ts`, add:

```ts
export type AiRecognitionStatus = 'pending' | 'success' | 'skipped' | 'error';

export interface ProductAiResult {
  status: AiRecognitionStatus;
  productName: string;
  title: string;
  subtitle: string;
  attributes: Record<string, string>;
  error: string;
  model: string;
}

export interface AiBatchConfig {
  enabled: boolean;
  apiKey: string;
  model: string;
}
```

Add `aiResult?: ProductAiResult;` to `ProductRecord`.

Change `BatchProgress.stage` to:

```ts
stage: 'idle' | 'scan' | 'parse' | 'image' | 'size-chart' | 'ai' | 'export' | 'done' | 'error';
```

- [ ] **Step 2: Mirror renderer-facing types**

In `src/renderer/types.ts`, add:

```ts
export interface AiConfigView {
  enabled: boolean;
  apiKey: string;
  model: string;
}

export interface AiConnectionTestResultView {
  ok: boolean;
  modelExists: boolean;
  supportsVision: boolean;
  textGenerationOk: boolean;
  warning?: string;
  error?: string;
  errorType?: 'api_key' | 'model_missing' | 'vision_unsupported' | 'quota' | 'rate_limit' | 'provider' | 'network' | 'unknown';
}
```

Change `BatchProgressView.stage` to:

```ts
stage: 'idle' | 'scan' | 'parse' | 'image' | 'size-chart' | 'ai' | 'export' | 'done' | 'error';
```

Add these methods to `Window.zhongkongtai`:

```ts
processBatch: (input: {
  styleNumberText: string;
  workbookPaths: string[];
  workbookDirectory?: string;
  outputDir: string;
  ai?: AiConfigView;
}) => Promise<BatchResultView>;
testAiConnection: (input: AiConfigView) => Promise<AiConnectionTestResultView>;
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: FAIL until later tasks wire the new renderer API, or PASS if only passive type exports are added.

- [ ] **Step 4: Commit after implementation approval**

Run only after the user approves git commits:

```bash
git add src/main/types.ts src/renderer/types.ts
git commit -m "feat: add ai batch types"
```

---

### Task 2: Add OpenRouter Client

**Files:**
- Create: `src/main/services/ai/openRouterClient.ts`
- Test: `tests/unit/openRouterClient.test.ts`

- [ ] **Step 1: Write failing client tests**

Create `tests/unit/openRouterClient.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  classifyOpenRouterError,
  modelSupportsVision,
  testOpenRouterConnection
} from '../../src/main/services/ai/openRouterClient';

describe('classifyOpenRouterError', () => {
  it.each([
    [401, 'invalid_api_key', 'api_key'],
    [403, 'forbidden', 'api_key'],
    [402, 'insufficient credits', 'quota'],
    [404, 'model not found', 'model_missing'],
    [429, 'rate limit', 'rate_limit'],
    [503, 'provider unavailable', 'provider'],
    [0, 'fetch failed', 'network']
  ])('maps %s %s to %s', (status, message, expected) => {
    expect(classifyOpenRouterError({ status, message }).type).toBe(expected);
  });
});

describe('modelSupportsVision', () => {
  it('checks input modalities for image support', () => {
    expect(modelSupportsVision({ id: 'vision-model', architecture: { input_modalities: ['text', 'image'] } })).toBe(true);
    expect(modelSupportsVision({ id: 'text-model', architecture: { input_modalities: ['text'] } })).toBe(false);
  });
});

describe('testOpenRouterConnection', () => {
  it('checks model list and tiny text generation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'openai/gpt-4o-mini', architecture: { input_modalities: ['text', 'image'] } }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'OK' } }] })
      });

    const result = await testOpenRouterConnection({
      apiKey: 'secret',
      model: 'openai/gpt-4o-mini',
      fetchImpl: fetchMock
    });

    expect(result).toMatchObject({
      ok: true,
      modelExists: true,
      supportsVision: true,
      textGenerationOk: true
    });
    expect(String(fetchMock.mock.calls[1][1].body)).toContain('"max_tokens":5');
    expect(String(fetchMock.mock.calls[1][1].body)).not.toContain('data:image');
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm run test -- tests/unit/openRouterClient.test.ts`

Expected: FAIL with missing module `openRouterClient`.

- [ ] **Step 3: Implement the client**

Create `src/main/services/ai/openRouterClient.ts`:

```ts
export type AiConnectionErrorType =
  | 'api_key'
  | 'model_missing'
  | 'vision_unsupported'
  | 'quota'
  | 'rate_limit'
  | 'provider'
  | 'network'
  | 'unknown';

export interface AiConnectionTestResult {
  ok: boolean;
  modelExists: boolean;
  supportsVision: boolean;
  textGenerationOk: boolean;
  warning?: string;
  error?: string;
  errorType?: AiConnectionErrorType;
}

export interface OpenRouterModel {
  id: string;
  architecture?: {
    input_modalities?: string[];
  };
}

export interface OpenRouterErrorInput {
  status?: number;
  message?: string;
}

export interface TestOpenRouterConnectionInput {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export function classifyOpenRouterError(input: OpenRouterErrorInput): { type: AiConnectionErrorType; message: string } {
  const status = input.status ?? 0;
  const lower = (input.message || '').toLowerCase();

  if (status === 401 || status === 403 || lower.includes('invalid_api_key')) return { type: 'api_key', message: 'API Key 无效' };
  if (status === 402 || lower.includes('credit') || lower.includes('quota') || lower.includes('balance')) return { type: 'quota', message: '余额不足或额度不可用' };
  if (status === 404 || lower.includes('model not found')) return { type: 'model_missing', message: '模型不存在或已下线' };
  if (status === 429 || lower.includes('rate limit')) return { type: 'rate_limit', message: '请求频率限制' };
  if (lower.includes('provider') || status === 503) return { type: 'provider', message: '当前模型供应商不可用' };
  if (status === 0 || lower.includes('fetch') || lower.includes('network') || lower.includes('timeout')) return { type: 'network', message: '网络连接失败' };

  return { type: 'unknown', message: input.message || 'AI 调用失败' };
}

export function modelSupportsVision(model: OpenRouterModel): boolean {
  return Boolean(model.architecture?.input_modalities?.includes('image'));
}

async function readError(response: Response): Promise<{ type: AiConnectionErrorType; message: string }> {
  const data = await response.json().catch(() => ({}));
  const message = String(data?.error?.message || data?.error || response.statusText || '');
  return classifyOpenRouterError({ status: response.status, message });
}

export async function testOpenRouterConnection(input: TestOpenRouterConnectionInput): Promise<AiConnectionTestResult> {
  const fetcher = input.fetchImpl || fetch;
  const headers = { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' };

  try {
    const modelsResponse = await fetcher(`${OPENROUTER_BASE_URL}/models`, { headers });
    if (!modelsResponse.ok) {
      const error = await readError(modelsResponse);
      return { ok: false, modelExists: false, supportsVision: false, textGenerationOk: false, error: error.message, errorType: error.type };
    }

    const modelsData = await modelsResponse.json();
    const models = Array.isArray(modelsData?.data) ? modelsData.data as OpenRouterModel[] : [];
    const model = models.find((item) => item.id === input.model);
    if (!model) {
      return { ok: false, modelExists: false, supportsVision: false, textGenerationOk: false, error: '模型不存在或已下线', errorType: 'model_missing' };
    }

    const supportsVision = modelSupportsVision(model);
    if (!supportsVision) {
      return { ok: false, modelExists: true, supportsVision: false, textGenerationOk: false, error: '模型不支持图片输入', errorType: 'vision_unsupported' };
    }

    const textResponse = await fetcher(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: input.model,
        messages: [{ role: 'user', content: '只返回 OK' }],
        max_tokens: 5
      })
    });

    if (!textResponse.ok) {
      const error = await readError(textResponse);
      return { ok: false, modelExists: true, supportsVision: true, textGenerationOk: false, error: error.message, errorType: error.type };
    }

    return { ok: true, modelExists: true, supportsVision: true, textGenerationOk: true };
  } catch (error) {
    const classified = classifyOpenRouterError({ status: 0, message: error instanceof Error ? error.message : String(error) });
    return { ok: false, modelExists: false, supportsVision: false, textGenerationOk: false, error: classified.message, errorType: classified.type };
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- tests/unit/openRouterClient.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit after implementation approval**

Run only after the user approves git commits:

```bash
git add src/main/services/ai/openRouterClient.ts tests/unit/openRouterClient.test.ts
git commit -m "feat: add openrouter client"
```

---

### Task 3: Add Prompt And Attribute Library

**Files:**
- Create: `src/main/services/ai/prompts.ts`
- Create: `src/main/services/ai/attributeLibrary.ts`

- [ ] **Step 1: Create the combined prompt**

Create `src/main/services/ai/prompts.ts`:

```ts
export interface AttributeDefinition {
  category: string;
  attribute: string;
  options: string[];
}

export interface BuildProductPromptInput {
  category: string;
  styleNumber: string;
  originalName: string;
  colors: string[];
  fabricName: string;
  composition: string;
  attributes: AttributeDefinition[];
}

function formatAttributes(attributes: AttributeDefinition[]): string {
  if (attributes.length === 0) return '当前类目暂无可选属性，请只根据图片和商品资料生成标题、商品名和可判断属性。';

  return attributes
    .map((item) => `${item.attribute}: [${item.options.join(', ')}]`)
    .join('\n');
}

export function buildProductRecognitionPrompt(input: BuildProductPromptInput): string {
  return `你是专业的大码女装抖音上架助手。
请根据商品图片和资料，一次性输出商品名、抖音主标题、副标题和属性。

商品资料：
- 款号：${input.styleNumber}
- 类目：${input.category || '未知'}
- 原始名称：${input.originalName || '无'}
- 颜色：${input.colors.join('/') || '无'}
- 面料名称：${input.fabricName || '无'}
- 成分：${input.composition || '无'}

属性选项：
${formatAttributes(input.attributes)}

规则：
1. 只输出合法 JSON，不要 Markdown，不要解释。
2. attributes 只能使用属性选项里的属性名；有选项的属性只能从选项中选择。
3. 主标题 23 到 25 个汉字，无标点、无空格、无英文数字。
4. 副标题 10 到 12 个汉字，无标点、无空格。
5. 商品名自然好记，不要包含款号。
6. 不确定的属性可以不返回，不要编造不可见细节。

输出 JSON：
{
  "productName": "",
  "title": "",
  "subtitle": "",
  "attributes": {
    "属性名": "属性值"
  }
}`;
}
```

- [ ] **Step 2: Migrate the attribute library**

Create `src/main/services/ai/attributeLibrary.ts` by copying `DEFAULT_ATTRIBUTE_LIBRARY` from:

`/Users/qiyiyi/Downloads/plus-size-fashion-attribute-extractor/src/data/attributeLibrary.ts`

Use this target shape:

```ts
import type { AttributeDefinition } from './prompts';

export const DEFAULT_ATTRIBUTE_LIBRARY: AttributeDefinition[] = [
  { category: '大码半身裙', attribute: '品牌', options: ['无品牌'] }
];

export function attributesForCategory(category: string): AttributeDefinition[] {
  const normalized = category.trim();
  return DEFAULT_ATTRIBUTE_LIBRARY.filter((item) => item.category === normalized);
}
```

Replace the sample array with the full copied array. Do not edit the old web project.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS after imports are valid.

- [ ] **Step 4: Commit after implementation approval**

Run only after the user approves git commits:

```bash
git add src/main/services/ai/prompts.ts src/main/services/ai/attributeLibrary.ts
git commit -m "feat: add ai prompts and attributes"
```

---

### Task 4: Add Product AI Recognizer

**Files:**
- Create: `src/main/services/ai/productAiRecognizer.ts`
- Test: `tests/unit/productAiRecognizer.test.ts`

- [ ] **Step 1: Write recognizer tests**

Create `tests/unit/productAiRecognizer.test.ts`:

```ts
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

describe('extractFirstJsonObject', () => {
  it('parses plain and markdown-wrapped JSON', () => {
    expect(extractFirstJsonObject('{"title":"A"}')).toEqual({ title: 'A' });
    expect(extractFirstJsonObject('```json\n{"title":"B"}\n```')).toEqual({ title: 'B' });
  });

  it('returns null for invalid JSON', () => {
    expect(extractFirstJsonObject('not json')).toBeNull();
  });
});

describe('recognizeProductWithAi', () => {
  it('skips products without an image', async () => {
    const result = await recognizeProductWithAi({
      product: product(),
      apiKey: 'secret',
      model: 'vision-model',
      callChatCompletion: vi.fn()
    });

    expect(result.status).toBe('skipped');
    expect(result.error).toBe('缺少商品图片，已跳过 AI 识别');
  });

  it('returns success from model JSON', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'zk-ai-'));
    const imagePath = path.join(dir, '24324.png');
    await fs.writeFile(imagePath, Buffer.from('png'));
    const callChatCompletion = vi.fn().mockResolvedValue('{"productName":"云朵小衫","title":"宽松显瘦遮肉圆领短袖上衣","subtitle":"微胖穿上很显瘦","attributes":{"品牌":"无品牌"}}');

    const result = await recognizeProductWithAi({
      product: product({ imagePath }),
      apiKey: 'secret',
      model: 'vision-model',
      callChatCompletion
    });

    expect(result).toMatchObject({
      status: 'success',
      productName: '云朵小衫',
      model: 'vision-model'
    });
    expect(callChatCompletion.mock.calls[0][0].imageDataUrl).toContain('data:image/png;base64,');
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm run test -- tests/unit/productAiRecognizer.test.ts`

Expected: FAIL with missing module `productAiRecognizer`.

- [ ] **Step 3: Implement recognizer**

Create `src/main/services/ai/productAiRecognizer.ts`:

```ts
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
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function emptyResult(status: ProductAiResult['status'], model: string, error = ''): ProductAiResult {
  return { status, productName: '', title: '', subtitle: '', attributes: {}, error, model };
}

async function imageToDataUrl(imagePath: string): Promise<string> {
  const bytes = await fs.readFile(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

export async function recognizeProductWithAi(input: RecognizeProductWithAiInput): Promise<ProductAiResult> {
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

  if (!parsed || typeof parsed !== 'object') {
    return emptyResult('error', input.model, 'AI 返回不是合法 JSON');
  }

  const data = parsed as Record<string, unknown>;
  const attributes = data.attributes && typeof data.attributes === 'object' && !Array.isArray(data.attributes)
    ? data.attributes as Record<string, string>
    : {};

  return {
    status: 'success',
    productName: String(data.productName || ''),
    title: String(data.title || ''),
    subtitle: String(data.subtitle || ''),
    attributes,
    error: '',
    model: input.model
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- tests/unit/productAiRecognizer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit after implementation approval**

Run only after the user approves git commits:

```bash
git add src/main/services/ai/productAiRecognizer.ts tests/unit/productAiRecognizer.test.ts
git commit -m "feat: add product ai recognizer"
```

---

### Task 5: Connect AI Stage To Batch Processing

**Files:**
- Modify: `src/main/services/batchProcessor.ts`
- Modify: `src/main/types.ts`
- Test: `tests/unit/batchProcessor.test.ts`

- [ ] **Step 1: Add batch processor tests**

Extend `tests/unit/batchProcessor.test.ts` with injectable recognizer coverage:

```ts
import type { ProductAiResult, ProductRecord } from '../../src/main/types';

const successfulAiResult: ProductAiResult = {
  status: 'success',
  productName: '云朵小衫',
  title: '宽松显瘦遮肉圆领短袖上衣',
  subtitle: '微胖穿上很显瘦',
  attributes: { 品牌: '无品牌' },
  error: '',
  model: 'vision-model'
};

runIfFixture('does not call ai recognizer when ai is disabled', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-batch-no-ai-'));
  const recognizeProduct = vi.fn();

  await processBatch({
    styleNumberText: '24324',
    workbookPaths: [fixture],
    outputDir,
    ai: { enabled: false, apiKey: '', model: '' },
    recognizeProduct
  });

  expect(recognizeProduct).not.toHaveBeenCalled();
});

runIfFixture('runs ai stage and stores successful results', async () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-batch-ai-'));
  const progressEvents: BatchProgress[] = [];
  const recognizeProduct = vi.fn(async (_product: ProductRecord) => successfulAiResult);

  const result = await processBatch({
    styleNumberText: '24324',
    workbookPaths: [fixture],
    outputDir,
    ai: { enabled: true, apiKey: 'secret', model: 'vision-model' },
    onProgress: (progress) => progressEvents.push(progress),
    recognizeProduct
  });

  expect(result.rows[0].product?.aiResult).toEqual(successfulAiResult);
  expect(progressEvents.map((event) => event.stage)).toContain('ai');
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm run test -- tests/unit/batchProcessor.test.ts`

Expected: FAIL with missing `processBatch` export and missing injectable recognizer input.

- [ ] **Step 3: Refactor processor input and result types**

In `src/main/services/batchProcessor.ts`, replace `ProcessBatchWithoutAiInput` with a generic input while keeping compatibility:

```ts
import { recognizeProductWithAi } from './ai/productAiRecognizer';
import type { AiBatchConfig, BatchProgress, BatchRow, ProductAiResult, ProductRecord } from '../types';

export interface ProcessBatchInput {
  styleNumberText: string;
  workbookPaths: string[];
  workbookDirectory?: string;
  outputDir: string;
  ai?: AiBatchConfig;
  onProgress?: (progress: BatchProgress) => void;
  recognizeProduct?: (product: ProductRecord) => Promise<ProductAiResult>;
}

export interface ProcessBatchResult {
  rows: BatchRow[];
  workbookPath: string;
  logPath: string;
  scannedWorkbookPaths: string[];
}

export type ProcessBatchWithoutAiInput = Omit<ProcessBatchInput, 'ai' | 'recognizeProduct'>;
export type ProcessBatchWithoutAiResult = ProcessBatchResult;
```

Change helper signatures from `ProcessBatchWithoutAiInput` to `ProcessBatchInput`.

- [ ] **Step 4: Add the AI stage after size chart generation**

Before building `rows`, add:

```ts
  const aiEnabled = Boolean(input.ai?.enabled);
  if (aiEnabled) {
    log.info(`AI 识别开始，共 ${products.length} 个商品`);

    for (let index = 0; index < products.length; index += 1) {
      const product = products[index];
      emitProgress(input, {
        stage: 'ai',
        message: `正在 AI 识别：${product.styleNumber}`,
        current: index + 1,
        total: products.length,
        styleNumber: product.styleNumber
      });

      try {
        const recognize = input.recognizeProduct || ((item: ProductRecord) =>
          recognizeProductWithAi({
            product: item,
            apiKey: input.ai?.apiKey || '',
            model: input.ai?.model || '',
            callChatCompletion: callOpenRouterVision
          }));
        product.aiResult = await recognize(product);

        if (product.aiResult.status === 'success') {
          log.info('AI 识别完成', product.styleNumber);
        } else if (product.aiResult.status === 'skipped') {
          product.warnings.push(product.aiResult.error);
          log.warning(product.aiResult.error, product.styleNumber);
        } else {
          product.warnings.push(`AI识别失败：${product.aiResult.error}`);
          log.error(`AI识别失败：${product.aiResult.error}`, product.styleNumber);
        }
      } catch (error) {
        const message = errorMessage(error);
        product.aiResult = {
          status: 'error',
          productName: '',
          title: '',
          subtitle: '',
          attributes: {},
          error: message,
          model: input.ai?.model || ''
        };
        product.warnings.push(`AI识别失败：${message}`);
        log.error(`AI识别失败：${message}`, product.styleNumber);
      }
    }
  }
```

Add `callOpenRouterVision` to `openRouterClient.ts` in Task 2 implementation if it does not exist yet:

```ts
export async function callOpenRouterVision(input: ChatCompletionInput): Promise<string> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      messages: [{ role: 'user', content: [
        { type: 'text', text: input.prompt },
        { type: 'image_url', image_url: { url: input.imageDataUrl } }
      ] }],
      temperature: 0.2
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(classifyOpenRouterError({ status: response.status, message: String(data?.error?.message || data?.error || response.statusText) }).message);
  return String(data?.choices?.[0]?.message?.content || '');
}
```

- [ ] **Step 5: Export processBatch and compatibility wrapper**

Rename the main function to `processBatch(input: ProcessBatchInput)`. Add wrapper:

```ts
export async function processBatchWithoutAi(input: ProcessBatchWithoutAiInput): Promise<ProcessBatchWithoutAiResult> {
  return processBatch({ ...input, ai: { enabled: false, apiKey: '', model: '' } });
}
```

- [ ] **Step 6: Run tests**

Run: `npm run test -- tests/unit/batchProcessor.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit after implementation approval**

Run only after the user approves git commits:

```bash
git add src/main/services/batchProcessor.ts src/main/services/ai/openRouterClient.ts tests/unit/batchProcessor.test.ts
git commit -m "feat: run ai during batch processing"
```

---

### Task 6: Export AI Fields

**Files:**
- Modify: `src/main/services/exportWorkbook.ts`
- Test: `tests/unit/exportWorkbook.test.ts`

- [ ] **Step 1: Add export test assertions**

In `tests/unit/exportWorkbook.test.ts`, add `aiResult` to the fixture product:

```ts
aiResult: {
  status: 'success',
  productName: '云朵小衫',
  title: '宽松显瘦遮肉圆领短袖上衣',
  subtitle: '微胖穿上很显瘦',
  attributes: { 品牌: '无品牌', 风格: '甜美风' },
  error: '',
  model: 'vision-model'
},
```

Add assertions after reading the workbook:

```ts
const taskSheet = workbook.getWorksheet('上架任务表');
expect(taskSheet?.getRow(1).values).toContain('AI识别状态');
expect(taskSheet?.getRow(1).values).toContain('AI属性JSON');
expect(taskSheet?.getCell('T2').value).toBe('成功');
expect(taskSheet?.getCell('U2').value).toBe('云朵小衫');
expect(String(taskSheet?.getCell('X2').value)).toContain('"品牌":"无品牌"');
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm run test -- tests/unit/exportWorkbook.test.ts`

Expected: FAIL because AI columns are missing.

- [ ] **Step 3: Add AI field helpers**

In `src/main/services/exportWorkbook.ts`, add:

```ts
function aiStatusLabel(product: ProductRecord): string {
  if (!product.aiResult) return '未启用';
  if (product.aiResult.status === 'success') return '成功';
  if (product.aiResult.status === 'skipped') return '跳过';
  if (product.aiResult.status === 'error') return '失败';
  return '待处理';
}

function aiAttributesJson(product: ProductRecord): string {
  return product.aiResult ? JSON.stringify(product.aiResult.attributes) : '';
}

function aiError(product: ProductRecord): string {
  return product.aiResult?.error || '';
}
```

- [ ] **Step 4: Append AI headers and row values**

Append these headers to both `商品总表` and `上架任务表`:

```ts
'AI识别状态',
'AI商品名',
'AI抖音主标题',
'AI副标题',
'AI属性JSON',
'AI识别错误'
```

Append these values to each product row:

```ts
aiStatusLabel(product),
product.aiResult?.productName || '',
product.aiResult?.title || '',
product.aiResult?.subtitle || '',
aiAttributesJson(product),
aiError(product)
```

For `上架任务表`, existing columns A-S remain unchanged; AI columns become T-Y.

- [ ] **Step 5: Run tests**

Run: `npm run test -- tests/unit/exportWorkbook.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit after implementation approval**

Run only after the user approves git commits:

```bash
git add src/main/services/exportWorkbook.ts tests/unit/exportWorkbook.test.ts
git commit -m "feat: export ai result fields"
```

---

### Task 7: Add IPC, Preload, And Renderer AI Controls

**Files:**
- Modify: `src/main/ipc.ts`
- Modify: `src/main/preload.ts`
- Modify: `src/renderer/types.ts`
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Add IPC validation and handlers**

In `src/main/ipc.ts`, import:

```ts
import { testOpenRouterConnection } from './services/ai/openRouterClient';
import { processBatch } from './services/batchProcessor';
import type { AiBatchConfig } from './types';
import type { ProcessBatchInput } from './services/batchProcessor';
```

Add:

```ts
function isAiConfig(value: unknown): value is AiBatchConfig {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<AiBatchConfig>;
  return (
    typeof config.enabled === 'boolean' &&
    typeof config.apiKey === 'string' &&
    typeof config.model === 'string'
  );
}

function isProcessBatchInput(value: unknown): value is ProcessBatchInput {
  if (!isProcessInput(value)) return false;
  const input = value as Partial<ProcessBatchInput>;
  return input.ai === undefined || isAiConfig(input.ai);
}
```

Register:

```ts
ipcMain.handle('ai:test-connection', async (_event, input: unknown) => {
  if (!isAiConfig(input) || !input.apiKey.trim() || !input.model.trim()) {
    throw new Error('AI 配置不完整');
  }

  return testOpenRouterConnection({
    apiKey: input.apiKey,
    model: input.model
  });
});

ipcMain.handle('batch:process', async (event, input: unknown) => {
  if (!isProcessBatchInput(input)) {
    throw new Error('批次处理参数不完整');
  }

  if (input.ai?.enabled && (!input.ai.apiKey.trim() || !input.ai.model.trim())) {
    throw new Error('启用 AI 时必须填写 API Key 和模型 ID');
  }

  return processBatch({
    styleNumberText: input.styleNumberText,
    workbookPaths: input.workbookPaths,
    workbookDirectory: input.workbookDirectory,
    outputDir: input.outputDir,
    ai: input.ai,
    onProgress: (progress) => event.sender.send('batch:progress', progress)
  });
});
```

Keep `batch:process-without-ai` for compatibility.

- [ ] **Step 2: Expose preload methods**

In `src/main/preload.ts`, expose:

```ts
processBatch: (input: ProcessBatchInput): Promise<ProcessBatchResult> =>
  ipcRenderer.invoke('batch:process', input),
testAiConnection: (input: AiBatchConfig): Promise<AiConnectionTestResult> =>
  ipcRenderer.invoke('ai:test-connection', input),
```

Keep `processWithoutAi` unchanged.

- [ ] **Step 3: Add renderer state**

In `src/renderer/App.tsx`, add state near existing state hooks:

```ts
const [aiEnabled, setAiEnabled] = useState(false);
const [aiApiKey, setAiApiKey] = useState('');
const [aiModel, setAiModel] = useState('');
const [testingAi, setTestingAi] = useState(false);
const [aiTestStatus, setAiTestStatus] = useState('');
```

Update `canRun` so enabled AI requires both fields:

```ts
const aiReady = !aiEnabled || Boolean(aiApiKey.trim() && aiModel.trim());
```

Include `aiReady` in `canRun`.

- [ ] **Step 4: Add test connection action**

Add:

```ts
const testAiConnection = async () => {
  setError('');
  setAiTestStatus('');
  setTestingAi(true);

  try {
    if (!window.zhongkongtai?.testAiConnection) {
      throw new Error('AI 测试接口未加载，请下载最新版本后重试');
    }

    const result = await window.zhongkongtai.testAiConnection({
      enabled: true,
      apiKey: aiApiKey,
      model: aiModel
    });
    setAiTestStatus(result.ok ? '连接成功，模型支持图片输入' : result.error || '连接失败');
  } catch (err) {
    setAiTestStatus(err instanceof Error ? err.message : String(err));
  } finally {
    setTestingAi(false);
  }
};
```

- [ ] **Step 5: Call the new batch API**

In `run`, replace the processing call with:

```ts
const process = window.zhongkongtai.processBatch || window.zhongkongtai.processWithoutAi;
const result = await process({
  styleNumberText,
  workbookPaths,
  workbookDirectory,
  outputDir,
  ai: {
    enabled: aiEnabled,
    apiKey: aiApiKey,
    model: aiModel
  }
});
```

- [ ] **Step 6: Add compact AI config UI**

Insert a white bordered block between 输出目录 and 开始处理:

```tsx
<div className="rounded-md border border-slate-200 bg-white p-4">
  <div className="mb-3 flex items-center justify-between gap-3">
    <h2 className="text-sm font-semibold">AI 配置</h2>
    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={aiEnabled}
        onChange={(event) => setAiEnabled(event.target.checked)}
        disabled={running}
      />
      启用 AI 识别
    </label>
  </div>
  <div className="space-y-2">
    <input
      type="password"
      value={aiApiKey}
      onChange={(event) => setAiApiKey(event.target.value)}
      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
      placeholder="OpenRouter API Key"
    />
    <input
      type="text"
      value={aiModel}
      onChange={(event) => setAiModel(event.target.value)}
      className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
      placeholder="OpenRouter 模型 ID"
    />
    <button
      type="button"
      onClick={testAiConnection}
      disabled={testingAi || !aiApiKey.trim() || !aiModel.trim()}
      className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-800 ring-1 ring-slate-300 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
    >
      {testingAi ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
      测试连接
    </button>
    {aiTestStatus && <div className="text-xs leading-5 text-slate-600">{aiTestStatus}</div>}
  </div>
</div>
```

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 8: Commit after implementation approval**

Run only after the user approves git commits:

```bash
git add src/main/ipc.ts src/main/preload.ts src/renderer/types.ts src/renderer/App.tsx
git commit -m "feat: add ai configuration ui"
```

---

### Task 8: Final Verification

**Files:**
- Verify: all files touched by Tasks 1-7

- [ ] **Step 1: Run unit tests**

Run: `npm run test`

Expected: PASS. Existing fixture-dependent tests may skip if `tests/fixtures/handcard-sample.xlsx` is absent.

- [ ] **Step 2: Run build**

Run: `npm run build`

Expected: PASS, including renderer and main-process typechecks.

- [ ] **Step 3: Manual no-AI smoke test**

Run the app with `npm run dev`, leave AI disabled, process a known workbook, and verify:

- Output workbook is created.
- Images and size chart images are still generated.
- Logs contain no AI call attempt.
- `上架任务表` AI status is `未启用`.

- [ ] **Step 4: Manual AI validation**

With a valid OpenRouter key and a vision model:

- `测试连接` returns success without uploading an image.
- Batch progress shows `ai`.
- A product with `images/款号.png` gets AI fields in `上架任务表`.
- A product without image is marked `跳过`.
- API Key does not appear in the log or workbook.

- [ ] **Step 5: Check old project untouched**

Run:

```bash
git -C /Users/qiyiyi/Downloads/plus-size-fashion-attribute-extractor status --short
```

Expected: no changes caused by this implementation.

- [ ] **Step 6: Final git review**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intended Zhongkongtai files are changed.

---

## Plan Self-Review

- Spec coverage: Tasks 1-8 cover AI config, local OpenRouter calls, two-step test, AI batch stage, export fields, logs/errors, tests, and old-project isolation.
- Placeholder scan: No `TBD`, `TODO`, omitted tasks, or intentionally vague implementation steps.
- Type consistency: `AiBatchConfig`, `ProductAiResult`, `ProcessBatchInput`, `AiConnectionTestResult`, `processBatch`, and `testAiConnection` are named consistently across main, preload, renderer, and tests.

Plan complete and saved to `docs/superpowers/plans/2026-06-03-openrouter-ai-mvp.md`.

Execution options:

1. Subagent-Driven (recommended): dispatch a fresh subagent per task and review between tasks.
2. Inline Execution: execute tasks in this session with checkpoints.
