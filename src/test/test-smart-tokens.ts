import { calculateSmartTokens, openaiConfig } from '../config';

interface TestCase {
  name: string;
  systemPrompt: string;
  content: string;
  expectedMaxTokensRange: [number, number];
  expectedTimeoutRange: [number, number];
}

function runTest(testCase: TestCase): boolean {
  const { name, systemPrompt, content, expectedMaxTokensRange, expectedTimeoutRange } = testCase;

  const contentTokens = Math.ceil(content.length / 4);
  const baseTokens = openaiConfig.maxTokens;

  let expectedMaxTokens = Math.max(1000, Math.ceil(contentTokens * 1.2));
  if (expectedMaxTokens < baseTokens) {
    expectedMaxTokens = baseTokens;
  } else if (expectedMaxTokens > baseTokens * 3) {
    expectedMaxTokens = baseTokens * 3;
  }

  let expectedTimeout = 1000 * 60;
  if (contentTokens > 500) {
    expectedTimeout = Math.ceil((contentTokens / 500) * 1000 * 60);
  }
  if (expectedTimeout < openaiConfig.timeout) {
    expectedTimeout = openaiConfig.timeout;
  } else if (expectedTimeout > openaiConfig.timeout * 3) {
    expectedTimeout = openaiConfig.timeout * 3;
  }

  const result = calculateSmartTokens(systemPrompt, content);

  const maxTokensPass = result.maxTokens >= expectedMaxTokensRange[0] && result.maxTokens <= expectedMaxTokensRange[1];
  const timeoutPass = result.timeout >= expectedTimeoutRange[0] && result.timeout <= expectedTimeoutRange[1];

  console.log(`\n[${name}]`);
  console.log(`  Content length: ${content.length} chars, ~${contentTokens} tokens`);
  console.log(`  Expected maxTokens: ${expectedMaxTokens}, Actual: ${result.maxTokens} ${maxTokensPass ? '✓' : '✗'}`);
  console.log(`  Expected timeout: ${expectedTimeout}ms, Actual: ${result.timeout}ms ${timeoutPass ? '✓' : '✗'}`);

  if (maxTokensPass && timeoutPass) {
    return true;
  }
  return false;
}

const testCases: TestCase[] = [
  {
    name: 'Empty content',
    systemPrompt: '翻译助手',
    content: '',
    expectedMaxTokensRange: [1000, 1000],
    expectedTimeoutRange: [60000, 60000],
  },
  {
    name: 'Short content (50 chars)',
    systemPrompt: '你是一个翻译助手',
    content: '这是一段简短的测试文本，包含中文字符。',
    expectedMaxTokensRange: [1000, 1000],
    expectedTimeoutRange: [60000, 60000],
  },
  {
    name: 'Medium content (500 chars)',
    systemPrompt: '你是一个专业的翻译助手，负责将中文翻译成英文',
    content: '这是一段中等长度的内容。'.repeat(20),
    expectedMaxTokensRange: [1000, 1150],
    expectedTimeoutRange: [60000, 60000],
  },
  {
    name: 'Long content (2000 chars)',
    systemPrompt: '你是一个专业的翻译助手，负责将中文翻译成英文，保持原文的语义和风格',
    content: '这是一个较长的测试内容。'.repeat(100),
    expectedMaxTokensRange: [1000, 3000],
    expectedTimeoutRange: [60000, 240000],
  },
  {
    name: 'Very long content (10000 chars)',
    systemPrompt: '你是一个专业的翻译助手，负责将中文翻译成英文、日文等其他语言',
    content: '这是一段非常非常长的内容。'.repeat(500),
    expectedMaxTokensRange: [1900, 2000],
    expectedTimeoutRange: [180000, 180000],
  },
  {
    name: 'Content with code blocks',
    systemPrompt: '翻译助手',
    content: '这是一段文本```const a = 1;```中间有代码',
    expectedMaxTokensRange: [1000, 1000],
    expectedTimeoutRange: [60000, 60000],
  },
  {
    name: 'Only special characters',
    systemPrompt: '翻译',
    content: '!!!@@@###$$$%%%^^^&&&***((( )))))',
    expectedMaxTokensRange: [1000, 1000],
    expectedTimeoutRange: [60000, 60000],
  },
  {
    name: 'Maximum boundary test',
    systemPrompt: 'a'.repeat(1000),
    content: 'b'.repeat(40000),
    expectedMaxTokensRange: [2500, 3000],
    expectedTimeoutRange: [120000, 180000],
  },
];

console.log('='.repeat(60));
console.log('Testing calculateSmartTokens function');
console.log('Base config:');
console.log(`  maxTokens: ${openaiConfig.maxTokens}`);
console.log(`  timeout: ${openaiConfig.timeout}ms`);
console.log('='.repeat(60));

let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = runTest(tc);
  if (result) {
    passed++;
  } else {
    failed++;
  }
}

console.log('\n' + '='.repeat(60));
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('='.repeat(60));

if (failed > 0) {
  process.exit(1);
}