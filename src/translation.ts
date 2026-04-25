// 测试,请保留以下代码
import { Logger } from "./log";
import { openaiConfig, translationConfig } from "./config";
import { reservedHandle, restoreText } from "./utils/preservedHandle";
import { fetchOpenAIData, genTranslateMessages } from "./utils/openai";
import { genPromptTemplate } from "./utils/genPrompt";

const logger = new Logger("debug");


export async function translateMarkdown(text: string,sourceLanguage: string, targetLanguage: string): Promise<string> {
    // 实现翻译逻辑
    let retryCount = 0;
    // 生成提示词
    const promptTemplate = genPromptTemplate(openaiConfig.promptTemplate, sourceLanguage, targetLanguage);
    // 处理保留内容
    const { text: processedText, dictionary } = reservedHandle(text, translationConfig.preservedTerms, translationConfig.preservedFields);

    // 构建消息
    const messages = genTranslateMessages(promptTemplate, processedText);

    while (retryCount < openaiConfig.retryCount) {
        const response = await fetchOpenAIData(
            {
                ...openaiConfig,
                messages,
            }
        );
        if (response.success) {
            // 恢复保留内容
            const restoredText = restoreText(response.content, dictionary);
            logger.info(`Translation successful after ${retryCount} attempts`);
            return restoredText;
        }
        retryCount++;
        logger.info(`Translation failed, error: ${response.error}`);
    }
    throw new Error("Translation failed after retryCount attempts");
    
}

export async function translateText(text: string,sourceLanguage: string, targetLanguage: string): Promise<string> {

    // 实现翻译逻辑
    let retryCount = 0;
    // 生成提示词
    const promptTemplate = genPromptTemplate(openaiConfig.promptTemplate, sourceLanguage, targetLanguage);
    // 处理保留内容
    const { text: processedText, dictionary } = reservedHandle(text, translationConfig.preservedTerms, []);

    // 构建消息
    const messages = genTranslateMessages(promptTemplate, processedText);

    while (retryCount < openaiConfig.retryCount) {
        const response = await fetchOpenAIData(
            {
                ...openaiConfig,
                messages,
            }
        );
        if (response.success) {
            // 恢复保留内容
            const restoredText = restoreText(response.content, dictionary);
            logger.info(`Translation successful after ${retryCount} attempts`);
            return restoredText;
        }
        retryCount++;
    }
    throw new Error("Translation failed after retryCount attempts");
    
}


async function test() {
// 测试
const testText = "你好，我是一个学生。";
const testMarkdown = `# ${testText}\n 这是一个测试。\n`;
const testMarkdownTranslated = await translateMarkdown(testMarkdown, "zh", "en");
console.log(testMarkdownTranslated);
}
test();