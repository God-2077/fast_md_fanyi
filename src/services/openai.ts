/**
 * OpenAI API 调用模块
 * 提供与 OpenAI 兼容的翻译 API 交互功能
 */

import type { FetchOpenAIConfig, ResponseData, Message } from '../types';
import { handleNormalRequest, handleStreamRequest } from '../utils/openai';
import { Logger } from '../utils/logger';
import { logLevelConfig } from '../config';

const logger = new Logger(logLevelConfig, 'openai');

async function fetchOpenAIData(config: FetchOpenAIConfig): Promise<ResponseData> {
  const {
    apiKey,
    baseURL,
    model,
    temperature,
    maxTokens,
    stream,
    timeout,
    messages,
    checkMangledCode,
  } = config;

  if (!apiKey) {
    return {
      status: 400,
      success: false,
      content: '',
      error: 'API key is required',
    };
  }

  if (!messages || messages.length === 0) {
    return {
      status: 400,
      success: false,
      content: '',
      error: 'Messages array cannot be empty',
    };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  const requestBody: Record<string, unknown> = {
    model: model || 'gpt-3.5-turbo',
    messages,
    temperature: temperature ?? 0.7,
    max_tokens: maxTokens ?? 2048,
  };

  logger.debug(`OpenAI API 请求体: ${JSON.stringify(requestBody)}`);

  logger.debug(`发送 OpenAI API 请求到 ${baseURL}/chat/completions`);

  if (stream) {
    requestBody.stream = true;
    return handleStreamRequest(baseURL, headers, requestBody, timeout, checkMangledCode);
  }

  return handleNormalRequest(baseURL, headers, requestBody, timeout, checkMangledCode);
}

function createTranslateMessages(systemPrompt: string, content: string): Message[] {
  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: content,
    },
  ];
}

function validateMessages(messages: unknown[]): messages is Message[] {
  if (!Array.isArray(messages)) return false;

  return messages.every(msg => {
    if (typeof msg !== 'object' || msg === null) return false;
    const m = msg as Record<string, unknown>;
    if (typeof m.role !== 'string') return false;
    if (!['system', 'user', 'assistant'].includes(m.role)) return false;
    if (typeof m.content !== 'string' && !Array.isArray(m.content)) return false;
    return true;
  });
}

export { fetchOpenAIData, createTranslateMessages, validateMessages };