/**
 * OpenAI API 调用辅助函数
 * 提供与 OpenAI 兼容的 API 交互辅助功能
 */

import axios, { AxiosError, type AxiosResponse } from 'axios';
import type { ResponseData } from '../types';
import { Logger } from './logger';
import { logLevelConfig } from '../config';

const logger = new Logger(logLevelConfig, 'openai');

function hasMangledCode(str: string): boolean {
  return /\uFFFD/.test(str);
}

function checkForRepetition(
  text: string,
  patternLength: number = 18,
  repeatLimit: number = 5
): { success: false; error: string } | null {
  if (text.length < patternLength * repeatLimit) {
    return null;
  }

  const lastPattern = text.slice(-patternLength);
  const expected = lastPattern.repeat(repeatLimit);
  const lastSegment = text.slice(-patternLength * repeatLimit);

  if (lastSegment === expected) {
    return {
      success: false,
      error: `检测到AI文本重复。最后${patternLength}个字符"${lastPattern}"在响应中重复出现了${repeatLimit}次，已超过预设阈值（${repeatLimit}次）。请求已被中断。`
    };
  }

  return null;
}

function checkContentQuality(text: string, checkMangledCode?: boolean, label?: string): { error: string } | null {
  if (!text) return null;

  const repetitionCheck = checkForRepetition(text);
  if (repetitionCheck) {
    const prefix = label ? `[${label}] ` : '';
    return { error: prefix + repetitionCheck.error };
  }

  if (checkMangledCode && hasMangledCode(text)) {
    const prefix = label ? `[${label}] ` : '';
    return { error: prefix + '检测到响应内容含乱码（\\uFFFD），请求已被中断' };
  }

  return null;
}

async function handleNormalRequest(
  baseURL: string,
  headers: Record<string, string>,
  requestBody: Record<string, unknown>,
  timeout?: number,
  checkMangledCode?: boolean,
  log?: Logger
): Promise<ResponseData> {
  const _log = log || logger;

  try {
    const response: AxiosResponse = await axios.post(
      `${baseURL}/chat/completions`,
      requestBody,
      {
        headers,
        timeout: timeout || 30000,
      }
    );

    return handleJsonResponse(response, checkMangledCode, _log);
  } catch (error) {
    return handleRequestError(error, _log);
  }
}

async function handleStreamRequest(
  baseURL: string,
  headers: Record<string, string>,
  requestBody: Record<string, unknown>,
  timeout?: number,
  checkMangledCode?: boolean,
  log?: Logger,
  logStreamDelta?: boolean
): Promise<ResponseData> {
  const _log = log || logger;

  return new Promise((resolve) => {
    let fullContent = '';
    let fullReasoningContent = '';
    let lastUsage: ResponseData['usage'] = undefined;
    let resolved = false;
    let chunkCount = 0;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout || 30000);

    _log.debug('OpenAI API 开始流式请求');

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
              _log.debug(`OpenAI API 流式响应完成, 共收到 ${chunkCount} 个 delta, 内容总长度: ${fullContent.length}`);
              _log.debug(`OpenAI API 返回原文: ${fullContent}`);
              resolve({
                status: 200,
                success: true,
                content: fullContent,
                error: '',
                usage: lastUsage,
              });
            }
            return;
          }

          try {
            const parsed = JSON.parse(data);

            if (parsed.usage) {
              lastUsage = {
                promptTokens: parsed.usage.prompt_tokens || 0,
                completionTokens: parsed.usage.completion_tokens || 0,
                totalTokens: parsed.usage.total_tokens || 0,
              };
            }

            const content = parsed.choices?.[0]?.delta?.content || '';
            const reasoningContent = parsed.choices?.[0]?.delta?.reasoning_content || '';

            if (content) {
              fullContent += content;
              chunkCount++;
              if (logStreamDelta) {
                _log.debug(`OpenAI API 流式响应 delta[${chunkCount}]: ${content}`);
              }
            }
            if (reasoningContent) {
              fullReasoningContent += reasoningContent;
              if (logStreamDelta) {
                _log.debug(`OpenAI API 流式响应 reasoning delta: ${reasoningContent}`);
              }
            }

            if (content || reasoningContent) {
              let checkResult: { error: string } | null = null;
              checkResult = checkContentQuality(fullContent, checkMangledCode, 'content');
              if (!checkResult) {
                checkResult = checkContentQuality(fullReasoningContent, checkMangledCode, 'reasoning');
              }

              if (checkResult) {
                controller.abort();
                clearTimeout(timeoutId);
                if (!resolved) {
                  resolved = true;
                  _log.warn(`OpenAI API 流式响应质量问题: ${checkResult.error}`);
                  resolve({
                    status: 400,
                    success: false,
                    content: fullContent,
                    error: checkResult.error,
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
          _log.debug(`OpenAI API 流式响应完成, 共收到 ${chunkCount} 个 delta, 内容总长度: ${fullContent.length}`);
          _log.debug(`OpenAI API 返回原文: ${fullContent}`);
          resolve({
            status: 200,
            success: true,
            content: fullContent,
            error: '',
            usage: lastUsage,
          });
        }
      });

      stream.on('error', (error: Error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutId);
          _log.error(`OpenAI API 流式错误: ${error.message}`);
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
        resolve(handleRequestError(error, _log));
      }
    });
  });
}

