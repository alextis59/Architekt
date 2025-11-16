import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Flow, Project, System } from '@architekt/domain';
import {
  createFlow as createFlowRequest,
  deleteFlow as deleteFlowRequest,
  fetchProjectDetails,
  updateFlow as updateFlowRequest,
  type FlowPayload
} from '../api/projects.js';
import { queryKeys } from '../queryKeys.js';
import {
  selectSelectedFlowId,
  selectSelectedProjectId,
  selectSelectedSystemId,
  useProjectStore
} from '../store/projectStore.js';
import TagFilterBar from './TagFilterBar.js';

type FlowView = 'linear' | 'graph' | 'playback';

type FlowMutationInput = {
  projectId: string;
  payload: FlowPayload;
  linkFrom?: { flowId: string; stepId: string } | null;
};

type UpdateFlowMutationInput = {
  projectId: string;
  flowId: string;
  payload: FlowPayload;
};

type DeleteFlowMutationInput = {
  projectId: string;
  flowId: string;
};

export type FlowDraftStep = {
  id?: string;
  name: string;
  description: string;
  sourceSystemId: string;
  targetSystemId: string;
  tags: string[];
  alternateFlowIds: string[];
};

export type FlowDraft = {
  id?: string;
  name: string;
  description: string;
  tags: string[];
  systemScopeIds: string[];
  steps: FlowDraftStep[];
};

type FlowValidationResult = {
  flow: string[];
  steps: Record<number, string[]>;
  isValid: boolean;
};

const sanitizeTagList = (tags: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const tag of tags) {
    const trimmed = tag.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    result.push(trimmed);
    seen.add(trimmed);
  }

  return result;
};

const parseTagInput = (input: string): string[] =>
  input
    .split(',')
    .map((value) => value.trim())
    .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);

const cloneDraftStep = (step: FlowDraftStep): FlowDraftStep => ({
  ...step,
  tags: [...step.tags],
  alternateFlowIds: [...step.alternateFlowIds]
});

export const createEmptyFlowDraft = (scopeIds: string[]): FlowDraft => ({
  name: '',
  description: '',
  tags: [],
  systemScopeIds: [...scopeIds],
  steps: []
});

export const createDraftFromFlow = (flow: Flow): FlowDraft => ({
  id: flow.id,
  name: flow.name,
  description: flow.description,
  tags: [...flow.tags],
  systemScopeIds: [...flow.systemScopeIds],
  steps: flow.steps.map((step) => cloneDraftStep(step))
});

export const toFlowPayload = (draft: FlowDraft, options: { includeIds?: boolean } = {}): FlowPayload => {
  const { includeIds = true } = options;

  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    tags: sanitizeTagList(draft.tags),
    systemScopeIds: Array.from(new Set(draft.systemScopeIds)),
    steps: draft.steps.map((step) => ({
      id: includeIds ? step.id : undefined,
      name: step.name.trim(),
      description: step.description.trim(),
      sourceSystemId: step.sourceSystemId,
      targetSystemId: step.targetSystemId,
      tags: sanitizeTagList(step.tags),
      alternateFlowIds: Array.from(new Set(step.alternateFlowIds))
    }))
  };
};

export const toExportableFlowPayload = (draft: FlowDraft): FlowPayload =>
  toFlowPayload(draft, { includeIds: false });

export const collectFlowTags = (project: Project): string[] => {
  const tags = new Set<string>();

  for (const flow of Object.values(project.flows)) {
    for (const tag of flow.tags) {
      if (tag.trim()) {
        tags.add(tag.trim());
      }
    }
  }

  return [...tags].sort((a, b) => a.localeCompare(b));
};

export const collectStepTagsFromDraft = (draft: FlowDraft | null): string[] => {
  if (!draft) {
    return [];
  }

  const tags = new Set<string>();

  for (const step of draft.steps) {
    for (const tag of step.tags) {
      const trimmed = tag.trim();
      if (trimmed) {
        tags.add(trimmed);
      }
    }
  }

  return [...tags].sort((a, b) => a.localeCompare(b));
};

export const validateFlowDraft = (draft: FlowDraft, project: Project): FlowValidationResult => {
  const result: FlowValidationResult = { flow: [], steps: {}, isValid: true };

  const trimmedName = draft.name.trim();
  if (!trimmedName) {
    result.flow.push('Flow name is required.');
  }

  const validScope = draft.systemScopeIds.filter((id) => Boolean(project.systems[id]));
  if (validScope.length === 0) {
    result.flow.push('Select at least one system for the flow scope.');
  }

  if (validScope.length !== draft.systemScopeIds.length) {
    result.flow.push('Some scoped systems are no longer available in the project.');
  }

  const scopeSet = new Set(validScope);
  const stepNames = new Map<string, number>();
  const flowIds = new Set(Object.keys(project.flows));
  if (draft.id) {
    flowIds.add(draft.id);
  }

  draft.steps.forEach((step, index) => {
    const errors: string[] = [];
    const name = step.name.trim();

    if (!name) {
      errors.push('Step name is required.');
    } else {
      const normalized = name.toLowerCase();
      if (stepNames.has(normalized)) {
        const duplicateIndex = stepNames.get(normalized);
        if (duplicateIndex !== undefined) {
          result.steps[duplicateIndex] = [
            ...(result.steps[duplicateIndex] ?? []),
            'Step name must be unique.'
          ];
        }
        errors.push('Step name must be unique.');
      } else {
        stepNames.set(normalized, index);
      }
    }

    if (!step.sourceSystemId) {
      errors.push('Select a source system.');
    }

    if (!step.targetSystemId) {
      errors.push('Select a target system.');
    }

    if (step.sourceSystemId && !scopeSet.has(step.sourceSystemId)) {
      errors.push('Source system must be part of the flow scope.');
    }

    if (step.targetSystemId && !scopeSet.has(step.targetSystemId)) {
      errors.push('Target system must be part of the flow scope.');
    }

    if (step.alternateFlowIds.some((id) => !flowIds.has(id))) {
      errors.push('Alternate flows must exist within the project.');
    }

    if (draft.id && step.alternateFlowIds.includes(draft.id)) {
      errors.push('A flow cannot reference itself as an alternate path.');
    }

    if (errors.length > 0) {
      result.steps[index] = errors;
    }
  });

  result.isValid =
    result.flow.length === 0 && Object.values(result.steps).every((messages) => messages.length === 0);

  return result;
};

