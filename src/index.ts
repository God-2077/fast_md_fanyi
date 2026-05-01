import 'dotenv/config';

/**
 * 翻译工具主入口
 * 批量将 Markdown 文件从源语言翻译到多个目标语言
 */

import { glob } from 'glob';
import path from 'path';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import crypto from 'crypto';
import pLimit from 'p-limit';

import { Logger } from './utils/logger';
import { translationConfig, openaiConfig, fileConfig, logLevelConfig, reportConfig } from './config';
import { formatLocalTime, validateConfig, getConfigSummary, cleanupOutputFolder, buildOutputContent, copyOtherFiles, createReportData, writeReport } from './utils';
import { TranslationService, TranslationServiceError } from './services/translation';
import type { ProcessedFrontMatter, TranslationMeta, HeaderFooterSingleConfig, FileReportEntry, ReportSummary, FailedFileEntry } from './types';

const logger = new Logger(logLevelConfig, 'main');

interface FileTaskOutput {
  aborted: boolean;
  skipped: boolean;
  skipReason?: string;
  outputPath: string;
  sourceHash?: string;
  usage?: { totalTokens: number };
  elapsedMs: number;
  report: FileReportEntry;
}

/**
 * 格式化页眉页脚，替换占位符
 */
function formatHeaderFooter(
  config: HeaderFooterSingleConfig | undefined,
  replacements: Record<string, string>
): { header: string; footer: string } {
  const header = config?.header || '';
  const footer = config?.footer || '';

  const formatText = (text: string): string => {
    let result = text;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  };

  return {
    header: formatText(header),
    footer: formatText(footer),
  };
}

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

  const fileReports: FileReportEntry[] = [];

  let totalFilesTranslated = 0;
  let totalFilesSkipped = 0;
  let totalCopiedFiles = 0;
  let totalTokensUsed = 0;
  const maxConsecutiveErrors = openaiConfig.maxConsecutiveErrors;
  const maxRetriesBehavior = openaiConfig.maxRetriesBehavior;
  const startTime = Date.now();

  let fatalAborted = false;
  let currentController: AbortController | null = null;

  const onSigint = () => {
    if (fatalAborted) {
      logger.error('收到第二次中断信号，强制退出');
      process.exit(1);
    }
    logger.warn('收到中断信号，正在停止...');
    fatalAborted = true;
    if (currentController) {
      currentController.abort();
    }
  };
  process.on('SIGINT', onSigint);

  for (const target of targets) {
    if (fatalAborted) break;

    const targetLang = target.shortName;
    const targetLangFullName = target.fullName;
    const targetLogger = logger.child(targetLang);

    targetLogger.info(`开始处理目标语言: ${target.fullName} (${targetLang})`);

    const controller = new AbortController();
    currentController = controller;
    const { signal } = controller;
    const limit = pLimit(openaiConfig.threadCount);

    const consecutiveErrorCount = { value: 0 };
    let abortReason = '';

    const processFileTask = async (filePath: string, index: number): Promise<FileTaskOutput> => {
      const taskId = String(index + 1);
      const taskLogger = targetLogger.child(taskId);

      if (signal.aborted) {
        return {
          aborted: true,
          skipped: false,
          outputPath: '',
          elapsedMs: 0,
          report: {
            sourceFile: filePath,
            outputFile: '',
            targetLang,
            success: false,
            skipped: false,
            failureReason: abortReason ? `任务已取消 (原因: ${abortReason})` : '任务已取消',
            elapsedMs: 0,
          },
        };
      }

      taskLogger.info(`翻译文件 [${index + 1}/${markdownFiles.length}]: ${path.basename(filePath)}`);
      const fileStartTime = Date.now();

      try {
        const result = await processMarkdownFile(
          filePath,
          inputFolder,
          outputBaseFolder,
          sourceLang,
          targetLang,
          targetLangFullName,
          source.shortName,
          translationService,
          taskLogger,
          signal,
          taskId
        );

        const fileElapsed = Date.now() - fileStartTime;
        consecutiveErrorCount.value = 0;

        const report: FileReportEntry = {
          sourceFile: filePath,
          outputFile: result.outputPath,
          targetLang,
          success: true,
          skipped: result.skipped,
          skipReason: result.skipReason,
          sourceHash: result.sourceHash,
          tokensUsed: result.usage?.totalTokens || 0,
          elapsedMs: fileElapsed,
        };

        if (result.usage) {
          taskLogger.info(
            `耗时: ${(fileElapsed / 1000).toFixed(2)}s, Tokens: ${result.usage.totalTokens}`
          );
        } else if (result.skipped) {
          taskLogger.info(`跳过 (原文未变更), 耗时: ${(fileElapsed / 1000).toFixed(2)}s`);
        }

        return {
          aborted: false,
          skipped: result.skipped,
          skipReason: result.skipReason,
          outputPath: result.outputPath,
          sourceHash: result.sourceHash,
          usage: result.usage,
          elapsedMs: fileElapsed,
          report,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isFatal = error instanceof TranslationServiceError && error.fatal;
        const fileElapsed = Date.now() - fileStartTime;

        const report: FileReportEntry = {
          sourceFile: filePath,
          outputFile: '',
          targetLang,
          success: false,
          skipped: false,
          failureReason: errorMsg,
          elapsedMs: fileElapsed,
        };

        if (isFatal) {
          taskLogger.error(`致命错误，广播停止信号: ${errorMsg}`);
          if (!abortReason) abortReason = errorMsg;
          controller.abort();
          return { aborted: true, skipped: false, outputPath: '', elapsedMs: fileElapsed, report };
        }

        consecutiveErrorCount.value++;
        taskLogger.error(
          `处理文件时发生错误: ${filePath}, 错误: ${errorMsg}, 连续错误: ${consecutiveErrorCount.value}/${maxConsecutiveErrors}`
        );

        if (consecutiveErrorCount.value >= maxConsecutiveErrors) {
          logger.error(`连续错误达到上限 ${maxConsecutiveErrors}，广播停止信号`);
          if (!abortReason) abortReason = `连续 ${maxConsecutiveErrors} 个文件处理失败`;
          controller.abort();
          return { aborted: true, skipped: false, outputPath: '', elapsedMs: fileElapsed, report };
        }

        if (maxRetriesBehavior === 'exit') {
          logger.error('达到最大重试次数，配置为退出程序');
          if (!abortReason) abortReason = errorMsg;
          controller.abort();
          return { aborted: true, skipped: false, outputPath: '', elapsedMs: fileElapsed, report };
        }

        taskLogger.info('跳过该文件，继续下一个');
        return {
          aborted: false,
          skipped: false,
          outputPath: '',
          elapsedMs: fileElapsed,
          report,
        };
      }
    };

    const tasks = markdownFiles.map((file, idx) =>
      limit(() => processFileTask(file, idx))
    );

    const allSettledPromise = Promise.allSettled(tasks);
    const abortPromise = new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => {
        const reason = abortReason ? `: ${abortReason}` : '';
        reject(new Error(`任务因致命错误而中止${reason}`));
      });
    });

    let fileResults: PromiseSettledResult<FileTaskOutput>[];

    try {
      fileResults = await Promise.race([
        allSettledPromise,
        abortPromise,
      ]);
    } catch {
      logger.error('因致命错误，任务已中止');
      fatalAborted = true;
      fileResults = await Promise.allSettled(tasks);
    }

    for (const settled of fileResults) {
      if (settled.status === 'rejected') {
        continue;
      }
      const data = settled.value;
      fileReports.push(data.report);

      if (data.skipped) {
        totalFilesSkipped++;
        if (data.outputPath) {
          outputFilesRecord.add(data.outputPath);
        }
      } else if (data.aborted) {
        // Aborted tasks are already reported
      } else if (data.outputPath) {
        outputFilesRecord.add(data.outputPath);
        totalFilesTranslated++;
        if (data.usage) {
          totalTokensUsed += data.usage.totalTokens;
        }
      }
      // Failed files remain in report only
    }

    if (signal.aborted) {
      logger.error('因致命错误，任务已中止');
      fatalAborted = true;
    }

    if (!fatalAborted) {
      targetLogger.info(`目标语言 ${target.fullName} (${targetLang}) 处理完成`);
    }

    if (fileConfig.copyOtherFiles && !fatalAborted) {
      const outputFolder = path.join(outputBaseFolder, targetLang);
      const copiedFiles = await copyOtherFiles(inputFolder, outputFolder, targetLogger);
      for (const f of copiedFiles) {
        outputFilesRecord.add(f);
      }
      totalCopiedFiles += copiedFiles.length;
    }

    if (!fatalAborted) {
      await cleanupOutputFolder(path.join(outputBaseFolder, targetLang), outputFilesRecord, targetLogger);
    }

    currentController = null;

    if (fatalAborted) break;
  }

  currentController = null;
  process.off('SIGINT', onSigint);

  const totalElapsed = Date.now() - startTime;
  logger.info('=== 所有文件翻译完成 ===');
  logger.info(
    `翻译: ${totalFilesTranslated} 个文件, 跳过: ${totalFilesSkipped} 个文件, 复制: ${totalCopiedFiles} 个文件`
  );
  logger.info(`总耗时: ${(totalElapsed / 1000).toFixed(2)}s, 总Tokens: ${totalTokensUsed}`);

  const failedFiles = fileReports.filter(f => !f.success && !f.skipped);
  const errorEntries: FailedFileEntry[] = failedFiles.map(f => ({
    sourceFile: f.sourceFile,
    targetLang: f.targetLang,
    reason: f.failureReason || '未知错误',
  }));

  if (errorEntries.length > 0) {
    logger.error(`错误: ${errorEntries.length} 个文件翻译失败:`);
    for (const e of errorEntries) {
      logger.error(`  - ${e.sourceFile} (${e.reason})`);
    }
  }

  if (reportConfig.enabled) {
    const summary: ReportSummary = {
      totalFiles: markdownFiles.length,
      totalTranslated: totalFilesTranslated,
      totalSkipped: totalFilesSkipped,
      totalFailed: errorEntries.length,
      totalCopiedFiles,
      totalElapsedMs: totalElapsed,
      totalTokens: totalTokensUsed,
      targetLanguages: targets.map(t => t.fullName),
    };
    const report = createReportData(summary, fileReports, errorEntries);
    await writeReport(report);
  }

  if (fatalAborted) {
    logger.error('程序因错误而中止');
    process.exit(1);
  }
}

