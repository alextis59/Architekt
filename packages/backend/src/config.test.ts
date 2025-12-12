import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { loadConfig } from './config.js';

test('loadConfig returns defaults for local filesystem persistence', () => {
  const originalEnv = { ...process.env };

  try {
    delete process.env.PORT;
    delete process.env.PERSISTENCE_DRIVER;
    delete process.env.AUTH_MODE;
    delete process.env.DEFAULT_USER_ID;
    delete process.env.DEFAULT_USER_NAME;
    delete process.env.DATA_DIR;
    delete process.env.BACKUP_DIR;
    delete process.env.MAX_BACKUPS;

    const config = loadConfig();
    const expectedDataDir = path.resolve(process.cwd(), 'data');

    assert.equal(config.port, 4000);
    assert.deepEqual(config.auth, {
      mode: 'local',
      defaultUserId: 'local-user',
      defaultUserName: 'Local User'
    });
    assert.deepEqual(config.persistence, {
      driver: 'filesystem',
      dataFile: path.join(expectedDataDir, 'store.json'),
      backupDir: path.join(expectedDataDir, 'backups'),
      maxBackups: 10
    });
  } finally {
    process.env = originalEnv;
  }
});

test('loadConfig supports google auth mode when client id provided', () => {
  const originalEnv = { ...process.env };

  try {
    process.env.AUTH_MODE = 'google';
    process.env.GOOGLE_CLIENT_ID = 'client';
    process.env.AUTH_TOKEN_SECRET = 'secret';
    process.env.AUTH_TOKEN_TTL_HOURS = '1';
    delete process.env.PERSISTENCE_DRIVER;

    const config = loadConfig();

    assert.deepEqual(config.auth, {
      mode: 'google',
      clientId: 'client',
      tokenSecret: 'secret',
      tokenTtlMs: 60 * 60 * 1000
    });
  } finally {
    process.env = originalEnv;
  }
});

test('loadConfig throws when google auth missing client id', () => {
  const originalEnv = { ...process.env };

  try {
    process.env.AUTH_MODE = 'google';
    delete process.env.GOOGLE_CLIENT_ID;

    assert.throws(() => loadConfig(), /GOOGLE_CLIENT_ID must be defined/);
  } finally {
    process.env = originalEnv;
  }
});

test('loadConfig builds mongo persistence configuration', () => {
  const originalEnv = { ...process.env };

  try {
    process.env.PERSISTENCE_DRIVER = 'mongo';
    process.env.MONGO_URI = 'mongodb://localhost:27017';
    process.env.MONGO_DATABASE = 'architekt-test';
    process.env.MONGO_COLLECTION = 'aggregates-test';
    process.env.PORT = '4100';

    const config = loadConfig();

    assert.equal(config.port, 4100);
    assert.deepEqual(config.persistence, {
      driver: 'mongo',
      uri: 'mongodb://localhost:27017',
      database: 'architekt-test',
      collection: 'aggregates-test'
    });
  } finally {
    process.env = originalEnv;
  }
});

test('loadConfig requires mongo uri when driver is mongo', () => {
  const originalEnv = { ...process.env };

  try {
    process.env.PERSISTENCE_DRIVER = 'mongo';
    delete process.env.MONGO_URI;

    assert.throws(() => loadConfig(), /MONGO_URI must be defined/);
  } finally {
    process.env = originalEnv;
  }
});