const FlowLinearView = ({
  steps,
  systemsById,
  flowsById
}: {
  steps: FlowDraftStep[];
  systemsById: Record<string, System>;
  flowsById: Record<string, Flow>;
}) => {
  if (steps.length === 0) {
    return <p className="status">No steps match the current filters.</p>;
  }

  return (
    <div className="flow-linear-view">
      {steps.map((step, index) => {
        const source = systemsById[step.sourceSystemId];
        const target = systemsById[step.targetSystemId];
        return (
          <article key={step.id ?? `${step.name}-${index}`} className="flow-step-card">
            <header className="flow-step-header">
              <h4>
                Step {index + 1}: {step.name || 'Untitled'}
              </h4>
              {step.tags.length > 0 && (
                <span className="tag-list">
                  {step.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </span>
              )}
            </header>
            <p className="step-systems">
              <strong>From:</strong> {source?.name ?? 'Unknown'} <span aria-hidden="true">→</span>{' '}
              <strong>To:</strong> {target?.name ?? 'Unknown'}
            </p>
            {step.description && <p className="step-description">{step.description}</p>}
            {step.alternateFlowIds.length > 0 && (
              <div className="alternate-flows">
                <span className="alternate-label">Alternate flows:</span>
                <ul>
                  {step.alternateFlowIds.map((flowId) => (
                    <li key={flowId}>{flowsById[flowId]?.name ?? flowId}</li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
};
const FlowGraphView = ({ steps, flowsById }: { steps: FlowDraftStep[]; flowsById: Record<string, Flow> }) => {
  if (steps.length === 0) {
    return <p className="status">Add steps to visualize the flow graph.</p>;
  }

  const altLayers = Math.max(0, ...steps.map((step) => step.alternateFlowIds.length));
  const width = Math.max(steps.length * 180, 360);
  const height = 180 + (altLayers > 0 ? altLayers * 70 : 0);

  const nodes = steps.map((step, index) => ({
    id: step.id ?? `draft-${index}`,
    label: step.name || `Step ${index + 1}`,
    x: ((index + 1) / (steps.length + 1)) * width,
    y: 80
  }));

  const edges = nodes.slice(0, -1).map((node, index) => ({
    from: node,
    to: nodes[index + 1]
  }));

  const alternateNodes = steps.flatMap((step, index) =>
    step.alternateFlowIds.map((flowId, altIndex) => ({
      key: `${nodes[index].id}-${flowId}-${altIndex}`,
      parent: nodes[index],
      label: flowsById[flowId]?.name ?? flowId,
      x: nodes[index].x,
      y: 140 + altIndex * 70
    }))
  );

  return (
    <svg
      className="flow-graph"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Graph representation of the current flow"
    >
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb" />
        </marker>
        <marker
          id="flow-alt-arrow"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0f766e" />
        </marker>
      </defs>
      {edges.map((edge) => (
        <path
          key={`${edge.from.id}-${edge.to.id}`}
          className="flow-graph-link"
          d={`M ${edge.from.x} ${edge.from.y} C ${edge.from.x + 40} ${edge.from.y} ${edge.to.x - 40} ${edge.to.y} ${edge.to.x} ${edge.to.y}`}
          markerEnd="url(#flow-arrow)"
        />
      ))}
      {alternateNodes.map((node) => (
        <path
          key={`alt-${node.key}`}
          className="flow-graph-alt-link"
          d={`M ${node.parent.x} ${node.parent.y + 20} C ${node.parent.x} ${node.parent.y + 50} ${node.x} ${node.y - 40} ${node.x} ${node.y - 10}`}
          markerEnd="url(#flow-alt-arrow)"
        />
      ))}
      {nodes.map((node, index) => (
        <g key={node.id} className="flow-graph-node" transform={`translate(${node.x}, ${node.y})`}>
          <circle r={24} />
          <text textAnchor="middle" dominantBaseline="central">
            {index + 1}
          </text>
          <text textAnchor="middle" dominantBaseline="hanging" className="flow-graph-label" y={32}>
            {node.label}
          </text>
        </g>
      ))}
      {alternateNodes.map((node) => (
        <g key={node.key} className="flow-graph-alt-node" transform={`translate(${node.x}, ${node.y})`}>
          <rect x={-60} y={-18} width={120} height={36} rx={12} />
          <text textAnchor="middle" dominantBaseline="central">
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
};

const FlowPlaybackView = ({
  steps,
  systemsById,
  flowsById
}: {
  steps: FlowDraftStep[];
  systemsById: Record<string, System>;
  flowsById: Record<string, Flow>;
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    setCurrentIndex(0);
    setIsPlaying(false);
  }, [steps]);

  useEffect(() => {
    if (!isPlaying || steps.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1 < steps.length ? prev + 1 : prev));
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isPlaying, steps.length]);

  if (steps.length === 0) {
    return <p className="status">No steps available for playback.</p>;
  }

  const step = steps[currentIndex];
  const source = systemsById[step.sourceSystemId];
  const target = systemsById[step.targetSystemId];

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1 < steps.length ? prev + 1 : prev));
    setIsPlaying(false);
  };

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev - 1 >= 0 ? prev - 1 : prev));
    setIsPlaying(false);
  };

  return (
    <div className="flow-playback">
      <div className="playback-controls">
        <button
          type="button"
          className="secondary"
          onClick={() => setIsPlaying((prev) => !prev)}
          disabled={steps.length === 0}
        >
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="secondary" onClick={handlePrevious} disabled={currentIndex === 0}>
          Previous
        </button>
        <button
          type="button"
          className="secondary"
          onClick={handleNext}
          disabled={currentIndex === steps.length - 1}
        >
          Next
        </button>
        <span className="playback-status">
          Step {currentIndex + 1} of {steps.length}
        </span>
      </div>
      <article className="playback-card">
        <h4>{step.name || `Step ${currentIndex + 1}`}</h4>
        <p>
          <strong>From:</strong> {source?.name ?? 'Unknown'} → <strong>To:</strong> {target?.name ?? 'Unknown'}
        </p>
        {step.description && <p>{step.description}</p>}
        {step.alternateFlowIds.length > 0 && (
          <div className="alternate-flows">
            <span className="alternate-label">Alternate flows:</span>
            <ul>
              {step.alternateFlowIds.map((flowId) => (
                <li key={flowId}>{flowsById[flowId]?.name ?? flowId}</li>
              ))}
            </ul>
          </div>
        )}
      </article>
      <div className="playback-progress" aria-hidden="true">
        {steps.map((_, index) => (
          <div key={index} className={clsx('playback-progress-segment', { active: index <= currentIndex })} />
        ))}
      </div>
    </div>
  );
};

type CreateFlowOptions = {
  template?: Partial<FlowDraft>;
  linkFrom?: { flowId: string; stepId: string } | null;
};

const FlowWorkspace = () => {
  const queryClient = useQueryClient();
  const selectedProjectId = useProjectStore(selectSelectedProjectId);
  const selectedSystemId = useProjectStore(selectSelectedSystemId);
  const selectedFlowId = useProjectStore(selectSelectedFlowId);
  const selectFlow = useProjectStore((state) => state.selectFlow);

  const [flowTagFilters, setFlowTagFilters] = useState<string[]>([]);
  const [stepTagFilters, setStepTagFilters] = useState<string[]>([]);
  const [activeView, setActiveView] = useState<FlowView>('linear');
  const [isCreatingNewFlow, setIsCreatingNewFlow] = useState(false);
  const [isEditingFlow, setIsEditingFlow] = useState(false);
  const [draft, setDraft] = useState<FlowDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [alternateLinkError, setAlternateLinkError] = useState<string | null>(null);
  const [pendingAlternateLink, setPendingAlternateLink] = useState<{ flowId: string; stepId: string } | null>(null);

  const projectQuery = useQuery({
    queryKey: selectedProjectId ? queryKeys.project(selectedProjectId) : ['project', 'none'],
    queryFn: () => fetchProjectDetails(selectedProjectId ?? ''),
    enabled: Boolean(selectedProjectId)
  });

  const project = projectQuery.data ?? null;

  useEffect(() => {
    setFlowTagFilters([]);
    setStepTagFilters([]);
    setActiveView('linear');
    setIsCreatingNewFlow(false);
    setIsEditingFlow(false);
    setDraft(null);
    setFormError(null);
    setAlternateLinkError(null);
    setPendingAlternateLink(null);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!project) {
      setDraft(null);
      return;
    }

    if (isCreatingNewFlow) {
      setDraft((previous) => {
        if (!previous) {
          const defaultScope =
            (selectedSystemId && project.systems[selectedSystemId] ? [selectedSystemId] : []) || [project.rootSystemId];
          return createEmptyFlowDraft(defaultScope.filter((id) => Boolean(project.systems[id])));
        }

        const validScope = previous.systemScopeIds.filter((id) => Boolean(project.systems[id]));
        if (validScope.length !== previous.systemScopeIds.length) {
          return { ...previous, systemScopeIds: validScope };
        }

        return previous;
      });
      setIsEditingFlow(true);
      return;
    }

    if (selectedFlowId && project.flows[selectedFlowId]) {
      setDraft(createDraftFromFlow(project.flows[selectedFlowId]));
      setIsEditingFlow(false);
    } else if (!selectedFlowId) {
      setDraft(null);
      setIsEditingFlow(false);
    }
  }, [project, selectedFlowId, isCreatingNewFlow, selectedSystemId]);

  useEffect(() => {
    if (!isCreatingNewFlow) {
      setPendingAlternateLink(null);
    }
  }, [isCreatingNewFlow]);

  const systems = useMemo(() => (project ? Object.values(project.systems) : []), [project]);
  const systemsById = project?.systems ?? {};
  const flows = useMemo(
    () => (project ? Object.values(project.flows).sort((a, b) => a.name.localeCompare(b.name)) : []),
    [project]
  );
  const flowsById = useMemo(() => {
    const map: Record<string, Flow> = {};
    for (const flow of flows) {
      map[flow.id] = flow;
    }
    return map;
  }, [flows]);

  const availableFlowTags = useMemo(() => (project ? collectFlowTags(project) : []), [project]);
  const availableStepTags = useMemo(() => collectStepTagsFromDraft(draft), [draft]);

  const filteredFlows = useMemo(() => {
    if (!flowTagFilters.length) {
      return flows;
    }

    const tagSet = new Set(flowTagFilters);
    return flows.filter((flow) => [...tagSet].every((tag) => flow.tags.includes(tag)));
  }, [flows, flowTagFilters]);

  const displayedSteps = useMemo(() => {
    if (!draft) {
      return [];
    }

    if (!stepTagFilters.length) {
      return draft.steps;
    }

    const tagSet = new Set(stepTagFilters);
    return draft.steps.filter((step) => step.tags.some((tag) => tagSet.has(tag)));
  }, [draft, stepTagFilters]);

  const validation = useMemo(
    () => (draft && project ? validateFlowDraft(draft, project) : { flow: [], steps: {}, isValid: false }),
    [draft, project]
  );

  const createFlowMutation = useMutation({
    mutationFn: ({ projectId, payload }: FlowMutationInput) => createFlowRequest(projectId, payload),
    onMutate: () => {
      setFormError(null);
      setAlternateLinkError(null);
    },
    onSuccess: async (flow, variables) => {
      const { projectId, linkFrom } = variables;
      queryClient.setQueryData<Project | undefined>(queryKeys.project(projectId), (previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          flows: {
            ...previous.flows,
            [flow.id]: flow
          }
        };
      });
      setIsCreatingNewFlow(false);
      setIsEditingFlow(false);
      selectFlow(flow.id);
      setDraft(createDraftFromFlow(flow));
      setStepTagFilters([]);
      setPendingAlternateLink(null);

      if (linkFrom && linkFrom.flowId && linkFrom.stepId) {
        try {
          await linkAlternateFlow({
            projectId,
            parentFlowId: linkFrom.flowId,
            stepId: linkFrom.stepId,
            alternateFlowId: flow.id
          });
        } catch (error) {
          setAlternateLinkError(
            error instanceof Error ? error.message : 'Unable to link the alternate flow automatically.'
          );
        }
      }

      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    },
    onError: (error, variables) => {
      setFormError(error instanceof Error ? error.message : 'Unable to save flow');
      if (variables?.linkFrom) {
        setPendingAlternateLink(variables.linkFrom);
      }
    }
  });

  const updateFlowMutation = useMutation({
    mutationFn: ({ projectId, flowId, payload }: UpdateFlowMutationInput) =>
      updateFlowRequest(projectId, flowId, payload),
    onMutate: () => {
      setFormError(null);
      setAlternateLinkError(null);
    },
    onSuccess: (flow, variables) => {
      queryClient.setQueryData<Project | undefined>(queryKeys.project(variables.projectId), (previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          flows: {
            ...previous.flows,
            [flow.id]: flow
          }
        };
      });
      setDraft(createDraftFromFlow(flow));
      setIsEditingFlow(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Unable to save flow');
    }
  });

  const deleteFlowMutation = useMutation({
    mutationFn: ({ projectId, flowId }: DeleteFlowMutationInput) => deleteFlowRequest(projectId, flowId),
    onMutate: () => {
      setFormError(null);
      setAlternateLinkError(null);
    },
    onSuccess: (_, variables) => {
      queryClient.setQueryData<Project | undefined>(queryKeys.project(variables.projectId), (previous) => {
        if (!previous) {
          return previous;
        }

        const nextFlows = { ...previous.flows };
        delete nextFlows[variables.flowId];

        return {
          ...previous,
          flows: nextFlows
        };
      });

      const currentFlowId = useProjectStore.getState().selectedFlowId;
      if (currentFlowId === variables.flowId) {
        selectFlow(null);
      }

      setDraft(null);
      setIsCreatingNewFlow(false);
      setPendingAlternateLink(null);
      setIsEditingFlow(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : 'Unable to delete flow');
    }
  });
  const linkAlternateFlow = async ({
    projectId,
    parentFlowId,
    stepId,
    alternateFlowId
  }: {
    projectId: string;
    parentFlowId: string;
    stepId: string;
    alternateFlowId: string;
  }) => {
    const cached = queryClient.getQueryData<Project | undefined>(queryKeys.project(projectId));
    const projectData = cached ?? (await fetchProjectDetails(projectId));
    const parentFlow = projectData?.flows[parentFlowId];

    if (!projectData || !parentFlow) {
      throw new Error('Parent flow not found for alternate linking.');
    }

    const updatedSteps = parentFlow.steps.map((step) =>
      step.id === stepId
        ? {
            ...step,
            alternateFlowIds: step.alternateFlowIds.includes(alternateFlowId)
              ? step.alternateFlowIds
              : [...step.alternateFlowIds, alternateFlowId]
          }
        : step
    );

    const payload: FlowPayload = {
      name: parentFlow.name,
      description: parentFlow.description,
      tags: parentFlow.tags,
      systemScopeIds: parentFlow.systemScopeIds,
      steps: updatedSteps.map((step) => ({
        id: step.id,
        name: step.name,
        description: step.description,
        sourceSystemId: step.sourceSystemId,
        targetSystemId: step.targetSystemId,
        tags: step.tags,
        alternateFlowIds: step.alternateFlowIds
      }))
    };

    const updatedFlow = await updateFlowRequest(projectId, parentFlowId, payload);
    queryClient.setQueryData<Project | undefined>(queryKeys.project(projectId), (previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        flows: {
          ...previous.flows,
          [updatedFlow.id]: updatedFlow
        }
      };
    });
  };

  const startCreateFlow = (options: CreateFlowOptions = {}) => {
    if (!project) {
      return;
    }

    const template = options.template ?? {};

    const determineScope = (): string[] => {
      if (template.systemScopeIds?.length) {
        const valid = template.systemScopeIds.filter((id) => Boolean(project.systems[id]));
        if (valid.length > 0) {
          return Array.from(new Set(valid));
        }
      }

      if (selectedSystemId && project.systems[selectedSystemId]) {
        return [selectedSystemId];
      }

      return project.rootSystemId ? [project.rootSystemId] : [];
    };

    const scope = determineScope();

    const draftTemplate: FlowDraft = {
      ...createEmptyFlowDraft(scope),
      name: template.name ?? '',
      description: template.description ?? '',
      tags: template.tags ? sanitizeTagList(template.tags) : [],
      systemScopeIds: scope,
      steps: template.steps
        ? template.steps.map((step) => ({
            id: step.id,
            name: step.name ?? '',
            description: step.description ?? '',
            sourceSystemId: step.sourceSystemId ?? scope[0] ?? '',
            targetSystemId: step.targetSystemId ?? scope[0] ?? '',
            tags: step.tags ? [...step.tags] : [],
            alternateFlowIds: step.alternateFlowIds ? [...step.alternateFlowIds] : []
          }))
        : []
    };

    setPendingAlternateLink(options.linkFrom ?? null);
    setFlowTagFilters([]);
    setIsCreatingNewFlow(true);
    selectFlow(null);
    setDraft(draftTemplate);
    setActiveView('linear');
    setStepTagFilters([]);
    setFormError(null);
    setAlternateLinkError(null);
    setIsEditingFlow(true);
  };

  const handleToggleFlowTag = (tag: string) => {
    setFlowTagFilters((previous) =>
      previous.includes(tag) ? previous.filter((entry) => entry !== tag) : [...previous, tag]
    );
  };

  const handleToggleStepTag = (tag: string) => {
    setStepTagFilters((previous) =>
      previous.includes(tag) ? previous.filter((entry) => entry !== tag) : [...previous, tag]
    );
  };

  const handleSelectFlow = (flowId: string) => {
    setIsCreatingNewFlow(false);
    setPendingAlternateLink(null);
    setIsEditingFlow(false);
    selectFlow(flowId);
  };

  const handleScopeToggle = (systemId: string) => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }

      const exists = previous.systemScopeIds.includes(systemId);
      const nextScope = exists
        ? previous.systemScopeIds.filter((id) => id !== systemId)
        : [...previous.systemScopeIds, systemId];

      return {
        ...previous,
        systemScopeIds: nextScope
      };
    });
  };

  const updateDraftField = <K extends keyof FlowDraft>(field: K, value: FlowDraft[K]) => {
    setDraft((previous) => (previous ? { ...previous, [field]: value } : previous));
  };

  const updateStepAt = (index: number, updater: (step: FlowDraftStep) => FlowDraftStep) => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }

      const steps = previous.steps.map((step, idx) => (idx === index ? updater(step) : step));
      return { ...previous, steps };
    });
  };

  const handleStepTagChange = (index: number, value: string) => {
    const tags = parseTagInput(value);
    updateStepAt(index, (step) => ({ ...step, tags }));
  };

  const handleStepAlternateChange = (index: number, values: string[]) => {
    updateStepAt(index, (step) => ({ ...step, alternateFlowIds: values }));
  };

  const handleAddStep = () => {
    if (!draft) {
      return;
    }

    const defaultSystem = draft.systemScopeIds[0] ?? '';
    const newStep: FlowDraftStep = {
      name: '',
      description: '',
      sourceSystemId: defaultSystem,
      targetSystemId: defaultSystem,
      tags: [],
      alternateFlowIds: []
    };

    setDraft((previous) => (previous ? { ...previous, steps: [...previous.steps, newStep] } : previous));
  };

  const handleRemoveStep = (index: number) => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }

      const steps = previous.steps.filter((_, idx) => idx !== index);
      return { ...previous, steps };
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!project || !draft) {
      return;
    }

    const payload = toFlowPayload(draft);

    if (isCreatingNewFlow || !draft.id) {
      createFlowMutation.mutate({
        projectId: project.id,
        payload,
        linkFrom: pendingAlternateLink
      });
    } else {
      updateFlowMutation.mutate({ projectId: project.id, flowId: draft.id, payload });
    }
  };

  const handleDeleteFlow = () => {
    if (!project || !draft?.id) {
      return;
    }

    deleteFlowMutation.mutate({ projectId: project.id, flowId: draft.id });
  };

  const handleExport = () => {
    if (!draft && (!selectedFlowId || !project)) {
      return;
    }

    const currentDraft = draft ?? (selectedFlowId ? createDraftFromFlow(project.flows[selectedFlowId]) : null);
    if (!currentDraft) {
      return;
    }

    const payload = toExportableFlowPayload(currentDraft);
    const fileName = `${currentDraft.name.trim() || 'flow'}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    if (!draft && (!selectedFlowId || !project)) {
      return;
    }

    const currentDraft = draft ?? (selectedFlowId ? createDraftFromFlow(project.flows[selectedFlowId]) : null);
    if (!currentDraft) {
      return;
    }

    const payload = JSON.stringify(toExportableFlowPayload(currentDraft), null, 2);

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = payload;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  const handleCreateAlternateFlow = (index: number) => {
    if (!draft || !project || !draft.id) {
      return;
    }

    const step = draft.steps[index];
    if (!step || !step.id) {
      return;
    }

    const template: Partial<FlowDraft> = {
      name: `${draft.name} • ${step.name || `Step ${index + 1}`} alt`,
      tags: [...draft.tags],
      systemScopeIds: [...draft.systemScopeIds],
      steps: [
        {
          id: undefined,
          name: step.name ? `${step.name} alternative` : 'Alternate step',
          description: step.description
            ? `Derived from ${step.name || `step ${index + 1}`}: ${step.description}`
            : `Alternate path derived from ${step.name || `step ${index + 1}`}`,
          sourceSystemId: step.sourceSystemId,
          targetSystemId: step.targetSystemId,
          tags: [],
          alternateFlowIds: []
        }
      ]
    };

    startCreateFlow({ template, linkFrom: { flowId: draft.id, stepId: step.id } });
  };

  const handleStartEditing = () => {
    if (!project || !draft?.id) {
      return;
    }

    const latestFlow = project.flows[draft.id];
    if (latestFlow) {
      setDraft(createDraftFromFlow(latestFlow));
    }

    setIsCreatingNewFlow(false);
    setFormError(null);
    setAlternateLinkError(null);
    setIsEditingFlow(true);
  };

  const handleCancelEditing = () => {
    if (createFlowMutation.isPending || updateFlowMutation.isPending || deleteFlowMutation.isPending) {
      return;
    }

    if (isCreatingNewFlow) {
      setIsCreatingNewFlow(false);
      setDraft(null);
    } else if (selectedFlowId && project?.flows[selectedFlowId]) {
      setDraft(createDraftFromFlow(project.flows[selectedFlowId]));
    }

    setPendingAlternateLink(null);
    setFormError(null);
    setAlternateLinkError(null);
    setIsEditingFlow(false);
  };

  const scopeOptions = useMemo(
    () => [...systems].sort((a, b) => a.name.localeCompare(b.name)),
    [systems]
  );

  const scopedSystems = draft
    ? draft.systemScopeIds
        .map((id) => systemsById[id])
        .filter((system): system is System => Boolean(system))
    : [];

  const viewTabs: { id: FlowView; label: string }[] = [
    { id: 'linear', label: 'Linear' },
    { id: 'graph', label: 'Graph' },
    { id: 'playback', label: 'Playback' }
  ];

  const renderView = () => {
    if (!draft) {
      return <p className="status">Select a flow or start a new one to visualize steps.</p>;
    }

    switch (activeView) {
      case 'graph':
        return <FlowGraphView steps={displayedSteps} flowsById={flowsById} />;
      case 'playback':
        return <FlowPlaybackView steps={displayedSteps} systemsById={systemsById} flowsById={flowsById} />;
      default:
        return <FlowLinearView steps={displayedSteps} systemsById={systemsById} flowsById={flowsById} />;
    }
  };

  const isMutating =
    createFlowMutation.isPending ||
    updateFlowMutation.isPending;
  const builderTitle = isCreatingNewFlow ? 'Create new flow' : 'Edit flow';
  const builderDescription = isCreatingNewFlow
    ? 'Define the flow details, scope, tags, and steps.'
    : 'Update flow details, scope, tags, and steps.';
  const pendingAlternateFlowName = pendingAlternateLink?.flowId
    ? flowsById[pendingAlternateLink.flowId]?.name ?? pendingAlternateLink.flowId
    : null;

  return (
    <section className="workspace flow-workspace panel">
      <header className="panel-header">
        <h2>Flow designer</h2>
        <p className="panel-subtitle">
          Model scenarios, branch alternate paths, and preview sequences across your architecture.
        </p>
      </header>
      {!selectedProjectId && (
        <div className="panel-content">
          <p className="status">Select a project to define flows.</p>
        </div>
      )}
      {selectedProjectId && projectQuery.isLoading && (
        <div className="panel-content">
          <p className="status">Loading flow data…</p>
        </div>
      )}
      {selectedProjectId && projectQuery.isError && (
        <div className="panel-content">
          <p className="status error" role="alert">
            Failed to load flows: {projectQuery.error instanceof Error ? projectQuery.error.message : 'Unknown error'}
          </p>
        </div>
      )}
      {selectedProjectId && project && (
        <div className="flow-layout">
          <aside className="panel flow-panel flow-sidebar">
            <h3 className="flow-sidebar-heading">Flows</h3>
            <TagFilterBar
              availableTags={availableFlowTags}
              selectedTags={flowTagFilters}
              onToggleTag={handleToggleFlowTag}
              onClear={() => setFlowTagFilters([])}
              label="Flow tags"
              ariaLabel="Flow tag filters"
              emptyLabel="No flows have tags yet."
            />
            {filteredFlows.length === 0 ? (
              <p className="status">
                {flows.length === 0
                  ? 'No flows yet. Use the button below to create the first flow.'
                  : 'No flows match the selected filters.'}
              </p>
            ) : (
              <ul className="flow-list">
                {filteredFlows.map((flow) => (
                  <li key={flow.id}>
                    <button
                      type="button"
                      className={clsx('flow-button', {
                        active: !isCreatingNewFlow && selectedFlowId === flow.id
                      })}
                      onClick={() => handleSelectFlow(flow.id)}
                    >
                      <span className="flow-name">{flow.name}</span>
                      {flow.tags.length > 0 && (
                        <span className="tag-list">
                          {flow.tags.map((tag) => (
                            <span key={tag} className="tag">
                              {tag}
                            </span>
                          ))}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flow-sidebar-actions">
              <p className="status">Kickstart alternate journeys tailored to your systems.</p>
              <button type="button" className="primary" onClick={() => startCreateFlow()}>
                New flow
              </button>
            </div>
          </aside>
          <div className="panel flow-panel flow-editor">
            <TagFilterBar
              availableTags={availableStepTags}
              selectedTags={stepTagFilters}
              onToggleTag={handleToggleStepTag}
              onClear={() => setStepTagFilters([])}
              label="Step tags"
              ariaLabel="Step tag filters"
              emptyLabel="No step tags available yet."
            />
            <div className="flow-view-tabs" role="tablist" aria-label="Flow visualization modes">
              {viewTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeView === tab.id}
                  className={clsx('flow-view-tab', { active: activeView === tab.id })}
                  onClick={() => setActiveView(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flow-visualization" role="region" aria-live="polite">
              {renderView()}
            </div>
            <div className="flow-detail">
              {draft ? (
                <>
                  <div className="flow-summary">
                    <header className="flow-summary-header">
                      <div className="flow-summary-heading">
                        <h3>{draft.name || 'Untitled flow'}</h3>
                        {draft.description && (
                          <p className="flow-summary-description">{draft.description}</p>
                        )}
                      </div>
                      {draft.id && (
                        <div className="flow-summary-actions">
                          <button type="button" className="secondary" onClick={handleExport}>
                            Export JSON
                          </button>
                          <button type="button" className="secondary" onClick={() => void handleCopy()}>
                            Copy JSON
                          </button>
                          <button
                            type="button"
                            className="danger"
                            onClick={handleDeleteFlow}
                            disabled={deleteFlowMutation.isPending}
                          >
                            {deleteFlowMutation.isPending ? 'Deleting…' : 'Delete flow'}
                          </button>
                          {!isEditingFlow && (
                            <button
                              type="button"
                              className="primary"
                              onClick={handleStartEditing}
                              disabled={
                                createFlowMutation.isPending ||
                                updateFlowMutation.isPending ||
                                deleteFlowMutation.isPending
                              }
                            >
                              Edit flow
                            </button>
                          )}
                        </div>
                      )}
                    </header>
                    <dl className="flow-summary-stats">
                      <div>
                        <dt>Steps</dt>
                        <dd>{draft.steps.length}</dd>
                      </div>
                      <div>
                        <dt>Tags</dt>
                        <dd>{draft.tags.length}</dd>
                      </div>
                    </dl>
                    <div className="flow-summary-sections">
                      <section className="flow-summary-section">
                        <h4>Flow tags</h4>
                        {draft.tags.length > 0 ? (
                          <div className="tag-list">
                            {draft.tags.map((tag) => (
                              <span key={tag} className="tag">
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="status">No tags assigned yet.</p>
                        )}
                      </section>
                      <section className="flow-summary-section">
                        <h4>Systems in scope</h4>
                        {scopedSystems.length > 0 ? (
                          <ul className="flow-summary-scope">
                            {scopedSystems.map((system) => (
                              <li key={system.id}>{system.name}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="status">No systems selected.</p>
                        )}
                      </section>
                    </div>
                    {formError && !isEditingFlow && (
                      <p className="status error" role="alert">
                        {formError}
                      </p>
                    )}
                  </div>
                  {isEditingFlow && (
                    <div className="flow-builder">
                      <header className="flow-builder-header">
                        <div>
                          <h4>{builderTitle}</h4>
                          <p className="flow-builder-description">{builderDescription}</p>
                        </div>
                        {pendingAlternateFlowName && (
                          <p className="status flow-builder-hint">
                            Once saved, this flow will link as an alternate from {pendingAlternateFlowName}.
                          </p>
                        )}
                      </header>
                      <form className="flow-form" onSubmit={handleSubmit}>
                <div className="flow-form-grid">
                  <label className="field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={draft?.name ?? ''}
                      onChange={(event) => updateDraftField('name', event.target.value)}
                      placeholder="E.g. Checkout happy path"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Tags</span>
                    <input
                      type="text"
                      value={draft ? draft.tags.join(', ') : ''}
                      onChange={(event) => updateDraftField('tags', parseTagInput(event.target.value))}
                      placeholder="Comma separated tags"
                    />
                  </label>
                </div>
                <label className="field">
                  <span>Description</span>
                  <textarea
                    value={draft?.description ?? ''}
                    onChange={(event) => updateDraftField('description', event.target.value)}
                    rows={3}
                    placeholder="Provide context for collaborators"
                  />
                </label>
                <div className="scope-selector">
                  <span className="scope-label">Systems in scope</span>
                  <div className="scope-grid">
                    {scopeOptions.map((system) => (
                      <label key={system.id} className="scope-option">
                        <input
                          type="checkbox"
                          checked={Boolean(draft?.systemScopeIds.includes(system.id))}
                          onChange={() => handleScopeToggle(system.id)}
                        />
                        <span>{system.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {validation.flow.length > 0 && (
                  <ul className="field-errors" role="alert">
                    {validation.flow.map((message) => (
                      <li key={message}>{message}</li>
                    ))}
                  </ul>
                )}
                <div className="steps-editor">
                  <div className="steps-header">
                    <h3>Steps</h3>
                    <button type="button" className="secondary" onClick={handleAddStep}>
                      Add step
                    </button>
                  </div>
                  {draft?.steps.length === 0 && <p className="status">Add steps to define the flow journey.</p>}
                  {draft?.steps.map((step, index) => (
                    <article key={step.id ?? index} className="step-editor">
                      <header className="step-editor-header">
                        <h4>Step {index + 1}</h4>
                        <div className="step-actions">
                          <button
                            type="button"
                            className="link-button"
                            onClick={() => handleCreateAlternateFlow(index)}
                            disabled={!step.id || !draft?.id}
                          >
                            Create alternate flow
                          </button>
                          <button type="button" className="link-button" onClick={() => handleRemoveStep(index)}>
                            Remove step
                          </button>
                        </div>
                      </header>
                      <div className="step-fields">
                        <label className="field">
                          <span>Name</span>
                          <input
                            type="text"
                            value={step.name}
                            onChange={(event) =>
                              updateStepAt(index, (current) => ({ ...current, name: event.target.value }))
                            }
                            placeholder="E.g. Validate cart"
                          />
                        </label>
                        <label className="field">
                          <span>Description</span>
                          <textarea
                            value={step.description}
                            onChange={(event) =>
                              updateStepAt(index, (current) => ({ ...current, description: event.target.value }))
                            }
                            rows={2}
                            placeholder="Optional details"
                          />
                        </label>
                        <div className="step-system-row">
                          <label className="field">
                            <span>Source system</span>
                            <select
                              value={step.sourceSystemId}
                              onChange={(event) =>
                                updateStepAt(index, (current) => ({ ...current, sourceSystemId: event.target.value }))
                              }
                            >
                              <option value="">Select system</option>
                              {scopedSystems.map((system) => (
                                <option key={system.id} value={system.id}>
                                  {system.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field">
                            <span>Target system</span>
                            <select
                              value={step.targetSystemId}
                              onChange={(event) =>
                                updateStepAt(index, (current) => ({ ...current, targetSystemId: event.target.value }))
                              }
                            >
                              <option value="">Select system</option>
                              {scopedSystems.map((system) => (
                                <option key={system.id} value={system.id}>
                                  {system.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <label className="field">
                          <span>Tags</span>
                          <input
                            type="text"
                            value={step.tags.join(', ')}
                            onChange={(event) => handleStepTagChange(index, event.target.value)}
                            placeholder="Comma separated tags"
                          />
                        </label>
                        <label className="field">
                          <span>Alternate flows</span>
                          <select
                            multiple
                            value={step.alternateFlowIds}
                            onChange={(event) =>
                              handleStepAlternateChange(
                                index,
                                Array.from(event.target.selectedOptions).map((option) => option.value)
                              )
                            }
                          >
                            {flows
                              .filter((flow) => flow.id !== draft?.id)
                              .map((flow) => (
                                <option key={flow.id} value={flow.id}>
                                  {flow.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        {validation.steps[index]?.length > 0 && (
                          <ul className="field-errors" role="alert">
                            {validation.steps[index].map((message) => (
                              <li key={message}>{message}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                <div className="flow-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleCancelEditing}
                    disabled={isMutating || deleteFlowMutation.isPending}
                  >
                    Cancel
                  </button>
                  <button className="primary" type="submit" disabled={!draft || !validation.isValid || isMutating}>
                    {isCreatingNewFlow || !draft?.id
                      ? createFlowMutation.isPending
                        ? 'Creating…'
                        : 'Create flow'
                      : updateFlowMutation.isPending
                        ? 'Saving…'
                        : 'Save flow'}
                  </button>
                </div>
                {formError && (
                  <p className="status error" role="alert">
                    {formError}
                  </p>
                )}
                {alternateLinkError && (
                  <p className="status error" role="alert">
                    {alternateLinkError}
                  </p>
                )}
              </form>
            </div>
          )}
        </>
      ) : (
        <p className="status">Select a flow to review details or create a new one.</p>
      )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export { FlowWorkspace };

export default FlowWorkspace;
