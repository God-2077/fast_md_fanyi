/**
 * 翻译服务模块
 * 提供统一的翻译功能，支持 Markdown 和纯文本翻译
 */

import type { 
  TranslationConfig, 
  OpenAIConfig, 
  FetchOpenAIConfig, 
  TranslateOptions,
  TranslateResult
} from '../types';
import { Logger } from '../utils/logger';
import { preservedHandle, restoreText } from '../utils/preservedText';
import { createTranslateMessages } from '../utils/prompt';
import { fetchOpenAIData } from '../services/openai';
import { logLevelConfig } from '../config';

/**
 * 翻译服务错误
 */
export class TranslationServiceError extends Error {
  constructor(message: string, public readonly fatal: boolean = false) {
    super(message);
    this.name = 'TranslationServiceError';
  }
}

/**
 * 翻译服务类
 */
export class TranslationService {
  private config: OpenAIConfig;
  private translationConfig: TranslationConfig;
  private logger: Logger;

  constructor(
    openaiConfig: OpenAIConfig,
    translationConfig: TranslationConfig,
    logger?: Logger
  ) {
    this.config = openaiConfig;
    this.translationConfig = translationConfig;
    this.logger = logger || new Logger(logLevelConfig, 'TranslationService');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 翻译 Markdown 内容
   */
  async translateMarkdown(
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<{ translatedText: string; usage?: { totalTokens: number } }> {
    const options: TranslateOptions = {
      sourceLanguage,
      targetLanguage,
      retryCount: this.config.retryCount,
    };

    const result = await this.executeTranslation(
      text,
      options,
      this.translationConfig.preservedTerms,
      this.translationConfig.preservedFields
    );

    if (!result.success) {
      throw new Error(result.error || 'Translation failed');
    }

    return {
      translatedText: result.translatedText!,
      usage: result.usage,
    };
  }

  /**
   * 翻译纯文本
   */
  async translateText(
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<{ translatedText: string; usage?: { totalTokens: number } }> {
    const options: TranslateOptions = {
      sourceLanguage,
      targetLanguage,
      retryCount: this.config.retryCount,
    };

    const result = await this.executeTranslation(
      text,
      options,
      this.translationConfig.preservedTerms,
      []
    );

    if (!result.success) {
      throw new Error(result.error || 'Translation failed');
    }

    return {
      translatedText: result.translatedText!,
      usage: result.usage,
    };
  }

  /**
   * 批量翻译文本数组
   */
  async translateBatch(
    texts: string[],
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<{ translations: string[]; usage?: { totalTokens: number } }> {
    const results = await Promise.all(
      texts.map(text => this.translateText(text, sourceLanguage, targetLanguage))
    );
    
    const translations = results.map(r => r.translatedText);
    const totalUsage = results.reduce((sum, r) => sum + (r.usage?.totalTokens || 0), 0);
    
    return {
      translations,
      usage: totalUsage > 0 ? { totalTokens: totalUsage } : undefined,
    };
  }

  /**
   * 执行翻译的核心逻辑
   */
  private async executeTranslation(
    text: string,
    options: TranslateOptions,
    preservedTerms: RegExp[],
    preservedFields: RegExp[]
  ): Promise<TranslateResult> {
    const maxRetries = options.retryCount || 3;
    let lastError: string = '';

    this.logger.info(`开始翻译: ${options.sourceLanguage} -> ${options.targetLanguage}`);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 构建提示词
        const messages = createTranslateMessages(
          this.config.promptTemplate,
          options.sourceLanguage,
          options.targetLanguage,
          text
        );

        // 预处理：保留特殊内容
        const { text: processedText, dictionary } = preservedHandle(
          text,
          preservedTerms,
          preservedFields
        );

        // 更新消息内容
        messages[1] = {
          role: 'user',
          content: processedText,
        };

        // 发送请求
        const apiConfig: FetchOpenAIConfig = {
          apiKey: this.config.apiKey,
          baseURL: this.config.baseURL,
          model: this.config.model,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
          stream: false,
          timeout: this.config.timeout,
          messages,
          checkMangledCode: this.config.checkMangledCode,
        };

        const response = await fetchOpenAIData(apiConfig);

        if (response.success) {
          // 还原特殊内容
          const restoredText = restoreText(response.content, dictionary);
          // 去除前后空格
          const trimmedText = restoredText.trim();
          this.logger.info(`翻译成功 (${attempt + 1} 次尝试)`);
          this.logger.debug(`Translation successful after ${attempt + 1} attempt(s)`);
          
          return {
            success: true,
            translatedText: trimmedText,
            usage: response.usage,
          };
        }

        lastError = response.error;
        const isFatalError = response.errorClassification === 'fatal';
        this.logger.warn(`翻译尝试 ${attempt + 1} 失败: ${lastError} [${response.errorClassification}]`);

        if (isFatalError) {
          this.logger.error(`收到致命错误，终止翻译: ${lastError}`);
          throw new TranslationServiceError(lastError, true);
        }

        const isRateLimited = response.status === 429;
        const waitTime = isRateLimited ? this.config.rateLimitWait : 1000;
        
        if (attempt < maxRetries - 1) {
          if (isRateLimited) {
            this.logger.info(`速率限制 (429)，等待 ${waitTime / 1000} 秒后重试...`);
          }
          await this.delay(waitTime);
        }

      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        this.logger.warn(`翻译尝试 ${attempt + 1} 错误: ${lastError}`);
      }
    }

    this.logger.error(`翻译失败，已达到最大重试次数 ${maxRetries}`);
    return {
      success: false,
      error: `Translation failed after ${maxRetries} attempts. Last error: ${lastError}`,
    };
  }
}

/**
 * 创建翻译服务实例
 */
export function createTranslationService(
  openaiConfig: OpenAIConfig,
  translationConfig: TranslationConfig,
  logger?: Logger
): TranslationService {
  return new TranslationService(openaiConfig, translationConfig, logger);
}
