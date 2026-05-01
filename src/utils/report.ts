import path from 'path';
import fs from 'fs/promises';
import type { TranslationReport, FileReportEntry, ReportSummary, FailedFileEntry } from '../types';
import { reportConfig } from '../config';
import { getConfigSummary, formatLocalTime } from './config';
import { Logger } from './logger';
import { logLevelConfig } from '../config';

const reportLogger = new Logger(logLevelConfig, 'report');

export interface ReportData {
  config: Record<string, unknown>;
  summary: ReportSummary;
  files: FileReportEntry[];
}

export function createReportData(
  summary: ReportSummary,
  files: FileReportEntry[],
  errors?: FailedFileEntry[]
): TranslationReport {
  const report: TranslationReport = {
    config: getConfigSummary(),
    summary,
    files,
    generatedAt: new Date().toISOString(),
  };
  if (errors && errors.length > 0) {
    report.errors = errors;
  }
  return report;
}

export async function writeReport(report: TranslationReport): Promise<void> {
  if (!reportConfig.enabled) {
    reportLogger.debug('翻译报告未启用，跳过生成');
    return;
  }

  const outputPath = path.resolve(reportConfig.outputPath.replace(/\{local\}/g, formatLocalTime('file')));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const content = JSON.stringify(report, null, 2);
  await fs.writeFile(outputPath, content, 'utf-8');

  reportLogger.info(`翻译报告已生成: ${outputPath}`);
}
