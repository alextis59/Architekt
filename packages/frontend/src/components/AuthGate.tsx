import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from '../auth/index.js';

type AuthGateProps = {
  children: ReactNode;
};

const AuthGate = ({ children }: AuthGateProps) => {
  const { mode, isReady, user, renderSignInButton, promptSignIn, error } = useAuth();
  const buttonRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (mode === 'google' && isReady && !user) {
      renderSignInButton(buttonRef.current);
    }
  }, [mode, isReady, user, renderSignInButton]);

  if (!isReady) {
    return (
      <div className="auth-gate" role="status" aria-live="polite">
        <p>Loading authentication&hellip;</p>
      </div>
    );
  }

  if (mode === 'google' && !user) {
    return (
      <div className="auth-gate" role="dialog" aria-modal="true">
        <div className="auth-card">
          <h2>Sign in to continue</h2>
          {error ? <p className="auth-error">{error}</p> : <p>Use your Google account to access your workspace.</p>}
          <div ref={buttonRef} className="auth-button" aria-live="polite" />
          {error ? (
            <button type="button" className="auth-retry" onClick={promptSignIn}>
              Try again
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthGate;

