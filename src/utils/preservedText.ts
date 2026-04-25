/**
 * 保留内容处理模块
 * 用于在翻译前保留特殊内容（如代码块、术语等），翻译后还原
 */

import type { PreservedHandleResult } from '../types';

/**
 * 生成唯一占位符前缀
 */
const PLACEHOLDER_PREFIX = '<PTX_';
const PLACEHOLDER_SUFFIX = '>';

/**
 * 生成安全的唯一ID
 */
let idCounter = 0;

function generateUniqueId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  idCounter++;
  return `${timestamp}_${random}_${idCounter}`;
}

/**
 * 创建占位符
 */
function createPlaceholder(id: string): string {
  return `${PLACEHOLDER_PREFIX}${id}${PLACEHOLDER_SUFFIX}`;
}

/**
 * 从占位符提取ID
 */
function extractPlaceholderId(placeholder: string): string | null {
  if (!placeholder.startsWith(PLACEHOLDER_PREFIX) || !placeholder.endsWith(PLACEHOLDER_SUFFIX)) {
    return null;
  }
  return placeholder.slice(PLACEHOLDER_PREFIX.length, -PLACEHOLDER_SUFFIX.length);
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 预处理正则表达式列表，过滤无效正则
 */
function sanitizeRegExpList(patterns: RegExp[]): RegExp[] {
  return patterns.filter((regex): regex is RegExp => regex instanceof RegExp);
}

/**
 * 处理保留内容，将特殊内容替换为占位符
 * 
 * @param text - 原始文本
 * @param preservedTerms - 需要保留的术语正则数组
 * @param preservedFields - 需要保留的字段正则数组
 * @returns 处理结果，包含处理后的文本和映射字典
 */
export function preservedHandle(
  text: string,
  preservedTerms: RegExp[],
  preservedFields: RegExp[]
): PreservedHandleResult {
  const dictionary = new Map<string, string>();
  const usedPlaceholders = new Set<string>();
  
  // 合并所有正则表达式
  const allPatterns = [...sanitizeRegExpList(preservedTerms), ...sanitizeRegExpList(preservedFields)];
  
  if (allPatterns.length === 0) {
    return { text, dictionary };
  }

  // 按位置从后往前收集所有匹配项
  interface Match {
    index: number;
    length: number;
    original: string;
    placeholder: string;
  }
  
  const matches: Match[] = [];
  
  for (const pattern of allPatterns) {
    // 重置正则表达式的 lastIndex
    const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const original = match[0];
      
      // 避免重复匹配
      if (matches.some(m => m.index === match!.index && m.original === original)) {
        continue;
      }
      
      matches.push({
        index: match.index,
        length: original.length,
        original,
        placeholder: '', // 稍后填充
      });
    }
  }

  // 按位置从后往前排序
  matches.sort((a, b) => b.index - a.index);

  // 生成占位符并记录映射
  let resultText = text;
  for (const match of matches) {
    let placeholder = dictionary.get(match.original);
    
    if (!placeholder) {
      // 生成唯一占位符
      let id = generateUniqueId();
      placeholder = createPlaceholder(id);
      
      // 确保占位符唯一
      while (usedPlaceholders.has(placeholder)) {
        id = generateUniqueId();
        placeholder = createPlaceholder(id);
      }
      
      usedPlaceholders.add(placeholder);
      dictionary.set(match.original, placeholder);
    }
    
    match.placeholder = placeholder;
    
    // 替换文本中的内容
    resultText = resultText.slice(0, match.index) + 
                 match.placeholder + 
                 resultText.slice(match.index + match.length);
  }

  return {
    text: resultText,
    dictionary,
  };
}

/**
 * 还原处理过的文本，将占位符还原为原始内容
 * 
 * @param processedText - 处理后的文本
 * @param dictionary - 映射字典
 * @returns 还原后的文本
 */
export function restoreText(processedText: string, dictionary: Map<string, string>): string {
  if (dictionary.size === 0) {
    return processedText;
  }

  let restoredText = processedText;
  
  // 按占位符长度逆序排列，避免部分匹配问题
  const entries = Array.from(dictionary.entries())
    .sort(([, a], [, b]) => b.length - a.length);

  for (const [original, placeholder] of entries) {
    // 使用安全的方式构建正则表达式
    const placeholderId = extractPlaceholderId(placeholder);
    if (!placeholderId) continue;
    
    const escapedPlaceholder = escapeRegExp(placeholder);
    const regex = new RegExp(escapedPlaceholder, 'g');
    restoredText = restoredText.replace(regex, original);
  }

  return restoredText;
}

/**
 * 检查文本是否包含占位符
 */
export function hasPlaceholder(text: string): boolean {
  return text.includes(PLACEHOLDER_PREFIX);
}

/**
 * 清理文本中的残留占位符（用于调试）
 */
export function cleanResidualPlaceholders(text: string, dictionary: Map<string, string>): string {
  let result = text;
  for (const [, placeholder] of dictionary.entries()) {
    const regex = new RegExp(escapeRegExp(placeholder), 'g');
    result = result.replace(regex, '[UNTRANSLATED]');
  }
  return result;
}
