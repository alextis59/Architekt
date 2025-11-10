import fs from 'node:fs/promises';
import path from 'node:path';
import { createEmptyDomainAggregate, validateDomainAggregate } from '@architekt/domain';
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
  const read = async () => {
    try {
      const raw = await fs.readFile(dataFile, 'utf-8');
      const parsed = JSON.parse(raw);
      return validateDomainAggregate(parsed);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        return createEmptyDomainAggregate();
      }

      throw error;
    }
  };

  const write = async (data: Parameters<PersistenceAdapter['save']>[0]) => {
    const payload = JSON.stringify(validateDomainAggregate(data), null, 2);
    await fs.mkdir(path.dirname(dataFile), { recursive: true });

    if (backupDir) {
      await createBackup(dataFile, backupDir, maxBackups);
    }

    const tempFile = `${dataFile}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tempFile, payload, 'utf-8');
    await fs.rename(tempFile, dataFile);
  };

  return {
    async load() {
      return read();
    },
    async save(data) {
      await write(data);
    }
  };
};
