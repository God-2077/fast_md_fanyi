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
import { translationConfig, openaiConfig, fileConfig, validateConfig, getConfigSummary, logLevelConfig } from './config';
import { TranslationService } from './services/translation';
import type { ProcessedFrontMatter } from './types';

// 创建日志记录器
const logger = new Logger(logLevelConfig, 'main');

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
  const sourceLang = source.shortName;

  // 按目标语言处理
  for (const target of targets) {
    const targetLang = target.shortName;
    const targetLogger = logger.child(targetLang);
    
    targetLogger.info(`开始处理目标语言: ${target.fullName} (${targetLang})`);

    for (let index = 0; index < markdownFiles.length; index++) {
      const markdownFile = markdownFiles[index];
      targetLogger.info(`翻译文件 [${index + 1}/${markdownFiles.length}]: ${path.basename(markdownFile)}`);

      try {
        await processMarkdownFile(
          markdownFile,
          inputFolder,
          outputBaseFolder,
          sourceLang,
          targetLang,
          translationService,
          targetLogger
        );
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
      await copyOtherFiles(inputFolder, outputFolder, targetLogger);
    }
  }

  logger.info('=== 所有文件翻译完成 ===');
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
  translationService: TranslationService,
  fileLogger: Logger
): Promise<void> {
  // 1. 读取文件并转换换行符 (CR → LF, CR+LF → LF)
  let markdownContent = await fs.readFile(filePath, 'utf-8');
  markdownContent = markdownContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  if (!markdownContent.trim()) {
    fileLogger.warn('文件内容为空，跳过');
    return;
  }

  // 2. 计算原文哈希值
  const contentHash = crypto.createHash('sha256').update(markdownContent).digest('hex');

  // 3. 解析 front-matter 和正文
  const parsedContent = fm<Record<string, unknown>>(markdownContent);
  const rawFrontMatter = parsedContent.attributes || {};
  const rawMarkdownBody = parsedContent.body || '';

  // 4. 翻译 front-matter 字段
  const processedFrontMatter = await translateFrontMatter(
    rawFrontMatter,
    sourceLang,
    targetLang,
    translationService,
    fileLogger
  );

  // 5. 翻译 Markdown 正文
  let translatedBody = rawMarkdownBody;
  if (rawMarkdownBody.trim()) {
    translatedBody = await translationService.translateMarkdown(
      rawMarkdownBody,
      sourceLang,
      targetLang
    );
  }

  // 6. 添加翻译元数据到 front-matter
  processedFrontMatter.translationMeta = {
    translatedAt: new Date().toISOString(),
    model: openaiConfig.model,
    sourceHash: contentHash,
  };

  // 7. 构建输出内容
  const finalContent = buildOutputContent(processedFrontMatter, translatedBody);

  // 8. 计算并写入输出路径
  const relativePath = path.relative(inputFolder, filePath);
  const outputPath = path.join(outputBaseFolder, targetLang, relativePath);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, finalContent, 'utf-8');

  fileLogger.info(`已生成: ${path.basename(outputPath)}`);
}

/**
 * 翻译 front-matter 字段
 */
async function translateFrontMatter(
  frontMatter: Record<string, unknown>,
  sourceLang: string,
  targetLang: string,
  translationService: TranslationService,
  fileLogger: Logger
): Promise<ProcessedFrontMatter> {
  const processed: ProcessedFrontMatter = { ...frontMatter };

  for (const fieldConfig of translationConfig.frontMatter) {
    const { field, type } = fieldConfig;
    const originalValue = frontMatter[field];

    if (originalValue === undefined || originalValue === null) {
      continue;
    }

    try {
      if (type === 'string' && typeof originalValue === 'string') {
        processed[field] = await translationService.translateText(
          originalValue,
          sourceLang,
          targetLang
        );
      } else if (type === 'string[]' && Array.isArray(originalValue)) {
        processed[field] = await translationService.translateBatch(
          originalValue.filter((item): item is string => typeof item === 'string'),
          sourceLang,
          targetLang
        );
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      fileLogger.warn(`翻译 front-matter 字段 "${field}" 时出错，保留原始值: ${errorMsg}`);
      // 出错时保留原始值
    }
  }

  return processed;
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

  const frontMatterLines = keys.map(key => {
    const value = frontMatter[key];
    if (Array.isArray(value)) {
      return `${key}: [${value.map(item => JSON.stringify(item)).join(', ')}]`;
    } else if (typeof value === 'object' && value !== null) {
      const nestedLines = Object.entries(value as Record<string, unknown>).map(
        ([k, v]) => `    ${k}: ${JSON.stringify(v)}`
      );
      return `${key}:\n${nestedLines.join('\n')}`;
    }
    return `${key}: ${JSON.stringify(value)}`;
  });

  return `---\n${frontMatterLines.join('\n')}\n---\n\n${body}`;
}

async function copyOtherFiles(
  inputFolder: string,
  outputFolder: string,
  logger: Logger
): Promise<void> {
  logger.info('正在复制其他文件...');
  
  const excludedDirs = fileConfig.ignore || ['node_modules', '.git', 'output', '.DS_Store'];
  
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
    logger.info(`已复制: ${relativePath}`);
  }
  
  logger.info(`复制完成，共 ${otherFiles.length} 个文件`);
}

// 启动程序
main().catch((error) => {
  logger.error('程序执行失败', error);
  process.exit(1);
});
