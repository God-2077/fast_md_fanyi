# AGENTS.md

## Dev Commands

```bash
pnpm dev          # Watch mode (tsx watch src/index.ts)
pnpm start        # Run directly (tsx src/index.ts)
pnpm typecheck    # TypeScript check (tsc --noEmit)
pnpm build        # Compile to dist/ (tsc)
pnpm lint         # ESLint (eslint src --ext .ts)
pnpm clean        # Remove dist/
```

## Important Conventions

- ESM project (`"type": "module"` in package.json)
- Uses `tsx` to run TypeScript directly; no ts-node
- Input: `input/` folder; output: `output/{targetLang}/` preserving folder structure
- API config lives in `src/config.ts`; env vars override it
- Logs go to `./logs/app.log` by default (also printed to console via pino-pretty)
- No formal test suite — `src/test/` contains only ad-hoc manual test scripts

## Env Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | API key (also has a hardcoded fallback in config.ts) | — |
| `OPENAI_BASE_URL` | API base URL | `https://api.siliconflow.cn/v1` |
| `OPENAI_MODEL` | Model name | `Qwen/Qwen3-8B` |
| `OPENAI_TEMPERATURE` | Temperature (0-1) | `0.5` |
| `OPENAI_MAX_TOKENS` | Max output tokens (when smartTokens is off) | `1000` |
| `OPENAI_STREAM` | Use streaming API responses | `true` |
| `OPENAI_TIMEOUT` | Request timeout in ms | `60000` |
| `OPENAI_THREAD_COUNT` | Concurrent request count | `2` |
| `OPENAI_RETRY_COUNT` | Max retries per request | `3` |
| `OPENAI_CHECK_MANGLED` | Detect mangled/garbled output | `true` |
| `OPENAI_SMART_TOKENS` | Dynamically compute maxTokens from input size | `true` |
| `OPENAI_SMART_TIMEOUT` | Dynamically compute timeout from input size | `true` |
| `OPENAI_MAX_RETRIES_BEHAVIOR` | Behavior after max retries: `skip` or `exit` | `skip` |
| `OPENAI_MAX_CONSECUTIVE_ERRORS` | Max consecutive failures before abort | `5` |
| `OPENAI_RATE_LIMIT_WAIT` | Wait time for 429 rate limit in ms | `10000` |
| `OPENAI_MOCK` | Mock mode (no real API calls) | `false` |
| `OPENAI_MOCK_DELAY` | Mock mode artificial delay in ms (0 = random) | `0` |
| `TRANSLATION_MAX_CHAR_LENGTH` | Max chars before chunking (0 = disable) | `25000` |
| `TRANSLATION_PRESERVED_TERMS_PLACEHOLDER` | Use <PTX_> placeholders for preserved terms | `true` |
| `INPUT_FOLDER` | Input directory path | `input` |
| `OUTPUT_FOLDER` | Output directory path | `output` |
| `FILE_PRESERVE_FOLDERS` | Preserve folder structure in output | `true` |
| `FILE_COPY_OTHER_FILES` | Copy non-markdown files to output | `true` |
| `FILE_SKIP_UNCHANGED` | Skip files with unchanged source hash | `true` |
| `LOG_LEVEL` | debug\|info\|warn\|error | `debug` |
| `LOG_TO_FILE` | Write logs to file | `true` |
| `LOG_FILE_PATH` | Log file path | `./logs/app.log` |
| `REPORT_ENABLED` | Generate translation JSON report | `true` |
| `REPORT_OUTPUT` | Report file path | `./output/translation-report.json` |

## Concurrency Model

- Uses `p-limit` with `openaiConfig.threadCount` for async concurrency (not real threads)
- Per target language: all files processed in parallel (capped by threadCount)
- Target languages are processed sequentially (one language at a time)
- Fatal errors trigger `AbortController` to cancel all in-flight tasks for the current language

## Architecture

- Entry: `src/index.ts` — processes files, handles front-matter, header/footer insertion
- `TranslationService` (`src/services/translation.ts`) — core translation with retry, chunking, preserved-text handling
- `OpenAI` (`src/services/openai.ts`) — API client (thin wrapper around `utils/openai.ts`)
- `src/utils/openai.ts` — actual HTTP calls (stream + non-stream), mangled-code detection, repetition detection, error classification
- `src/utils/preservedText.ts` — replaces code blocks, LaTeX, and terms with `<PTX_*>` / `<TERM_*>` placeholders before translation, restores after
- `src/utils/textChunker.ts` — splits long Markdown on `\n\n` boundaries without breaking code fences
- `src/utils/fileProcessor.ts` — builds output YAML front-matter, copies non-MD files, cleans stale output
- `src/utils/prompt.ts` — renders prompt templates with `{sourceLanguage}` / `{targetLanguage}` placeholders
- `src/utils/config.ts` — `validateConfig()` and `getConfigSummary()` (reads config from `src/config.ts`)

## Key Behaviors to Know

- **Skip unchanged files**: If `fileConfig.skipUnchanged` is true (default), compares `sourceHash` stored in `translationMeta` front-matter of existing output — skips if hash matches
- **Smart tokens/timeout**: When `smartTokens` or `smartTimeout` is enabled (default on), `calculateSmartTokens()` in `src/config.ts` dynamically computes `maxTokens` and `timeout` based on estimated input token count
- **Error classification**: Every API error is classified as `fatal` (exit/abort) or `retryable` (retry up to `retryCount`). 429 is retryable with `rateLimitWait` delay. Status codes 400/401/402/404/405/422/500 are fatal. DNS/ECONNREFUSED is fatal.
- **Max retries behavior**: `openaiConfig.maxRetriesBehavior` controls what happens after all retries exhausted — `'skip'` (skip file, continue) or `'exit'` (abort program)
- **Consecutive error limit**: If `maxConsecutiveErrors` consecutive files fail, the entire run aborts
- **Preserved terms placeholders**: Terms normally use `<TERM_xxx>` (includes the original word so AI can use it contextually). Set `preservedTermsUseFieldPlaceholder: true` to use `<PTX_xxx>` instead (like fields do)
- **Header/Footer**: Per-language header/footer with `{model}`, `{local}`, `{sourceLang}`, `{targetLang}`, etc. Config in `translationConfig.headerFooter`
- **Skip matches**: `skipMatches` in translationConfig can skip files by front-matter field or content regex pattern
- **Cleanup**: After translation, deletes any files in output directory that weren't produced/recorded in the current run
