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

  // 先识别并保护文本中已有的占位符
  const existingPlaceholderRegex = new RegExp(escapeRegExp(PLACEHOLDER_PREFIX) + '.+?' + escapeRegExp(PLACEHOLDER_SUFFIX), 'g');
  let match: RegExpExecArray | null;
  while ((match = existingPlaceholderRegex.exec(text)) !== null) {
    const original = match[0];
    if (!dictionary.has(original)) {
      dictionary.set(original, original);
      usedPlaceholders.add(original);
    }
  }

  // 按位置从后往前收集所有匹配项
  interface Match {
    index: number;
    length: number;
    original: string;
    placeholder: string;
}

  // 收集所有匹配项
  const matches: Match[] = [];
  
  for (const pattern of allPatterns) {
    // 重置正则表达式的 lastIndex
    const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const original = match[0];
      
      // 跳过已经是占位符的完整匹配
      if (original.startsWith(PLACEHOLDER_PREFIX) && original.endsWith(PLACEHOLDER_SUFFIX)) {
        continue;
      }
      
      // 跳过与字典中已有内容完全相同的匹配（同一文本不应重复保护）
      if (dictionary.has(original)) {
        continue;
      }
      
      matches.push({
        index: match.index,
        length: original.length,
        original,
        placeholder: '',
      });
    }
  }
  
  // 过滤重叠匹配：先按长度降序，再按位置升序排序
  matches.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return a.index - b.index;
  });
  
  const filteredMatches: Match[] = [];
  for (const match of matches) {
    const matchEnd = match.index + match.length;
    // 检查是否被已过滤的匹配包含（完全包含关系）
    const isContained = filteredMatches.some(
      existing => existing.index <= match.index && (existing.index + existing.length) >= matchEnd
    );
    if (!isContained) {
      filteredMatches.push(match);
    }
  }
  
  // 按位置从后往前排序，这样从后往前替换时位置不会错
  filteredMatches.sort((a, b) => b.index - a.index);

  // 生成占位符并记录映射
  let resultText = text;
  const protectedRanges: { start: number; end: number }[] = [];
  
  for (const match of filteredMatches) {
    const matchEnd = match.index + match.length;
    
    // 检查与已保护范围是否重叠
    const overlapsWithProtected = protectedRanges.some(
      range => match.index < range.end && matchEnd > range.start
    );
    if (overlapsWithProtected) {
      continue;
    }
    
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
    
    // 记录保护范围
    const placeholderEnd = match.index + placeholder.length;
    protectedRanges.push({ start: match.index, end: placeholderEnd });
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
  
  // 获取所有占位符，按长度从长到短排序
  const entries = Array.from(dictionary.entries())
    .sort(([, a], [, b]) => b.length - a.length);

  for (const [original, placeholder] of entries) {
    if (!placeholder.startsWith(PLACEHOLDER_PREFIX) || !placeholder.endsWith(PLACEHOLDER_SUFFIX)) {
      continue;
    }
    
    // Use string replace instead of regex to avoid $ being interpreted as group reference
    restoredText = restoredText.split(placeholder).join(original);
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
