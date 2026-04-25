import axios from 'axios';
import type { FetchOpenAIConfig, ResponseData } from '../type/openai';

async function fetchOpenAIData(openaiConfig: FetchOpenAIConfig): Promise<ResponseData> {
    const {
        apiKey,
        baseURL,
        model,
        temperature,
        maxTokens,
        stream,
        timeout,
        messages
    } = openaiConfig;

    // 构建请求头
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
    };

    // 构建请求体
    const requestBody = {
        model: model || 'gpt-3.5-turbo',
        messages,
        temperature: temperature || 0.7,
        max_tokens: maxTokens || 2048,
        stream: stream || false,
    };

    try {
        // 发送请求到 OpenAI API
        const response = await axios.post(
            `${baseURL}/chat/completions`,
            requestBody,
            {
                headers,
                timeout: timeout || 30000,
                responseType: stream ? 'stream' : 'json',
            }
        );

        if (stream) {
            // 处理流式响应
            return await handleStreamResponse(response);
        } else {
            // 处理普通响应
            return handleJsonResponse(response);
        }
    } catch (error) {
        return handleError(error);
    }
}

// 处理 JSON 响应
function handleJsonResponse(response: any): ResponseData {
    const { status, data } = response;
    
    if (status === 200 && data.choices && data.choices.length > 0) {
        const content = data.choices[0]?.message?.content || '';
        
        return {
            status,
            success: true,
            content,
            error: '',
        };
    }
    
    return {
        status: status || 500,
        success: false,
        content: '',
        error: 'Invalid response format',
    };
}

// 处理流式响应
async function handleStreamResponse(stream: any): Promise<ResponseData> {
    return new Promise((resolve) => {
        let fullContent = '';
        
        stream.on('data', (chunk: Buffer) => {
            const chunkStr = chunk.toString();
            const lines = chunkStr.split('\n').filter(line => line.trim() !== '');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.substring(6);
                    
                    if (data === '[DONE]') {
                        resolve({
                            status: 200,
                            success: true,
                            content: fullContent,
                            error: '',
                        });
                        return;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        const content = parsed.choices[0]?.delta?.content || '';
                        fullContent += content;
                    } catch (e) {
                        console.error('Failed to parse stream data:', e);
                    }
                }
            }
        });
        
        stream.on('error', (error: any) => {
            resolve({
                status: 500,
                success: false,
                content: '',
                error: error.message || 'Stream error',
            });
        });
        
        stream.on('end', () => {
            resolve({
                status: 200,
                success: true,
                content: fullContent,
                error: '',
            });
        });
    });
}

// 错误处理
function handleError(error: any): ResponseData {
    let status = 500;
    let errorMessage = 'Unknown error';
    
    if (axios.isAxiosError(error)) {
        if (error.response) {
            // 服务器返回错误状态码
            status = error.response.status;
            errorMessage = error.response.data?.error?.message || error.response.data || error.message;
        } else if (error.request) {
            // 请求已发送但无响应
            errorMessage = 'No response received from server';
        } else {
            // 请求配置出错
            errorMessage = error.message;
        }
    } else {
        errorMessage = error.message || String(error);
    }
    
    return {
        status,
        success: false,
        content: '',
        error: errorMessage,
    };
}

function genTranslateMessages(prompt: string, content: string): any[] {
    const messages: any[] = [];
    messages.push({ role: "system", content: prompt });
    messages.push({ role: "user", content: [
        {
            type: "text",
            text: `\n\n--- File: translate.md ---\n${content}`,
        }
    ] });
    return messages;
}

// 可选：导出工具函数以便其他地方使用
export { fetchOpenAIData, genTranslateMessages };



// // 使用示例
// const config: OpenAIConfig = {
//     apiKey: 'sk-fgvymgrplbdychhplgzavprlkvhxloticxennehpastjetlf',
//     baseURL: "https://api.siliconflow.cn/v1",
//     model: 'Qwen/Qwen3.5-4B',
//     temperature: 0.7,
//     maxTokens: 2048,
//     stream: false,
//     timeout: 30000,
//     messages: [
//         { role: 'user', content: 'Hello!' }
//     ]
// };

// fetchOpenAIData(config)
//     .then(response => {
//         if (response.success) {
//             console.log('AI Response:', response.content);
//         } else {
//             console.error('Error:', response.error);
//         }
//     })
//     .catch(error => {
//         console.error('Request failed:', error);
//     });