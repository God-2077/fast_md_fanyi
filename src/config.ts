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
  // 跳过翻译匹配配置
  skipMatches: [
    // {
    //   // 匹配 front-matter 指定字段，有匹配则跳过
    //   field: 'draft',
    //   fieldPattern: /^true$/i,
    // },
    // {
    //   // 匹配 content 内容，有匹配则跳过
    //   contentPattern: /<!--\s*skip\s*-->/gi,
    // },
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
  // 是否检测乱码
  checkMangledCode: true,
  // 智能 maxTokens（根据内容长度动态调整）
  // 如需自定义计算逻辑，可修改 calculateSmartTokens 函数
  smartTokens: true,
  // 智能 timeout（根据内容长度动态调整）
  // 如需自定义计算逻辑，可修改 calculateSmartTokens 函数
  smartTimeout: true,
  // 达到最大重试次数时的行为
  maxRetriesBehavior: 'skip', // 'skip' 跳过该文件继续下一个, 'exit' 退出程序
  // 连续错误次数限制
  maxConsecutiveErrors: 5, // 连续失败5个文件后退出
  // 429 速率限制等待时间（毫秒）
  rateLimitWait: 10000, // 默认10秒
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
 * 根据系统提示词和内容智能计算 maxTokens 和 timeout
 * @param systemPrompt 系统提示词
 * @param content 待翻译内容
 * @returns 智能计算的 maxTokens 和 timeout
 */
export function calculateSmartTokens(
  _systemPrompt: string,
  content: string
): { maxTokens: number; timeout: number } {
  const contentTokens = Math.ceil(content.length / 4);
  let maxTokens = Math.max(1000, Math.ceil(contentTokens * 1.2));
  const baseTokens = openaiConfig.maxTokens;
  if (maxTokens < baseTokens) {
    maxTokens = baseTokens;
  } else if (maxTokens > baseTokens * 3) {
    maxTokens = baseTokens * 3;
  }

  let timeout = 1000 * 60;
  if (contentTokens > 500) {
    timeout = Math.ceil((contentTokens / 500) * 1000 * 60);
  }
  if (timeout < openaiConfig.timeout) {
    timeout = openaiConfig.timeout;
  } else if (timeout > openaiConfig.timeout * 3) {
    timeout = openaiConfig.timeout * 3;
  }

  return { maxTokens, timeout };
}

export default appConfig;
