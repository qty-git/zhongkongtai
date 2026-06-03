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

  it('redacts sensitive values from unknown error messages', () => {
    const result = classifyOpenRouterError({
      status: 500,
      message:
        'failed with Bearer sk-or-v1-secret123 and data:image/png;base64,abc123DEF=='
    });

    expect(result.message).not.toContain('sk-or-v1-secret123');
    expect(result.message).not.toContain('data:image/png;base64');
    expect(result.message).toContain('[redacted-api-key]');
    expect(result.message).toContain('[redacted-image]');
  });
});

describe('modelSupportsVision', () => {
  it('checks input modalities for image support', () => {
    expect(
      modelSupportsVision({
        id: 'vision-model',
        architecture: { input_modalities: ['text', 'image'] }
      })
    ).toBe(true);
    expect(
      modelSupportsVision({
        id: 'text-model',
        architecture: { input_modalities: ['text'] }
      })
    ).toBe(false);
  });
});

describe('testOpenRouterConnection', () => {
  it('checks model list and tiny text generation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'openai/gpt-4o-mini',
              architecture: { input_modalities: ['text', 'image'] }
            }
          ]
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
