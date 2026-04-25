// config.ts
export interface TranslationConfig {
  source: LanguageDefinition;
  targets: LanguageDefinition[];
  preservedFields: RegExp[];
  preservedTerms: RegExp[];
  frontMatter: {
    field: string;
    type: "string" | "string[]";
  }[];
}

export interface LanguageDefinition {
  fullName: string;
  shortName: string;
}

export interface OpenAIConfig {
    apiKey: string;
    baseURL: string;
    model: string;
    // 温度
    temperature: number;
    // 最大输出长度
    maxTokens: number;
    // 流式输出
    stream: boolean;
    // 系统提示词模板
    promptTemplate: string;
    // 超时时间, 单位毫秒
    timeout: number;
    // 线程数
    threadCount: number;
}

export interface FileConfig {
    inputFolder: string;
    ignore: string[];
    outputFolder: string;
    fileName: string;
    filePath: string;
    // 保留原始文件夹结构
    preserveFolders: boolean;
    copyOtherFiles: boolean;
}
