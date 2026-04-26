/**
 * 应用配置文件
 * 集中管理所有配置项，支持环境变量覆盖
 */

import type { 
  TranslationConfig, 
  OpenAIConfig, 
  FileConfig,
  AppConfig,
  LogLevel
} from './types';

/**
 * 日志级别配置
 */
export const logLevelConfig: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'debug';

/**
 * 翻译配置
 */
export const translationConfig: TranslationConfig = {
  // 源语言
  source: {
    fullName: '简体中文',
    shortName: 'zh',
  },
  // 目标语言
  targets: [
    {
      fullName: '英文',
      shortName: 'en',
    },
    // {
      // fullName: '日文',
      // shortName: 'ja',
    // },
  ],
  // 需要翻译的 front-matter 字段
  frontMatter: [
    {
      field: 'title',
      type: 'string',
    },
    {
      field: 'description',
      type: 'string',
    },
    {
      field: 'tags',
      type: 'string[]',
    },
  ],
  // 保留字段（不会被翻译）
  preservedFields: [
    /```[\s\S]*?```/g,           // 代码块
    /`[^`]+`/g,                   // 行内代码
    /\$\$[\s\S]*?\$\$/g,         // 数学公式块
    /\$[^$\n]+\$/g,              // 行内数学公式
  ],
  // 保留术语（不会被翻译）
  preservedTerms: [
    /\btoken\b/gi,               // 技术术语示例
    /\bAPI\b/gi,
    /\bSDK\b/gi,
  ],
};

/**
 * OpenAI API 配置
 */
export const openaiConfig: OpenAIConfig = {
  // API Key - 建议通过环境变量 OPENAI_API_KEY 设置
  apiKey: process.env.OPENAI_API_KEY || 'sk-fgvymgrplbdychhplgzavprlkvhxloticxennehpastjetlf',
  // API 基础地址
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.siliconflow.cn/v1',
  // 模型名称
  model: process.env.OPENAI_MODEL || 'Qwen/Qwen3-8B',
//   Qwen/Qwen3-8B Qwen/Qwen2.5-7B-Instruct
  // 温度参数 (0-1)
  temperature: 0.5,
  // 最大输出 token 数
  maxTokens: 1000,
  // 是否使用流式输出
  stream: true,
  // 系统提示词模板
  promptTemplate: '你为高精度专属翻译助手，需按指定语种完成翻译：源语言{sourceLanguage}，目标语言{targetLanguage}。遵循规范：完整保留原文 Markdown 排版、语义风格与语气；仅翻译常规文字，所有  <PTX_*>  格式特殊标识、占位符不做修改；输出仅含翻译结果，无任何附加说明。',
  // 请求超时时间（毫秒）
  timeout: 1000 * 60, // 5 分钟
  // 并发请求数
  threadCount: 3,
  // 重试次数
  retryCount: 3,
};

/**
 * 文件配置
 */
export const fileConfig: FileConfig = {
  inputFolder: 'input',
  ignore: [
    'node_modules',
    'dist',
    'output',
    '.git',
    '.DS_Store',
  ],
  outputFolder: 'output',
  fileName: '{name}_{targetShortName}.{ext}',
  filePath: '{targetShortName}/{filePath}.{ext}',
  preserveFolders: true,
  copyOtherFiles: true,
  skipUnchanged: true,
};

/**
 * 完整的应用配置
 */
export const appConfig: AppConfig = {
  translation: translationConfig,
  openai: openaiConfig,
  file: fileConfig,
  logLevel: logLevelConfig,
};

/**
 * 验证配置
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 验证 OpenAI 配置
  if (!openaiConfig.apiKey) {
    errors.push('OPENAI_API_KEY is not set. Please set the environment variable or update config.ts');
  }

  if (!openaiConfig.baseURL) {
    errors.push('OpenAI base URL is required');
  }

  if (openaiConfig.temperature < 0 || openaiConfig.temperature > 1) {
    errors.push('Temperature must be between 0 and 1');
  }

  if (openaiConfig.retryCount < 0) {
    errors.push('Retry count must be non-negative');
  }

  // 验证文件配置
  if (!fileConfig.inputFolder) {
    errors.push('Input folder path is required');
  }

  if (!fileConfig.outputFolder) {
    errors.push('Output folder path is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 获取配置摘要（用于日志）
 */
export function getConfigSummary(): Record<string, unknown> {
  return {
    logLevel: logLevelConfig,
    sourceLanguage: translationConfig.source,
    targetLanguages: translationConfig.targets.map(t => t.fullName),
    model: openaiConfig.model,
    temperature: openaiConfig.temperature,
    maxTokens: openaiConfig.maxTokens,
    retryCount: openaiConfig.retryCount,
    inputFolder: fileConfig.inputFolder,
    outputFolder: fileConfig.outputFolder,
  };
}

export default appConfig;
