/**
 * 保留内容处理模块
 * 用于在翻译前保留特殊内容（如代码块、术语等），翻译后还原
 */

import type { PreservedHandleResult } from '../types';

/**
 * 生成唯一占位符前缀
 * PTX: 用于保留字段（代码块、公式等）
 * TERM: 用于保留术语（专业词汇）
 */
const PTX_PREFIX = '<PTX_';
const TERM_PREFIX = '<TERM_';
const PLACEHOLDER_SUFFIX = '>';

/**
 * 生成简短的唯一ID（用于字段占位符）
 */
let idCounter = 0;

export function resetIdCounter(): void {
  idCounter = 0;
}

function generateShortId(): string {
  const random = Math.random().toString(36).substring(2, 6);
  idCounter++;
  return `${idCounter}_${random}`;
}

/**
 * 创建字段占位符（简短格式）
 */
function createFieldPlaceholder(id: string): string {
  return `${PTX_PREFIX}${id}${PLACEHOLDER_SUFFIX}`;
}

/**
 * 创建术语占位符，包含匹配的单词让 AI 更好地理解上下文
 */
function createTermPlaceholder(original: string): string {
  const sanitized = original.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'term';
  return `${TERM_PREFIX}${sanitized}${PLACEHOLDER_SUFFIX}`;
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
  preservedFields: RegExp[],
  preservedTermsUseFieldPlaceholder = false
): PreservedHandleResult {
  const dictionary = new Map<string, string>();
  const usedPlaceholders = new Set<string>();
  
  if (preservedTerms.length === 0 && preservedFields.length === 0) {
    return { text, dictionary };
  }

  // 先识别并保护文本中已有的占位符
  const existingPlaceholderRegex = /<(?:PTX|TERM)_.+?>/g;
  let match: RegExpExecArray | null;
  while ((match = existingPlaceholderRegex.exec(text)) !== null) {
    const original = match[0];
    if (!dictionary.has(original)) {
      dictionary.set(original, original);
      usedPlaceholders.add(original);
    }
  }

  // 匹配项类型
  interface Match {
    index: number;
    length: number;
    original: string;
    placeholder: string;
    type: 'term' | 'field';
  }

  // 收集所有匹配项
  const matches: Match[] = [];
  
  // 收集术语匹配
  for (const pattern of sanitizeRegExpList(preservedTerms)) {
    const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const original = m[0];
      
      if (original.startsWith(PTX_PREFIX) && original.endsWith(PLACEHOLDER_SUFFIX)) {
        continue;
      }
      if (original.startsWith(TERM_PREFIX) && original.endsWith(PLACEHOLDER_SUFFIX)) {
        continue;
      }
      if (dictionary.has(original)) {
        continue;
      }
      
      matches.push({
        index: m.index,
        length: original.length,
        original,
        placeholder: '',
        type: 'term',
      });
    }
  }

  // 收集字段匹配
  for (const pattern of sanitizeRegExpList(preservedFields)) {
    const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const original = m[0];
      
      if (original.startsWith(PTX_PREFIX) && original.endsWith(PLACEHOLDER_SUFFIX)) {
        continue;
      }
      if (original.startsWith(TERM_PREFIX) && original.endsWith(PLACEHOLDER_SUFFIX)) {
        continue;
      }
      if (dictionary.has(original)) {
        continue;
      }
      
      matches.push({
        index: m.index,
        length: original.length,
        original,
        placeholder: '',
        type: 'field',
      });
    }
  }
  
  if (matches.length === 0) {
    return { text, dictionary };
  }

  // 过滤重叠匹配：先按长度降序，再按位置升序排序
  matches.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return a.index - b.index;
  });
  
  const filteredMatches: Match[] = [];
  for (const match of matches) {
    const matchEnd = match.index + match.length;
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
  
  for (const m of filteredMatches) {
    const matchEnd = m.index + m.length;
    
    const overlapsWithProtected = protectedRanges.some(
      range => m.index < range.end && matchEnd > range.start
    );
    if (overlapsWithProtected) {
      continue;
    }
    
    let placeholder = dictionary.get(m.original);
    
    if (!placeholder) {
      if (m.type === 'term' && !preservedTermsUseFieldPlaceholder) {
        placeholder = createTermPlaceholder(m.original);
        let counter = 1;
        while (usedPlaceholders.has(placeholder)) {
          const sanitized = m.original.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '') || 'term';
          placeholder = `${TERM_PREFIX}${sanitized}_${counter}${PLACEHOLDER_SUFFIX}`;
          counter++;
        }
      } else {
        let id = generateShortId();
        placeholder = createFieldPlaceholder(id);
        while (usedPlaceholders.has(placeholder)) {
          id = generateShortId();
          placeholder = createFieldPlaceholder(id);
        }
      }
      
      usedPlaceholders.add(placeholder);
      dictionary.set(m.original, placeholder);
    }
    
    m.placeholder = placeholder;
    
    resultText = resultText.slice(0, m.index) + 
                 m.placeholder + 
                 resultText.slice(m.index + m.length);
    
    const placeholderEnd = m.index + placeholder.length;
    protectedRanges.push({ start: m.index, end: placeholderEnd });
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
  
  const entries = Array.from(dictionary.entries())
    .sort(([, a], [, b]) => b.length - a.length);

  for (const [original, placeholder] of entries) {
    const isTermPlaceholder = placeholder.startsWith(TERM_PREFIX);
    const isFieldPlaceholder = placeholder.startsWith(PTX_PREFIX);
    if (!isTermPlaceholder && !isFieldPlaceholder) {
      continue;
    }
    if (!placeholder.endsWith(PLACEHOLDER_SUFFIX)) {
      continue;
    }
    
    restoredText = restoredText.split(placeholder).join(original);
  }

  return restoredText;
}

/**
 * 检查文本是否包含占位符
 */
export function hasPlaceholder(text: string): boolean {
  return text.includes(PTX_PREFIX) || text.includes(TERM_PREFIX);
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
