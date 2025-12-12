import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, RequestHandler, Response } from 'express';
import crypto from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { createAuthMiddleware, createGoogleLoginHandler } from './auth.js';
import { UnauthorizedError } from './httpError.js';

const signToken = (payload: object, secret: string) => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const encodedPayload = encode(payload);
  const data = `${header}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
};

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
    header: (() => undefined) as Request['header']
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

test('google auth middleware verifies signed token and applies claims', async () => {
  const token = signToken(
    { sub: 'google-user', name: 'Profile Name', email: 'profile@example.com', exp: Math.floor(Date.now() / 1000) + 3600 },
    'secret'
  );

  const middleware = createAuthMiddleware({
    mode: 'google',
    clientId: 'client',
    tokenSecret: 'secret',
    tokenTtlMs: 3600_000
  });

  const request: Partial<Request> = {
    header: ((name: string) =>
      name === 'authorization' ? `Bearer ${token}` : undefined) as Request['header']
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
  const middleware = createAuthMiddleware({
    mode: 'google',
    clientId: 'client',
    tokenSecret: 'secret',
    tokenTtlMs: 3600_000
  });

  const request: Partial<Request> = {
    header: ((name: string) =>
      name === 'authorization' ? '' : undefined) as Request['header']
  };

  let error: unknown;
  await runMiddleware(middleware, request, (err) => {
    error = err;
  });

  assert.ok(error instanceof UnauthorizedError);
  assert.equal((error as UnauthorizedError).message, 'Missing authentication token');
});

test('google auth middleware rejects invalid signatures', async () => {
  const token = signToken(
    { sub: 'google-user', exp: Math.floor(Date.now() / 1000) + 3600 },
    'other-secret'
  );

  const middleware = createAuthMiddleware({
    mode: 'google',
    clientId: 'client',
    tokenSecret: 'secret',
    tokenTtlMs: 3600_000
  });

  const request: Partial<Request> = {
    header: ((name: string) =>
      name === 'authorization' ? 'Bearer token' : undefined) as Request['header']
  };

  let error: unknown;
  await runMiddleware(middleware, request, (err) => {
    error = err;
  });

  assert.ok(error instanceof UnauthorizedError);
  assert.equal((error as UnauthorizedError).message, 'Invalid authentication token');
});

test('google auth middleware rejects expired tokens', async () => {
  const token = signToken(
    { sub: 'google-user', exp: Math.floor(Date.now() / 1000) - 10 },
    'secret'
  );

  const middleware = createAuthMiddleware({
    mode: 'google',
    clientId: 'client',
    tokenSecret: 'secret',
    tokenTtlMs: 3600_000
  });

  const request: Partial<Request> = {
    header: ((name: string) =>
      name === 'authorization' ? `Bearer ${token}` : undefined) as Request['header']
  };

  let error: unknown;
  await runMiddleware(middleware, request, (err) => {
    error = err;
  });

  assert.ok(error instanceof UnauthorizedError);
  assert.equal((error as UnauthorizedError).message, 'Authentication token has expired');
});

test('google login handler exchanges credentials for internal token', async (t) => {
  t.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () =>
    ({
      getPayload: () => ({ sub: 'google-user', email: 'fallback@example.com' })
    }) as never
  );

  const handler = createGoogleLoginHandler({
    mode: 'google',
    clientId: 'client',
    tokenSecret: 'secret',
    tokenTtlMs: 3600_000
  });

  const request: Partial<Request> = {
    body: { credential: 'google-credential' }
  };

  const response: Partial<Response> & { statusCode?: number; payload?: unknown } = {
    status(code: number) {
      this.statusCode = code;
      return this as Response;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this as Response;
    }
  };

  await handler(request as Request, response as Response);

  const { token, user } = response.payload as { token: string; user: unknown };
  assert.equal(response.statusCode, undefined);
  assert.equal((user as { id: string }).id, 'google-user');

  const [, payload, signature] = token.split('.');
  const signedData = token.slice(0, token.lastIndexOf('.'));
  const expectedSignature = crypto.createHmac('sha256', 'secret').update(signedData).digest('base64url');
  assert.equal(signature, expectedSignature);

  const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8')) as {
    sub?: string;
    email?: string;
  };
  assert.equal(decoded.sub, 'google-user');
  assert.equal(decoded.email, 'fallback@example.com');
});
