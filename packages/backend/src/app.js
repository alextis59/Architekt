import { parse as parseUrl } from 'node:url';
import { createProjectIndex, validateDomainAggregate } from '@architekt/domain';

const sendJson = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const handleAsync = (handler) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Unexpected error', error);
    sendJson(res, 500, { message: 'Internal Server Error' });
  }
};

/**
 * @param {{ persistence: import('./persistence/index.js').PersistenceAdapter }} options
 */
export const createApp = ({ persistence }) => {
  const routes = new Map();

  const register = (method, path, handler) => {
    routes.set(`${method.toUpperCase()} ${path}`, handleAsync(handler));
  };

  register('GET', '/health', async (_req, res) => {
    sendJson(res, 200, { status: 'ok' });
  });

  register('GET', '/projects', async (_req, res) => {
    const data = await persistence.load();
    const normalized = validateDomainAggregate(data);
    sendJson(res, 200, { projects: createProjectIndex(normalized) });
  });

  const handle = async (req, res) => {
    const { method = 'GET', url = '/' } = req;
    const { pathname } = parseUrl(url, false);
    const key = `${method.toUpperCase()} ${pathname}`;
    const route = routes.get(key);

    if (!route) {
      sendJson(res, 404, { message: 'Not Found' });
      return;
    }

    await route(req, res);
  };

  return { handle };
};
