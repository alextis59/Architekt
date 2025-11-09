import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.resolve(currentDir, '../index.html');
const documentText = fs.readFileSync(fixturePath, 'utf-8');

test('landing page contains the root element placeholder', () => {
  assert.ok(documentText.includes('<div id="app"></div>'), 'expected #app placeholder in markup');
});
