import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import type { Project } from '@architekt/domain';
import {
  createComponent,
  deleteComponent,
  fetchProjectDetails,
  updateComponent,
  type ComponentPayload
} from '../api/projects.js';
import { queryKeys } from '../queryKeys.js';
import {
  selectSelectedComponentId,
  selectSelectedProjectId,
  useProjectStore
} from '../store/projectStore.js';
import {
  ComponentDraft,
  EntryPointDraft,
  createComponentDraft,
  createEmptyEntryPointDraft,
  toComponentPayload,
  toExportableComponentPayload
} from './ComponentDesigner.helpers.js';
import {
  addAttributeToList,
  AttributeDraft,
  cloneAttributeDraft,
  createEmptyAttributeDraft,
  collectAttributeIds,
  findAttributeInList,
  generateLocalId,
  removeAttributeFromList,
  retainExpandedAttributeIds,
  updateAttributeInList
} from './DataModelDesigner.helpers.js';
import { AttributeItem, AttributeModal } from './DataModelDesigner.js';
import {
  ENTRY_POINT_METHOD_OPTIONS,
  ENTRY_POINT_PROTOCOL_OPTIONS,
  ENTRY_POINT_TYPE_OPTIONS,
  ENTRY_POINT_TYPE_CONFIG,
  type EntryPointFormConfig
} from './ComponentDesigner.constants.js';

const cloneEntryPointDraft = (entryPoint: EntryPointDraft): EntryPointDraft => ({
  ...entryPoint,
  tags: [...entryPoint.tags],
  requestModelIds: [...entryPoint.requestModelIds],
  responseModelIds: [...entryPoint.responseModelIds],
  requestAttributes: entryPoint.requestAttributes.map(cloneAttributeDraft),
  responseAttributes: entryPoint.responseAttributes.map(cloneAttributeDraft)
});

const cloneDraft = (draft: ComponentDraft | null): ComponentDraft | null => {
  if (!draft) {
    return draft;
  }

  return {
    ...draft,
    entryPoints: draft.entryPoints.map(cloneEntryPointDraft)
  };
};

const ENTRY_POINT_FORM_DEFAULTS: EntryPointFormConfig = {
  allowedProtocols: ENTRY_POINT_PROTOCOL_OPTIONS.map((option) => option.value),
  allowedMethods: ENTRY_POINT_METHOD_OPTIONS.map((option) => option.value),
  showProtocol: true,
  showMethod: true,
  showPath: true,
  showFunctionName: false
};

const ENTRY_POINT_ATTRIBUTE_FLAG_VISIBILITY = {
  required: true,
  unique: false,
  readOnly: false,
  encrypted: false,
  private: false
} as const;

const filterEntryPointOptions = (
  options: typeof ENTRY_POINT_PROTOCOL_OPTIONS,
  allowedValues: string[]
) => {
  const allowed = new Set(allowedValues);
  return options.filter((option) => allowed.has(option.value));
};

const getEntryPointFormConfig = (type: string): EntryPointFormConfig => {
  const overrides = ENTRY_POINT_TYPE_CONFIG[type] ?? {};
  return {
    ...ENTRY_POINT_FORM_DEFAULTS,
    ...overrides,
    allowedProtocols: overrides.allowedProtocols ?? ENTRY_POINT_FORM_DEFAULTS.allowedProtocols,
    allowedMethods: overrides.allowedMethods ?? ENTRY_POINT_FORM_DEFAULTS.allowedMethods
  };
};

const applyEntryPointTypeRules = (entryPoint: EntryPointDraft): EntryPointDraft => {
  const config = getEntryPointFormConfig(entryPoint.type);

  return {
    ...entryPoint,
    functionName: config.showFunctionName ? entryPoint.functionName : '',
    protocol:
      config.showProtocol && config.allowedProtocols.includes(entryPoint.protocol)
        ? entryPoint.protocol
        : '',
    method:
      config.showMethod && config.allowedMethods.includes(entryPoint.method)
        ? entryPoint.method
        : '',
    path: config.showPath ? entryPoint.path : ''
  };
};

const parseTagInput = (input: string): string[] =>
  input
    .split(',')
    .map((value) => value.trim())
    .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);

