import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useAuth = vi.fn();

vi.mock('../auth/index.js', () => ({
  useAuth
}));

describe('AuthGate', () => {
  beforeEach(() => {
    useAuth.mockReset();
  });

  it('shows a loading status while authentication is initializing', async () => {
    useAuth.mockReturnValue({
      mode: 'local',
      isReady: false,
      user: null,
      error: null,
      signOut: vi.fn(),
      renderSignInButton: vi.fn(),
      promptSignIn: vi.fn()
    });

    const AuthGate = (await import('./AuthGate.js')).default;

    render(
      <AuthGate>
        <div>Content</div>
      </AuthGate>
    );

    expect(screen.getByRole('status')).toHaveTextContent(/Loading authentication/i);
  });

  it('renders google sign-in dialog and retry button when user is not authenticated', async () => {
    const renderSignInButton = vi.fn();
    const promptSignIn = vi.fn();

    useAuth.mockReturnValue({
      mode: 'google',
      isReady: true,
      user: null,
      error: 'Failed to initialize',
      signOut: vi.fn(),
      renderSignInButton,
      promptSignIn
    });

    const AuthGate = (await import('./AuthGate.js')).default;

    const user = userEvent.setup();
    render(
      <AuthGate>
        <div>Protected</div>
      </AuthGate>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText(/Failed to initialize/i)).toBeInTheDocument();

    const buttonContainer = dialog.querySelector('.auth-button');
    expect(buttonContainer).toBeTruthy();
    expect(renderSignInButton).toHaveBeenCalledWith(buttonContainer);

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(promptSignIn).toHaveBeenCalled();
  });

  it('renders children when authentication is ready and user is present', async () => {
    useAuth.mockReturnValue({
      mode: 'local',
      isReady: true,
      user: { id: 'local-user' },
      error: null,
      signOut: vi.fn(),
      renderSignInButton: vi.fn(),
      promptSignIn: vi.fn()
    });

    const AuthGate = (await import('./AuthGate.js')).default;

    render(
      <AuthGate>
        <div>Protected content</div>
      </AuthGate>
    );

    expect(screen.getByText(/Protected content/)).toBeInTheDocument();
  });
});
