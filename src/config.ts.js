// config.ts
import { title } from "process";
import { TranslationConfig,
    OpenAIConfig,
    FileConfig
} from "./type/config";
export const translationConfig: TranslationConfig = {
    // 源语言
    source: {
        fullName: "简体中文",
        shortName: "zh"
    },
    // 目标语言
    targets: [
        {
            fullName: "英文",
            shortName: "en"
        },
        {
            fullName: "日文",
            shortName: "ja"
        }
    ],
    // 需要翻译的字段
    frontMatter: [
        {
            field: "title",
            type: "string"
        },
        {
            field: "description",
            type: "string"
        },
        {
            field: "tags",
            type: "string[]"
        },
    ],
    // 保留字段
    preservedFields: [
        RegExp("example"),
        // 代码块
        /```([a-z]+)?\n([\s\S]*?)\n```/g
    ],
    // 保留术语
    preservedTerms: [
        RegExp("token"),
    ],
};

export const openaiConfig: OpenAIConfig = {
    apiKey: "sk-fgvymgrplbdychhplgzavprlkvhxloticxennehpastjetlf",
    baseURL: "https://api.siliconflow.cn/v1",
    model: "gpt-3.5-turbo",
    // 温度
    temperature: 0.5,
    // 最大输出长度
    maxTokens: 8000,
    stream: true,
    // 系统提示词模板
    promptTemplate: "你是一个专业的翻译助手，负责将文本文件从{source}翻译为{target}。",
    // 超时时间, 单位毫秒
    timeout: 1000 * 60 * 5,
    // 线程数
    threadCount: 4,
}


// 输入、输出文件夹、文件命名等
export const fileConfig: FileConfig = {
    inputFolder: "i",
    outputFolder: "output",
    fileName: "{name}_{targetShortName}.{ext}",
    filePath: "{targetShortName}/{filePath}.{ext}",
    // 保留原始文件夹结构
    preserveFolders: true,
    // 复制其它文件到输出文件夹
    copyOtherFiles: true,
};


export default {
    translationConfig,
    openaiConfig,
    fileConfig
};