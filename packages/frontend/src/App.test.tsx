import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.js';

vi.mock('./api/projects', () => {
  const project = {
    id: 'proj-1',
    name: 'Demo Project',
    description: 'Synthetic data for tests',
    tags: ['demo'],
    rootSystemId: 'sys-1',
    systems: {
      'sys-1': {
        id: 'sys-1',
        name: 'Demo Platform',
        description: 'Root node',
        tags: ['platform'],
        childIds: [],
        isRoot: true
      }
    },
    flows: {}
  };

  return {
    fetchProjects: vi.fn().mockResolvedValue([
      {
        id: project.id,
        name: project.name,
        description: project.description,
        tags: project.tags,
        rootSystemId: project.rootSystemId
      }
    ]),
    createProject: vi.fn().mockResolvedValue(project),
    fetchProjectDetails: vi.fn().mockResolvedValue(project),
    createSystem: vi.fn().mockResolvedValue(project.systems[project.rootSystemId]),
    updateSystem: vi.fn().mockResolvedValue(project.systems[project.rootSystemId]),
    deleteSystem: vi.fn().mockResolvedValue(undefined)
  };
});

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the architecture explorer workspace', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { level: 1, name: /Architekt/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Architecture explorer/i })).toBeInTheDocument();
    });

    expect(await screen.findByRole('button', { name: /Demo Project/i })).toBeInTheDocument();
    expect(screen.getByText(/visualize hierarchies/i)).toBeInTheDocument();
  });
});
