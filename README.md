# 翻译工具 (Fast MD Fanyi)

Markdown 文件批量翻译工具，支持多语言翻译。

---

## 功能特性

- 批量翻译 Markdown 文件
- 支持 front-matter 字段翻译
- 保留代码块和特殊术语
- 支持多目标语言并行处理
- 完整的类型安全
- 完善的错误处理和日志记录
- 自动检测重复翻译内容
- 支持自定义提示词模板

## 项目结构

```
src/
├── index.ts          # 主入口
├── config.ts         # 配置文件
├── types/
│   └── index.ts      # 类型定义
├── services/
│   ├── index.ts      # 服务导出
│   ├── openai.ts     # OpenAI API 调用
│   └── translation.ts # 翻译服务
└── utils/
    ├── index.ts      # 工具导出
    ├── logger.ts     # 日志模块
    ├── preservedText.ts # 保留内容处理
    └── prompt.ts      # 提示词生成
```

## 配置

在 `src/config.ts` 中配置以下选项：

- **translationConfig**: 源语言、目标语言、保留字段等
- **openaiConfig**: API 密钥、模型、温度等
- **fileConfig**: 输入输出文件夹等

### 环境变量

可以设置以下环境变量覆盖配置文件：

- `OPENAI_API_KEY`: API 密钥
- `OPENAI_BASE_URL`: API 基础地址
- `OPENAI_MODEL`: 模型名称
- `LOG_LEVEL`: 日志级别 (debug|info|warn|error)

## 使用方法

1. 安装依赖：
```bash
pnpm install
```

2. 配置 API 密钥（在 `src/config.ts` 中或设置环境变量）

3. 放入待翻译文件到 `input/` 文件夹

4. 运行程序：
```bash
pnpm start
```

5. 翻译结果将输出到 `output/{语言代码}/` 文件夹

### 保留术语

在 `translationConfig.preserveTerms` 中配置需要保留不翻译的术语：

```typescript
preserveTerms: ['API', 'SDK', 'token', 'npm', 'pnpm', 'Node.js']
```

---

## 保留内容

工具会自动保留以下内容不被翻译：

- 代码块（ fenced code blocks 和行内代码）
- 数学公式（LaTeX 格式）
- 配置的保留术语（如 API、SDK、npm 等）

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | API 密钥 | - |
| `OPENAI_BASE_URL` | API 基础地址 | https://api.openai.com/v1 |
| `OPENAI_MODEL` | 模型名称 | Qwen3-8B |
| `LOG_LEVEL` | 日志级别 | info |

---

## 开发

```bash
# 安装依赖
pnpm install

# 类型检查
pnpm typecheck

# 开发模式
pnpm dev

# 构建
pnpm build

# 启动
pnpm start
```
