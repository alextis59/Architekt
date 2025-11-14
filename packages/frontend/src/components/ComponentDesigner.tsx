import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { FormEvent, useEffect, useMemo, useState } from 'react';
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

const ComponentDesigner = () => {
  const queryClient = useQueryClient();
  const selectedProjectId = useProjectStore(selectSelectedProjectId);
  const selectedComponentId = useProjectStore(selectSelectedComponentId);
  const selectComponent = useProjectStore((state) => state.selectComponent);

  const [draft, setDraft] = useState<ComponentDraft | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [creationForm, setCreationForm] = useState({ name: '', description: '' });

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

  useEffect(() => {
    if (!project || !selectedComponentId || !project.components[selectedComponentId]) {
      setDraft(null);
      setIsDirty(false);
      return;
    }

    setDraft(createComponentDraft(project.components[selectedComponentId]));
    setIsDirty(false);
  }, [project, selectedComponentId]);

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
    if (!project || !selectedComponentId || !project.components[selectedComponentId]) {
      return;
    }

    setDraft(createComponentDraft(project.components[selectedComponentId]));
    setIsDirty(false);
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
              <ul className="component-list" role="list">
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
            <form className="component-create" onSubmit={handleCreateComponent}>
              <h4>Create component</h4>
              <label className="field">
                <span>Name</span>
                <input
                  type="text"
                  value={creationForm.name}
                  onChange={(event) =>
                    setCreationForm((previous) => ({
                      ...previous,
                      name: event.target.value
                    }))
                  }
                  placeholder="Component name"
                  disabled={createComponentMutation.isPending || !selectedProjectId}
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
                  rows={2}
                  disabled={createComponentMutation.isPending || !selectedProjectId}
                />
              </label>
              <button
                type="submit"
                className="primary"
                disabled={createComponentMutation.isPending || !selectedProjectId}
              >
                Add component
              </button>
            </form>
          </aside>
          <div className="component-editor">
            {!draft && (
              <p className="status">Select a component to edit its details.</p>
            )}
            {draft && (
              <form className="component-form" onSubmit={handleSaveDraft}>
                <div className="component-fields">
                  <label className="field">
                    <span>Name</span>
                    <input
                      type="text"
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
                      onChange={(event) =>
                        handleComponentFieldChange('description', event.target.value)
                      }
                      rows={3}
                      placeholder="How does this component operate?"
                      disabled={isMutating}
                    />
                  </label>
                </div>
                <section className="entry-points">
                  <header className="entry-points-header">
                    <div>
                      <h3>Entry points</h3>
                      <p className="panel-subtitle">
                        Capture the interfaces exposed by this component and the data they exchange.
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
                  </header>
                  {draft.entryPoints.length === 0 && (
                    <p className="status">No entry points defined yet.</p>
                  )}
                  {draft.entryPoints.map((entryPoint) => (
                    <article className="entry-point" key={entryPoint.localId}>
                      <div className="entry-point-header">
                        <h4>{entryPoint.name.trim() || 'Untitled entry point'}</h4>
                        <button
                          type="button"
                          className="link"
                          onClick={() => handleRemoveEntryPoint(entryPoint.localId)}
                          disabled={isMutating}
                        >
                          Remove
                        </button>
                      </div>
                      <div className="entry-point-grid">
                        <label className="field">
                          <span>Name</span>
                          <input
                            type="text"
                            value={entryPoint.name}
                            onChange={(event) =>
                              updateEntryPoint(entryPoint.localId, { name: event.target.value })
                            }
                            disabled={isMutating}
                            required
                          />
                        </label>
                        <label className="field">
                          <span>Type</span>
                          <input
                            type="text"
                            value={entryPoint.type}
                            onChange={(event) =>
                              updateEntryPoint(entryPoint.localId, { type: event.target.value })
                            }
                            placeholder="http, queue, tcp…"
                            disabled={isMutating}
                            required
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
                                        toggleEntryPointModel(entryPoint.localId, 'requestModelIds', model.id)
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
                                        toggleEntryPointModel(entryPoint.localId, 'responseModelIds', model.id)
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
                </section>
                <footer className="component-actions">
                  <button type="submit" className="primary" disabled={!canSave || isMutating}>
                    Save component
                  </button>
                  <button type="button" className="secondary" onClick={handleResetDraft} disabled={isMutating}>
                    Reset changes
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={handleDeleteComponent}
                    disabled={isMutating}
                  >
                    Delete component
                  </button>
                </footer>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default ComponentDesigner;
