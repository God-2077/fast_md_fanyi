/**
 * OpenAI API 调用模块
 * 提供与 OpenAI 兼容的翻译 API 交互功能
 */

import axios, { AxiosError, type AxiosResponse } from 'axios';
import type { FetchOpenAIConfig, ResponseData, Message } from '../types';
import { Logger } from '../utils/logger';
import { logLevelConfig } from '../config';

const logger = new Logger(logLevelConfig, 'openai');

function checkForRepetition(
  text: string, 
  patternLength: number = 18, 
  repeatLimit: number = 5
): { success: false; error: string } | null {
  if (text.length < patternLength) {
    return null;
  }

  const lastPattern = text.slice(-patternLength);
  
  const escapedPattern = lastPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(escapedPattern, 'g');
  const matches = text.match(regex);
  const repeatCount = matches ? matches.length : 0;

  if (repeatCount >= repeatLimit) {
    return {
      success: false,
      error: `检测到AI文本重复。最后${patternLength}个字符"${lastPattern}"在响应中重复出现了${repeatCount}次，已超过预设阈值（${repeatLimit}次）。请求已被中断。`
    };
  }

  return null;
}

/**
 * 发送请求到 OpenAI API
 */
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
  } = config;

  // 验证必需参数
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

  // 构建请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  };

  // 构建请求体
  const requestBody: Record<string, unknown> = {
    model: model || 'gpt-3.5-turbo',
    messages,
    temperature: temperature ?? 0.7,
    max_tokens: maxTokens ?? 2048,
  };

  logger.debug(`OpenAI API 请求体: ${JSON.stringify(requestBody)}`);

  logger.debug(`发送 OpenAI API 请求到 ${baseURL}/chat/completions`);

  // 流式响应处理
  if (stream) {
    requestBody.stream = true;
    return handleStreamRequest(baseURL, headers, requestBody, timeout);
  }

  // 普通请求
  return handleNormalRequest(baseURL, headers, requestBody, timeout);
}

/**
 * 处理普通请求（非流式）
 */
async function handleNormalRequest(
  baseURL: string,
  headers: Record<string, string>,
  requestBody: Record<string, unknown>,
  timeout?: number
): Promise<ResponseData> {
  try {
    const response: AxiosResponse = await axios.post(
      `${baseURL}/chat/completions`,
      requestBody,
      {
        headers,
        timeout: timeout || 30000,
      }
    );

    return handleJsonResponse(response);
  } catch (error) {
    return handleRequestError(error);
  }
}

/**
 * 处理流式请求
 */
async function handleStreamRequest(
  baseURL: string,
  headers: Record<string, string>,
  requestBody: Record<string, unknown>,
  timeout?: number
): Promise<ResponseData> {
  return new Promise((resolve) => {
    let fullContent = '';
    let resolved = false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout || 30000);

    axios.post(`${baseURL}/chat/completions`, requestBody, {
      headers: {
        ...headers,
        'Accept': 'text/event-stream',
      },
      responseType: 'stream',
      signal: controller.signal,
    })
    .then((response) => {
      const stream = response.data as NodeJS.ReadableStream;

      stream.on('data', (chunk: Buffer) => {
        const chunkStr = chunk.toString();
        const lines = chunkStr.split('\n');

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || !trimmedLine.startsWith('data: ')) {
            continue;
          }

          const data = trimmedLine.slice(6);

          if (data === '[DONE]') {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutId);
              resolve({
                status: 200,
                success: true,
                content: fullContent,
                error: '',
              });
            }
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              fullContent += content;

              const repetitionCheck = checkForRepetition(fullContent);
              if (repetitionCheck) {
                controller.abort();
                clearTimeout(timeoutId);
                if (!resolved) {
                  resolved = true;
                  resolve({
                    status: 400,
                    success: false,
                    content: fullContent,
                    error: repetitionCheck.error,
                  });
                }
                return;
              }
            }
          } catch {
            // 忽略解析错误，继续处理
          }
        }
      });

      stream.on('end', () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve({
            status: 200,
            success: true,
            content: fullContent,
            error: '',
          });
        }
      });

      stream.on('error', (error: Error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          resolve({
            status: 500,
            success: false,
            content: '',
            error: error.message || 'Stream error',
          });
        }
      });
    })
    .catch((error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        resolve(handleRequestError(error));
      }
    });
  });
}

/**
 * 处理 JSON 响应
 */
function handleJsonResponse(response: AxiosResponse): ResponseData {
  const { status, data } = response;

  logger.debug(`OpenAI API 响应状态: ${status}`);
  logger.debug(`OpenAI API 响应数据: ${JSON.stringify(data)}`);

  if (status === 200 && data.choices && data.choices.length > 0) {
    const content = data.choices[0]?.message?.content || '';

    const repetitionCheck = checkForRepetition(content);
    if (repetitionCheck) {
      logger.warn(`OpenAI API 响应内容检测到重复模式: ${repetitionCheck.error}`);
      return {
        status: 400,
        success: false,
        content: content,
        error: repetitionCheck.error,
      };
    }

    logger.info(`OpenAI API 请求成功，响应状态: ${status}`);
    return {
      status,
      success: true,
      content,
      error: '',
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
      } : undefined,
    };
  }

  logger.warn('OpenAI API 响应格式无效');
  return {
    status: status || 500,
    success: false,
    content: '',
    error: 'Invalid response format',
  };
}

/**
 * 处理请求错误
 */
function handleRequestError(error: unknown): ResponseData {
  let status = 500;
  let errorMessage = 'Unknown error';

  if (error instanceof AxiosError) {
    if (error.response) {
      status = error.response.status;
      const errorData = error.response.data;
      errorMessage = errorData?.error?.message || 
                     errorData?.error?.type || 
                     JSON.stringify(errorData) || 
                     error.message;
    } else if (error.request) {
      errorMessage = 'No response received from server. Please check your network connection.';
    } else {
      errorMessage = error.message;
    }
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else {
    errorMessage = String(error);
  }

  logger.error(`OpenAI API 请求失败: ${errorMessage}`);

  return {
    status,
    success: false,
    content: '',
    error: errorMessage,
  };
}

/**
 * 构建翻译消息
 */
function createTranslateMessages(systemPrompt: string, content: string): Message[] {
  return [
    { role: 'system', content: systemPrompt },
    { 
      role: 'user', 
      content: content,
    //   旧格式
    //   content: [
    //     {
    //       type: 'text',
    //       text: `\n\n--- Content to translate ---\n${content}`,
    //     }
    //   ]
    },
  ];
}

/**
 * 验证消息格式
 */
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
