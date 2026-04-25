/**
 * 提示词模板生成模块
 */

import type { Message } from '../types';

/**
 * 默认翻译提示词模板
 */
const DEFAULT_PROMPT_TEMPLATE = '你是一个专业的翻译助手，负责将文本从{sourceLanguage}翻译为{targetLanguage}。请保持原文的格式和语气，只翻译内容，不要添加额外的解释。';

/**
 * 生成翻译提示词
 * 
 * @param template - 提示词模板
 * @param sourceLanguage - 源语言
 * @param targetLanguage - 目标语言
 * @returns 格式化后的提示词
 */
export function generatePrompt(
  template: string,
  sourceLanguage: string,
  targetLanguage: string
): string {
  return template
    .replace(/{sourceLanguage}/g, sourceLanguage)
    .replace(/{targetLanguage}/g, targetLanguage);
}

/**
 * 生成翻译系统消息
 */
export function createTranslateSystemMessage(
  template: string,
  sourceLanguage: string,
  targetLanguage: string
): Message {
  return {
    role: 'system',
    content: generatePrompt(template, sourceLanguage, targetLanguage),
  };
}

/**
 * 创建翻译用户消息
 */
export function createTranslateUserMessage(content: string): Message {
  return {
    role: 'user',
    content: content,
  };
}

/**
 * 创建完整的翻译消息数组
 */
export function createTranslateMessages(
  template: string,
  sourceLanguage: string,
  targetLanguage: string,
  content: string
): Message[] {
  return [
    createTranslateSystemMessage(template, sourceLanguage, targetLanguage),
    createTranslateUserMessage(content),
  ];
}

export { DEFAULT_PROMPT_TEMPLATE };
