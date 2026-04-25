import { ReservedHandleResult } from "../type/preservedHandle";

/**
 * 保留字段或术语处理
 * 如 example => <keep_id_123456>
 *    example => <keep_word_is_example>
 * @param text 原始文本
 * @param preservedTerms 需要保留的术语正则数组
 * @param preservedFields 需要保留的字段正则数组
 * @returns 处理结果
 */
export function reservedHandle(text: string, preservedTerms: RegExp[], preservedFields: RegExp[]): ReservedHandleResult {
    const dictionary = new Map<string, string>();
    let resultText = text;
    
    // 处理保留术语
    for (const term of preservedTerms) {
        const matches = [...resultText.matchAll(term)];
        // 从后往前替换，避免位置偏移
        for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i];
            const original = match[0];
            const key = `<keep_word_is_${original}>`;
            
            if (!dictionary.has(original)) {
                dictionary.set(original, key);
                resultText = resultText.substring(0, match.index) + 
                           key + 
                           resultText.substring(match.index + original.length);
            }
        }
    }
    
    // 处理保留字段
    for (const field of preservedFields) {
        const matches = [...resultText.matchAll(field)];
        // 从后往前替换
        for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i];
            const original = match[0];
            
            if (!dictionary.has(original)) {
                // 使用更可靠的ID生成方式
                const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
                const key = `<keep_id_${id}>`;
                
                dictionary.set(original, key);
                resultText = resultText.substring(0, match.index) + 
                           key + 
                           resultText.substring(match.index + original.length);
            }
        }
    }
    
    return {
        text: resultText,
        dictionary,
    };
}

/**
 * 还原处理过的文本
 * @param processedText 处理后的文本
 * @param dictionary 映射字典
 * @returns 还原后的文本
 */
export function restoreText(processedText: string, dictionary: Map<string, string>): string {
    let restoredText = processedText;
    // 按value长度逆序排列，避免部分匹配问题
    const entries = Array.from(dictionary.entries())
        .sort((a, b) => b[1].length - a[1].length);
    
    for (const [original, placeholder] of entries) {
        restoredText = restoredText.replace(new RegExp(placeholder, 'g'), original);
    }
    
    return restoredText;
}


// 定义要保留的内容
// const preservedTerms = [
//     /example\b/g,  // 保留单词"example"
//     /test\b/g      // 保留单词"test"
// ];

// const preservedFields = [
//     /{.*?}/g,      // 保留{xxx}格式的字段
//     /\[.*?\]/g     // 保留[xxx]格式的字段
// ];

// const result = reservedHandle("This is an example with {field1} and [field2]", preservedTerms, preservedFields);
// console.log(result.text); // 处理后的文本
// console.log(result.dictionary); // 映射关系