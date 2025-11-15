import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, RequestHandler, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { createAuthMiddleware } from './auth.js';
import { UnauthorizedError } from './httpError.js';

const runMiddleware = async (
  middleware: RequestHandler,
  req: Partial<Request>,
  next: (error?: unknown) => void
) => {
  await middleware(req as Request, {} as Response, next);
};

test('local auth middleware assigns default user', async () => {
  const middleware = createAuthMiddleware({
    mode: 'local',
    defaultUserId: 'local-user',
    defaultUserName: 'Local Tester'
  });

  const request: Partial<Request> = {
    header: () => undefined
  };

  let error: unknown;
  await runMiddleware(middleware, request, (err) => {
    error = err;
  });

  assert.equal(error, undefined);
  assert.deepEqual(request.user, {
    id: 'local-user',
    name: 'Local Tester',
    email: 'local-user@local'
  });
});

test('google auth middleware verifies token and merges profile fields', async (t) => {
  const profilePayload = Buffer.from(
    JSON.stringify({ name: 'Profile Name', email: 'profile@example.com' })
  ).toString('base64url');
  const token = `header.${profilePayload}.signature`;

  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () =>
    ({
      getPayload: () => ({ sub: 'google-user', email: 'fallback@example.com' })
    }) as never
  );

  const middleware = createAuthMiddleware({ mode: 'google', clientId: 'client' });

  const request: Partial<Request> = {
    header: (name: string) => (name === 'authorization' ? `Bearer ${token}` : undefined)
  };

  let error: unknown;
  await runMiddleware(middleware, request, (err) => {
    error = err;
  });

  assert.equal(error, undefined);
  assert.deepEqual(request.user, {
    id: 'google-user',
    name: 'Profile Name',
    email: 'profile@example.com'
  });
});

test('google auth middleware rejects missing tokens', async () => {
  const middleware = createAuthMiddleware({ mode: 'google', clientId: 'client' });

  const request: Partial<Request> = {
    header: (name: string) => (name === 'authorization' ? '' : undefined)
  };

  let error: unknown;
  await runMiddleware(middleware, request, (err) => {
    error = err;
  });

  assert.ok(error instanceof UnauthorizedError);
  assert.equal((error as UnauthorizedError).message, 'Missing authentication token');
});

test('google auth middleware normalizes verification failures', async (t) => {
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => {
    throw new Error('boom');
  });

  const middleware = createAuthMiddleware({ mode: 'google', clientId: 'client' });

  const request: Partial<Request> = {
    header: (name: string) => (name === 'authorization' ? 'Bearer token' : undefined)
  };

  let error: unknown;
  await runMiddleware(middleware, request, (err) => {
    error = err;
  });

  assert.ok(error instanceof UnauthorizedError);
  assert.equal((error as UnauthorizedError).message, 'Invalid authentication token');
});
