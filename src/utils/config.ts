import { translationConfig, openaiConfig, fileConfig, logConfig } from '../config';

export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!openaiConfig.apiKey) {
    errors.push('OPENAI_API_KEY is not set. Please set the environment variable or update config.ts');
  }

  if (!openaiConfig.baseURL) {
    errors.push('OpenAI base URL is required');
  }

  if (openaiConfig.temperature < 0 || openaiConfig.temperature > 1) {
    errors.push('Temperature must be between 0 and 1');
  }

  if (openaiConfig.retryCount < 0) {
    errors.push('Retry count must be non-negative');
  }

  if (!fileConfig.inputFolder) {
    errors.push('Input folder path is required');
  }

  if (!fileConfig.outputFolder) {
    errors.push('Output folder path is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getConfigSummary(): Record<string, unknown> {
  return {
    logLevel: logConfig.level,
    logOutputToFile: logConfig.outputToFile,
    logFilePath: logConfig.filePath,
    sourceLanguage: translationConfig.source,
    targetLanguages: translationConfig.targets.map(t => t.fullName),
    model: openaiConfig.model,
    temperature: openaiConfig.temperature,
    maxTokens: openaiConfig.maxTokens,
    retryCount: openaiConfig.retryCount,
    inputFolder: fileConfig.inputFolder,
    outputFolder: fileConfig.outputFolder,
  };
}