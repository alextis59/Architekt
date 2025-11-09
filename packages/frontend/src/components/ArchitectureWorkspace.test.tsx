import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ArchitectureWorkspace from './ArchitectureWorkspace.js';
import { useProjectStore } from '../store/projectStore.js';

const apiMocks = vi.hoisted(() => ({
  fetchProjectDetails: vi.fn(),
  createSystem: vi.fn(),
  updateSystem: vi.fn(),
  deleteSystem: vi.fn()
}));

vi.mock('../api/projects', () => ({
  fetchProjectDetails: apiMocks.fetchProjectDetails,
  createSystem: apiMocks.createSystem,
  updateSystem: apiMocks.updateSystem,
  deleteSystem: apiMocks.deleteSystem
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false
      }
    }
  });

const resetStore = () => {
  useProjectStore.setState({ selectedProjectId: null, selectedSystemId: null });
};

describe('ArchitectureWorkspace', () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it('surfaces project loading errors with context', async () => {
    apiMocks.fetchProjectDetails.mockRejectedValue(new Error('Boom'));
    useProjectStore.setState({ selectedProjectId: 'proj-1', selectedSystemId: null });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ArchitectureWorkspace />
      </QueryClientProvider>
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load project details: Boom');
  });
});

