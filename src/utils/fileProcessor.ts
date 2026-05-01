/**
 * 文件处理工具模块
 */

import path from 'path';
import fs from 'fs/promises';
import yaml from 'js-yaml';
import type { ProcessedFrontMatter } from '../types';
import { fileConfig } from '../config';
import { Logger } from './logger';

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
          } catch (error) {
            logger.warn(`删除目录失败: ${fullPath}`, error);
          }
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
    lineWidth: -1,
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

export { cleanupOutputFolder, buildOutputContent, copyOtherFiles };