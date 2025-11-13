import { Buffer } from 'node:buffer';
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

const createLocalMiddleware = ({ defaultUserId, defaultUserName }: LocalAuthConfig): RequestHandler =>
  (req, _res, next) => {
    req.user = {
      id: defaultUserId,
      name: defaultUserName,
      email: `${defaultUserId}@local`
    };
    next();
  };

const createGoogleMiddleware = ({ clientId }: GoogleAuthConfig): RequestHandler => {
  const client = new OAuth2Client(clientId);

  return async (req, _res, next) => {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    if (!token) {
      next(new UnauthorizedError('Missing authentication token'));
      return;
    }

    try {
      const ticket = await client.verifyIdToken({
        idToken: token,
        audience: clientId
      });
      const payload = ticket.getPayload();

      if (!payload?.sub) {
        next(new UnauthorizedError('Invalid authentication token'));
        return;
      }

      const profile = decodeJwtPayload(token);
      const name = (profile?.name as string | undefined) ?? payload.name ?? payload.email ?? undefined;
      const email = (profile?.email as string | undefined) ?? payload.email ?? undefined;

      req.user = {
        id: payload.sub,
        name,
        email
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

