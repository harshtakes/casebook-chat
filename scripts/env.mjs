import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadLocalEnv() {
  const envPath = resolve(process.cwd(), '.env.local');

  try {
    const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith('#') || !trimmedLine.includes('=')) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf('=');
      const key = trimmedLine.slice(0, separatorIndex);
      const value = trimmedLine.slice(separatorIndex + 1);

      process.env[key] ??= value;
    }
  } catch {
    // Scripts surface missing envs with clearer messages at their call sites.
  }
}
