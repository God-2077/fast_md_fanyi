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

async function handleNormalRequest(
  baseURL: string,
  headers: Record<string, string>,
  requestBody: Record<string, unknown>,
  timeout?: number,
  checkMangledCode?: boolean
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

    return handleJsonResponse(response, checkMangledCode);
  } catch (error) {
    return handleRequestError(error);
  }
}

async function handleStreamRequest(
  baseURL: string,
  headers: Record<string, string>,
  requestBody: Record<string, unknown>,
  timeout?: number,
  checkMangledCode?: boolean
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

              if (checkMangledCode && hasMangledCode(fullContent)) {
                controller.abort();
                clearTimeout(timeoutId);
                if (!resolved) {
                  resolved = true;
                  resolve({
                    status: 400,
                    success: false,
                    content: fullContent,
                    error: '检测到响应内容含乱码（\\uFFFD），请求已被中断',
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

function handleJsonResponse(response: AxiosResponse, checkMangledCode?: boolean): ResponseData {
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

    if (checkMangledCode && hasMangledCode(content)) {
      logger.warn('OpenAI API 响应内容检测到乱码');
      return {
        status: 400,
        success: false,
        content: content,
        error: '检测到响应内容含乱码（\\uFFFD）',
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

export { hasMangledCode, checkForRepetition, handleNormalRequest, handleStreamRequest, handleJsonResponse, handleRequestError };