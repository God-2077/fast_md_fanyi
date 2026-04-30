/**
 * 工具模块导出
 */

export { Logger } from './logger';
export {
  preservedHandle,
  restoreText,
  hasPlaceholder,
  cleanResidualPlaceholders
} from './preservedText';
export {
  generatePrompt,
  createTranslateSystemMessage,
  createTranslateUserMessage,
  createTranslateMessages,
  DEFAULT_PROMPT_TEMPLATE
} from './prompt';
export { validateConfig, getConfigSummary, formatLocalTime } from './config';
export { cleanupOutputFolder, buildOutputContent, copyOtherFiles } from './fileProcessor';
export { createReportData, writeReport } from './report';
export type { ReportData } from './report';