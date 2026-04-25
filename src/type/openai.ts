
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
    // 超时时间, 单位毫秒
    timeout: number;
    messages: any[];
}