const ComponentDesigner = () => {
  const queryClient = useQueryClient();
  const selectedProjectId = useProjectStore(selectSelectedProjectId);
  const selectedComponentId = useProjectStore(selectSelectedComponentId);
  const selectComponent = useProjectStore((state) => state.selectComponent);

  const [draft, setDraft] = useState<ComponentDraft | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [creationForm, setCreationForm] = useState({ name: '', description: '' });
  const [activeModal, setActiveModal] = useState<'create' | 'edit' | null>(null);
  const [entryPointModalMode, setEntryPointModalMode] = useState<'create' | 'edit' | null>(null);
  const [entryPointModalDraft, setEntryPointModalDraft] = useState<EntryPointDraft | null>(null);
  const [entryPointFormError, setEntryPointFormError] = useState<string | null>(null);
  const [expandedEntryPointIds, setExpandedEntryPointIds] = useState<Set<string>>(() => new Set());
  const [draggingEntryPointId, setDraggingEntryPointId] = useState<string | null>(null);
  const [dragOverEntryPointId, setDragOverEntryPointId] = useState<string | null>(null);

  const createNameFieldRef = useRef<HTMLInputElement | null>(null);
  const editNameFieldRef = useRef<HTMLInputElement | null>(null);
  const entryPointNameFieldRef = useRef<HTMLInputElement | null>(null);
  const modalActivatorRef = useRef<HTMLElement | null>(null);
  const previousDraftStateRef = useRef<{ draft: ComponentDraft | null; isDirty: boolean } | null>(null);
  const draggingEntryPointIdRef = useRef<string | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragOverEntryPointIdRef = useRef<string | null>(null);

  const projectQuery = useQuery({
    queryKey: selectedProjectId ? queryKeys.project(selectedProjectId) : ['project', 'none'],
    queryFn: () => fetchProjectDetails(selectedProjectId ?? ''),
    enabled: Boolean(selectedProjectId)
  });

  const project = projectQuery.data;

  const components = useMemo(() => {
    if (!project) {
      return [];
    }

    return Object.values(project.components).sort((a, b) => a.name.localeCompare(b.name));
  }, [project]);

  const selectedComponent =
    selectedComponentId && project ? project.components[selectedComponentId] ?? null : null;

  const dataModelOptions = useMemo(() => {
    if (!project) {
      return [];
    }

    return Object.values(project.dataModels).sort((a, b) => a.name.localeCompare(b.name));
  }, [project]);

  const dataModelLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    dataModelOptions.forEach((model) => lookup.set(model.id, model.name));
    return lookup;
  }, [dataModelOptions]);

  useEffect(() => {
    if (!project || components.length === 0) {
      if (selectedComponentId !== null) {
        selectComponent(null);
      }
      return;
    }

    if (!selectedComponentId || !project.components[selectedComponentId]) {
      selectComponent(components[0]?.id ?? null);
    }
  }, [components, project, selectComponent, selectedComponentId]);

  const resetDraftToSelected = useCallback(() => {
    if (!project || !selectedComponent) {
      setDraft(null);
      setIsDirty(false);
      setExpandedEntryPointIds(new Set());
      return;
    }

    setDraft(createComponentDraft(selectedComponent, project.entryPoints));
    setIsDirty(false);
    setExpandedEntryPointIds(new Set());
    setEntryPointModalMode(null);
    setEntryPointModalDraft(null);
    setEntryPointFormError(null);
  }, [project, selectedComponent]);

  useEffect(() => {
    resetDraftToSelected();
  }, [resetDraftToSelected]);

  const focusModalActivator = useCallback(() => {
    if (modalActivatorRef.current) {
      modalActivatorRef.current.focus();
      modalActivatorRef.current = null;
    }
  }, []);

  const createComponentMutation = useMutation({
    mutationFn: ({
      projectId,
      payload
    }: {
      projectId: string;
      payload: ComponentPayload;
    }) => createComponent(projectId, payload),
    onSuccess: (component, variables) => {
      queryClient.setQueryData<Project | undefined>(queryKeys.project(variables.projectId), (previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          components: {
            ...previous.components,
            [component.id]: component
          }
        };
      });
      selectComponent(component.id);
      setCreationForm({ name: '', description: '' });
      setActiveModal(null);
      focusModalActivator();
      previousDraftStateRef.current = null;
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
    }
  });

  const updateComponentMutation = useMutation({
    mutationFn: ({
      projectId,
      componentId,
      payload
    }: {
      projectId: string;
      componentId: string;
      payload: ComponentPayload;
    }) => updateComponent(projectId, componentId, payload),
    onSuccess: (component, variables) => {
      queryClient.setQueryData<Project | undefined>(queryKeys.project(variables.projectId), (previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          components: {
            ...previous.components,
            [component.id]: component
          }
        };
      });
      setIsDirty(false);
      setActiveModal(null);
      focusModalActivator();
      previousDraftStateRef.current = null;
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
    }
  });

  const deleteComponentMutation = useMutation({
    mutationFn: ({
      projectId,
      componentId
    }: {
      projectId: string;
      componentId: string;
    }) => deleteComponent(projectId, componentId),
    onSuccess: (_, variables) => {
      let nextSelectedId: string | null = null;
      queryClient.setQueryData<Project | undefined>(queryKeys.project(variables.projectId), (previous) => {
        if (!previous) {
          return previous;
        }

        const nextComponents = { ...previous.components };
        delete nextComponents[variables.componentId];
        const sorted = Object.values(nextComponents).sort((a, b) => a.name.localeCompare(b.name));
        nextSelectedId = sorted[0]?.id ?? null;

        return {
          ...previous,
          components: nextComponents
        };
      });
      selectComponent(nextSelectedId);
      setDraft(null);
      setIsDirty(false);
      setActiveModal(null);
      focusModalActivator();
      previousDraftStateRef.current = null;
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
    }
  });

  const saveDraft = useCallback(
    (draftToSave: ComponentDraft) => {
      if (!selectedProjectId || !draftToSave.id) {
        return;
      }

      updateComponentMutation.mutate({
        projectId: selectedProjectId,
        componentId: draftToSave.id,
        payload: toComponentPayload(draftToSave)
      });
    },
    [selectedProjectId, updateComponentMutation]
  );

  const handleCreateComponent = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProjectId) {
      return;
    }

    const trimmedName = creationForm.name.trim();
    if (!trimmedName) {
      return;
    }

    createComponentMutation.mutate({
      projectId: selectedProjectId,
      payload: {
        name: trimmedName,
        description: creationForm.description,
        entryPoints: []
      }
    });
  };

  const handleComponentFieldChange = (field: 'name' | 'description', value: string) => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }

      setIsDirty(true);
      return {
        ...previous,
        [field]: value
      };
    });
  };

  const openCreateEntryPointModal = () => {
    setEntryPointModalDraft(applyEntryPointTypeRules(createEmptyEntryPointDraft()));
    setEntryPointModalMode('create');
    setEntryPointFormError(null);
  };

  const openEditEntryPointModal = (entryPointId: string) => {
    if (!draft) {
      return;
    }

    const entryPoint = draft.entryPoints.find((item) => item.localId === entryPointId);
    if (!entryPoint) {
      return;
    }

    setExpandedEntryPointIds((previous) => new Set(previous).add(entryPointId));
    setEntryPointModalDraft(applyEntryPointTypeRules(cloneEntryPointDraft(entryPoint)));
    setEntryPointModalMode('edit');
    setEntryPointFormError(null);
  };

  const closeEntryPointModal = () => {
    setEntryPointModalMode(null);
    setEntryPointModalDraft(null);
    setEntryPointFormError(null);
  };

  const handleEntryPointModalChange = (updates: Partial<EntryPointDraft>) => {
    setEntryPointModalDraft((previous) =>
      previous ? applyEntryPointTypeRules({ ...previous, ...updates }) : previous
    );
    setEntryPointFormError(null);
  };

  const toggleEntryPointModalModel = (
    key: 'requestModelIds' | 'responseModelIds',
    modelId: string
  ) => {
    setEntryPointModalDraft((previous) => {
      if (!previous) {
        return previous;
      }

      const selected = new Set(previous[key]);
      if (selected.has(modelId)) {
        selected.delete(modelId);
      } else {
        selected.add(modelId);
      }

      return { ...previous, [key]: [...selected] };
    });
    setEntryPointFormError(null);
  };

  const handleSubmitEntryPoint = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || !entryPointModalDraft || !entryPointModalMode) {
      return;
    }

    const trimmedName = entryPointModalDraft.name.trim();
    if (!trimmedName) {
      setEntryPointFormError('Enter a name for the entry point.');
      entryPointNameFieldRef.current?.focus();
      return;
    }

    const normalizedEntryPoint = applyEntryPointTypeRules({
      ...entryPointModalDraft,
      name: trimmedName
    });

    const entryPoints =
      entryPointModalMode === 'create'
        ? [...draft.entryPoints, normalizedEntryPoint]
        : draft.entryPoints.map((entryPoint) =>
            entryPoint.localId === normalizedEntryPoint.localId ? normalizedEntryPoint : entryPoint
          );

    const updatedDraft = {
      ...draft,
      entryPoints
    };

    setDraft(updatedDraft);
    setExpandedEntryPointIds((previous) => new Set(previous).add(normalizedEntryPoint.localId));
    setIsDirty(true);
    saveDraft(updatedDraft);
    closeEntryPointModal();
  };

  const handleDuplicateEntryPoint = (entryPointId: string) => {
    let duplicatedEntryPointId: string | null = null;

    setDraft((previous) => {
      if (!previous) {
        return previous;
      }

      const index = previous.entryPoints.findIndex((entryPoint) => entryPoint.localId === entryPointId);
      if (index === -1) {
        return previous;
      }

      const entryPoint = previous.entryPoints[index];
      const duplicate: EntryPointDraft = {
        ...cloneEntryPointDraft(entryPoint),
        id: undefined,
        localId: generateLocalId(),
        name: entryPoint.name ? `${entryPoint.name} (copy)` : ''
      };

      duplicatedEntryPointId = duplicate.localId;
      setIsDirty(true);

      return {
        ...previous,
        entryPoints: [
          ...previous.entryPoints.slice(0, index + 1),
          duplicate,
          ...previous.entryPoints.slice(index + 1)
        ]
      };
    });

    if (duplicatedEntryPointId) {
      setExpandedEntryPointIds((previous) => new Set(previous).add(duplicatedEntryPointId!));
    }
  };

  const handleRemoveEntryPoint = (entryPointId: string) => {
    const entryPointName = draft?.entryPoints.find((entryPoint) => entryPoint.localId === entryPointId)?.name;
    const entryPointLabel = entryPointName?.trim() || 'this entry point';

    if (!window.confirm(`Are you sure you want to remove ${entryPointLabel}?`)) {
      return;
    }

    setDraft((previous) => {
      if (!previous) {
        return previous;
      }

      setIsDirty(true);
      return {
        ...previous,
        entryPoints: previous.entryPoints.filter((entryPoint) => entryPoint.localId !== entryPointId)
      };
    });
    setExpandedEntryPointIds((previous) => {
      const next = new Set(previous);
      next.delete(entryPointId);
      return next;
    });
  };

  const moveEntryPoint = (sourceId: string, targetId: string | null) => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }

      const sourceIndex = previous.entryPoints.findIndex((entryPoint) => entryPoint.localId === sourceId);
      if (sourceIndex === -1) {
        return previous;
      }

      if (targetId === sourceId || (targetId === null && sourceIndex === previous.entryPoints.length - 1)) {
        return previous;
      }

      const entryPoints = [...previous.entryPoints];
      const [moved] = entryPoints.splice(sourceIndex, 1);

      if (targetId === null) {
        entryPoints.push(moved);
      } else {
        const targetIndex = entryPoints.findIndex((entryPoint) => entryPoint.localId === targetId);
        if (targetIndex === -1) {
          return previous;
        }

        entryPoints.splice(targetIndex, 0, moved);
      }
      setIsDirty(true);

      return {
        ...previous,
        entryPoints
      };
    });
  };

  const handleResetDraft = () => {
    resetDraftToSelected();
  };

  const handleSaveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) {
      return;
    }

    saveDraft(draft);
  };

  const handleDeleteComponent = () => {
    if (!selectedProjectId || !draft?.id) {
      return;
    }

    deleteComponentMutation.mutate({ projectId: selectedProjectId, componentId: draft.id });
  };

  const handleExport = () => {
    if (!draft && (!selectedComponent || !project)) {
      return;
    }

    const currentDraft =
      draft ?? createComponentDraft(selectedComponent!, project.entryPoints);
    const payload = toExportableComponentPayload(currentDraft, dataModelLookup);
    const fileName = `${currentDraft.name.trim() || 'component'}.json`;
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
    if (!draft && (!selectedComponent || !project)) {
      return;
    }

    const currentDraft =
      draft ?? createComponentDraft(selectedComponent!, project.entryPoints);
    const payload = JSON.stringify(toExportableComponentPayload(currentDraft, dataModelLookup), null, 2);

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

  const canSave = Boolean(draft && isDirty && draft.name.trim().length > 0);
  const isMutating =
    createComponentMutation.isPending ||
    updateComponentMutation.isPending ||
    deleteComponentMutation.isPending;

  const isCreateModalOpen = activeModal === 'create';
  const isEditModalOpen = activeModal === 'edit';
  const isModalOpen = activeModal !== null;
  const isEntryPointModalOpen = entryPointModalMode !== null && entryPointModalDraft !== null;
  const modalTitleId = isEditModalOpen ? 'edit-component-title' : 'create-component-title';
  const modalDescriptionId = isEditModalOpen
    ? 'edit-component-description'
    : 'create-component-description';
  const modalHeading = isEditModalOpen ? 'Edit component' : 'Create component';
  const modalDescription = isEditModalOpen
    ? 'Update service name and description.'
    : 'Define the name and description for the new component. Entry points can be configured after creation.';
  const activeMutation = isEditModalOpen ? updateComponentMutation : createComponentMutation;

  const toggleEntryPointExpansion = (entryPointId: string) => {
    setExpandedEntryPointIds((previous) => {
      const next = new Set(previous);
      if (next.has(entryPointId)) {
        next.delete(entryPointId);
      } else {
        next.add(entryPointId);
      }
      return next;
    });
  };

  const handleEntryPointDragStart = (entryPointId: string) => {
    draggingEntryPointIdRef.current = entryPointId;
    dragOverEntryPointIdRef.current = entryPointId;
    setDraggingEntryPointId(entryPointId);
    setDragOverEntryPointId(entryPointId);
  };

  const handleEntryPointDragEnter = (entryPointId: string) => {
    if (dragOverEntryPointId !== entryPointId) {
      setDragOverEntryPointId(entryPointId);
    }
  };

  const handleEntryPointDrop = (entryPointId: string) => {
    if (draggingEntryPointIdRef.current) {
      moveEntryPoint(draggingEntryPointIdRef.current, entryPointId);
    }
    draggingEntryPointIdRef.current = null;
    setDraggingEntryPointId(null);
    setDragOverEntryPointId(null);
  };

  const handleEntryPointsDrop = () => {
    if (draggingEntryPointIdRef.current) {
      moveEntryPoint(draggingEntryPointIdRef.current, null);
    }
    draggingEntryPointIdRef.current = null;
    setDraggingEntryPointId(null);
    setDragOverEntryPointId(null);
  };

  useEffect(() => {
    dragOverEntryPointIdRef.current = dragOverEntryPointId;
  }, [dragOverEntryPointId]);

  const handleEntryPointPointerMove = useCallback((event: PointerEvent) => {
    if (dragPointerIdRef.current !== event.pointerId || !draggingEntryPointIdRef.current) {
      return;
    }

    event.preventDefault();
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const dropzone = element?.closest<HTMLElement>('.entry-point-dropzone');
    const card = element?.closest<HTMLElement>('[data-entry-point-id]');

    if (dropzone) {
      dragOverEntryPointIdRef.current = null;
      setDragOverEntryPointId(null);
      return;
    }

    if (card?.dataset.entryPointId) {
      dragOverEntryPointIdRef.current = card.dataset.entryPointId ?? null;
      setDragOverEntryPointId((previous) =>
        previous !== card.dataset.entryPointId ? card.dataset.entryPointId ?? null : previous
      );
      return;
    }

    dragOverEntryPointIdRef.current = null;
    setDragOverEntryPointId(null);
  }, []);

  const handleEntryPointPointerEnd = useCallback(
    (event: PointerEvent) => {
      if (dragPointerIdRef.current !== event.pointerId) {
        return;
      }

      event.preventDefault();

      if (draggingEntryPointIdRef.current) {
        moveEntryPoint(draggingEntryPointIdRef.current, dragOverEntryPointIdRef.current);
      }

      draggingEntryPointIdRef.current = null;
      dragPointerIdRef.current = null;
      setDraggingEntryPointId(null);
      setDragOverEntryPointId(null);

      window.removeEventListener('pointermove', handleEntryPointPointerMove);
      window.removeEventListener('pointerup', handleEntryPointPointerEnd);
      window.removeEventListener('pointercancel', handleEntryPointPointerEnd);
    },
    [handleEntryPointPointerMove, moveEntryPoint]
  );

  const handleEntryPointPointerDragStart = (
    entryPointId: string,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (event.pointerType === 'mouse') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    dragPointerIdRef.current = event.pointerId;
    handleEntryPointDragStart(entryPointId);

    window.addEventListener('pointermove', handleEntryPointPointerMove);
    window.addEventListener('pointerup', handleEntryPointPointerEnd);
    window.addEventListener('pointercancel', handleEntryPointPointerEnd);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handleEntryPointPointerMove);
      window.removeEventListener('pointerup', handleEntryPointPointerEnd);
      window.removeEventListener('pointercancel', handleEntryPointPointerEnd);
    };
  }, [handleEntryPointPointerEnd, handleEntryPointPointerMove]);

  const openCreateModal = () => {
    createComponentMutation.reset();
    updateComponentMutation.reset();
    deleteComponentMutation.reset();
    setCreationForm({ name: '', description: '' });
    previousDraftStateRef.current = null;
    modalActivatorRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActiveModal('create');
  };

  const openEditModal = () => {
    if (!selectedComponent) {
      return;
    }

    updateComponentMutation.reset();
    createComponentMutation.reset();
    deleteComponentMutation.reset();
    previousDraftStateRef.current = { draft: cloneDraft(draft), isDirty };
    if (!draft) {
      setDraft(createComponentDraft(selectedComponent));
      setIsDirty(false);
    }
    modalActivatorRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setActiveModal('edit');
  };

  const dismissModal = useCallback(() => {
    createComponentMutation.reset();
    updateComponentMutation.reset();
    deleteComponentMutation.reset();
    if (activeModal === 'edit' && previousDraftStateRef.current) {
      const { draft: previousDraft, isDirty: previousIsDirty } = previousDraftStateRef.current;
      setDraft(previousDraft ? cloneDraft(previousDraft) : previousDraft);
      setIsDirty(previousIsDirty);
    }
    setActiveModal(null);
    previousDraftStateRef.current = null;
    focusModalActivator();
  }, [
    activeModal,
    createComponentMutation,
    deleteComponentMutation,
    focusModalActivator,
    updateComponentMutation
  ]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissModal();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dismissModal, isModalOpen]);

  useEffect(() => {
    if (isCreateModalOpen) {
      createNameFieldRef.current?.focus();
    }
  }, [isCreateModalOpen]);

  useEffect(() => {
    if (isEditModalOpen) {
      editNameFieldRef.current?.focus();
    }
  }, [isEditModalOpen]);

  useEffect(() => {
    if (isEntryPointModalOpen) {
      entryPointNameFieldRef.current?.focus();
      entryPointNameFieldRef.current?.select();
    }
  }, [isEntryPointModalOpen]);

  const associatedModelCount = useMemo(() => {
    if (!draft) {
      return 0;
    }

    const models = new Set<string>();
    draft.entryPoints.forEach((entryPoint) => {
      entryPoint.requestModelIds.forEach((id) => models.add(id));
      entryPoint.responseModelIds.forEach((id) => models.add(id));
    });

    return models.size;
  }, [draft]);

  return (
    <section className="workspace component-designer panel">
      <header className="panel-header">
        <h2>Component designer</h2>
        <p className="panel-subtitle">
          Define services and map their entry points, protocols, and associated data models.
        </p>
      </header>
      {!selectedProjectId && (
        <div className="panel-content">
          <p className="status">Select a project to manage its components.</p>
        </div>
      )}
      {selectedProjectId && projectQuery.isLoading && (
        <div className="panel-content">
          <p className="status">Loading components…</p>
        </div>
      )}
      {selectedProjectId && projectQuery.isError && (
        <div className="panel-content">
          <p className="status error" role="alert">
            Failed to load components:{' '}
            {projectQuery.error instanceof Error ? projectQuery.error.message : 'Unknown error'}
          </p>
        </div>
      )}
      {selectedProjectId && project && (
        <div className="component-designer-body">
          <aside className="component-sidebar">
            <h3>Components</h3>
            {components.length === 0 ? (
              <p className="status">Create your first component to get started.</p>
            ) : (
              <ul className="component-list">
                {components.map((component) => (
                  <li key={component.id}>
                    <button
                      type="button"
                      className={clsx('component-item', {
                        selected: component.id === selectedComponentId
                      })}
                      onClick={() => selectComponent(component.id)}
                      disabled={isMutating}
                    >
                      <span className="component-name">{component.name}</span>
                      {component.description && (
                        <span className="component-description">{component.description}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="component-create-launcher">
              <p className="status">
                Document new services and capabilities as your architecture evolves.
              </p>
              <button type="button" className="primary" onClick={openCreateModal}>
                New component
              </button>
            </div>
          </aside>
          <div className="component-editor">
            {!selectedComponent && (
              <p className="status">Select a component to review and edit its details.</p>
            )}
            {selectedComponent && draft && (
              <div className="component-detail">
                <section className="component-summary">
                  <header className="component-summary-header">
                    <div className="component-summary-heading">
                      <h3>{draft.name}</h3>
                      {draft.description.trim() && (
                        <p className="component-summary-description">{draft.description}</p>
                      )}
                    </div>
                    <div className="component-summary-actions">
                      <button type="button" className="secondary" onClick={handleExport}>
                        Export JSON
                      </button>
                      <button type="button" className="secondary" onClick={() => void handleCopy()}>
                        Copy JSON
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={handleDeleteComponent}
                        disabled={deleteComponentMutation.isPending}
                      >
                        {deleteComponentMutation.isPending ? 'Deleting…' : 'Delete component'}
                      </button>
                      <button type="button" className="primary" onClick={openEditModal}>
                        Edit component details
                      </button>
                    </div>
                  </header>
                  <dl className="component-summary-stats">
                    <div>
                      <dt>Entry points</dt>
                      <dd>{draft.entryPoints.length}</dd>
                    </div>
                    <div>
                      <dt>Associated models</dt>
                      <dd>{associatedModelCount}</dd>
                    </div>
                  </dl>
                  <p className="status">
                    Use the editor below to document interfaces and integrations.
                  </p>
                  {deleteComponentMutation.isError && (
                    <p className="status error" role="alert">
                      Unable to delete component.
                    </p>
                  )}
                </section>
                <section className="component-entry-editor">
                  <form className="component-form" onSubmit={handleSaveDraft}>
                    <div className="entry-points-header component-entry-header">
                      <div className="component-entry-header-text">
                        <h4>Entry points</h4>
                        <p className="status">
                          Update the interfaces this component exposes and map related data models.
                        </p>
                      </div>
                      <button
                        type="button"
                        className="secondary"
                        onClick={openCreateEntryPointModal}
                        disabled={isMutating}
                      >
                        New entry point
                      </button>
                    </div>
                    <div
                      className="entry-points"
                      onDragOver={(event) => {
                        if (!draggingEntryPointId) {
                          return;
                        }
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(event) => {
                        if (!draggingEntryPointId) {
                          return;
                        }
                        event.preventDefault();
                        handleEntryPointsDrop();
                      }}
                    >
                      {draft.entryPoints.length === 0 && (
                        <p className="status">No entry points yet. Add your first entry point.</p>
                      )}
                      {draft.entryPoints.map((entryPoint) => (
                        <EntryPointItem
                          key={entryPoint.localId}
                          entryPoint={entryPoint}
                          dataModelLookup={dataModelLookup}
                          expandedEntryPointIds={expandedEntryPointIds}
                          onToggle={toggleEntryPointExpansion}
                          onEdit={openEditEntryPointModal}
                          onDuplicate={handleDuplicateEntryPoint}
                          onRemove={handleRemoveEntryPoint}
                          onDragStart={handleEntryPointDragStart}
                          onDragEnter={handleEntryPointDragEnter}
                          onDrop={handleEntryPointDrop}
                          onDragEnd={handleEntryPointsDrop}
                          onPointerDragStart={handleEntryPointPointerDragStart}
                          isDragging={draggingEntryPointId === entryPoint.localId}
                          isDropTarget={dragOverEntryPointId === entryPoint.localId}
                        />
                      ))}
                      {draggingEntryPointId && (
                        <div
                          className="entry-point-dropzone"
                          data-entry-point-dropzone="end"
                          onDragOver={(event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = 'move';
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            handleEntryPointsDrop();
                          }}
                          aria-label="Move entry point to end"
                        />
                      )}
                    </div>
                    <footer className="component-actions">
                      <button type="submit" className="primary" disabled={!canSave || isMutating}>
                        Save changes
                      </button>
                      <button
                        type="button"
                        className="secondary"
                        onClick={handleResetDraft}
                        disabled={!isDirty || isMutating}
                      >
                        Reset changes
                      </button>
                    </footer>
                    {updateComponentMutation.isError && (
                      <p className="status error" role="alert">
                        Unable to save component.
                      </p>
                    )}
                  </form>
                </section>
              </div>
            )}
          </div>
        </div>
      )}
      {isEntryPointModalOpen && entryPointModalDraft && entryPointModalMode && (
        <EntryPointModal
          mode={entryPointModalMode}
          entryPoint={entryPointModalDraft}
          dataModelOptions={dataModelOptions}
          onClose={closeEntryPointModal}
          onChange={handleEntryPointModalChange}
          onToggleModel={toggleEntryPointModalModel}
          onSubmit={handleSubmitEntryPoint}
          nameFieldRef={entryPointNameFieldRef}
          error={entryPointFormError}
        />
      )}
      {isModalOpen && (
        <div
          className="modal-backdrop"
          role="button"
          tabIndex={0}
          aria-label={`Dismiss ${isEditModalOpen ? 'edit' : 'create'} component dialog`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              dismissModal();
            }
          }}
          onKeyDown={(event) => {
            if (event.currentTarget !== event.target) {
              return;
            }
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              dismissModal();
            }
          }}
        >
          <div
            className={`modal${isEditModalOpen ? ' component-modal' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            aria-describedby={modalDescriptionId}
          >
            <header className="modal-header">
              <h3 id={modalTitleId}>{modalHeading}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={dismissModal}
                aria-label={`Close ${isEditModalOpen ? 'edit' : 'create'} component dialog`}
                disabled={activeMutation.isPending || deleteComponentMutation.isPending}
              >
                ×
              </button>
            </header>
            <p id={modalDescriptionId} className="modal-description">
              {modalDescription}
            </p>
            <div className="modal-body">
              {isCreateModalOpen && (
                <form className="modal-form" onSubmit={handleCreateComponent}>
                  <label className="field">
                    <span>Name</span>
                    <input
                      type="text"
                      ref={createNameFieldRef}
                      value={creationForm.name}
                      onChange={(event) =>
                        setCreationForm((previous) => ({
                          ...previous,
                          name: event.target.value
                        }))
                      }
                      placeholder="Component name"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Description</span>
                    <textarea
                      value={creationForm.description}
                      onChange={(event) =>
                        setCreationForm((previous) => ({
                          ...previous,
                          description: event.target.value
                        }))
                      }
                      placeholder="Optional description"
                      rows={3}
                    />
                  </label>
                  {createComponentMutation.isError && (
                    <p className="status error" role="alert">
                      Unable to create component.
                    </p>
                  )}
                  <div className="modal-actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={dismissModal}
                      disabled={createComponentMutation.isPending}
                    >
                      Cancel
                    </button>
                    <button className="primary" type="submit" disabled={createComponentMutation.isPending}>
                      {createComponentMutation.isPending ? 'Creating…' : 'Create component'}
                    </button>
                  </div>
                </form>
              )}
              {isEditModalOpen && draft && (
                <form className="modal-form" onSubmit={handleSaveDraft}>
                  <label className="field">
                    <span>Name</span>
                    <input
                      type="text"
                      ref={editNameFieldRef}
                      value={draft.name}
                      onChange={(event) => handleComponentFieldChange('name', event.target.value)}
                      required
                      disabled={isMutating}
                    />
                  </label>
                  <label className="field">
                    <span>Description</span>
                    <textarea
                      value={draft.description}
                      onChange={(event) => handleComponentFieldChange('description', event.target.value)}
                      rows={3}
                      placeholder="How does this component operate?"
                      disabled={isMutating}
                    />
                  </label>
                  {updateComponentMutation.isError && (
                    <p className="status error" role="alert">
                      Unable to save component.
                    </p>
                  )}
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={dismissModal}
                      disabled={updateComponentMutation.isPending || deleteComponentMutation.isPending}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary"
                      type="submit"
                      disabled={!canSave || updateComponentMutation.isPending}
                    >
                      {updateComponentMutation.isPending ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

type EntryPointItemProps = {
  entryPoint: EntryPointDraft;
  dataModelLookup: Map<string, string>;
  expandedEntryPointIds: Set<string>;
  onToggle: (entryPointId: string) => void;
  onEdit: (entryPointId: string) => void;
  onDuplicate: (entryPointId: string) => void;
  onRemove: (entryPointId: string) => void;
  onDragStart: (entryPointId: string) => void;
  onDragEnter: (entryPointId: string) => void;
  onDrop: (entryPointId: string) => void;
  onDragEnd: () => void;
  onPointerDragStart: (entryPointId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  isDragging: boolean;
  isDropTarget: boolean;
};

const EntryPointItem = ({
  entryPoint,
  dataModelLookup,
  expandedEntryPointIds,
  onToggle,
  onEdit,
  onDuplicate,
  onRemove,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd,
  onPointerDragStart,
  isDragging,
  isDropTarget
}: EntryPointItemProps) => {
  const isExpanded = expandedEntryPointIds.has(entryPoint.localId);
  const displayName = entryPoint.name.trim() || 'Untitled entry point';
  const displayType = entryPoint.type.trim() || '—';
  const displayFunctionName = entryPoint.functionName.trim() || '—';
  const displayProtocol = entryPoint.protocol.trim() || '—';
  const displayMethod = entryPoint.method.trim() || '—';
  const displayPath = entryPoint.path.trim() || '—';
  const displayDescription = entryPoint.description.trim() || '—';
  const formConfig = getEntryPointFormConfig(entryPoint.type);
  const displayPrimaryBadge = formConfig.showMethod
    ? displayMethod
    : formConfig.showFunctionName
      ? displayFunctionName
      : displayMethod;
  const requestModels =
    entryPoint.requestModelIds.length === 0
      ? []
      : entryPoint.requestModelIds.map((id) => dataModelLookup.get(id) ?? 'Unknown model');
  const responseModels =
    entryPoint.responseModelIds.length === 0
      ? []
      : entryPoint.responseModelIds.map((id) => dataModelLookup.get(id) ?? 'Unknown model');

  return (
    <article
      className={clsx('entry-point-card', {
        'entry-point-dragging': isDragging,
        'entry-point-drop-target': isDropTarget && !isDragging
      })}
      data-entry-point-id={entryPoint.localId}
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDragEnter(entryPoint.localId);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        onDragEnter(entryPoint.localId);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop(entryPoint.localId);
      }}
    >
      <div className="entry-point-header">
        <button
          type="button"
          className="icon-button entry-point-drag-handle"
          aria-label="Reorder entry point"
          draggable
          onDragStart={(event) => {
            event.stopPropagation();
            event.dataTransfer.effectAllowed = 'move';
            onDragStart(entryPoint.localId);
          }}
          onDragEnd={(event) => {
            event.stopPropagation();
            onDragEnd();
          }}
          onPointerDown={(event) => onPointerDragStart(entryPoint.localId, event)}
        >
          ☰
        </button>
        <button
          type="button"
          className="entry-point-toggle"
          onClick={() => onToggle(entryPoint.localId)}
          aria-expanded={isExpanded}
        >
          <span className="entry-point-toggle-icon" aria-hidden="true">
            {isExpanded ? '▾' : '▸'}
          </span>
          <div className="entry-point-title">
            <span className="entry-point-method">{displayPrimaryBadge}</span>
            <span className="entry-point-name">{displayName}</span>
          </div>
        </button>
      </div>
      {isExpanded && (
        <div className="entry-point-details">
          <dl className="entry-point-grid entry-point-details-grid">
            <div className="entry-point-detail">
              <dt>Type</dt>
              <dd>{displayType}</dd>
            </div>
            {formConfig.showFunctionName && (
              <div className="entry-point-detail">
                <dt>Function name</dt>
                <dd>{displayFunctionName}</dd>
              </div>
            )}
            {formConfig.showProtocol && (
              <div className="entry-point-detail">
                <dt>Protocol</dt>
                <dd>{displayProtocol}</dd>
              </div>
            )}
            {formConfig.showMethod && (
              <div className="entry-point-detail">
                <dt>Method / Verb</dt>
                <dd>{displayMethod}</dd>
              </div>
            )}
            {formConfig.showPath && (
              <div className="entry-point-detail">
                <dt>Path or channel</dt>
                <dd>{displayPath}</dd>
              </div>
            )}
            <div className="entry-point-detail entry-point-detail-description">
              <dt>Description</dt>
              <dd>{displayDescription}</dd>
            </div>
          </dl>
          <div className="entry-point-associations">
            <div className="association-group">
              <h5>Tags</h5>
              {entryPoint.tags.length > 0 ? (
                <div className="tag-list">
                  {entryPoint.tags.map((tag) => (
                    <span key={`${entryPoint.localId}-tag-${tag}`} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="status">No tags assigned.</p>
              )}
            </div>
            <div className="association-group">
              <h5>Request models</h5>
              {requestModels.length > 0 ? (
                <ul className="entry-point-association-list">
                  {requestModels.map((name, index) => (
                    <li key={`${entryPoint.localId}-request-${index}`}>{name}</li>
                  ))}
                </ul>
              ) : (
                <p className="status">No request models mapped.</p>
              )}
            </div>
            <div className="association-group">
              <h5>Response models</h5>
              {responseModels.length > 0 ? (
                <ul className="entry-point-association-list">
                  {responseModels.map((name, index) => (
                    <li key={`${entryPoint.localId}-response-${index}`}>{name}</li>
                  ))}
                </ul>
              ) : (
                <p className="status">No response models mapped.</p>
              )}
            </div>
          </div>
          <div className="entry-point-actions">
            <button type="button" className="secondary" onClick={() => onEdit(entryPoint.localId)}>
              Edit entry point
            </button>
            <button type="button" className="secondary" onClick={() => onDuplicate(entryPoint.localId)}>
              Duplicate entry point
            </button>
            <button type="button" className="danger" onClick={() => onRemove(entryPoint.localId)}>
              Remove
            </button>
          </div>
        </div>
      )}
    </article>
  );
};

type EntryPointModalProps = {
  mode: 'create' | 'edit';
  entryPoint: EntryPointDraft;
  dataModelOptions: { id: string; name: string }[];
  onClose: () => void;
  onChange: (updates: Partial<EntryPointDraft>) => void;
  onToggleModel: (key: 'requestModelIds' | 'responseModelIds', modelId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  nameFieldRef: RefObject<HTMLInputElement>;
  error: string | null;
};

const EntryPointModal = ({
  mode,
  entryPoint,
  dataModelOptions,
  onClose,
  onChange,
  onToggleModel,
  onSubmit,
  nameFieldRef,
  error
}: EntryPointModalProps) => {
  const modalTitleId = `${mode}-entry-point-title`;
  const modalDescriptionId = `${mode}-entry-point-description`;
  const heading = mode === 'edit' ? 'Edit entry point' : 'Create entry point';
  const description =
    mode === 'edit'
      ? 'Update entry point details and associated request/response models.'
      : 'Define a new entry point with its interface details and data model associations.';
  const formConfig = getEntryPointFormConfig(entryPoint.type);
  const protocolOptions = formConfig.showProtocol
    ? filterEntryPointOptions(ENTRY_POINT_PROTOCOL_OPTIONS, formConfig.allowedProtocols)
    : [];
  const methodOptions = formConfig.showMethod
    ? filterEntryPointOptions(ENTRY_POINT_METHOD_OPTIONS, formConfig.allowedMethods)
    : [];
  const [expandedRequestAttributeIds, setExpandedRequestAttributeIds] = useState<Set<string>>(() =>
    retainExpandedAttributeIds(new Set(), { attributes: entryPoint.requestAttributes })
  );
  const [expandedResponseAttributeIds, setExpandedResponseAttributeIds] = useState<Set<string>>(() =>
    retainExpandedAttributeIds(new Set(), { attributes: entryPoint.responseAttributes })
  );
  const [activeAttributeContext, setActiveAttributeContext] = useState<
    { side: 'request' | 'response'; id: string } | null
  >(null);
  const attributeNameFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setExpandedRequestAttributeIds((previous) =>
      retainExpandedAttributeIds(previous, { attributes: entryPoint.requestAttributes })
    );
    setExpandedResponseAttributeIds((previous) =>
      retainExpandedAttributeIds(previous, { attributes: entryPoint.responseAttributes })
    );
  }, [entryPoint.requestAttributes, entryPoint.responseAttributes]);

  const updateAttributes = (
    side: 'request' | 'response',
    updater: (attributes: AttributeDraft[]) => AttributeDraft[]
  ) => {
    const key = side === 'request' ? 'requestAttributes' : 'responseAttributes';
    const sourceAttributes =
      side === 'request' ? entryPoint.requestAttributes : entryPoint.responseAttributes;
    const nextAttributes = updater(sourceAttributes);
    onChange({ [key]: nextAttributes } as Partial<EntryPointDraft>);
  };

  const toggleAttributeExpansion = (side: 'request' | 'response', attributeId: string) => {
    const setExpanded =
      side === 'request' ? setExpandedRequestAttributeIds : setExpandedResponseAttributeIds;
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(attributeId)) {
        next.delete(attributeId);
      } else {
        next.add(attributeId);
      }
      return next;
    });
  };

  const handleAttributeChange = (
    side: 'request' | 'response',
    attributeId: string,
    updates: Partial<AttributeDraft>
  ) => {
    updateAttributes(side, (attributes) =>
      updateAttributeInList(attributes, attributeId, (attribute) => ({ ...attribute, ...updates }))
    );
  };

  const handleAddAttribute = (side: 'request' | 'response', parentId: string | null) => {
    const newAttribute = createEmptyAttributeDraft();
    updateAttributes(side, (attributes) => addAttributeToList(attributes, parentId, newAttribute));
    const setExpanded =
      side === 'request' ? setExpandedRequestAttributeIds : setExpandedResponseAttributeIds;
    setExpanded((previous) => {
      const next = new Set(previous);
      next.add(newAttribute.localId);
      if (parentId) {
        next.add(parentId);
      }
      return next;
    });
    setActiveAttributeContext({ side, id: newAttribute.localId });
  };

  const handleRemoveAttribute = (side: 'request' | 'response', attributeId: string) => {
    const attributes = side === 'request' ? entryPoint.requestAttributes : entryPoint.responseAttributes;
    const attributeToRemove = findAttributeInList(attributes, attributeId);
    const removedIds = attributeToRemove
      ? collectAttributeIds([attributeToRemove])
      : new Set<string>([attributeId]);
    updateAttributes(side, (current) => removeAttributeFromList(current, attributeId));
    const setExpanded =
      side === 'request' ? setExpandedRequestAttributeIds : setExpandedResponseAttributeIds;
    setExpanded((previous) => {
      const next = new Set(previous);
      removedIds.forEach((id) => next.delete(id));
      return next;
    });
    setActiveAttributeContext((current) =>
      current && removedIds.has(current.id) && current.side === side ? null : current
    );
  };

  const openAttributeModal = (side: 'request' | 'response', attributeId: string) => {
    setActiveAttributeContext({ side, id: attributeId });
  };

  const closeAttributeModal = () => {
    setActiveAttributeContext(null);
  };

  const activeAttribute = useMemo(() => {
    if (!activeAttributeContext) {
      return null;
    }

    const attributes =
      activeAttributeContext.side === 'request'
        ? entryPoint.requestAttributes
        : entryPoint.responseAttributes;

    return findAttributeInList(attributes, activeAttributeContext.id);
  }, [activeAttributeContext, entryPoint.requestAttributes, entryPoint.responseAttributes]);

  useEffect(() => {
    if (activeAttributeContext && !activeAttribute) {
      setActiveAttributeContext(null);
    }
  }, [activeAttribute, activeAttributeContext]);

  const renderAttributes = (
    side: 'request' | 'response',
    title: string,
    attributes: AttributeDraft[],
    expandedIds: Set<string>
  ) => (
    <div className="association-group entry-point-attributes-group">
      <div className="entry-point-attributes-header">
        <h5>{title}</h5>
        <button type="button" className="secondary" onClick={() => handleAddAttribute(side, null)}>
          Add attribute
        </button>
      </div>
      {attributes.length === 0 ? (
        <p className="status">No attributes defined.</p>
      ) : (
        <div className="attribute-list">
          {attributes.map((attribute) => (
            <AttributeItem
              key={attribute.localId}
              attribute={attribute}
              depth={0}
              expandedAttributeIds={expandedIds}
              onToggle={(id) => toggleAttributeExpansion(side, id)}
              onEdit={(id) => openAttributeModal(side, id)}
              onAddChild={(parentId) => handleAddAttribute(side, parentId)}
              onRemove={(id) => handleRemoveAttribute(side, id)}
              flagVisibility={ENTRY_POINT_ATTRIBUTE_FLAG_VISIBILITY}
            />
          ))}
        </div>
      )}
    </div>
  );

  const isAttributeModalOpen = Boolean(activeAttributeContext && activeAttribute);

  return (
    <div
      className="modal-backdrop entry-point-modal-backdrop"
      role="button"
      tabIndex={0}
      aria-label={`Dismiss ${mode} entry point dialog`}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.currentTarget !== event.target) {
          return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div
        className="modal entry-point-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalTitleId}
        aria-describedby={modalDescriptionId}
      >
        <header className="modal-header">
          <h3 id={modalTitleId}>{heading}</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label={`Close ${mode} entry point dialog`}>
            ×
          </button>
        </header>
        <p id={modalDescriptionId} className="modal-description">
          {description}
        </p>
        <div className="modal-body">
          <form className="modal-form" onSubmit={onSubmit}>
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                ref={nameFieldRef}
                value={entryPoint.name}
                onChange={(event) => onChange({ name: event.target.value })}
                placeholder="Entry point name"
                required
              />
            </label>
            <div className="entry-point-grid">
              <label className="field">
                <span>Type</span>
                <select
                  value={entryPoint.type}
                  onChange={(event) => onChange({ type: event.target.value })}
                >
                  <option value="">Select type</option>
                  {ENTRY_POINT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {formConfig.showFunctionName && (
                <label className="field">
                  <span>Function name</span>
                  <input
                    type="text"
                    value={entryPoint.functionName}
                    onChange={(event) => onChange({ functionName: event.target.value })}
                    placeholder="ordersSync"
                  />
                </label>
              )}
              {formConfig.showProtocol && protocolOptions.length > 0 && (
                <label className="field">
                  <span>Protocol</span>
                  <select
                    value={entryPoint.protocol}
                  onChange={(event) => onChange({ protocol: event.target.value })}
                >
                  <option value="">Select protocol</option>
                  {protocolOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {formConfig.showMethod && methodOptions.length > 0 && (
              <label className="field">
                <span>Method / Verb</span>
                <select
                  value={entryPoint.method}
                  onChange={(event) => onChange({ method: event.target.value })}
                >
                  <option value="">Select method (optional)</option>
                  {methodOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {formConfig.showPath && (
              <label className="field">
                <span>Path or channel</span>
                <input
                  type="text"
                  value={entryPoint.path}
                  onChange={(event) => onChange({ path: event.target.value })}
                  placeholder="/customers, orders.queue…"
                />
              </label>
            )}
            </div>
            <label className="field">
              <span>Description</span>
              <textarea
                value={entryPoint.description}
                onChange={(event) => onChange({ description: event.target.value })}
                rows={3}
                placeholder="What does this entry point do?"
              />
            </label>
            <label className="field">
              <span>Tags</span>
              <input
                type="text"
                value={entryPoint.tags.join(', ')}
                onChange={(event) => onChange({ tags: parseTagInput(event.target.value) })}
                placeholder="Comma separated tags"
              />
            </label>
            <div className="entry-point-associations">
              <div className="association-group">
                <h5>Request models</h5>
                {dataModelOptions.length === 0 ? (
                  <p className="status">No data models available.</p>
                ) : (
                  <ul>
                    {dataModelOptions.map((model) => (
                      <li key={model.id}>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={entryPoint.requestModelIds.includes(model.id)}
                            onChange={() => onToggleModel('requestModelIds', model.id)}
                          />
                          <span>{model.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="association-group">
                <h5>Response models</h5>
                {dataModelOptions.length === 0 ? (
                  <p className="status">No data models available.</p>
                ) : (
                  <ul>
                    {dataModelOptions.map((model) => (
                      <li key={model.id}>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={entryPoint.responseModelIds.includes(model.id)}
                            onChange={() => onToggleModel('responseModelIds', model.id)}
                          />
                          <span>{model.name}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="entry-point-attributes">
              {renderAttributes(
                'request',
                'Request attributes',
                entryPoint.requestAttributes,
                expandedRequestAttributeIds
              )}
              {renderAttributes(
                'response',
                'Response attributes',
                entryPoint.responseAttributes,
                expandedResponseAttributeIds
              )}
            </div>
            {error && (
              <p className="status error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={onClose}>
                Cancel
              </button>
              <button className="primary" type="submit" disabled={!entryPoint.name.trim()}>
                {mode === 'edit' ? 'Save changes' : 'Create entry point'}
              </button>
            </div>
          </form>
        </div>
      </div>
      {isAttributeModalOpen && activeAttribute && activeAttributeContext && (
        <AttributeModal
          attribute={activeAttribute}
          onClose={closeAttributeModal}
          onSubmit={(attributeId, updates) =>
            handleAttributeChange(activeAttributeContext.side, attributeId, updates)
          }
          nameFieldRef={attributeNameFieldRef}
          flagVisibility={ENTRY_POINT_ATTRIBUTE_FLAG_VISIBILITY}
        />
      )}
    </div>
  );
};

export default ComponentDesigner;
