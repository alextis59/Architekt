import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  toComponentPayload
} from './ComponentDesigner.helpers.js';

const cloneEntryPointDraft = (entryPoint: EntryPointDraft): EntryPointDraft => ({
  ...entryPoint,
  requestModelIds: [...entryPoint.requestModelIds],
  responseModelIds: [...entryPoint.responseModelIds]
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

const ComponentDesigner = () => {
  const queryClient = useQueryClient();
  const selectedProjectId = useProjectStore(selectSelectedProjectId);
  const selectedComponentId = useProjectStore(selectSelectedComponentId);
  const selectComponent = useProjectStore((state) => state.selectComponent);

  const [draft, setDraft] = useState<ComponentDraft | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [creationForm, setCreationForm] = useState({ name: '', description: '' });
  const [activeModal, setActiveModal] = useState<'create' | 'edit' | null>(null);

  const createNameFieldRef = useRef<HTMLInputElement | null>(null);
  const editNameFieldRef = useRef<HTMLInputElement | null>(null);
  const modalActivatorRef = useRef<HTMLElement | null>(null);
  const previousDraftStateRef = useRef<{ draft: ComponentDraft | null; isDirty: boolean } | null>(null);

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
    if (!selectedComponent) {
      setDraft(null);
      setIsDirty(false);
      return;
    }

    setDraft(createComponentDraft(selectedComponent));
    setIsDirty(false);
  }, [selectedComponent]);

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
      setDraft(createComponentDraft(component));
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

  const updateEntryPoint = (entryPointId: string, updates: Partial<EntryPointDraft>) => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }

      setIsDirty(true);
      return {
        ...previous,
        entryPoints: previous.entryPoints.map((entryPoint) => {
          if (entryPoint.localId !== entryPointId) {
            return entryPoint;
          }

          return {
            ...entryPoint,
            ...updates
          };
        })
      };
    });
  };

  const toggleEntryPointModel = (
    entryPointId: string,
    key: 'requestModelIds' | 'responseModelIds',
    modelId: string
  ) => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }

      setIsDirty(true);
      return {
        ...previous,
        entryPoints: previous.entryPoints.map((entryPoint) => {
          if (entryPoint.localId !== entryPointId) {
            return entryPoint;
          }

          const selected = new Set(entryPoint[key]);
          if (selected.has(modelId)) {
            selected.delete(modelId);
          } else {
            selected.add(modelId);
          }

          return {
            ...entryPoint,
            [key]: [...selected]
          };
        })
      };
    });
  };

  const handleAddEntryPoint = () => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }

      setIsDirty(true);
      return {
        ...previous,
        entryPoints: [...previous.entryPoints, createEmptyEntryPointDraft()]
      };
    });
  };

  const handleRemoveEntryPoint = (entryPointId: string) => {
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
  };

  const handleResetDraft = () => {
    resetDraftToSelected();
  };

  const handleSaveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProjectId || !draft || !draft.id) {
      return;
    }

    updateComponentMutation.mutate({
      projectId: selectedProjectId,
      componentId: draft.id,
      payload: toComponentPayload(draft)
    });
  };

  const handleDeleteComponent = () => {
    if (!selectedProjectId || !draft?.id) {
      return;
    }

    deleteComponentMutation.mutate({ projectId: selectedProjectId, componentId: draft.id });
  };

  const canSave = Boolean(draft && isDirty && draft.name.trim().length > 0);
  const isMutating =
    createComponentMutation.isPending ||
    updateComponentMutation.isPending ||
    deleteComponentMutation.isPending;

  const isCreateModalOpen = activeModal === 'create';
  const isEditModalOpen = activeModal === 'edit';
  const isModalOpen = activeModal !== null;
  const modalTitleId = isEditModalOpen ? 'edit-component-title' : 'create-component-title';
  const modalDescriptionId = isEditModalOpen
    ? 'edit-component-description'
    : 'create-component-description';
  const modalHeading = isEditModalOpen ? 'Edit component' : 'Create component';
  const modalDescription = isEditModalOpen
    ? 'Update service name and description.'
    : 'Define the name and description for the new component. Entry points can be configured after creation.';
  const activeMutation = isEditModalOpen ? updateComponentMutation : createComponentMutation;

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
                        onClick={handleAddEntryPoint}
                        disabled={isMutating}
                      >
                        Add entry point
                      </button>
                    </div>
                    {draft.entryPoints.length === 0 && (
                      <p className="status">No entry points yet. Add your first entry point.</p>
                    )}
                    {draft.entryPoints.map((entryPoint) => (
                      <article key={entryPoint.localId} className="entry-point">
                        <div className="entry-point-header">
                          <label className="field">
                            <span>Name</span>
                            <input
                              type="text"
                              value={entryPoint.name}
                              onChange={(event) =>
                                updateEntryPoint(entryPoint.localId, { name: event.target.value })
                              }
                              required
                              disabled={isMutating}
                            />
                          </label>
                          <button
                            type="button"
                            className="danger"
                            onClick={() => handleRemoveEntryPoint(entryPoint.localId)}
                            disabled={isMutating}
                          >
                            Remove
                          </button>
                        </div>
                        <div className="entry-point-grid">
                          <label className="field">
                            <span>Type</span>
                            <input
                              type="text"
                              value={entryPoint.type}
                              onChange={(event) =>
                                updateEntryPoint(entryPoint.localId, { type: event.target.value })
                              }
                              placeholder="HTTP, queue, cron…"
                              disabled={isMutating}
                            />
                          </label>
                          <label className="field">
                            <span>Protocol</span>
                            <input
                              type="text"
                              value={entryPoint.protocol}
                              onChange={(event) =>
                                updateEntryPoint(entryPoint.localId, {
                                  protocol: event.target.value
                                })
                              }
                              placeholder="HTTP, gRPC, AMQP…"
                              disabled={isMutating}
                            />
                          </label>
                          <label className="field">
                            <span>Method / Verb</span>
                            <input
                              type="text"
                              value={entryPoint.method}
                              onChange={(event) =>
                                updateEntryPoint(entryPoint.localId, { method: event.target.value })
                              }
                              placeholder="GET, POST, LISTEN…"
                              disabled={isMutating}
                            />
                          </label>
                          <label className="field">
                            <span>Path or channel</span>
                            <input
                              type="text"
                              value={entryPoint.path}
                              onChange={(event) =>
                                updateEntryPoint(entryPoint.localId, { path: event.target.value })
                              }
                              placeholder="/customers, orders.queue…"
                              disabled={isMutating}
                            />
                          </label>
                          <label className="field">
                            <span>Target / endpoint</span>
                            <input
                              type="text"
                              value={entryPoint.target}
                              onChange={(event) =>
                                updateEntryPoint(entryPoint.localId, { target: event.target.value })
                              }
                              placeholder="Host, broker, topic…"
                              disabled={isMutating}
                            />
                          </label>
                        </div>
                        <label className="field">
                          <span>Description</span>
                          <textarea
                            value={entryPoint.description}
                            onChange={(event) =>
                              updateEntryPoint(entryPoint.localId, {
                                description: event.target.value
                              })
                            }
                            rows={2}
                            placeholder="What does this entry point do?"
                            disabled={isMutating}
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
                                        onChange={() =>
                                          toggleEntryPointModel(
                                            entryPoint.localId,
                                            'requestModelIds',
                                            model.id
                                          )
                                        }
                                        disabled={isMutating}
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
                                        onChange={() =>
                                          toggleEntryPointModel(
                                            entryPoint.localId,
                                            'responseModelIds',
                                            model.id
                                          )
                                        }
                                        disabled={isMutating}
                                      />
                                      <span>{model.name}</span>
                                    </label>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
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

export default ComponentDesigner;
