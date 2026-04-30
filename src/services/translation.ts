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
import { preservedHandle, restoreText, resetIdCounter } from '../utils/preservedText';
import { splitMarkdownIntoChunks } from '../utils/textChunker';
import { createTranslateMessages } from '../utils/prompt';
import { fetchOpenAIData } from '../services/openai';
import { logLevelConfig, calculateSmartTokens } from '../config';

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
   * 如果内容超过 maxCharLength，自动分块翻译
   */
  async translateMarkdown(
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<{ translatedText: string; usage?: { totalTokens: number } }> {
    const maxCharLength = this.translationConfig.maxCharLength;
    if (maxCharLength && text.length > maxCharLength) {
      return this.translateMarkdownChunked(text, sourceLanguage, targetLanguage, maxCharLength);
    }

    const options: TranslateOptions = {
      sourceLanguage,
      targetLanguage,
      retryCount: this.config.retryCount,
    };

    const result = await this.executeTranslation(
      text,
      options,
      this.translationConfig.preservedTerms,
      this.translationConfig.preservedFields,
      this.translationConfig.preservedTermsUseFieldPlaceholder,
      'markdown'
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
   * 分块翻译 Markdown 内容
   */
  private async translateMarkdownChunked(
    text: string,
    sourceLanguage: string,
    targetLanguage: string,
    maxCharLength: number
  ): Promise<{ translatedText: string; usage?: { totalTokens: number } }> {
    const chunks = splitMarkdownIntoChunks(text, maxCharLength);
    this.logger.info(`内容长度 ${text.length} 超过限制 ${maxCharLength}，分割为 ${chunks.length} 个块`);

    const options: TranslateOptions = {
      sourceLanguage,
      targetLanguage,
      retryCount: this.config.retryCount,
    };

    const translatedChunks: string[] = [];
    let totalTokens = 0;

    for (let i = 0; i < chunks.length; i++) {
      this.logger.debug(`翻译第 ${i + 1}/${chunks.length} 个块 (${chunks[i].length} 字符)`);

      const result = await this.executeTranslation(
        chunks[i],
        options,
        this.translationConfig.preservedTerms,
        this.translationConfig.preservedFields,
        this.translationConfig.preservedTermsUseFieldPlaceholder,
        'markdown'
      );

      if (!result.success) {
        throw new Error(`Block ${i + 1} translation failed: ${result.error}`);
      }

      translatedChunks.push(result.translatedText!);
      if (result.usage) {
        totalTokens += result.usage.totalTokens;
      }
    }

    this.logger.info(`分块翻译完成，共 ${chunks.length} 个块`);

    return {
      translatedText: translatedChunks.join('\n\n'),
      usage: { totalTokens },
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
      [],
      this.translationConfig.preservedTermsUseFieldPlaceholder,
      'text'
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
   * 获取提示词模板
   * 根据翻译类型返回对应的提示词模板
   */
  private getPromptTemplate(type: 'markdown' | 'text'): string {
    if (type === 'markdown') {
      return this.config.markdownPromptTemplate || this.config.promptTemplate || '';
    }
    if (type === 'text') {
      return this.config.textPromptTemplate || this.config.promptTemplate || '';
    }
    return '';
  }

  /**
   * 执行翻译的核心逻辑
   */
  private async executeTranslation(
    text: string,
    options: TranslateOptions,
    preservedTerms: RegExp[],
    preservedFields: RegExp[],
    preservedTermsUseFieldPlaceholder = false,
    type: 'markdown' | 'text' = 'markdown'
  ): Promise<TranslateResult> {
    const maxRetries = options.retryCount || 3;
    let lastError: string = '';

    this.logger.info(`开始翻译: ${options.sourceLanguage} -> ${options.targetLanguage} [${type}]`);

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 构建提示词
        const promptTemplate = this.getPromptTemplate(type);
        const messages = createTranslateMessages(
          promptTemplate,
          options.sourceLanguage,
          options.targetLanguage,
          text
        );

        resetIdCounter();

        const systemPrompt = (messages[0] as { content: string }).content || '';
        
        let maxTokens = this.config.maxTokens;
        let timeout = this.config.timeout;
        if (this.config.smartTokens || this.config.smartTimeout) {
          const smartResult = calculateSmartTokens(systemPrompt, text);
          if (this.config.smartTokens) maxTokens = smartResult.maxTokens;
          if (this.config.smartTimeout) timeout = smartResult.timeout;
        }

        const { text: processedText, dictionary } = preservedHandle(
          text,
          preservedTerms,
          preservedFields,
          preservedTermsUseFieldPlaceholder
        );

        messages[1] = {
          role: 'user',
          content: processedText,
        };

        const apiConfig: FetchOpenAIConfig = {
          apiKey: this.config.apiKey,
          baseURL: this.config.baseURL,
          model: this.config.model,
          temperature: this.config.temperature,
          maxTokens,
          stream: false,
          timeout,
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