/**
 * 解析 Markdown 文件的 YAML front-matter，使用 JSON_SCHEMA 避免将日期字符串转为 Date 对象
 */
function parseFrontMatter(content: string): { attributes: Record<string, unknown>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { attributes: {}, body: content };
  }

  const yamlStr = match[1];
  const body = match[2];

  const attributes = (yaml.load(yamlStr, { schema: yaml.JSON_SCHEMA }) as Record<string, unknown>) || {};

  return { attributes, body };
}

/**
 * 处理单个 Markdown 文件
 */
function shouldSkipTranslation(
  frontMatter: Record<string, unknown>,
  content: string,
  fileLogger: Logger
): boolean {
  const skipMatches = translationConfig.skipMatches;
  if (!skipMatches || skipMatches.length === 0) {
    return false;
  }

  for (const match of skipMatches) {
    if (match.field && match.fieldPattern) {
      const fieldValue = frontMatter[match.field];
      if (fieldValue !== undefined && fieldValue !== null) {
        const fieldStr = String(fieldValue);
        if (match.fieldPattern.test(fieldStr)) {
          fileLogger.debug(`跳过匹配: field="${match.field}" matches "${match.fieldPattern}"`);
          return true;
        }
      }
    }

    if (match.contentPattern) {
      if (match.contentPattern.test(content)) {
        fileLogger.debug(`跳过匹配: content matches "${match.contentPattern}"`);
        return true;
      }
    }
  }

  return false;
}

