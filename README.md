# Fast MD Fanyi

Markdown 文件批量翻译工具，基于大语言模型 API。

> **注意**：这是我给自己的博客 [Ksable's 小屋](https://blog.ksable.top/) 编写的自用翻译工具，代码里可能包含一些个性化配置（如 API 地址、prompt 模板、front-matter 字段等）。现分享出来供参考和魔改，欢迎大家 fork 后按需调整。

---

## 功能特性

- 批量翻译 Markdown 文件内容
- 支持翻译 front-matter 字段（title、description、keywords 等）
- 自动保留代码块、LaTeX 公式、加密块等特殊内容不被翻译
- 可配置保留术语（如 API、SDK 等专用名词不翻译）
- 支持多目标语言（按语言顺序串行处理，文件内并发）
- 智能分块：超长文档自动按 `\n\n` 边界拆分翻译
- 支持流式/非流式 API 调用
- 智能 token 估算：根据内容长度动态调整 max_tokens 和超时
- 完善的错误处理：重试、速率限制等待、连续错误熔断、乱码检测
- 跳过未变更文件（对比 sourceHash）
- 页眉/页脚模板：译文中自动插入翻译说明（可按语言定制）
- 翻译报告：生成 JSON 报告记录翻译耗时、结果等
- 模拟模式（`OPENAI_MOCK=true`）：调试时不发起真实 API 请求

---

## 项目结构

```
src/
├── index.ts                 # 主入口
├── config.ts                # 应用配置（翻译、API、文件、报告、日志）
├── types/
│   └── index.ts             # 类型定义
├── services/
│   ├── index.ts             # 服务导出
│   ├── openai.ts            # OpenAI API 客户端封装
│   └── translation.ts       # 翻译服务（重试、分块、占位符处理）
├── utils/
│   ├── config.ts            # 配置校验与摘要
│   ├── fileProcessor.ts     # 文件处理（front-matter 构建、非 MD 复制、输出清理）
│   ├── logger.ts            # 日志模块（pino）
│   ├── openai.ts            # HTTP 请求（流式/非流式）、错误分类、乱码检测
│   ├── preservedText.ts     # 保留内容替换（代码块/公式/术语 → <PTX_*> 占位符）
│   ├── prompt.ts            # 提示词模板渲染
│   ├── report.ts            # 翻译报告生成
│   └── textChunker.ts       # 长文本智能分块
└── test/                    # 临时手动测试脚本（非正式测试）
```

---

## 配置

所有配置集中在 `src/config.ts`，支持环境变量覆盖。

### 主要配置项

| 分类 | 配置项 | 说明 |
|------|--------|------|
| **translationConfig** | `source` | 源语言（全称 + 简写） |
| | `targets` | 目标语言列表 |
| | `frontMatter` | 需要翻译的 front-matter 字段 |
| | `preservedFields` | 保留内容正则（代码块、公式等） |
| | `preservedTerms` | 保留术语正则 |
| | `skipMatches` | 按 front-matter 字段或内容正则跳过文件 |
| | `headerFooter` | 页眉页脚模板（支持按语言定制） |
| | `maxCharLength` | 触发分块翻译的字符数上限 |
| **openaiConfig** | `apiKey` / `baseURL` / `model` | API 连接信息 |
| | `temperature` / `maxTokens` | 模型参数 |
| | `stream` | 是否使用流式输出 |
| | `threadCount` | 并发数 |
| | `retryCount` | 重试次数 |
| | `smartTokens` / `smartTimeout` | 根据内容长度动态调整 token 和超时 |
| | `maxRetriesBehavior` | 重试耗尽后行为：`skip` / `exit` |
| | `maxConsecutiveErrors` | 连续错误熔断阈值 |
| | `mock` / `mockDelay` | 模拟模式 |
| **fileConfig** | `inputFolder` | 输入目录（默认 `input/`） |
| | `outputFolder` | 输出目录（默认 `output/`） |
| | `skipUnchanged` | 跳过未变更文件 |
| | `copyOtherFiles` | 复制非 MD 文件到输出目录 |
| **reportConfig** | `enabled` | 是否生成翻译报告 |
| | `outputPath` | 报告输出路径 |
| **logConfig** | `level` | 日志级别 |
| | `writeToFile` | 是否写入文件 |
| | `filePath` | 日志文件路径 |

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | API 密钥 | — |
| `OPENAI_BASE_URL` | API 基础地址 | `https://api.siliconflow.cn/v1` |
| `OPENAI_MODEL` | 模型名称 | `Qwen/Qwen3-8B` |
| `OPENAI_MOCK` | 模拟模式（不发起真实请求） | `false` |
| `LOG_LEVEL` | 日志级别：debug / info / warn / error | `debug` |
| `LOG_TO_FILE` | 日志写入文件 | `true` |
| `LOG_FILE_PATH` | 日志文件路径 | `./logs/app-{local}.log` |
| `REPORT_ENABLED` | 生成翻译报告 | `true` |
| `REPORT_OUTPUT` | 报告文件路径 | `./output/translation-report-{local}.json` |

---

## 使用方法

1. **安装依赖**

```bash
pnpm install
```

2. **配置**

编辑 `src/config.ts` 设置源语言、目标语言、保留术语等，或通过环境变量设置 API 密钥和模型。

3. **放入待翻译文件**

将 Markdown 文件放入 `input/` 文件夹，支持子目录（保持目录结构）。

4. **运行**

```bash
pnpm start          # 直接运行
pnpm dev            # 开发模式（文件变更自动重启）
```

5. **查看结果**

翻译结果输出到 `output/{语言简写}/`，目录结构与输入保持一致。

### 保留术语示例

```typescript
preservedTerms: [
  /\bAPI\b/gi,
  /\bSDK\b/gi,
  /\bnpm\b/gi,
  /\bpip\b/gi,
]
```

### 跳过特定文件

在 front-matter 中设置 `draft: true` 或 `password: xxx` 可跳过对应文件的翻译（配置在 `skipMatches` 中）。

---

## 开发命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 开发模式（文件监听 + 自动重启） |
| `pnpm start` | 直接运行 |
| `pnpm typecheck` | TypeScript 类型检查 |
| `pnpm build` | 编译到 `dist/` |
| `pnpm lint` | ESLint 检查 |
| `pnpm clean` | 清理 `dist/` |

---

## 技术栈

- **运行时**: Node.js >= 18，TypeScript，ESM
- **API 调用**: axios
- **并发控制**: p-limit
- **日志**: pino（配合 pino-pretty 美化输出）
- **front-matter 解析**: js-yaml
- **文件匹配**: glob
- **运行**: tsx（直接执行 TypeScript）

---

## License

MIT
