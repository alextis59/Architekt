import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { getAuthToken, notifyUnauthorized, setAuthToken, setUnauthorizedHandler } from './tokenStore.js';

type AuthMode = 'local' | 'google';

export type AuthenticatedUser = {
  id: string;
  name?: string;
  email?: string;
};

type AuthContextValue = {
  mode: AuthMode;
  isReady: boolean;
  user: AuthenticatedUser | null;
  error: string | null;
  signOut: () => void;
  renderSignInButton: (element: HTMLElement | null) => void;
  promptSignIn: () => void;
};

type GoogleJwtPayload = {
  sub?: string;
  name?: string;
  email?: string;
  exp?: number;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'architekt.idToken';

const readStoredToken = (): string | null => {
  try {
    const persistedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
    if (persistedToken) {
      return persistedToken;
    }
  } catch {
    // Ignore storage errors (e.g. disabled cookies)
  }

  try {
    const legacyToken = window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (legacyToken) {
      // Migrate legacy session-based tokens to persistent storage.
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      try {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, legacyToken);
      } catch {
        // Ignore storage errors for migration as well.
      }
    }
    return legacyToken;
  } catch {
    return null;
  }
};

const writeStoredToken = (token: string | null) => {
  try {
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors (e.g. disabled cookies)
  }

  try {
    window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage errors when cleaning up legacy storage.
  }
};

const decodeJwt = (token: string): GoogleJwtPayload | null => {
  try {
    const [, payload] = token.split('.');
    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = atob(padded);
    return JSON.parse(decoded) as GoogleJwtPayload;
  } catch {
    return null;
  }
};

const resolveUserFromToken = (token: string): AuthenticatedUser | null => {
  const payload = decodeJwt(token);
  if (!payload?.sub) {
    return null;
  }

  return {
    id: payload.sub,
    name: payload.name ?? payload.email ?? undefined,
    email: payload.email ?? undefined
  };
};

const loadGoogleIdentityScript = () => {
  if (document.getElementById('google-identity-services')) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.id = 'google-identity-services';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
};

type RuntimeAuthConfig = { mode: 'local' } | { mode: 'google'; clientId: string };

const STATIC_AUTH_CONFIG: RuntimeAuthConfig | null = (() => {
  const rawMode = (import.meta.env.VITE_AUTH_MODE as string | undefined)?.toLowerCase();

  if (rawMode === 'google') {
    const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '';
    return clientId ? { mode: 'google', clientId } : null;
  }

  if (rawMode === 'local') {
    return { mode: 'local' };
  }

  if (import.meta.env.MODE === 'test') {
    return { mode: 'local' };
  }

  return null;
})();

const LOCAL_USER_ID = (import.meta.env.VITE_DEFAULT_USER_ID as string | undefined)?.trim() || 'local-user';
const LOCAL_USER_NAME = (import.meta.env.VITE_DEFAULT_USER_NAME as string | undefined)?.trim() || 'Local Explorer';
const LOCAL_USER_EMAIL = (import.meta.env.VITE_DEFAULT_USER_EMAIL as string | undefined)?.trim() || 'local@example.com';

