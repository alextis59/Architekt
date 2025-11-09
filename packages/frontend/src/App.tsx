import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import DashboardPage from './components/DashboardPage.js';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

const AppLayout = () => (
  <main className="app">
    <header className="hero">
      <h1>Architekt</h1>
      <p className="lead">
        Build, annotate, and evolve systems with a visual architecture explorer powered by your project data.
      </p>
    </header>
    <div className="dashboard">
      <Outlet />
    </div>
  </main>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
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
  </QueryClientProvider>
);

export default App;
