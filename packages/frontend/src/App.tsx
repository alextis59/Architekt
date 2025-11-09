import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ArchitectureWorkspace from './components/ArchitectureWorkspace.js';
import ProjectManager from './components/ProjectManager.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <main className="app">
      <header className="hero">
        <h1>Architekt</h1>
        <p className="lead">
          Build, annotate, and evolve systems with a visual architecture explorer powered by your project data.
        </p>
      </header>
      <div className="dashboard">
        <ProjectManager />
        <ArchitectureWorkspace />
      </div>
    </main>
  </QueryClientProvider>
);

export default App;