async function processMarkdownFile(
  filePath: string,
  inputFolder: string,
  outputBaseFolder: string,
  sourceLang: string,
  targetLang: string,
  targetLanguage: string,
  sourceShortName: string,
  translationService: TranslationService,
  fileLogger: Logger,
  signal?: AbortSignal,
  taskId?: string
): Promise<{ outputPath: string; skipped: boolean; usage?: { totalTokens: number }; sourceHash: string; skipReason?: string }> {
  if (signal?.aborted) {
    throw new TranslationServiceError('Translation cancelled (another task already triggered abort)', true);
  }

  let markdownContent = await fs.readFile(filePath, 'utf-8');
  markdownContent = markdownContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (!markdownContent.trim()) {
    fileLogger.warn('文件内容为空，跳过');
    return { outputPath: '', skipped: true, sourceHash: '', skipReason: 'file content empty' };
  }

  const contentHash = crypto.createHash('sha256').update(markdownContent).digest('hex');

  const relativePath = path.relative(inputFolder, filePath);
  const outputPath = path.join(outputBaseFolder, targetLang, relativePath);

  if (fileConfig.skipUnchanged) {
    try {
      const existingContent = await fs.readFile(outputPath, 'utf-8');
      const parsed = parseFrontMatter(existingContent);
      const existingMeta = parsed.attributes.translationMeta as TranslationMeta | undefined;

      if (existingMeta?.sourceHash === contentHash) {
        fileLogger.info(`原文未变更，跳过翻译: ${path.basename(outputPath)}`);
        return { outputPath, skipped: true, sourceHash: contentHash, skipReason: 'source content unchanged' };
      }
    } catch {
      // 文件不存在，继续翻译
    }
  }

  const parsedContent = parseFrontMatter(markdownContent);
  const rawFrontMatter = parsedContent.attributes || {};
  const rawMarkdownBody = parsedContent.body || '';

  if (shouldSkipTranslation(rawFrontMatter, rawMarkdownBody, fileLogger)) {
    fileLogger.info(`跳过翻译: ${path.basename(outputPath)} (匹配跳过规则)`);
    return { outputPath, skipped: true, sourceHash: contentHash, skipReason: 'matched skip rule' };
  }

  const { frontMatter: processedFrontMatter, usage: frontMatterUsage } = await translateFrontMatter(
    rawFrontMatter,
    sourceLang,
    targetLanguage,
    translationService,
    fileLogger,
    taskId
  );

  let translatedBody = rawMarkdownBody;
  let bodyUsage: { totalTokens: number } | undefined;
  if (rawMarkdownBody.trim()) {
    const bodyResult = await translationService.translateMarkdown(
      rawMarkdownBody,
      sourceLang,
      targetLanguage,
      taskId
    );
    translatedBody = bodyResult.translatedText;
    bodyUsage = bodyResult.usage;
  }

  processedFrontMatter.translationMeta = {
    translatedAt: new Date().toISOString(),
    model: openaiConfig.model,
    sourceHash: contentHash,
  };

  let finalBody = translatedBody;
  const headerFooterConfig = translationConfig.headerFooter;
  if (headerFooterConfig) {
    const specificConfig = headerFooterConfig[targetLang] || headerFooterConfig.default;
    const replacements = {
      model: openaiConfig.model,
      local: formatLocalTime('display'),
      targetLanguage: targetLanguage,
      sourceLanguage: sourceLang,
      targetLang,
      sourceLang: sourceShortName,
    };
    const { header, footer } = formatHeaderFooter(specificConfig, replacements);
    if (header) {
      finalBody = header + '\n\n' + finalBody;
    }
    if (footer) {
      finalBody = finalBody + '\n\n' + footer;
    }
  }

  const finalContent = buildOutputContent(processedFrontMatter, finalBody);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, finalContent, 'utf-8');

  fileLogger.info(`已生成: ${path.basename(outputPath)}`);

  const totalUsage = (frontMatterUsage?.totalTokens || 0) + (bodyUsage?.totalTokens || 0);
  return {
    outputPath,
    skipped: false,
    sourceHash: contentHash,
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
  fileLogger: Logger,
  taskId?: string
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
          targetLanguage,
          taskId
        );
        processed[field] = result.translatedText;
        if (result.usage) totalUsage += result.usage.totalTokens;
      } else if (type === 'string[]' && Array.isArray(originalValue)) {
        const result = await translationService.translateBatch(
          originalValue.filter((item): item is string => typeof item === 'string'),
          sourceLang,
          targetLanguage,
          taskId
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

main().catch(async (error) => {
  logger.error('程序执行失败', error);
  process.exit(1);
});