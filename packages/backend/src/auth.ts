import { Buffer } from 'node:buffer';
import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { UnauthorizedError } from './httpError.js';

export type AuthenticatedUser = {
  id: string;
  name?: string;
  email?: string;
};

export type LocalAuthConfig = {
  mode: 'local';
  defaultUserId: string;
  defaultUserName: string;
};

export type GoogleAuthConfig = {
  mode: 'google';
  clientId: string;
  tokenSecret: string;
  tokenTtlMs: number;
};

export type AuthConfig = LocalAuthConfig | GoogleAuthConfig;

const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  try {
    const [, payload] = token.split('.');

    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = Buffer.from(padded, 'base64').toString('utf-8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const encodeBase64Url = (input: string | Buffer): string =>
  Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const signPayload = (payload: object, secret: string): string => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = encodeBase64Url(JSON.stringify(header));
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64');
  const encodedSignature = signature.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${data}.${encodedSignature}`;
};

const verifySignature = (token: string, secret: string): Record<string, unknown> | null => {
  const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');

  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    return null;
  }

  const data = `${encodedHeader}.${encodedPayload}`;
  const expected = crypto.createHmac('sha256', secret).update(data).digest();
  const provided = Buffer.from(encodedSignature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encodedPayload, 'base64').toString('utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const createInternalToken = (
  user: AuthenticatedUser,
  { tokenSecret, tokenTtlMs }: Pick<GoogleAuthConfig, 'tokenSecret' | 'tokenTtlMs'>
): string => {
  const now = Date.now();
  const payload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + tokenTtlMs) / 1000)
  };

  return signPayload(payload, tokenSecret);
};

const createLocalMiddleware = ({ defaultUserId, defaultUserName }: LocalAuthConfig): RequestHandler =>
  (req, _res, next) => {
    req.user = {
      id: defaultUserId,
      name: defaultUserName,
      email: `${defaultUserId}@local`
    };
    next();
  };

const createGoogleMiddleware = (config: GoogleAuthConfig): RequestHandler => {
  return async (req, _res, next) => {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    if (!token) {
      next(new UnauthorizedError('Missing authentication token'));
      return;
    }

    try {
      const payload = verifySignature(token, config.tokenSecret);

      if (!payload?.sub || !payload.exp) {
        next(new UnauthorizedError('Invalid authentication token'));
        return;
      }

      const expirationMs = Number(payload.exp) * 1000;
      if (Number.isNaN(expirationMs) || expirationMs <= Date.now()) {
        next(new UnauthorizedError('Authentication token has expired'));
        return;
      }

      req.user = {
        id: payload.sub as string,
        name: (payload.name as string | undefined) ?? undefined,
        email: (payload.email as string | undefined) ?? undefined
      };
      next();
    } catch (error) {
      if (error instanceof Error) {
        error.message = 'Invalid authentication token';
      }
      next(new UnauthorizedError('Invalid authentication token'));
    }
  };
};

export const createAuthMiddleware = (config: AuthConfig): RequestHandler => {
  if (config.mode === 'google') {
    return createGoogleMiddleware(config);
  }

  return createLocalMiddleware(config);
};

export const createGoogleLoginHandler = (config: GoogleAuthConfig): RequestHandler => {
  const client = new OAuth2Client(config.clientId);

  return async (req, res) => {
    const credential = typeof req.body?.credential === 'string' ? req.body.credential.trim() : '';

    if (!credential) {
      res.status(400).json({ error: 'Missing sign-in credential' });
      return;
    }

    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: config.clientId
      });
      const payload = ticket.getPayload();

      if (!payload?.sub) {
        res.status(401).json({ error: 'Invalid sign-in credential' });
        return;
      }

      const profile = decodeJwtPayload(credential);
      const user: AuthenticatedUser = {
        id: payload.sub,
        name: (profile?.name as string | undefined) ?? payload.name ?? payload.email ?? undefined,
        email: (profile?.email as string | undefined) ?? payload.email ?? undefined
      };

      const token = createInternalToken(user, config);

      res.json({ token, user });
    } catch {
      res.status(401).json({ error: 'Invalid sign-in credential' });
    }
  };
};

