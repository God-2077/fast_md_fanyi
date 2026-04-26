/**
 * 翻译工具主入口
 * 批量将 Markdown 文件从源语言翻译到多个目标语言
 */

import { glob } from 'glob';
import path from 'path';
import fs from 'fs/promises';
import fm from 'front-matter';
import yaml from 'js-yaml';
import crypto from 'crypto';

import { Logger } from './utils/logger';
import { translationConfig, openaiConfig, fileConfig, validateConfig, getConfigSummary, logLevelConfig } from './config';
import { TranslationService } from './services/translation';
import type { ProcessedFrontMatter, TranslationMeta } from './types';

// 创建日志记录器
const logger = new Logger(logLevelConfig, 'main');

async function cleanupOutputFolder(
  outputFolder: string,
  outputFilesRecord: Set<string>,
  logger: Logger
): Promise<void> {
  logger.info('正在清理未记录的文件...');
  
  const excludedDirs = fileConfig.ignore || ['node_modules', '.git', 'output', '.DS_Store'];
  let deletedCount = 0;
  
  async function scanDir(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (excludedDirs.includes(entry.name)) continue;
        const subFiles = await scanDir(fullPath);
        files.push(...subFiles);
        if (subFiles.length === 0) {
          try {
            await fs.rmdir(fullPath);
            logger.info(`已删除空目录: ${path.relative(outputFolder, fullPath)}`);
          } catch {}
        }
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
    
    return files;
  }
  
  const existingFiles = await scanDir(outputFolder);
  
  for (const filePath of existingFiles) {
    if (!outputFilesRecord.has(filePath)) {
      try {
        await fs.unlink(filePath);
        logger.info(`已删除: ${path.relative(outputFolder, filePath)}`);
        deletedCount++;
      } catch (error) {
        logger.warn(`删除文件失败: ${filePath}`, error);
      }
    }
  }
  
  logger.info(`清理完成，删除了 ${deletedCount} 个文件`);
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  logger.info('=== 翻译工具启动 ===');

  // 验证配置
  const configValidation = validateConfig();
  if (!configValidation.valid) {
    logger.error('配置验证失败:');
    for (const error of configValidation.errors) {
      logger.error(`  - ${error}`);
    }
    process.exit(1);
  }

  logger.info('配置摘要:', getConfigSummary());

  // 解析文件夹路径
  const inputFolder = path.resolve(fileConfig.inputFolder);
  const outputBaseFolder = path.resolve(fileConfig.outputFolder);

  // 查找所有 Markdown 文件
  logger.info(`正在扫描输入文件夹: ${inputFolder}`);
  const markdownFiles = await glob(`${inputFolder}/**/*.md`);

  if (markdownFiles.length === 0) {
    logger.warn('未找到任何 Markdown 文件，程序退出。');
    return;
  }

  logger.info(`找到 ${markdownFiles.length} 个 Markdown 文件`);

  // 创建翻译服务实例
  const translationService = new TranslationService(openaiConfig, translationConfig, logger);

  const { source, targets } = translationConfig;
  const sourceLang = source.fullName;

  // 记录所有输出文件路径
  const outputFilesRecord = new Set<string>();

  // 总统计
  let totalFilesTranslated = 0;
  let totalFilesSkipped = 0;
  let totalCopiedFiles = 0;
  let totalTokensUsed = 0;
  const startTime = Date.now();

  // 按目标语言处理
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
        } else {
          outputFilesRecord.add(result.outputPath);
          totalFilesTranslated++;
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
        targetLogger.error(`处理文件时发生错误: ${markdownFile}`, error);
        // 跳过当前文件，继续处理下一个
        continue;
      }
    }

    targetLogger.info(`目标语言 ${target.fullName} (${targetLang}) 处理完成`);

    // 复制其他文件（非 Markdown）
    if (fileConfig.copyOtherFiles) {
      const outputFolder = path.join(outputBaseFolder, targetLang);
      const copiedFiles = await copyOtherFiles(inputFolder, outputFolder, targetLogger);
      for (const f of copiedFiles) {
        outputFilesRecord.add(f);
      }
      totalCopiedFiles += copiedFiles.length;
    }

    // 清理输出目录中未记录的文件
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
  // 1. 读取文件并转换换行符 (CR → LF, CR+LF → LF)
  let markdownContent = await fs.readFile(filePath, 'utf-8');
  markdownContent = markdownContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  if (!markdownContent.trim()) {
    fileLogger.warn('文件内容为空，跳过');
    return { outputPath: '', skipped: false };
  }

  // 2. 计算原文哈希值
  const contentHash = crypto.createHash('sha256').update(markdownContent).digest('hex');

  // 3. 构建输出路径
  const relativePath = path.relative(inputFolder, filePath);
  const outputPath = path.join(outputBaseFolder, targetLang, relativePath);

  // 4. 检查是否需要跳过（文件已存在且哈希值匹配）
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

  // 5. 解析 front-matter 和正文
  const parsedContent = fm<Record<string, unknown>>(markdownContent);
  const rawFrontMatter = parsedContent.attributes || {};
  const rawMarkdownBody = parsedContent.body || '';

  // 6. 翻译 front-matter 字段
  const { frontMatter: processedFrontMatter, usage: frontMatterUsage } = await translateFrontMatter(
    rawFrontMatter,
    sourceLang,
    targetLanguage,
    translationService,
    fileLogger
  );

  // 7. 翻译 Markdown 正文
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

  // 8. 添加翻译元数据到 front-matter
  processedFrontMatter.translationMeta = {
    translatedAt: new Date().toISOString(),
    model: openaiConfig.model,
    sourceHash: contentHash,
  };

  // 9. 构建输出内容
  const finalContent = buildOutputContent(processedFrontMatter, translatedBody);

  // 10. 写入输出文件
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

/**
 * 构建输出内容
 */
function buildOutputContent(
  frontMatter: ProcessedFrontMatter,
  body: string
): string {
  const keys = Object.keys(frontMatter);

  if (keys.length === 0) {
    return body;
  }

  const yamlStr = yaml.dump(frontMatter, {
    indent: 2,
    sortKeys: false,
    noRefs: true,
  });

  return `---\n${yamlStr}---\n\n${body}`;
}

async function copyOtherFiles(
  inputFolder: string,
  outputFolder: string,
  logger: Logger
): Promise<string[]> {
  logger.info('正在复制其他文件...');
  
  const excludedDirs = fileConfig.ignore || ['node_modules', '.git', 'output', '.DS_Store'];
  const copiedFiles: string[] = [];
  
  async function scanDir(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (excludedDirs.includes(entry.name)) continue;
        const subFiles = await scanDir(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && !entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
    
    return files;
  }
  
  const otherFiles = await scanDir(inputFolder);
  
  for (const filePath of otherFiles) {
    const relativePath = path.relative(inputFolder, filePath);
    const destPath = path.join(outputFolder, relativePath);
    
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(filePath, destPath);
    copiedFiles.push(destPath);
    logger.info(`已复制: ${relativePath}`);
  }
  
  logger.info(`复制完成，共 ${otherFiles.length} 个文件`);
  return copiedFiles;
}

// 启动程序
main().catch((error) => {
  logger.error('程序执行失败', error);
  process.exit(1);
});
