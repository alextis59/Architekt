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
    return window.sessionStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
};

const writeStoredToken = (token: string | null) => {
  try {
    if (token) {
      window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors (e.g. disabled cookies)
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

const resolveAuthMode = (): AuthMode => {
  const raw = (import.meta.env.VITE_AUTH_MODE as string | undefined)?.toLowerCase();
  return raw === 'google' ? 'google' : 'local';
};

const LOCAL_USER_ID = (import.meta.env.VITE_DEFAULT_USER_ID as string | undefined)?.trim() || 'local-user';
const LOCAL_USER_NAME = (import.meta.env.VITE_DEFAULT_USER_NAME as string | undefined)?.trim() || 'Local Explorer';
const LOCAL_USER_EMAIL = (import.meta.env.VITE_DEFAULT_USER_EMAIL as string | undefined)?.trim() || 'local@example.com';

const LOCAL_USER: AuthenticatedUser = {
  id: LOCAL_USER_ID,
  name: LOCAL_USER_NAME,
  email: LOCAL_USER_EMAIL
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const mode = resolveAuthMode();
  const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? '';

  const [user, setUser] = useState<AuthenticatedUser | null>(mode === 'local' ? LOCAL_USER : null);
  const [error, setError] = useState<string | null>(null);
  const [isReady, setReady] = useState(mode === 'local');
  const googleInitializedRef = useRef(false);

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

    const applyCredential = (token: string) => {
      const payload = decodeJwt(token);
      if (!payload?.sub) {
        setError('Invalid sign-in response');
        writeStoredToken(null);
        setAuthToken(null);
        setUser(null);
        return;
      }

      const expiration = payload.exp ? payload.exp * 1000 : null;
      if (expiration && expiration <= Date.now()) {
        setError('Session expired, please sign in again.');
        writeStoredToken(null);
        setAuthToken(null);
        setUser(null);
        return;
      }

      const authenticatedUser: AuthenticatedUser = {
        id: payload.sub,
        name: payload.name ?? payload.email ?? undefined,
        email: payload.email ?? undefined
      };

      writeStoredToken(token);
      setAuthToken(token);
      setUser(authenticatedUser);
      setError(null);
    };

    const initializeGoogle = async () => {
      if (!googleClientId) {
        setError('Google client ID is not configured.');
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
            applyCredential(credential);
          }
        });

        googleInitializedRef.current = true;
        setReady(true);

        const storedToken = readStoredToken();
        if (storedToken) {
          applyCredential(storedToken);
        } else {
          setAuthToken(null);
          setUser(null);
        }

        accounts.prompt();
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
  }, [googleClientId, mode, signOut]);

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

