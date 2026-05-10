import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// 1. 保存当前 shell 环境变量（后续恢复，确保其最高优先级）
const shellEnv: Record<string, string | undefined> = {};
for (const key of Object.keys(process.env)) {
  shellEnv[key] = process.env[key];
}

// 2. 加载上级目录 .env（安静跳过不存在的文件）
if (!shellEnv.NO_LOAD_PARENT_ENV) {
  const parentEnvPath = resolve(projectRoot, '..', '.env');
  if (existsSync(parentEnvPath)) {
    config({ path: parentEnvPath, override: true });
  }
}

// 3. 加载当前项目目录 .env（覆盖上级同名变量）
const currentEnvPath = resolve(projectRoot, '.env');
if (existsSync(currentEnvPath)) {
  config({ path: currentEnvPath, override: true });
}

// 4. 恢复 shell 环境变量（最高优先级，不受 .env 文件影响）
for (const [key, value] of Object.entries(shellEnv)) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
