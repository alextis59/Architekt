import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startServer } from './server.js';

const withEnv = async (overrides: Record<string, string>, run: () => Promise<void>) => {
  const original: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    original[key] = process.env[key];
    process.env[key] = value;
  }

  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

test('startServer provisions filesystem directories before launching the app', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'architekt-server-'));
  const dataDir = path.join(baseDir, 'data');
  const backupDir = path.join(baseDir, 'backups');

  await withEnv(
    {
      PORT: '0',
      PERSISTENCE_DRIVER: 'filesystem',
      DATA_DIR: dataDir,
      BACKUP_DIR: backupDir,
      AUTH_MODE: 'local',
      DEFAULT_USER_ID: 'test-user',
      DEFAULT_USER_NAME: 'Test User'
    },
    async () => {
      const originalLog = console.log;
      console.log = () => {};
      try {
        const server = await startServer();
        server.close();
      } finally {
        console.log = originalLog;
      }
    }
  );

  await assert.doesNotReject(() => fs.access(dataDir));
  await assert.doesNotReject(() => fs.access(backupDir));
});

test('startServer skips directory creation for non-filesystem persistence', async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'architekt-server-memory-'));
  const dataDir = path.join(baseDir, 'data');

  await withEnv(
    {
      PORT: '0',
      PERSISTENCE_DRIVER: 'mongo',
      MONGO_URI: 'mongodb://localhost:27017',
      MONGO_DATABASE: 'architekt',
      MONGO_COLLECTION: 'aggregates',
      AUTH_MODE: 'google',
      GOOGLE_CLIENT_ID: 'client-id',
      AUTH_TOKEN_SECRET: 'secret'
    },
    async () => {
      const originalLog = console.log;
      console.log = () => {};
      try {
        const server = await startServer();
        server.close();
      } finally {
        console.log = originalLog;
      }
    }
  );

  await assert.rejects(() => fs.access(dataDir));
});
