# AGENTS.md

## Dev Commands

```bash
pnpm dev          # Watch mode (tsx watch)
pnpm start        # Run directly (tsx src/index.ts)
pnpm typecheck    # TypeScript check (tsc --noEmit)
pnpm build        # Compile to dist/
pnpm lint         # ESLint
```

## Important Conventions

- ESM project (`"type": "module"` in package.json)
- Uses `tsx` to run TypeScript directly; no ts-node
- Input: `input/` folder (not `i/`)
- Output: `output/{targetLang}/` preserving folder structure
- API config in `src/config.ts`; env vars override it

## Env Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | API key (also hardcoded in config.ts) |
| `OPENAI_BASE_URL` | Base URL (default: SiliconFlow) |
| `OPENAI_MODEL` | Model name (default: Qwen3-8B) |
| `LOG_LEVEL` | debug\|info\|warn\|error (default: debug) |

## Architecture

- Entry: `src/index.ts` → processes files, handles front-matter
- `TranslationService` (`src/services/translation.ts`) → core translation logic
- `OpenAI` (`src/services/openai.ts`) → API client with retry/dedup
- Config pattern in `src/config.ts` is the source of truth; README may be outdated