function handleJsonResponse(response: AxiosResponse, checkMangledCode?: boolean, log?: Logger): ResponseData {
  const _log = log || logger;
  const { status, data } = response;

  _log.debug(`OpenAI API 响应状态: ${status}`);
  _log.debug(`OpenAI API 响应数据: ${JSON.stringify(data)}`);

  if (status === 200 && data.choices && data.choices.length > 0) {
    const content = data.choices[0]?.message?.content || '';
    const reasoningContent = data.choices[0]?.message?.reasoning_content || '';

    _log.debug(`OpenAI API 返回原文: ${content}`);
    if (reasoningContent) {
      _log.debug(`OpenAI API 返回推理原文: ${reasoningContent}`);
    }

    const contentCheck = checkContentQuality(content, checkMangledCode, 'content');
    if (contentCheck) {
      _log.warn(`OpenAI API 响应内容质量问题: ${contentCheck.error}`);
      return {
        status: 400,
        success: false,
        content,
        error: contentCheck.error,
      };
    }

    const reasoningCheck = checkContentQuality(reasoningContent, checkMangledCode, 'reasoning');
    if (reasoningCheck) {
      _log.warn(`OpenAI API 响应推理内容质量问题: ${reasoningCheck.error}`);
      return {
        status: 400,
        success: false,
        content,
        error: reasoningCheck.error,
      };
    }

    _log.info(`OpenAI API 请求成功，响应状态: ${status}`);
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

  _log.warn('OpenAI API 响应格式无效');
  return {
    status: status || 500,
    success: false,
    content: '',
    error: 'Invalid response format',
  };
}

const FATAL_STATUS_CODES = [400, 401, 402, 404, 405, 422, 500];

function classifyError(error: unknown): { classification: 'fatal' | 'retryable'; message: string; status: number; rawBody?: string } {
  let status = 500;
  let message = 'Unknown error';
  let rawBody: string | undefined;

  if (error instanceof AxiosError) {
    if (error.response) {
      status = error.response.status;
      const errorData = error.response.data;
      let dataStr = '';
      try { dataStr = JSON.stringify(errorData); } catch { /* circular structure, ignore */ }
      rawBody = dataStr;
      message = errorData?.error?.message ||
                errorData?.error?.type ||
                dataStr ||
                error.message;
    } else if (error.request) {
      const lowerMsg = error.message?.toLowerCase() || '';
      if (lowerMsg.includes('cancel') || lowerMsg.includes('abort')) {
        message = 'Request was cancelled (timeout or internal abort)';
        status = 408;
      } else {
        message = 'No response received from server. Please check your network connection.';
        status = 0;
      }
    } else {
      const lowerMsg = error.message?.toLowerCase() || '';
      if (lowerMsg.includes('cancel') || lowerMsg.includes('abort')) {
        message = `Request was cancelled — ${error.message}`;
        status = 408;
      } else {
        message = error.message;
      }
    }

    if (status === 429) {
      return { classification: 'retryable', message: `Rate limited (429): ${message}`, status, rawBody };
    }

    if (FATAL_STATUS_CODES.includes(status)) {
      return { classification: 'fatal', message, status, rawBody };
    }

    if (status === 0) {
      return { classification: 'retryable', message, status, rawBody };
    }

    return { classification: 'retryable', message, status, rawBody };
  }

  if (error instanceof Error) {
    const lowerMsg = error.message?.toLowerCase() || '';
    message = error.message;
    if (lowerMsg.includes('cancel') || lowerMsg.includes('abort')) {
      return { classification: 'retryable', message: `Request was cancelled — ${message}`, status: 408 };
    }
    if (message.includes('timeout') || message.includes('Timeout')) {
      return { classification: 'retryable', message, status: 408 };
    }
    if (message.includes('ENOTFOUND') || message.includes('DNS') || message.includes('ECONNREFUSED')) {
      return { classification: 'fatal', message, status: 0 };
    }
  }
  return { classification: 'fatal', message, status };
}

function handleRequestError(error: unknown, log?: Logger): ResponseData {
  const _log = log || logger;
  const { classification, message, status, rawBody } = classifyError(error);

  _log.error(`OpenAI API 请求失败: ${message} [${classification}]`);
  if (rawBody) {
    _log.debug(`OpenAI API 错误响应原文: ${rawBody}`);
  }

  return {
    status,
    success: false,
    content: '',
    error: message,
    errorClassification: classification,
  };
}

export { hasMangledCode, checkForRepetition, checkContentQuality, handleNormalRequest, handleStreamRequest, handleJsonResponse, handleRequestError };