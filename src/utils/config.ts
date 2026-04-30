import { translationConfig, openaiConfig, fileConfig, logLevelConfig } from '../config';

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function formatLocalTime(type: 'file' | 'display' = 'display'): string {
  const now = new Date();
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return type === 'file' ? `${date}_${time.replace(/:/g, '-')}` : `${date} ${time}`;
}

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
    logLevel: logLevelConfig,
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