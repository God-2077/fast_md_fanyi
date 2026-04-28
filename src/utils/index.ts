/**
 * 工具模块导出
 */

export { createLogger, globalLogger } from './logger';
export type { Logger } from './logger';
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
export { validateConfig, getConfigSummary } from './config';
export { cleanupOutputFolder, buildOutputContent, copyOtherFiles } from './fileProcessor';