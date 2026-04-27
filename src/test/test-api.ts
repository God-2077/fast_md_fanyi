import { openaiConfig } from '../config';
import type { Message } from '../types';

const LOG_TO_FILE = true;
const LOG_FILE_PATH = './api-test.log';

const systemPrompt = '你是一个翻译助手，请将下面的中文翻译成英文。';
const userMessage = '你好世界！这是一段测试文本。';
const stream = false;

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

const logs: LogEntry[] = [];

function log(level: string, message: string) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  logs.push(entry);
  console.log(`[${entry.timestamp}] [${level}] ${entry.message}`);
}

async function saveLogsToFile() {
  if (!LOG_TO_FILE) return;
  const fs = await import('fs');
  const content = logs.map(e => `[${e.timestamp}] [${e.level}] ${e.message}`).join('\n');
  fs.writeFileSync(LOG_FILE_PATH, content);
  log('INFO', `日志已保存到 ${LOG_FILE_PATH}`);
}

async function testApi() {
  log('INFO', '='.repeat(60));
  log('INFO', 'OpenAI API 测试开始');
  log('INFO', '='.repeat(60));

  const url = `${openaiConfig.baseURL}/chat/completions`;
  log('INFO', `请求地址: ${url}`);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${openaiConfig.apiKey}`,
  };
  log('INFO', '请求头:');
  log('DEBUG', JSON.stringify(headers, null, 2));

  const messages: Message[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];
  log('INFO', '消息列表:');
  messages.forEach((msg, i) => {
    log('DEBUG', `[${i}] role: ${msg.role}, content: ${msg.content}`);
  });

  const requestBody: Record<string, unknown> = {
    model: openaiConfig.model,
    messages,
    temperature: openaiConfig.temperature,
    max_tokens: openaiConfig.maxTokens,
    stream: stream,
  };
  log('INFO', '请求正文:');
  log('DEBUG', JSON.stringify(requestBody, null, 2));

  log('INFO', '-'.repeat(60));
  log('INFO', `发送请求... (stream: ${stream})`);
  log('INFO', '-'.repeat(60));

  const startTime = Date.now();

  try {
    if (stream) {
      await testStreamRequest(url, headers, requestBody);
    } else {
      await testNormalRequest(url, headers, requestBody);
    }
  } catch (error) {
    log('ERROR', `请求异常: ${error}`);
  }

  const duration = Date.now() - startTime;
  log('INFO', `请求完成，耗时: ${duration}ms`);
  log('INFO', '='.repeat(60));

  await saveLogsToFile();
}

async function testNormalRequest(
  url: string,
  headers: Record<string, string>,
  requestBody: Record<string, unknown>
) {
  const axios = (await import('axios')).default;

  log('INFO', '使用普通请求模式');
  log('DEBUG', `URL: ${url}`);

  const response = await axios.post(url, requestBody, {
    headers,
    timeout: openaiConfig.timeout,
  });

  log('INFO', '响应状态行:');
  log('DEBUG', `HTTP/${response.status} ${response.statusText}`);

  log('INFO', '响应头:');
  log('DEBUG', JSON.stringify(response.headers, null, 2));

  log('INFO', '响应正文:');
  log('DEBUG', JSON.stringify(response.data, null, 2));

  const content = response.data.choices?.[0]?.message?.content || '';
  log('INFO', `提取内容: ${content}`);

  if (response.data.usage) {
    log('INFO', 'Token 使用情况:');
    log('DEBUG', JSON.stringify(response.data.usage, null, 2));
  }

  return response;
}

async function testStreamRequest(
  url: string,
  headers: Record<string, string>,
  requestBody: Record<string, unknown>
) {
  const axios = (await import('axios')).default;

  log('INFO', '使用流式请求模式');
  log('DEBUG', `URL: ${url}`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), openaiConfig.timeout);

  const response = await axios.post(url, requestBody, {
    headers: {
      ...headers,
      'Accept': 'text/event-stream',
    },
    responseType: 'stream',
    signal: controller.signal,
  });

  clearTimeout(timeoutId);

  log('INFO', '响应状态行:');
  log('DEBUG', `HTTP/${response.status} ${response.statusText}`);

  log('INFO', '响应头:');
  log('DEBUG', JSON.stringify(response.headers, null, 2));

  log('INFO', '响应流开始接收:');
  log('DEBUG', '-'.repeat(40));

  const stream = response.data as NodeJS.ReadableStream;
  let fullContent = '';

  await new Promise<void>((resolve) => {
    stream.on('data', (chunk: Buffer) => {
      const chunkStr = chunk.toString();
      log('DEBUG', `收到数据块:\n${chunkStr}`);

      const lines = chunkStr.split('\n');
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;

        const data = trimmedLine.slice(6);
        if (data === '[DONE]') {
          log('INFO', '流结束 [DONE]');
          resolve();
          return;
        }

        try {
          const parsed = JSON.parse(data);
          log('DEBUG', `数据块 JSON:\n${JSON.stringify(parsed, null, 2)}`);
          const content = parsed.choices?.[0]?.delta?.content || '';
          if (content) {
            fullContent += content;
            log('DEBUG', `内容增量: "${content}"`);
          }
        } catch {
          // 忽略解析错误
        }
      }
    });

    stream.on('end', () => {
      log('INFO', '流接收完成');
      resolve();
    });

    stream.on('error', (error: Error) => {
      log('ERROR', `流错误: ${error.message}`);
      resolve();
    });
  });

  log('DEBUG', '-'.repeat(40));
  log('INFO', `完整内容: ${fullContent}`);
  log('INFO', '-'.repeat(60));

  return fullContent;
}

testApi().catch(console.error);