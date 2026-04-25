// index.ts
import { translationConfig, openaiConfig, fileConfig } from "./config";
import { glob } from "glob";
import path from "path";
import { Logger } from "./log";
import fs from "fs/promises"; // 直接使用 promises API
import { translateMarkdown, translateText } from "./translation";
import fm from 'front-matter';

async function main() {
    const logger = new Logger("debug");
    logger.info("开始翻译 Markdown 文件");

    // 解析输入输出文件夹路径
    const inputFolder = path.resolve(fileConfig.inputFolder);
    const outputBaseFolder = path.resolve(fileConfig.outputFolder);

    // 查找所有 Markdown 文件
    const markdownFiles = await glob(`${inputFolder}/**/*.md`);
    logger.info(`找到 ${markdownFiles.length} 个 Markdown 文件`);

    if (markdownFiles.length === 0) {
        logger.warn("未找到任何 Markdown 文件，程序退出。");
        return;
    }

    const { source, targets } = translationConfig;
    const sourceLang = source.shortName; // 例如 "zh"

    // 优化点：外层循环遍历目标语言。这样逻辑更清晰，便于未来按语言做并发或批处理。
    for (const target of targets) {
        const targetLang = target.shortName; // 例如 "en", "ja"
        logger.info(`开始处理目标语言: ${target.fullName} (${targetLang})`);

        for (const [index, markdownFile] of markdownFiles.entries()) {
            logger.info(`翻译文件 [${index + 1}/${markdownFiles.length}], 语言[${targetLang}]: ${markdownFile}`);
            
            try {
                // 1. 读取文件
                const markdownContent = await fs.readFile(markdownFile, 'utf-8');
                if (!markdownContent.trim()) {
                    logger.warn(`文件内容为空，跳过: ${markdownFile}`);
                    continue;
                }

                // 2. 解析 front-matter 和正文
                const parsedContent = fm(markdownContent);
                const rawFrontMatterAttributes = parsedContent.attributes || {};
                const rawMarkdownBody = parsedContent.body || '';

                // 3. 翻译 front-matter 中配置的字段
                const processedFrontMatter: Record<string, any> = { ...rawFrontMatterAttributes }; // 初始拷贝

                for (const fieldConfig of translationConfig.frontMatter) {
                    const { field, type } = fieldConfig;
                    const originalValue = rawFrontMatterAttributes[field];
                    
                    if (originalValue === undefined || originalValue === null) {
                        continue; // 如果原文档没有这个字段，则跳过
                    }

                    try {
                        if (type === 'string' && typeof originalValue === 'string') {
                            // 翻译字符串
                            processedFrontMatter[field] = await translateText(originalValue, sourceLang, targetLang);
                        } else if (type === 'string[]' && Array.isArray(originalValue)) {
                            // 翻译字符串数组：修复点，使用 Promise.all 处理异步数组映射
                            const translatedArray = await Promise.all(
                                originalValue.map(item => 
                                    typeof item === 'string' 
                                        ? translateText(item, sourceLang, targetLang)
                                        : item // 非字符串项保留原样
                                )
                            );
                            processedFrontMatter[field] = translatedArray;
                        }
                        // 其他未配置的类型，processedFrontMatter 已保留原值
                    } catch (error) {
                        logger.error(`翻译 front-matter 字段 "${field}" 时出错 (文件: ${markdownFile}): ${error}`);
                        // 出错时，保留原始值
                        processedFrontMatter[field] = originalValue;
                    }
                }

                // 4. 翻译 Markdown 正文
                let translatedBody = rawMarkdownBody;
                if (rawMarkdownBody.trim()) {
                    try {
                        translatedBody = await translateMarkdown(rawMarkdownBody, sourceLang, targetLang);
                    } catch (error) {
                        logger.error(`翻译正文时出错 (文件: ${markdownFile}): ${error}`);
                        // 跳过当前文件，继续处理下一个
                        continue;
                    }
                }

                // 5. 构建输出内容
                let finalContent = '';
                if (Object.keys(processedFrontMatter).length > 0) {
                    finalContent += '---\n';
                    for (const [key, value] of Object.entries(processedFrontMatter)) {
                        if (Array.isArray(value)) {
                            finalContent += `${key}: [${value.map(item => JSON.stringify(item)).join(', ')}]\n`;
                        } else {
                            finalContent += `${key}: ${JSON.stringify(value)}\n`;
                        }
                    }
                    finalContent += '---\n\n';
                }
                finalContent += translatedBody;

                // 6. 计算并写入输出路径
                const relativePath = path.relative(inputFolder, markdownFile);
                const outputPath = path.join(outputBaseFolder, targetLang, relativePath);
                
                await fs.mkdir(path.dirname(outputPath), { recursive: true });
                await fs.writeFile(outputPath, finalContent, 'utf-8');
                
                logger.info(`已生成翻译文件: ${outputPath}`);

            } catch (error) {
                // 捕获文件读取、解析等整体性错误
                logger.error(`处理文件时发生严重错误 ${markdownFile}: ${error}`);
                // 根据需求决定是 continue 还是 throw error
                continue; // 跳过当前文件，继续处理下一个
            }
        }
        logger.info(`目标语言 ${target.fullName} (${targetLang}) 处理完成。`);
    }

    logger.info("所有文件翻译完成！");
}

// 启动程序，并捕获未处理的Promise异常
main().catch((error) => {
    console.error('程序执行失败:', error);
    process.exit(1);
});