const LOCAL_USER: AuthenticatedUser = {
  id: LOCAL_USER_ID,
  name: LOCAL_USER_NAME,
  email: LOCAL_USER_EMAIL
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<AuthMode>(STATIC_AUTH_CONFIG?.mode ?? 'local');
  const [googleClientId, setGoogleClientId] = useState(() =>
    STATIC_AUTH_CONFIG?.mode === 'google' ? STATIC_AUTH_CONFIG.clientId : ''
  );
  const [user, setUser] = useState<AuthenticatedUser | null>(
    STATIC_AUTH_CONFIG?.mode === 'local' ? LOCAL_USER : null
  );
  const [error, setError] = useState<string | null>(null);
  const [isReady, setReady] = useState(STATIC_AUTH_CONFIG?.mode === 'local');
  const googleInitializedRef = useRef(false);

  const applySessionToken = useCallback(
    (token: string, userFromResponse?: AuthenticatedUser): boolean => {
      const payload = decodeJwt(token);
      const resolvedUser = userFromResponse ?? resolveUserFromToken(token);

      if (!payload?.sub || !resolvedUser?.id) {
        setError('Invalid sign-in response');
        writeStoredToken(null);
        setAuthToken(null);
        setUser(null);
        return false;
      }

      const expiration = payload.exp ? payload.exp * 1000 : null;
      if (expiration && expiration <= Date.now()) {
        setError('Session expired, please sign in again.');
        writeStoredToken(null);
        setAuthToken(null);
        setUser(null);
        return false;
      }

      writeStoredToken(token);
      setAuthToken(token);
      setUser(resolvedUser);
      setError(null);
      return true;
    },
    []
  );

  useEffect(() => {
    if (STATIC_AUTH_CONFIG) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const loadAuthConfig = async () => {
      try {
        const response = await fetch('/api/auth/config', { signal: controller.signal });
        if (!response.ok) {
          throw new Error('Failed to load authentication configuration.');
        }

        const config = (await response.json()) as RuntimeAuthConfig;
        if (cancelled) {
          return;
        }

        if (config.mode === 'google') {
          setMode('google');
          setGoogleClientId(config.clientId);
          setUser(null);
          setReady(false);
          setError(null);
          googleInitializedRef.current = false;
        } else {
          setMode('local');
          setGoogleClientId('');
          setUser(LOCAL_USER);
          setReady(true);
          setAuthToken(null);
          writeStoredToken(null);
          setError(null);
          googleInitializedRef.current = false;
        }
      } catch (err) {
        if (cancelled) {
          return;
        }

        setMode('google');
        setGoogleClientId('');
        setUser(null);
        setError(err instanceof Error ? err.message : 'Failed to load authentication configuration.');
        setReady(true);
      }
    };

    loadAuthConfig();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const signOut = useCallback(() => {
    if (mode === 'google') {
      writeStoredToken(null);
      setAuthToken(null);
      setUser(null);
      setError(null);
      try {
        window.google?.accounts.id.disableAutoSelect();
        window.google?.accounts.id.cancel();
      } catch {
        // Ignore cleanup errors
      }
    } else {
      setUser(LOCAL_USER);
      setAuthToken(null);
    }
  }, [mode]);

  useEffect(() => {
    if (mode === 'local') {
      setAuthToken(null);
      setUnauthorizedHandler(null);
      return;
    }

    let cancelled = false;

    const exchangeCredential = async (credential: string) => {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential })
        });

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          const payload = (await response
            .json()
            .catch(() => null)) as { error?: string } | null;
          setError(payload?.error ?? 'Sign-in failed. Please try again.');
          setAuthToken(null);
          setUser(null);
          return;
        }

        const { token, user: userFromResponse } = (await response.json()) as {
          token?: string;
          user?: AuthenticatedUser;
        };

        if (!token) {
          throw new Error('Invalid sign-in response');
        }

        const applied = applySessionToken(token, userFromResponse);
        if (!applied && googleInitializedRef.current) {
          window.google?.accounts.id.prompt();
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
        setAuthToken(null);
        setUser(null);
      }
    };

    const initializeGoogle = async () => {
      if (!googleClientId) {
        setError((previous) => previous ?? 'Google client ID is not configured.');
        setReady(true);
        return;
      }

      try {
        await loadGoogleIdentityScript();
        if (cancelled) {
          return;
        }

        const accounts = window.google?.accounts?.id;
        if (!accounts) {
          setError('Google Identity Services are unavailable.');
          setReady(true);
          return;
        }

        accounts.initialize({
          client_id: googleClientId,
          callback: (credentialResponse) => {
            const credential = credentialResponse.credential;
            if (!credential) {
              setError('Sign-in failed. Please try again.');
              return;
            }
            void exchangeCredential(credential);
          }
        });

        googleInitializedRef.current = true;
        setReady(true);

        const storedToken = readStoredToken();
        const restored = storedToken ? applySessionToken(storedToken) : false;
        if (!restored) {
          setAuthToken(null);
          setUser(null);
          accounts.prompt();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize Google authentication');
        setReady(true);
      }
    };

    initializeGoogle();

    setUnauthorizedHandler(() => signOut());

    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
    };
  }, [applySessionToken, googleClientId, mode, signOut]);

  const renderSignInButton = useCallback(
    (element: HTMLElement | null) => {
      if (!element) {
        return;
      }

      if (mode !== 'google') {
        element.innerHTML = '';
        return;
      }

      if (!googleInitializedRef.current) {
        element.innerHTML = '';
        return;
      }

      try {
        window.google?.accounts.id.renderButton(element, {
          theme: 'filled_blue',
          size: 'large',
          type: 'standard',
          shape: 'rectangular',
          width: 260
        });
      } catch {
        element.innerHTML = '';
      }
    },
    [mode]
  );

  const promptSignIn = useCallback(() => {
    if (mode === 'google' && googleInitializedRef.current) {
      try {
        window.google?.accounts.id.prompt();
      } catch {
        // Ignore prompt errors
      }
    }
  }, [mode]);

  useEffect(() => {
    if (mode === 'google' && !getAuthToken() && user) {
      // User was restored from storage but token is missing, reapply stored token.
      const storedToken = readStoredToken();
      if (storedToken) {
        setAuthToken(storedToken);
      }
    }
  }, [mode, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      mode,
      isReady,
      user,
      error,
      signOut,
      renderSignInButton,
      promptSignIn
    }),
    [mode, isReady, user, error, signOut, renderSignInButton, promptSignIn]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};

export const useRequireAuth = (): AuthenticatedUser | null => {
  const { user, isReady } = useAuth();
  return isReady ? user : null;
};

export const signOutDueToUnauthorized = (): void => {
  notifyUnauthorized();
};

