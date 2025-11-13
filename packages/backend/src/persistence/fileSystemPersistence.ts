import fs from 'node:fs/promises';
import path from 'node:path';
import { createEmptyDomainAggregate, validateDomainAggregate, type DomainAggregate } from '@architekt/domain';
import type { PersistenceAdapter } from './index.js';

const toTimestamp = (date: Date) => date.toISOString().replace(/[:]/g, '-');

const pruneBackups = async (backupDir: string, maxBackups: number) => {
  if (maxBackups <= 0) {
    return;
  }

  const files = await fs.readdir(backupDir).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  });

  const fullPaths = files
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(backupDir, file));

  if (fullPaths.length <= maxBackups) {
    return;
  }

  const stats = await Promise.all(
    fullPaths.map(async (file) => ({
      file,
      mtime: (await fs.stat(file)).mtime.getTime()
    }))
  );

  const stale = stats
    .sort((a, b) => a.mtime - b.mtime)
    .slice(0, Math.max(0, stats.length - maxBackups));

  await Promise.all(
    stale.map(async ({ file }) => {
      try {
        await fs.unlink(file);
      } catch (error) {
        if (
          !(
            error &&
            typeof error === 'object' &&
            'code' in error &&
            (error as NodeJS.ErrnoException).code === 'ENOENT'
          )
        ) {
          throw error;
        }
      }
    })
  );
};

const createBackup = async (source: string, backupDir: string, maxBackups: number) => {
  try {
    await fs.access(source);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return;
    }

    throw error;
  }

  await fs.mkdir(backupDir, { recursive: true });
  const timestamp = toTimestamp(new Date());
  const backupFile = path.join(backupDir, `store-backup-${timestamp}.json`);
  await fs.copyFile(source, backupFile);
  await pruneBackups(backupDir, maxBackups);
};

type FileSystemPersistenceOptions = {
  dataFile: string;
  backupDir?: string;
  maxBackups?: number;
};

export const createFileSystemPersistence = ({
  dataFile,
  backupDir,
  maxBackups = 10
}: FileSystemPersistenceOptions): PersistenceAdapter => {
  const sanitizeStore = (input: unknown): Record<string, DomainAggregate> => {
    if (!input || typeof input !== 'object') {
      return {};
    }

    if ('projects' in (input as Record<string, unknown>)) {
      const aggregate = validateDomainAggregate(input);
      return { 'local-user': aggregate };
    }

    const entries = Object.entries(input as Record<string, unknown>).flatMap(
      ([userId, value]): [string, DomainAggregate][] => {
        try {
          const aggregate = validateDomainAggregate(value);
          return [[userId, aggregate]];
        } catch {
          return [];
        }
      }
    );

    return Object.fromEntries(entries);
  };

  const readStore = async (): Promise<Record<string, DomainAggregate>> => {
    try {
      const raw = await fs.readFile(dataFile, 'utf-8');
      const parsed = JSON.parse(raw);
      return sanitizeStore(parsed);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {};
      }

      throw error;
    }
  };

  const writeStore = async (store: Record<string, DomainAggregate>) => {
    const payload = JSON.stringify(
      Object.fromEntries(
        Object.entries(store).map(([userId, aggregate]) => [userId, validateDomainAggregate(aggregate)])
      ),
      null,
      2
    );
    await fs.mkdir(path.dirname(dataFile), { recursive: true });

    if (backupDir) {
      await createBackup(dataFile, backupDir, maxBackups);
    }

    const tempFile = `${dataFile}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempFile, payload, 'utf-8');
    await fs.rename(tempFile, dataFile);
  };

  return {
    async load(userId) {
      const store = await readStore();
      const aggregate = store[userId];
      return aggregate ? validateDomainAggregate(aggregate) : createEmptyDomainAggregate();
    },
    async save(userId, data) {
      const store = await readStore();
      const aggregate = validateDomainAggregate(data);
      await writeStore({ ...store, [userId]: aggregate });
    }
  };
};
