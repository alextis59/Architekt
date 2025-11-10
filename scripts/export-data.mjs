#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const defaultAggregate = { projects: {} };

const parseArgs = (argv) => {
  const map = new Map();

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const next = argv[index + 1];

    if (key.startsWith('--')) {
      if (next && !next.startsWith('-')) {
        map.set(key, next);
        index += 1;
      } else {
        map.set(key, true);
      }
    } else if (key.startsWith('-')) {
      if (next && !next.startsWith('-')) {
        map.set(key, next);
        index += 1;
      } else {
        map.set(key, true);
      }
    }
  }

  return map;
};

const args = parseArgs(process.argv.slice(2));
const outputPath = args.get('--out') ?? args.get('-o');
const driver = (process.env.PERSISTENCE_DRIVER ?? 'filesystem').toLowerCase();

const readFileAggregate = async (file) => {
  try {
    const raw = await fs.readFile(file, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return defaultAggregate;
    }

    throw error;
  }
};

const loadAggregate = async () => {
  if (driver === 'mongo') {
    const uri = process.env.MONGO_URI;

    if (!uri) {
      throw new Error('MONGO_URI must be set when exporting from MongoDB');
    }

    const database = process.env.MONGO_DATABASE ?? 'architekt';
    const collectionName = process.env.MONGO_COLLECTION ?? 'aggregates';

    const client = await MongoClient.connect(uri, {
      serverSelectionTimeoutMS: 5_000
    });

    try {
      const collection = client.db(database).collection(collectionName);
      const document = await collection.findOne({ _id: 'architekt' });
      return document?.aggregate ?? defaultAggregate;
    } finally {
      await client.close();
    }
  }

  const dataDir = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
  const dataFile = path.join(dataDir, 'store.json');

  return readFileAggregate(dataFile);
};

const main = async () => {
  try {
    const aggregate = await loadAggregate();
    const serialized = JSON.stringify(aggregate, null, 2);

    if (outputPath && typeof outputPath === 'string') {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, serialized, 'utf-8');
      console.log(`Exported data to ${outputPath}`);
    } else {
      process.stdout.write(`${serialized}\n`);
    }
  } catch (error) {
    console.error('Failed to export data');
    console.error(error);
    process.exitCode = 1;
  }
};

await main();
