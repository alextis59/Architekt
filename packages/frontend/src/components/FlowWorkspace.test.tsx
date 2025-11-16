import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Project } from '@architekt/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FlowWorkspace from './FlowWorkspace.js';
import { useProjectStore } from '../store/projectStore.js';
import { queryKeys } from '../queryKeys.js';

const apiMocks = vi.hoisted(() => ({
  fetchProjectDetails: vi.fn(),
  createFlow: vi.fn(),
  updateFlow: vi.fn(),
  deleteFlow: vi.fn()
}));

vi.mock('../api/projects', () => ({
  fetchProjectDetails: apiMocks.fetchProjectDetails,
  createFlow: apiMocks.createFlow,
  updateFlow: apiMocks.updateFlow,
  deleteFlow: apiMocks.deleteFlow
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity
      }
    }
  });

const resetStore = () => {
  useProjectStore.setState({
    selectedProjectId: null,
    selectedSystemId: null,
    selectedFlowId: null,
    selectedDataModelId: null,
    selectedComponentId: null
  });
};

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;
let consoleWarnSpy: ReturnType<typeof vi.spyOn> | null = null;

const projectFixture: Project = {
  id: 'proj-1',
  name: 'Flow project',
  description: 'Fixture for flow workspace tests',
  tags: [],
  rootSystemId: 'sys-1',
  systems: {
    'sys-1': {
      id: 'sys-1',
      name: 'Storefront',
      description: 'Customer facing UI',
      tags: ['ui'],
      childIds: ['sys-2'],
      isRoot: true
    },
    'sys-2': {
      id: 'sys-2',
      name: 'Payments',
      description: 'Handles charges',
      tags: ['billing'],
      childIds: [],
      isRoot: false
    }
  },
  flows: {
    'flow-1': {
      id: 'flow-1',
      name: 'Checkout happy path',
      description: 'Primary checkout sequence',
      tags: ['checkout', 'happy-path'],
      systemScopeIds: ['sys-1', 'sys-2'],
      steps: [
        {
          id: 'step-1',
          name: 'Validate cart',
          description: 'Ensure items are available',
          sourceSystemId: 'sys-1',
          targetSystemId: 'sys-2',
          tags: ['validation'],
          alternateFlowIds: []
        },
        {
          id: 'step-2',
          name: 'Process payment',
          description: 'Charge the selected payment method',
          sourceSystemId: 'sys-2',
          targetSystemId: 'sys-2',
          tags: ['billing'],
          alternateFlowIds: ['flow-2']
        }
      ]
    },
    'flow-2': {
      id: 'flow-2',
      name: 'Checkout fallback',
      description: 'Handles payment failures',
      tags: ['fallback'],
      systemScopeIds: ['sys-1', 'sys-2'],
      steps: [
        {
          id: 'step-3',
          name: 'Retry payment',
          description: 'Attempt alternate processor',
          sourceSystemId: 'sys-2',
          targetSystemId: 'sys-2',
          tags: ['billing', 'retry'],
          alternateFlowIds: []
        }
      ]
    }
  },
  dataModels: {},
  components: {},
  entryPoints: {}
};

describe('FlowWorkspace', () => {
  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    resetStore();
    consoleErrorSpy?.mockRestore();
    consoleWarnSpy?.mockRestore();
    consoleErrorSpy = null;
    consoleWarnSpy = null;
  });

  it('loads the selected flow and allows switching visualization modes', async () => {
    const user = userEvent.setup();
    apiMocks.fetchProjectDetails.mockResolvedValue(projectFixture);
    await act(async () => {
      useProjectStore.setState({
        selectedProjectId: 'proj-1',
        selectedSystemId: null,
        selectedFlowId: 'flow-1',
        selectedDataModelId: null,
        selectedComponentId: null
      });
    });

    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.project('proj-1'), projectFixture);

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <FlowWorkspace />
        </QueryClientProvider>
      );
    });

    await screen.findByText('Step 1: Validate cart');

    expect(screen.getByRole('tab', { name: 'Linear' })).toHaveAttribute('aria-selected', 'true');

    await user.click(screen.getByRole('tab', { name: 'Graph' }));
    expect(screen.getByRole('tab', { name: 'Graph' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('img', { name: /graph representation/i })).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Playback' }));
    expect(screen.getByRole('tab', { name: 'Playback' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
  });

  it('filters the rendered steps when step tag filters are toggled', async () => {
    const user = userEvent.setup();
    apiMocks.fetchProjectDetails.mockResolvedValue(projectFixture);
    await act(async () => {
      useProjectStore.setState({
        selectedProjectId: 'proj-1',
        selectedSystemId: null,
        selectedFlowId: 'flow-1',
        selectedDataModelId: null,
        selectedComponentId: null
      });
    });

    const queryClient = createTestQueryClient();
    queryClient.setQueryData(queryKeys.project('proj-1'), projectFixture);

    await act(async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <FlowWorkspace />
        </QueryClientProvider>
      );
    });

    await screen.findByText('Step 1: Validate cart');

    const billingFilter = await screen.findByRole('button', { name: 'billing' });
    await user.click(billingFilter);

    await waitFor(() => {
      expect(screen.queryByText('Validate cart')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Step 1: Process payment')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    await waitFor(() => {
      expect(screen.getByText('Step 1: Validate cart')).toBeInTheDocument();
      expect(screen.getByText('Step 2: Process payment')).toBeInTheDocument();
    });
  });
});
