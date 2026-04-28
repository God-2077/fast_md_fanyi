/**
 * 统一类型定义文件
 */

// ============== 语言相关类型 ==============

/**
 * 语言定义
 */
export interface LanguageDefinition {
  fullName: string;
  shortName: string;
}

/**
 * 前置matter字段配置
 */
export interface FrontMatterField {
  field: string;
  type: 'string' | 'string[]';
}

/**
 * 跳过翻译匹配配置
 * field: 指定 front-matter 字段名，配合 fieldPattern 匹配该字段值
 * contentPattern: 直接匹配整个 content 内容
 */
export interface SkipMatch {
  field?: string;
  fieldPattern?: RegExp;
  contentPattern?: RegExp;
}

// ============== 配置相关类型 ==============

/**
 * 翻译配置
 */
export interface TranslationConfig {
  source: LanguageDefinition;
  targets: LanguageDefinition[];
  preservedFields: RegExp[];
  preservedTerms: RegExp[];
  preservedTermsUseFieldPlaceholder?: boolean;
  frontMatter: FrontMatterField[];
  skipMatches?: SkipMatch[];
}

/**
 * OpenAI API 配置
 */
export interface OpenAIConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
  promptTemplate: string;
  timeout: number;
  threadCount: number;
  retryCount: number;
  checkMangledCode: boolean;
  smartTokens: boolean;
  smartTimeout: boolean;
  maxRetriesBehavior: 'skip' | 'exit';
  maxConsecutiveErrors: number;
  rateLimitWait: number;
  mock?: boolean;
  mockDelay?: number;
}

/**
 * 文件配置
 */
export interface FileConfig {
  inputFolder: string;
  ignore: string[];
  outputFolder: string;
  fileName: string;
  filePath: string;
  preserveFolders: boolean;
  copyOtherFiles: boolean;
  skipUnchanged: boolean;
}

// ============== OpenAI API 相关类型 ==============

/**
 * OpenAI 消息角色
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * OpenAI 消息结构
 */
export interface Message {
  role: MessageRole;
  content: string | MessageContent[];
}

/**
 * 多模态消息内容
 */
export interface MessageContent {
  type: 'text';
  text: string;
}

/**
 * 获取 OpenAI 数据的配置
 */
export interface FetchOpenAIConfig {
  apiKey: string;
  baseURL: string;
  model: string;
  temperature: number;
  maxTokens: number;
  stream: boolean;
  timeout: number;
  messages: Message[];
  checkMangledCode?: boolean;
}

/**
 * API 响应数据
 */
/**
 * 错误分类
 */
export type ErrorClassification = 'fatal' | 'retryable';

export interface ResponseData {
  status: number;
  success: boolean;
  content: string;
  error: string;
  errorClassification?: ErrorClassification;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============== 保留内容处理相关类型 ==============

/**
 * 保留内容处理结果
 */
export interface PreservedHandleResult {
  text: string;
  dictionary: Map<string, string>;
}

// ============== 翻译服务相关类型 ==============

/**
 * 翻译服务选项
 */
export interface TranslateOptions {
  sourceLanguage: string;
  targetLanguage: string;
  retryCount?: number;
}

/**
 * 翻译结果
 */
export interface TranslateResult {
  success: boolean;
  translatedText?: string;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ============== 日志相关类型 ==============

/**
 * 日志级别
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ============== 应用级别类型 ==============

/**
 * 应用配置（合并所有配置）
 */
export interface AppConfig {
  translation: TranslationConfig;
  openai: OpenAIConfig;
  file: FileConfig;
  logLevel: LogLevel;
}

/**
 * 解析后的 Markdown 内容
 */
export interface ParsedMarkdown {
  attributes: Record<string, unknown>;
  body: string;
  rawContent: string;
}

/**
 * 处理后的前置matter
 */
export interface ProcessedFrontMatter {
  [key: string]: unknown;
  translationMeta?: TranslationMeta;
}

/**
 * 翻译元数据
 */
export interface TranslationMeta {
  translatedAt: string;
  model: string;
  sourceHash: string;
}
