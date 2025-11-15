import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthModule = typeof import('./AuthProvider.js');

const resetEnvironment = () => {
  vi.unstubAllEnvs();
  sessionStorage.clear();
  localStorage.clear();
  vi.restoreAllMocks();
  delete (window as { google?: unknown }).google;
  const existingScript = document.getElementById('google-identity-services');
  if (existingScript) {
    existingScript.remove();
  }
};

describe('AuthProvider', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  afterEach(() => {
    resetEnvironment();
  });

  const loadModule = async (): Promise<AuthModule> => {
    vi.resetModules();
    return import('./AuthProvider.js');
  };

  it('provides a local user and keeps session when signing out in local mode', async () => {
    vi.resetModules();
    const { AuthProvider, useAuth } = await import('./AuthProvider.js');

    const renderResult: { getAuth?: () => ReturnType<typeof useAuth> } = {};

    const TestConsumer = () => {
      const auth = useAuth();
      renderResult.getAuth = () => auth;
      return null;
    };

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(renderResult.getAuth?.().isReady).toBe(true);
    });

    const auth = renderResult.getAuth?.();
    expect(auth?.mode).toBe('local');
    expect(auth?.user?.id).toBe('local-user');

    auth?.signOut();

    expect(renderResult.getAuth?.()?.user?.id).toBe('local-user');
  });

  it('initializes google auth based on runtime configuration and manages tokens', async () => {
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('VITE_AUTH_MODE', '');
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');

    const script = document.createElement('script');
    script.id = 'google-identity-services';
    document.head.appendChild(script);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ mode: 'google', clientId: 'client-123' })
    });
    vi.stubGlobal('fetch', fetchMock);

    const initialize = vi.fn();
    let initializeCallback: ((response: { credential?: string | null }) => void) | null = null;
    initialize.mockImplementation((options: { callback: (response: { credential?: string | null }) => void }) => {
      initializeCallback = options.callback;
    });

    const renderButton = vi.fn();
    const prompt = vi.fn();
    const disableAutoSelect = vi.fn();
    const cancel = vi.fn();

    (window as { google?: unknown }).google = {
      accounts: {
        id: {
          initialize,
          renderButton,
          prompt,
          disableAutoSelect,
          cancel
        }
      }
    };

    const { AuthProvider, useAuth, signOutDueToUnauthorized } = await loadModule();
    const tokenStore = await import('./tokenStore.js');

    const authRef: { value?: ReturnType<typeof useAuth> } = {};
    const TestConsumer = () => {
      const auth = useAuth();
      authRef.value = auth;
      return <div data-testid="status">{auth.isReady ? 'ready' : 'pending'}</div>;
    };

    const { getByTestId } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(getByTestId('status').textContent).toBe('ready');
      expect(authRef.value?.mode).toBe('google');
    });

    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'client-123' }));
    expect(prompt).toHaveBeenCalled();

    const button = document.createElement('div');
    authRef.value?.renderSignInButton(button);
    expect(renderButton).toHaveBeenCalledWith(button, expect.any(Object));

    authRef.value?.promptSignIn();
    expect(prompt).toHaveBeenCalledTimes(2);

    const payload = { sub: 'user-123', email: 'user@example.com', exp: Math.floor(Date.now() / 1000) + 3600 };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    initializeCallback?.({ credential: `header.${encoded}.signature` });

    await waitFor(() => {
      expect(authRef.value?.user?.id).toBe('user-123');
      expect(tokenStore.getAuthToken()).toMatch(/header\./);
    });

    await signOutDueToUnauthorized();

    await waitFor(() => {
      expect(authRef.value?.user).toBeNull();
    });
    expect(tokenStore.getAuthToken()).toBeNull();

    authRef.value?.signOut();
    expect(disableAutoSelect).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
  });

  it('exposes promptSignIn to retry google authentication after an error', async () => {
    vi.stubEnv('MODE', 'development');
    vi.stubEnv('VITE_AUTH_MODE', '');

    const script = document.createElement('script');
    script.id = 'google-identity-services';
    document.head.appendChild(script);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({})
    });
    vi.stubGlobal('fetch', fetchMock);

    const prompt = vi.fn();
    (window as { google?: unknown }).google = {
      accounts: {
        id: {
          initialize: vi.fn(),
          renderButton: vi.fn(),
          prompt,
          disableAutoSelect: vi.fn(),
          cancel: vi.fn()
        }
      }
    };

    const { AuthProvider, useAuth } = await loadModule();

    const authRef: { value?: ReturnType<typeof useAuth> } = {};
    const TestConsumer = () => {
      const auth = useAuth();
      authRef.value = auth;
      return <button onClick={() => auth.promptSignIn()}>Prompt</button>;
    };

    const user = userEvent.setup();
    const { getByRole } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(authRef.value?.mode).toBe('google');
      expect(authRef.value?.error).toMatch(/Failed to load/);
    });

    await user.click(getByRole('button', { name: /prompt/i }));
    expect(prompt).not.toHaveBeenCalled();

    authRef.value?.renderSignInButton(document.createElement('div'));
    authRef.value?.promptSignIn();
    expect(prompt).not.toHaveBeenCalled();
  });
});
