/**
 * Markdown 解析工具模块
 * 统一处理换行符，确保 Windows（CRLF）与 Unix（LF）环境下行为一致
 */

import yaml from 'js-yaml';

export function normalizeLineEndings(content: string): string {
  return content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * 解析 Markdown 文件的 YAML front-matter，使用 JSON_SCHEMA 避免将日期字符串转为 Date 对象
 */
export function parseFrontMatter(content: string): { attributes: Record<string, unknown>; body: string } {
  const normalized = normalizeLineEndings(content);
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { attributes: {}, body: normalized };
  }

  const yamlStr = match[1];
  const body = match[2];

  const attributes = (yaml.load(yamlStr, { schema: yaml.JSON_SCHEMA }) as Record<string, unknown>) || {};

  return { attributes, body };
}

/**
 * 从已有输出文件内容中提取 body 部分（去除 YAML front-matter）
 */
export function extractOutputBody(existingContent: string): string {
  const normalized = normalizeLineEndings(existingContent);
  const match = normalized.match(/^---\n[\s\S]*?\n---\n\n?([\s\S]*)$/);
  return match ? match[1] : normalized;
}
