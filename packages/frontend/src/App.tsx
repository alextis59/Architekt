import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import DashboardPage from './components/DashboardPage.js';
import AuthGate from './components/AuthGate.js';
import { AuthProvider, useAuth } from './auth/index.js';
import { useProjectStore } from './store/projectStore.js';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

const HeaderAuthStatus = () => {
  const { mode, user, signOut } = useAuth();

  if (mode === 'local') {
    return <span className="auth-status">Local mode</span>;
  }

  if (!user) {
    return null;
  }

  const displayName = user.name ?? user.email ?? 'Signed in';

  return (
    <div className="auth-status" role="group" aria-label="Account">
      <span className="auth-identity">{displayName}</span>
      <button type="button" onClick={signOut} className="auth-signout">
        Sign out
      </button>
    </div>
  );
};

const AppLayout = () => (
  <main className="app">
    <header className="hero">
      <h1>Architekt</h1>
      <p className="lead">
        Build, annotate, and evolve systems with a visual architecture explorer powered by your project data.
      </p>
      <HeaderAuthStatus />
    </header>
    <div className="dashboard">
      <Outlet />
    </div>
  </main>
);

const AppRoutes = () => {
  const { user } = useAuth();
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    const currentId = user?.id ?? null;
    if (previousUserId.current === null && currentId !== null) {
      previousUserId.current = currentId;
      return;
    }

    if (previousUserId.current !== currentId) {
      queryClient.clear();
      useProjectStore.setState({
        selectedProjectId: null,
        selectedSystemId: null,
        selectedFlowId: null,
        selectedDataModelId: null,
        selectedComponentId: null
      });
      previousUserId.current = currentId;
    }
  }, [user?.id]);

  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/projects" replace />} />
        <Route path="projects">
          <Route index element={<DashboardPage />} />
          <Route path=":projectId" element={<DashboardPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Route>
    </Routes>
  );
};

const App = () => (
  <AuthProvider>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <AppRoutes />
      </AuthGate>
    </QueryClientProvider>
  </AuthProvider>
);

export default App;
