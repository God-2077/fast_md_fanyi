import { preservedHandle, restoreText } from '../utils/preservedText';

const testPatterns = [
    /```[\s\S]*?```/g,
    /`[^`]+`/g,
    /\$\$[\s\S]*?\$\$/g,
    /\$[^$\n]+\$/g,
    /\btoken\b/gi,
    /\bAPI\b/gi,
    /\bSDK\b/gi,
];

const tests = [
    {
        name: "基本测试：同时保留 API、token 和行内代码",
        text: `Umami API 需要认证，可以使用用户的 API 密钥 \`x-umami-share-token\`。`,
    },
    {
        name: "代码块测试：保留 JSON 代码块",
        text: `
\`\`\`json
{
  "username": "your-username",
  "password": "your-password"
}
\`\`\`
`,
    },
    {
        name: "嵌套测试：代码块内的 API token",
        text: `
\`\`\`javascript
const API_TOKEN = 'secret-token';
fetch('/api', { headers: { 'Authorization': \`Bearer \${API_TOKEN}\` } })
\`\`\`
`,
    },
    {
        name: "多次出现：同一个术语多次出现",
        text: `API 用于认证。另一个 API 端点也需要 API 密钥。token 可以复用。`,
    },
    {
        name: "数学公式：复杂块级公式",
        text: "\n数学公式 $E=mc^2$ 和块级公式：\n$$sum_{i=1}^n i = frac{n(n+1)}{2}$$\n",
    },
    {
        name: "混合内容：中文与技术术语混合",
        text: `
## 认证

Umami API 需要认证，可以使用用户的 API 密钥或是使用网站分享中的 API 密钥 \`x-umami-share-token\`。

\`\`\`json
{
  "apiKey": "your-api-key",
  "shareToken": "x-umami-share-token"
}
\`\`\`
`,
    },
    {
        name: "边界情况：连续的特殊内容",
        text: `\`code1\`\`code2\` \`token1\` \`token2\``,
    },
    {
        name: "URL 保留",
        text: `访问 https://api.example.com/v1 获取 API 密钥`,
    },
    {
        name: "转义字符",
        text: "字符串中的\\`反斜杠和`反引号`需要保留",
    },
    {
        name: "空内容：仅有代码块标记",
        text: "```\n```",
    },
    {
        name: "长文本：大段代码",
        text: `
\`\`\`typescript
interface User {
    id: number;
    name: string;
    email: string;
    createdAt: Date;
}

async function fetchUsers(api: string, token: string): Promise<User[]> {
    const response = await fetch(\`\${api}/users\`, {
        headers: {
            'Authorization': \`Bearer \${token}\`,
            'Content-Type': 'application/json'
        }
    });
    return response.json();
}
\`\`\`
`,
    },
    {
        name: "特殊字符：HTML 实体",
        text: "&lt;div&gt; &amp; &quot;",
    },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`测试: ${test.name}`);
    console.log('='.repeat(60));
    
const preserved = preservedHandle(test.text, testPatterns, []);
    const restored = restoreText(preserved.text, preserved.dictionary);
    
    if (restored === test.text) {
        console.log('✓ 通过');
        passed++;
    } else {
        console.log('✗ 失败');
        failed++;
        console.log('原始:', JSON.stringify(test.text));
        console.log('处理后:', JSON.stringify(preserved.text));
        console.log('还原:', JSON.stringify(restored));
        console.log('字典:', Array.from(preserved.dictionary.entries()));
    }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`总计: ${passed} 通过, ${failed} 失败`);
console.log('='.repeat(60));

if (failed > 0) {
    process.exit(1);
}