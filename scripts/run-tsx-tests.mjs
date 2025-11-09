#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const tsxBinPath = require.resolve('tsx/cli');

const cwd = process.cwd();
const inputPaths = process.argv.slice(2);
const roots = inputPaths.length > 0 ? inputPaths : ['src'];

const testFiles = [];

const TEST_FILE_REGEX = /\.test\.tsx?$/i;

function collectTestsFromDirectory(relativeDir) {
  const absoluteDir = path.resolve(cwd, relativeDir);
  let dirEntries;

  try {
    dirEntries = readdirSync(absoluteDir, { withFileTypes: true });
  } catch (error) {
    console.error(`Failed to read directory \"${relativeDir}\":`, error.message);
    process.exit(1);
  }

  for (const entry of dirEntries) {
    const entryRelativePath = path.join(relativeDir, entry.name);

    if (entry.isDirectory()) {
      collectTestsFromDirectory(entryRelativePath);
    } else if (entry.isFile() && TEST_FILE_REGEX.test(entry.name)) {
      testFiles.push(entryRelativePath);
    }
  }
}

for (const root of roots) {
  const absoluteRoot = path.resolve(cwd, root);

  if (!existsSync(absoluteRoot)) {
    console.error(`Test path \"${root}\" does not exist.`);
    process.exit(1);
  }

  const stats = statSync(absoluteRoot);

  if (stats.isDirectory()) {
    collectTestsFromDirectory(root);
  } else if (stats.isFile()) {
    if (!TEST_FILE_REGEX.test(path.basename(root))) {
      console.error(`File \"${root}\" does not match the expected *.test.ts pattern.`);
      process.exit(1);
    }

    testFiles.push(root);
  }
}

if (testFiles.length === 0) {
  console.error(`No test files matching *.test.ts or *.test.tsx were found under: ${roots.join(', ')}`);
  process.exit(1);
}

const child = spawn(process.execPath, [tsxBinPath, '--test', ...testFiles], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error('Failed to start the test runner:', error.message);
  process.exit(1);
});
