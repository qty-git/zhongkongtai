import type { ChatCompletionInput } from './productAiRecognizer';

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

function sanitizeErrorMessage(message: string): string {
  return message
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, '[redacted-api-key]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted-api-key]')
    .replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\r\n]+/gi, '[redacted-image]');
}

export function classifyOpenRouterError(input: OpenRouterErrorInput): {
  type: AiConnectionErrorType;
  message: string;
} {
  const status = input.status ?? 0;
  const safeMessage = sanitizeErrorMessage(input.message || '');
  const lower = safeMessage.toLowerCase();

  if (status === 401 || status === 403 || lower.includes('invalid_api_key')) {
    return { type: 'api_key', message: 'API Key 无效' };
  }

  if (
    status === 402 ||
    lower.includes('credit') ||
    lower.includes('quota') ||
    lower.includes('balance')
  ) {
    return { type: 'quota', message: '余额不足或额度不可用' };
  }

  if (status === 404 || lower.includes('model not found')) {
    return { type: 'model_missing', message: '模型不存在或已下线' };
  }

  if (status === 429 || lower.includes('rate limit')) {
    return { type: 'rate_limit', message: '请求频率限制' };
  }

  if (status === 503 || lower.includes('provider')) {
    return { type: 'provider', message: '当前模型供应商不可用' };
  }

  if (
    status === 0 ||
    lower.includes('fetch') ||
    lower.includes('network') ||
    lower.includes('timeout')
  ) {
    return { type: 'network', message: '网络连接失败' };
  }

  return { type: 'unknown', message: safeMessage || 'AI 调用失败' };
}

export function modelSupportsVision(model: OpenRouterModel): boolean {
  return Boolean(model.architecture?.input_modalities?.includes('image'));
}

async function readError(response: Response): Promise<{
  type: AiConnectionErrorType;
  message: string;
}> {
  const data = (await response.json().catch(() => ({}))) as {
    error?: { message?: unknown } | unknown;
  };
  const errorMessage =
    data.error && typeof data.error === 'object' && 'message' in data.error
      ? data.error.message
      : undefined;
  const message = String(errorMessage || data.error || response.statusText || '');

  return classifyOpenRouterError({ status: response.status, message });
}

export async function testOpenRouterConnection(
  input: TestOpenRouterConnectionInput
): Promise<AiConnectionTestResult> {
  const fetcher = input.fetchImpl || fetch;
  const headers = {
    Authorization: `Bearer ${input.apiKey}`,
    'Content-Type': 'application/json'
  };

  try {
    const modelsResponse = await fetcher(`${OPENROUTER_BASE_URL}/models`, { headers });
    if (!modelsResponse.ok) {
      const error = await readError(modelsResponse);

      return {
        ok: false,
        modelExists: false,
        supportsVision: false,
        textGenerationOk: false,
        error: error.message,
        errorType: error.type
      };
    }

    const modelsData = (await modelsResponse.json()) as { data?: unknown };
    const models = Array.isArray(modelsData.data) ? (modelsData.data as OpenRouterModel[]) : [];
    const model = models.find((item) => item.id === input.model);

    if (!model) {
      return {
        ok: false,
        modelExists: false,
        supportsVision: false,
        textGenerationOk: false,
        error: '模型不存在或已下线',
        errorType: 'model_missing'
      };
    }

    const supportsVision = modelSupportsVision(model);
    if (!supportsVision) {
      return {
        ok: false,
        modelExists: true,
        supportsVision: false,
        textGenerationOk: false,
        error: '模型不支持图片输入',
        errorType: 'vision_unsupported'
      };
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

      return {
        ok: false,
        modelExists: true,
        supportsVision: true,
        textGenerationOk: false,
        error: error.message,
        errorType: error.type
      };
    }

    return {
      ok: true,
      modelExists: true,
      supportsVision: true,
      textGenerationOk: true
    };
  } catch (error) {
    const classified = classifyOpenRouterError({
      status: 0,
      message: error instanceof Error ? error.message : String(error)
    });

    return {
      ok: false,
      modelExists: false,
      supportsVision: false,
      textGenerationOk: false,
      error: classified.message,
      errorType: classified.type
    };
  }
}

export async function callOpenRouterVision(input: ChatCompletionInput): Promise<string> {
  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: input.prompt },
            { type: 'image_url', image_url: { url: input.imageDataUrl } }
          ]
        }
      ],
      temperature: 0.2
    })
  });
  const data = (await response.json().catch(() => ({}))) as {
    choices?: Array<{ message?: { content?: unknown } }>;
    error?: { message?: unknown } | unknown;
  };

  if (!response.ok) {
    const errorMessage =
      data.error && typeof data.error === 'object' && 'message' in data.error
        ? data.error.message
        : data.error;
    const classified = classifyOpenRouterError({
      status: response.status,
      message: String(errorMessage || response.statusText || '')
    });

    throw new Error(classified.message);
  }

  return String(data.choices?.[0]?.message?.content || '');
}
