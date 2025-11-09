import path from 'node:path';

export type BackendConfig = {
  port: number;
  dataFile: string;
};

export const loadConfig = (): BackendConfig => {
  const port = Number.parseInt(process.env.PORT ?? '4000', 10);
  const dataDir = process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data');
  const dataFile = path.join(dataDir, 'store.json');

  return {
    port: Number.isNaN(port) ? 4000 : port,
    dataFile
  };
};
