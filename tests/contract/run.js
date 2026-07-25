#!/usr/bin/env node
// Cross-platform wrapper so npm scripts can pin a BASE_URL without relying on
// shell-specific syntax (`FOO=bar cmd` fails on PowerShell, `set FOO=bar&&cmd`
// fails on POSIX shells). Sets the env var in the child process environment
// instead, which works identically on Windows, macOS, and Linux.
import { spawnSync } from 'node:child_process';

const baseUrl = process.argv[2];

if (!baseUrl) {
  console.error('Usage: node run.js <BASE_URL>');
  console.error('Example: node run.js http://localhost:5100');
  process.exit(1);
}

const result = spawnSync('npx', ['vitest', 'run'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, BASE_URL: baseUrl },
});

process.exit(result.status ?? 1);
