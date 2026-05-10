import '../env';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import yaml from 'js-yaml';
import { glob } from 'glob';
import { fileConfig, translationConfig } from '../config';
import type { TranslationMeta } from '../types';

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

function computeHashes(
  rawMarkdown: string,
  rawBody: string,
  rawFrontMatter: Record<string, unknown>,
): { fullHash: string; bodyHash: string; fieldHashes: Record<string, string> } {
  const fullHash = crypto.createHash('sha256').update(rawMarkdown).digest('hex');
  const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const fieldHashes: Record<string, string> = {};
  for (const fc of translationConfig.frontMatter) {
    const val = rawFrontMatter[fc.field];
    if (val === undefined || val === null) continue;
    const input = fc.type === 'string[]' ? JSON.stringify(val) : String(val);
    fieldHashes[fc.field] = crypto.createHash('sha256').update(input).digest('hex');
  }
  return { fullHash, bodyHash, fieldHashes };
}

function buildOutputContent(frontMatter: Record<string, unknown>, body: string): string {
  const keys = Object.keys(frontMatter);
  if (keys.length === 0) return body;
  const yamlStr = yaml.dump(frontMatter, { indent: 2, sortKeys: false, noRefs: true, lineWidth: -1 });
  return `---\n${yamlStr}---\n\n${body}`;
}

interface MigrateResult {
  outputFile: string;
  sourceFile: string;
  status: 'migrated' | 'skipped_already' | 'skipped_no_meta' | 'skipped_no_source' | 'skipped_hash_mismatch' | 'error';
  detail?: string;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');

  const inputFolder = path.resolve(fileConfig.inputFolder);
  const outputFolder = path.resolve(fileConfig.outputFolder);

  console.log(`输入目录: ${inputFolder}`);
  console.log(`输出目录: ${outputFolder}`);
  console.log(`模式: ${dryRun ? '预览 (--dry-run)' : '写入'}${force ? ', 强制执行 (--force)' : ''}`);
  console.log('');

  const mdFiles = await glob('**/*.md', { cwd: outputFolder, ignore: ['translation-report-*.json'] });
  console.log(`找到 ${mdFiles.length} 个输出文件\n`);

  const results: MigrateResult[] = [];

  for (const relPath of mdFiles) {
    const outputFilePath = path.join(outputFolder, relPath);

    try {
      const existingContent = await fs.readFile(outputFilePath, 'utf-8');
      const parsed = parseFrontMatter(existingContent);
      const meta = parsed.attributes.translationMeta as TranslationMeta | undefined;

      if (!meta || !meta.sourceHash) {
        results.push({
          outputFile: relPath,
          sourceFile: '',
          status: 'skipped_no_meta',
          detail: '无 translationMeta 或 sourceHash',
        });
        continue;
      }

      if (meta.bodyHash !== undefined && meta.fieldHashes !== undefined) {
        results.push({
          outputFile: relPath,
          sourceFile: '',
          status: 'skipped_already',
          detail: '已包含新格式 hash',
        });
        continue;
      }

      const sourceFilePath = path.join(inputFolder, relPath);
      let sourceContent: string;

      try {
        sourceContent = await fs.readFile(sourceFilePath, 'utf-8');
        sourceContent = sourceContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      } catch {
        results.push({
          outputFile: relPath,
          sourceFile: sourceFilePath,
          status: 'skipped_no_source',
          detail: '找不到对应源文件',
        });
        continue;
      }

      const sourceParsed = parseFrontMatter(sourceContent);
      const { fullHash, bodyHash, fieldHashes } = computeHashes(
        sourceContent,
        sourceParsed.body,
        sourceParsed.attributes || {},
      );

      if (!force && fullHash !== meta.sourceHash) {
        results.push({
          outputFile: relPath,
          sourceFile: relPath,
          status: 'skipped_hash_mismatch',
          detail: `源文件已变更 (旧: ${meta.sourceHash.slice(0, 12)}..., 新: ${fullHash.slice(0, 12)}...)`,
        });
        continue;
      }

      if (force && fullHash !== meta.sourceHash) {
        console.warn(`  警告: ${relPath} 源文件已变更，强制更新 hash`);
      }

      meta.bodyHash = bodyHash;
      meta.fieldHashes = fieldHashes;

      const outputBody = parsed.body;
      const newContent = buildOutputContent(parsed.attributes, outputBody);

      if (!dryRun) {
        await fs.writeFile(outputFilePath, newContent, 'utf-8');
      }

      results.push({ outputFile: relPath, sourceFile: relPath, status: 'migrated' });
      console.log(`  ${dryRun ? '[预览] ' : ''}已迁移: ${relPath}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ outputFile: relPath, sourceFile: '', status: 'error', detail: msg });
      console.error(`  错误: ${relPath} - ${msg}`);
    }
  }

  const count = (s: MigrateResult['status']) => results.filter(r => r.status === s).length;

  console.log('\n=== 迁移完成 ===');
  console.log(`  已迁移:             ${count('migrated')}`);
  console.log(`  跳过 (已是最新):    ${count('skipped_already')}`);
  console.log(`  跳过 (无元数据):    ${count('skipped_no_meta')}`);
  console.log(`  跳过 (无源文件):    ${count('skipped_no_source')}`);
  console.log(`  跳过 (hash 不匹配): ${count('skipped_hash_mismatch')}`);

  if (count('error') > 0) {
    console.log(`  错误:               ${count('error')}`);
  }
}

main().catch((err) => {
  console.error('迁移脚本失败:', err instanceof Error ? err.message : err);
  process.exit(1);
});
