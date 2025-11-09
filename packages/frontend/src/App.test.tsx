import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from 'history';
import { Router } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App, { queryClient } from './App.js';
import { useProjectStore } from './store/projectStore.js';

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
      childIds: ['sys-2'],
      isRoot: true
    },
    'sys-2': {
      id: 'sys-2',
      name: 'Child Service',
      description: 'Handles downstream tasks',
      tags: ['service'],
      childIds: [],
      isRoot: false
    }
  },
  flows: {}
};

const apiMocks = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
  createProject: vi.fn(),
  fetchProjectDetails: vi.fn(),
  createSystem: vi.fn(),
  updateSystem: vi.fn(),
  deleteSystem: vi.fn()
}));

vi.mock('./api/projects', () => apiMocks);

const {
  fetchProjects: mockFetchProjects,
  createProject: mockCreateProject,
  fetchProjectDetails: mockFetchProjectDetails,
  createSystem: mockCreateSystem,
  updateSystem: mockUpdateSystem,
  deleteSystem: mockDeleteSystem
} = apiMocks;

const renderWithRouter = (initialEntries: string[]) => {
  const history = createMemoryHistory({ initialEntries });
  const view = render(
    <Router location={history.location} navigator={history}>
      <App />
    </Router>
  );

  return { history, ...view };
};

const resetStore = () => {
  useProjectStore.setState({ selectedProjectId: null, selectedSystemId: null });
};

describe('App', () => {
  beforeEach(() => {
    mockFetchProjects.mockResolvedValue([
      {
        id: project.id,
        name: project.name,
        description: project.description,
        tags: project.tags,
        rootSystemId: project.rootSystemId
      }
    ]);
    mockCreateProject.mockResolvedValue(project);
    mockFetchProjectDetails.mockResolvedValue(project);
    mockCreateSystem.mockResolvedValue(project.systems[project.rootSystemId]);
    mockUpdateSystem.mockResolvedValue(project.systems[project.rootSystemId]);
    mockDeleteSystem.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    resetStore();
  });

  it('renders the architecture explorer workspace', async () => {
    renderWithRouter(['/projects']);

    expect(screen.getByRole('heading', { level: 1, name: /Architekt/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: /Architecture explorer/i })).toBeInTheDocument();
    });

    expect(await screen.findByRole('button', { name: /Demo Project/i })).toBeInTheDocument();
    expect(screen.getByText(/visualize hierarchies/i)).toBeInTheDocument();
  });

  it('navigates to a project specific route when a project is selected', async () => {
    const { history } = renderWithRouter(['/projects']);

    const projectButton = await screen.findByRole('button', { name: /Demo Project/i });
    await userEvent.click(projectButton);

    await waitFor(() => {
      expect(history.location.pathname).toBe('/projects/proj-1');
    });
  });

  it('loads project data when the URL already targets a project', async () => {
    renderWithRouter(['/projects/proj-1']);

    const detailsHeading = await screen.findByRole('heading', { level: 3, name: /Demo Platform/i });
    const detailsPanel = detailsHeading.closest('.system-details-panel');
    expect(detailsPanel).not.toBeNull();

    if (!detailsPanel) {
      throw new Error('System details panel not found');
    }

    const nameInputs = within(detailsPanel).getAllByRole('textbox', { name: /Name/i });
    expect(nameInputs[0]).toHaveValue('Demo Platform');
  });
});
