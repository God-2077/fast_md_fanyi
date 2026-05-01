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

/**
 * 单语言页眉页脚配置
 */
export interface HeaderFooterSingleConfig {
  header?: string;
  footer?: string;
}

/**
 * 页眉页脚配置
 * key 为语言简写（如 'en', 'ja'），value 为该语言的配置
 * default 为默认配置
 * 特定语言配置优先级高于 default
 */
export interface HeaderFooterConfig {
  default: HeaderFooterSingleConfig;
  [key: string]: HeaderFooterSingleConfig;
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
  headerFooter?: HeaderFooterConfig;
  maxCharLength?: number;
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
  /** @deprecated 使用 markdownPromptTemplate 和 textPromptTemplate 替代 */
  promptTemplate?: string;
  /** Markdown 内容翻译的提示词模板 */
  markdownPromptTemplate?: string;
  /** 纯文本翻译的提示词模板 */
  textPromptTemplate?: string;
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
  preserveFolders: boolean;
  copyOtherFiles: boolean;
  skipUnchanged: boolean;
}

/**
 * 翻译报告配置
 */
export interface ReportConfig {
  enabled: boolean;
  outputPath: string;
}

/**
 * 单个文件的翻译报告条目
 */
export interface FileReportEntry {
  sourceFile: string;
  outputFile: string;
  targetLang: string;
  success: boolean;
  skipped: boolean;
  skipReason?: string;
  sourceHash?: string;
  failureReason?: string;
  tokensUsed?: number;
  elapsedMs: number;
}

/**
 * 翻译报告摘要
 */
export interface ReportSummary {
  totalFiles: number;
  totalTranslated: number;
  totalSkipped: number;
  totalFailed: number;
  totalCopiedFiles: number;
  totalElapsedMs: number;
  totalTokens: number;
  targetLanguages: string[];
}

/**
 * 翻译错误条目
 */
export interface FailedFileEntry {
  sourceFile: string;
  targetLang: string;
  reason: string;
}

/**
 * 翻译报告
 */
export interface TranslationReport {
  config: Record<string, unknown>;
  summary: ReportSummary;
  files: FileReportEntry[];
  generatedAt: string;
  errors?: FailedFileEntry[];
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
  taskId?: string;
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
  report: ReportConfig;
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
