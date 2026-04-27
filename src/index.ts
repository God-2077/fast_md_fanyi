/**
 * 翻译工具主入口
 * 批量将 Markdown 文件从源语言翻译到多个目标语言
 */

import { glob } from 'glob';
import path from 'path';
import fs from 'fs/promises';
import fm from 'front-matter';
import crypto from 'crypto';

import { Logger } from './utils/logger';
import { translationConfig, openaiConfig, fileConfig, logLevelConfig } from './config';
import { validateConfig, getConfigSummary, cleanupOutputFolder, buildOutputContent, copyOtherFiles } from './utils';
import { TranslationService, TranslationServiceError } from './services/translation';
import type { ProcessedFrontMatter, TranslationMeta } from './types';

const logger = new Logger(logLevelConfig, 'main');

/**
 * 主函数
 */
async function main(): Promise<void> {
  logger.info('=== 翻译工具启动 ===');

  const configValidation = validateConfig();
  if (!configValidation.valid) {
    logger.error('配置验证失败:');
    for (const error of configValidation.errors) {
      logger.error(`  - ${error}`);
    }
    process.exit(1);
  }

  logger.info('配置摘要:', getConfigSummary());

  const inputFolder = path.resolve(fileConfig.inputFolder);
  const outputBaseFolder = path.resolve(fileConfig.outputFolder);

  logger.info(`正在扫描输入文件夹: ${inputFolder}`);
  const markdownFiles = await glob(`${inputFolder}/**/*.md`);

  if (markdownFiles.length === 0) {
    logger.warn('未找到任何 Markdown 文件，程序退出。');
    return;
  }

  logger.info(`找到 ${markdownFiles.length} 个 Markdown 文件`);

  const translationService = new TranslationService(openaiConfig, translationConfig, logger);

  const { source, targets } = translationConfig;
  const sourceLang = source.fullName;

  const outputFilesRecord = new Set<string>();

  let totalFilesTranslated = 0;
  let totalFilesSkipped = 0;
  let totalCopiedFiles = 0;
  let totalTokensUsed = 0;
  let consecutiveErrors = 0;
  const maxConsecutiveErrors = openaiConfig.maxConsecutiveErrors;
  const maxRetriesBehavior = openaiConfig.maxRetriesBehavior;
  const startTime = Date.now();

  for (const target of targets) {
    const targetLang = target.shortName;
    const targetLangFullName = target.fullName;
    const targetLogger = logger.child(targetLang);

    targetLogger.info(`开始处理目标语言: ${target.fullName} (${targetLang})`);

    for (let index = 0; index < markdownFiles.length; index++) {
      const markdownFile = markdownFiles[index];
      targetLogger.info(`翻译文件 [${index + 1}/${markdownFiles.length}]: ${path.basename(markdownFile)}`);

      const fileStartTime = Date.now();
      try {
        const result = await processMarkdownFile(
          markdownFile,
          inputFolder,
          outputBaseFolder,
          sourceLang,
          targetLang,
          targetLangFullName,
          translationService,
          targetLogger
        );

        if (result.skipped) {
          totalFilesSkipped++;
          consecutiveErrors = 0;
        } else {
          outputFilesRecord.add(result.outputPath);
          totalFilesTranslated++;
          consecutiveErrors = 0;
          if (result.usage) {
            totalTokensUsed += result.usage.totalTokens;
          }
        }

        const fileElapsed = Date.now() - fileStartTime;
        if (result.usage) {
          targetLogger.info(
            `耗时: ${(fileElapsed / 1000).toFixed(2)}s, Tokens: ${result.usage.totalTokens}`
          );
        } else if (result.skipped) {
          targetLogger.info(`跳过 (原文未变更), 耗时: ${(fileElapsed / 1000).toFixed(2)}s`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isFatal = error instanceof TranslationServiceError && error.fatal;

        if (isFatal) {
          targetLogger.error(`致命错误，程序终止: ${errorMsg}`);
          process.exit(1);
        }

        consecutiveErrors++;
        targetLogger.error(`处理文件时发生错误: ${markdownFile}, 错误: ${errorMsg}, 连续错误: ${consecutiveErrors}/${maxConsecutiveErrors}`);

        if (consecutiveErrors >= maxConsecutiveErrors) {
          logger.error(`连续错误达到上限 ${maxConsecutiveErrors}，程序退出`);
          process.exit(1);
        }

        if (maxRetriesBehavior === 'exit') {
          logger.error(`达到最大重试次数，配置为退出程序`);
          process.exit(1);
        }

        targetLogger.info(`跳过该文件，继续下一个`);
        continue;
      }
    }

    targetLogger.info(`目标语言 ${target.fullName} (${targetLang}) 处理完成`);

    if (fileConfig.copyOtherFiles) {
      const outputFolder = path.join(outputBaseFolder, targetLang);
      const copiedFiles = await copyOtherFiles(inputFolder, outputFolder, targetLogger);
      for (const f of copiedFiles) {
        outputFilesRecord.add(f);
      }
      totalCopiedFiles += copiedFiles.length;
    }

    await cleanupOutputFolder(path.join(outputBaseFolder, targetLang), outputFilesRecord, targetLogger);
  }

  const totalElapsed = Date.now() - startTime;
  logger.info('=== 所有文件翻译完成 ===');
  logger.info(
    `翻译: ${totalFilesTranslated} 个文件, 跳过: ${totalFilesSkipped} 个文件, 复制: ${totalCopiedFiles} 个文件`
  );
  logger.info(`总耗时: ${(totalElapsed / 1000).toFixed(2)}s, 总Tokens: ${totalTokensUsed}`);
}

/**
 * 处理单个 Markdown 文件
 */
async function processMarkdownFile(
  filePath: string,
  inputFolder: string,
  outputBaseFolder: string,
  sourceLang: string,
  targetLang: string,
  targetLanguage: string,
  translationService: TranslationService,
  fileLogger: Logger
): Promise<{ outputPath: string; skipped: boolean; usage?: { totalTokens: number } }> {
  let markdownContent = await fs.readFile(filePath, 'utf-8');
  markdownContent = markdownContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (!markdownContent.trim()) {
    fileLogger.warn('文件内容为空，跳过');
    return { outputPath: '', skipped: false };
  }

  const contentHash = crypto.createHash('sha256').update(markdownContent).digest('hex');

  const relativePath = path.relative(inputFolder, filePath);
  const outputPath = path.join(outputBaseFolder, targetLang, relativePath);

  if (fileConfig.skipUnchanged) {
    try {
      const existingContent = await fs.readFile(outputPath, 'utf-8');
      const parsed = fm<Record<string, unknown>>(existingContent);
      const existingMeta = parsed.attributes.translationMeta as TranslationMeta | undefined;

      if (existingMeta?.sourceHash === contentHash) {
        fileLogger.info(`原文未变更，跳过翻译: ${path.basename(outputPath)}`);
        return { outputPath, skipped: true };
      }
    } catch {
      // 文件不存在，继续翻译
    }
  }

  const parsedContent = fm<Record<string, unknown>>(markdownContent);
  const rawFrontMatter = parsedContent.attributes || {};
  const rawMarkdownBody = parsedContent.body || '';

  const { frontMatter: processedFrontMatter, usage: frontMatterUsage } = await translateFrontMatter(
    rawFrontMatter,
    sourceLang,
    targetLanguage,
    translationService,
    fileLogger
  );

  let translatedBody = rawMarkdownBody;
  let bodyUsage: { totalTokens: number } | undefined;
  if (rawMarkdownBody.trim()) {
    const bodyResult = await translationService.translateMarkdown(
      rawMarkdownBody,
      sourceLang,
      targetLanguage
    );
    translatedBody = bodyResult.translatedText;
    bodyUsage = bodyResult.usage;
  }

  processedFrontMatter.translationMeta = {
    translatedAt: new Date().toISOString(),
    model: openaiConfig.model,
    sourceHash: contentHash,
  };

  const finalContent = buildOutputContent(processedFrontMatter, translatedBody);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, finalContent, 'utf-8');

  fileLogger.info(`已生成: ${path.basename(outputPath)}`);

  const totalUsage = (frontMatterUsage?.totalTokens || 0) + (bodyUsage?.totalTokens || 0);
  return {
    outputPath,
    skipped: false,
    usage: totalUsage > 0 ? { totalTokens: totalUsage } : undefined,
  };
}

/**
 * 翻译 front-matter 字段
 */
async function translateFrontMatter(
  frontMatter: Record<string, unknown>,
  sourceLang: string,
  targetLanguage: string,
  translationService: TranslationService,
  fileLogger: Logger
): Promise<{ frontMatter: ProcessedFrontMatter; usage?: { totalTokens: number } }> {
  const processed: ProcessedFrontMatter = { ...frontMatter };
  let totalUsage = 0;

  for (const fieldConfig of translationConfig.frontMatter) {
    const { field, type } = fieldConfig;
    const originalValue = frontMatter[field];

    if (originalValue === undefined || originalValue === null) {
      continue;
    }

    try {
      if (type === 'string' && typeof originalValue === 'string') {
        const result = await translationService.translateText(
          originalValue,
          sourceLang,
          targetLanguage
        );
        processed[field] = result.translatedText;
        if (result.usage) totalUsage += result.usage.totalTokens;
      } else if (type === 'string[]' && Array.isArray(originalValue)) {
        const result = await translationService.translateBatch(
          originalValue.filter((item): item is string => typeof item === 'string'),
          sourceLang,
          targetLanguage
        );
        processed[field] = result.translations;
        if (result.usage) totalUsage += result.usage.totalTokens;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      fileLogger.warn(`翻译 front-matter 字段 "${field}" 时出错，保留原始值: ${errorMsg}`);
    }
  }

  return {
    frontMatter: processed,
    usage: totalUsage > 0 ? { totalTokens: totalUsage } : undefined,
  };
}

main().catch((error) => {
  logger.error('程序执行失败', error);
  process.exit(1);
});