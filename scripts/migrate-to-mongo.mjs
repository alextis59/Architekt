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

const readAggregateFromFile = async (file) => {
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

const args = parseArgs(process.argv.slice(2));

const dataDir = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
const defaultSource = path.join(dataDir, 'store.json');
const sourceFile = args.get('--source') ?? args.get('-s') ?? defaultSource;

const uri = process.env.MONGO_URI;

if (!uri) {
  console.error('MONGO_URI must be defined to run the migration');
  process.exit(1);
}

const database = process.env.MONGO_DATABASE ?? 'architekt';
const collectionName = process.env.MONGO_COLLECTION ?? 'aggregates';

const main = async () => {
  try {
    const aggregate = await readAggregateFromFile(sourceFile);

    const client = await MongoClient.connect(uri, {
      serverSelectionTimeoutMS: 5_000
    });

    try {
      const collection = client.db(database).collection(collectionName);
      await collection.updateOne(
        { _id: 'architekt' },
        {
          $set: {
            aggregate
          }
        },
        { upsert: true }
      );
      console.log(
        `Migrated data from ${sourceFile} to MongoDB collection ${collectionName} in database ${database}`
      );
    } finally {
      await client.close();
    }
  } catch (error) {
    console.error('Failed to migrate data to MongoDB');
    console.error(error);
    process.exitCode = 1;
  }
};

await main();
