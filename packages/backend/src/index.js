import { startServer } from './server.js';

startServer().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start backend server', error);
  process.exitCode = 1;
});
