import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from '@architekt/domain';
import {
  createDataModel,
  deleteDataModel,
  fetchProjectDetails,
  updateDataModel,
  type DataModelPayload
} from '../api/projects.js';
import { queryKeys } from '../queryKeys.js';
import {
  selectSelectedDataModelId,
  selectSelectedProjectId,
  useProjectStore
} from '../store/projectStore.js';
import {
  AttributeDraft,
  DataModelDraft,
  createDataModelDraft,
  createEmptyAttributeDraft,
  toDataModelPayload
} from './DataModelDesigner.helpers.js';

const TYPE_OPTIONS = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'date'];

type UpdateAttributeFn = (attribute: AttributeDraft) => AttributeDraft;

const updateAttributeInList = (
  attributes: AttributeDraft[],
  targetId: string,
  updater: UpdateAttributeFn
): AttributeDraft[] =>
  attributes.map((attribute) => {
    if (attribute.localId === targetId) {
      return updater(attribute);
    }

    return {
      ...attribute,
      attributes: updateAttributeInList(attribute.attributes, targetId, updater)
    };
  });

const removeAttributeFromList = (attributes: AttributeDraft[], targetId: string): AttributeDraft[] =>
  attributes
    .filter((attribute) => attribute.localId !== targetId)
    .map((attribute) => ({
      ...attribute,
      attributes: removeAttributeFromList(attribute.attributes, targetId)
    }));

const addAttributeToList = (
  attributes: AttributeDraft[],
  parentId: string | null,
  newAttribute: AttributeDraft
): AttributeDraft[] => {
  if (parentId === null) {
    return [...attributes, newAttribute];
  }

  return attributes.map((attribute) => {
    if (attribute.localId === parentId) {
      return {
        ...attribute,
        attributes: [...attribute.attributes, newAttribute]
      };
    }

    return {
      ...attribute,
      attributes: addAttributeToList(attribute.attributes, parentId, newAttribute)
    };
  });
};

const DataModelDesigner = () => {
  const queryClient = useQueryClient();
  const selectedProjectId = useProjectStore(selectSelectedProjectId);
  const selectedDataModelId = useProjectStore(selectSelectedDataModelId);
  const selectDataModel = useProjectStore((state) => state.selectDataModel);

  const [draft, setDraft] = useState<DataModelDraft | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [creationForm, setCreationForm] = useState({ name: '', description: '' });
  const [activeModal, setActiveModal] = useState<'create' | 'edit' | null>(null);

  const createNameFieldRef = useRef<HTMLInputElement | null>(null);
  const editNameFieldRef = useRef<HTMLInputElement | null>(null);

  const projectQuery = useQuery({
    queryKey: selectedProjectId ? queryKeys.project(selectedProjectId) : ['project', 'none'],
    queryFn: () => fetchProjectDetails(selectedProjectId ?? ''),
    enabled: Boolean(selectedProjectId)
  });

  const project = projectQuery.data;
  const selectedDataModel =
    selectedDataModelId && project ? project.dataModels[selectedDataModelId] ?? null : null;

  const dataModels = useMemo(() => {
    if (!project) {
      return [];
    }

    return Object.values(project.dataModels).sort((a, b) => a.name.localeCompare(b.name));
  }, [project]);

  useEffect(() => {
    if (!project || dataModels.length === 0) {
      if (selectedDataModelId !== null) {
        selectDataModel(null);
      }
      return;
    }

    if (!selectedDataModelId || !project.dataModels[selectedDataModelId]) {
      selectDataModel(dataModels[0]?.id ?? null);
    }
  }, [dataModels, project, selectDataModel, selectedDataModelId]);

  useEffect(() => {
    if (!project || !selectedDataModelId || !project.dataModels[selectedDataModelId]) {
      setDraft(null);
      setIsDirty(false);
      return;
    }

    setDraft(createDataModelDraft(project.dataModels[selectedDataModelId]));
    setIsDirty(false);
  }, [project, selectedDataModelId]);

  const createDataModelMutation = useMutation({
    mutationFn: ({
      projectId,
      payload
    }: {
      projectId: string;
      payload: DataModelPayload;
    }) => createDataModel(projectId, payload),
    onSuccess: (dataModel, variables) => {
      queryClient.setQueryData<Project | undefined>(queryKeys.project(variables.projectId), (previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          dataModels: {
            ...previous.dataModels,
            [dataModel.id]: dataModel
          }
        };
      });
      selectDataModel(dataModel.id);
      setCreationForm({ name: '', description: '' });
      setActiveModal(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
    }
  });

  const updateDataModelMutation = useMutation({
    mutationFn: ({
      projectId,
      dataModelId,
      payload
    }: {
      projectId: string;
      dataModelId: string;
      payload: DataModelPayload;
    }) => updateDataModel(projectId, dataModelId, payload),
    onSuccess: (dataModel, variables) => {
      queryClient.setQueryData<Project | undefined>(queryKeys.project(variables.projectId), (previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          dataModels: {
            ...previous.dataModels,
            [dataModel.id]: dataModel
          }
        };
      });
      setDraft(createDataModelDraft(dataModel));
      setIsDirty(false);
      setActiveModal(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
    }
  });

  const deleteDataModelMutation = useMutation({
    mutationFn: ({
      projectId,
      dataModelId
    }: {
      projectId: string;
      dataModelId: string;
    }) => deleteDataModel(projectId, dataModelId),
    onSuccess: (_, variables) => {
      let nextSelectedId: string | null = null;
      queryClient.setQueryData<Project | undefined>(queryKeys.project(variables.projectId), (previous) => {
        if (!previous) {
          return previous;
        }

        const nextDataModels = { ...previous.dataModels };
        delete nextDataModels[variables.dataModelId];
        const sorted = Object.values(nextDataModels).sort((a, b) => a.name.localeCompare(b.name));
        nextSelectedId = sorted[0]?.id ?? null;

        return {
          ...previous,
          dataModels: nextDataModels
        };
      });
      selectDataModel(nextSelectedId);
      setDraft(null);
      setIsDirty(false);
      setActiveModal(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
    }
  });

  const resetDraftToSelected = useCallback(() => {
    if (!selectedDataModel || !project) {
      setDraft(null);
      setIsDirty(false);
      return;
    }

    setDraft(createDataModelDraft(project.dataModels[selectedDataModel.id]));
    setIsDirty(false);
  }, [project, selectedDataModel]);

  const handleCreateDataModel = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProjectId) {
      return;
    }

    const trimmedName = creationForm.name.trim();
    if (!trimmedName) {
      return;
    }

    createDataModelMutation.mutate({
      projectId: selectedProjectId,
      payload: {
        name: trimmedName,
        description: creationForm.description,
        attributes: []
      }
    });
  };

  const openCreateModal = () => {
    createDataModelMutation.reset();
    updateDataModelMutation.reset();
    deleteDataModelMutation.reset();
    setCreationForm({ name: '', description: '' });
    setActiveModal('create');
  };

  const openEditModal = () => {
    if (!selectedDataModel) {
      return;
    }
    updateDataModelMutation.reset();
    createDataModelMutation.reset();
    deleteDataModelMutation.reset();
    resetDraftToSelected();
    setActiveModal('edit');
  };

  const dismissModal = useCallback(() => {
    createDataModelMutation.reset();
    updateDataModelMutation.reset();
    deleteDataModelMutation.reset();
    setActiveModal(null);
    resetDraftToSelected();
  }, [createDataModelMutation, updateDataModelMutation, deleteDataModelMutation, resetDraftToSelected]);

  const handleAttributeChange = (attributeId: string, updates: Partial<AttributeDraft>) => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        attributes: updateAttributeInList(previous.attributes, attributeId, (attribute) => ({
          ...attribute,
          ...updates
        }))
      };
    });
    setIsDirty(true);
  };

  const handleAddAttribute = (parentId: string | null) => {
    const newAttribute = createEmptyAttributeDraft();
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        attributes: addAttributeToList(previous.attributes, parentId, newAttribute)
      };
    });
    setIsDirty(true);
  };

  const handleRemoveAttribute = (attributeId: string) => {
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        attributes: removeAttributeFromList(previous.attributes, attributeId)
      };
    });
    setIsDirty(true);
  };

  const handleResetDraft = () => {
    resetDraftToSelected();
  };

  const handleSaveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProjectId || !draft || !draft.id) {
      return;
    }

    updateDataModelMutation.mutate({
      projectId: selectedProjectId,
      dataModelId: draft.id,
      payload: toDataModelPayload(draft)
    });
  };

  const handleDeleteDataModel = () => {
    if (!selectedProjectId || !draft?.id) {
      return;
    }

    deleteDataModelMutation.mutate({ projectId: selectedProjectId, dataModelId: draft.id });
  };

  const handleExport = () => {
    if (!draft && !selectedDataModel) {
      return;
    }

    const currentDraft = draft ?? createDataModelDraft(selectedDataModel!);
    const payload = toDataModelPayload(currentDraft);
    const fileName = `${currentDraft.name.trim() || 'data-model'}.json`;
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

  const canSave = Boolean(draft && isDirty && draft.name.trim().length > 0);

  const isCreateModalOpen = activeModal === 'create';
  const isEditModalOpen = activeModal === 'edit';
  const isModalOpen = activeModal !== null;
  const modalTitleId = isEditModalOpen ? 'edit-data-model-title' : 'create-data-model-title';
  const modalDescriptionId = isEditModalOpen
    ? 'edit-data-model-description'
    : 'create-data-model-description';
  const modalHeading = isEditModalOpen ? 'Edit data model' : 'Create data model';
  const modalDescription = isEditModalOpen
    ? 'Update model details, manage attributes, and export JSON schemas.'
    : 'Define the name and description for the new data model. Attributes can be added after creation.';
  const activeMutation = isEditModalOpen ? updateDataModelMutation : createDataModelMutation;

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

  return (
    <section className="workspace data-model-workspace panel">
      <header className="panel-header">
        <h2>Data model designer</h2>
        <p className="panel-subtitle">
          Create JSON data models, define attribute constraints, and export schemas for reuse.
        </p>
      </header>
      {!selectedProjectId && (
        <div className="panel-content">
          <p className="status">Select a project to manage its data models.</p>
        </div>
      )}
      {selectedProjectId && projectQuery.isLoading && (
        <div className="panel-content">
          <p className="status">Loading data models…</p>
        </div>
      )}
      {selectedProjectId && projectQuery.isError && (
        <div className="panel-content">
          <p className="status error" role="alert">
            Failed to load data models:{' '}
            {projectQuery.error instanceof Error ? projectQuery.error.message : 'Unknown error'}
          </p>
        </div>
      )}
      {selectedProjectId && project && (
        <div className="data-model-layout">
          <div className="panel data-model-panel data-model-sidebar">
            <h3 className="data-model-heading">Models</h3>
            {dataModels.length === 0 && (
              <p className="status">No data models yet. Use the button below to add your first model.</p>
            )}
            {dataModels.length > 0 && (
              <ul className="data-model-list">
                {dataModels.map((model) => (
                  <li key={model.id}>
                    <button
                      type="button"
                      className={clsx('data-model-button', {
                        active: model.id === selectedDataModelId
                      })}
                      onClick={() => selectDataModel(model.id)}
                    >
                      <span className="data-model-name">{model.name}</span>
                      {model.description && (
                        <span className="data-model-description">{model.description}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="data-model-create-launcher">
              <p className="status">Kickstart a new schema tailored to your project.</p>
              <button className="primary" type="button" onClick={openCreateModal}>
                New data model
              </button>
            </div>
          </div>
          <div className="panel data-model-panel data-model-editor">
            {!selectedDataModel && <p className="status">Select a data model to review details.</p>}
            {selectedDataModel && (
              <div className="data-model-summary">
                <header className="data-model-summary-header">
                  <h3>{selectedDataModel.name}</h3>
                  {selectedDataModel.description && (
                    <p className="data-model-summary-description">{selectedDataModel.description}</p>
                  )}
                </header>
                <dl className="data-model-summary-stats">
                  <div>
                    <dt>Attributes</dt>
                    <dd>{selectedDataModel.attributes.length}</dd>
                  </div>
                </dl>
                <p className="status">
                  Manage schema fields, descriptions, and constraints from the edit dialog.
                </p>
                <div className="data-model-summary-actions">
                  <button type="button" className="secondary" onClick={handleExport}>
                    Export JSON
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={handleDeleteDataModel}
                    disabled={deleteDataModelMutation.isPending}
                  >
                    {deleteDataModelMutation.isPending ? 'Deleting…' : 'Delete model'}
                  </button>
                  <button type="button" className="primary" onClick={openEditModal}>
                    Edit data model
                  </button>
                </div>
                {updateDataModelMutation.isError && (
                  <p className="status error" role="alert">
                    Unable to save data model.
                  </p>
                )}
                {deleteDataModelMutation.isError && (
                  <p className="status error" role="alert">
                    Unable to delete data model.
                  </p>
                )}
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
          aria-label={`Dismiss ${isEditModalOpen ? 'edit' : 'create'} data model dialog`}
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
            className={`modal${isEditModalOpen ? ' data-model-modal' : ''}`}
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
                aria-label={`Close ${isEditModalOpen ? 'edit' : 'create'} data model dialog`}
                disabled={activeMutation.isPending || deleteDataModelMutation.isPending}
              >
                ×
              </button>
            </header>
            <p id={modalDescriptionId} className="modal-description">
              {modalDescription}
            </p>
            <div className="modal-body">
              {isCreateModalOpen && (
                <form className="modal-form" onSubmit={handleCreateDataModel}>
                  <label className="field">
                    <span>Name</span>
                    <input
                      type="text"
                      ref={createNameFieldRef}
                      value={creationForm.name}
                      onChange={(event) =>
                        setCreationForm((previous) => ({ ...previous, name: event.target.value }))
                      }
                      placeholder="E.g. Customer"
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
                      rows={3}
                      placeholder="Optional summary"
                    />
                  </label>
                  {createDataModelMutation.isError && (
                    <p className="status error" role="alert">
                      Unable to create data model.
                    </p>
                  )}
                  <div className="modal-actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={dismissModal}
                      disabled={createDataModelMutation.isPending}
                    >
                      Cancel
                    </button>
                    <button className="primary" type="submit" disabled={createDataModelMutation.isPending}>
                      {createDataModelMutation.isPending ? 'Creating…' : 'Create model'}
                    </button>
                  </div>
                </form>
              )}
              {isEditModalOpen && draft && (
                <form className="data-model-form" onSubmit={handleSaveDraft}>
                  <div className="data-model-header">
                    <div className="field">
                      <label>
                        <span>Name</span>
                        <input
                          type="text"
                          ref={editNameFieldRef}
                          value={draft.name}
                          onChange={(event) => {
                            const value = event.target.value;
                            setDraft((previous) => (previous ? { ...previous, name: value } : previous));
                            setIsDirty(true);
                          }}
                          required
                        />
                      </label>
                    </div>
                    <div className="field">
                      <label>
                        <span>Description</span>
                        <textarea
                          value={draft.description}
                          onChange={(event) => {
                            const value = event.target.value;
                            setDraft((previous) =>
                              previous ? { ...previous, description: value } : previous
                            );
                            setIsDirty(true);
                          }}
                          rows={3}
                        />
                      </label>
                    </div>
                    <div className="data-model-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={handleResetDraft}
                        disabled={!isDirty}
                      >
                        Reset
                      </button>
                      <button type="button" className="secondary" onClick={handleExport}>
                        Export JSON
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={handleDeleteDataModel}
                        disabled={deleteDataModelMutation.isPending}
                      >
                        {deleteDataModelMutation.isPending ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                  <div className="attribute-list">
                    {draft.attributes.length === 0 && (
                      <p className="status">No attributes yet. Add your first attribute.</p>
                    )}
                    {draft.attributes.map((attribute) => (
                      <AttributeEditor
                        key={attribute.localId}
                        attribute={attribute}
                        depth={0}
                        onChange={handleAttributeChange}
                        onAddChild={handleAddAttribute}
                        onRemove={handleRemoveAttribute}
                      />
                    ))}
                  </div>
                  <div className="attribute-toolbar">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => handleAddAttribute(null)}
                    >
                      Add attribute
                    </button>
                  </div>
                  <div className="data-model-footer">
                    <button
                      className="primary"
                      type="submit"
                      disabled={!canSave || updateDataModelMutation.isPending}
                    >
                      {updateDataModelMutation.isPending ? 'Saving…' : 'Save changes'}
                    </button>
                    {updateDataModelMutation.isError && (
                      <p className="status error" role="alert">
                        Unable to save data model.
                      </p>
                    )}
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

type AttributeEditorProps = {
  attribute: AttributeDraft;
  depth: number;
  onChange: (attributeId: string, updates: Partial<AttributeDraft>) => void;
  onAddChild: (parentId: string) => void;
  onRemove: (attributeId: string) => void;
};

const AttributeEditor = ({ attribute, depth, onChange, onAddChild, onRemove }: AttributeEditorProps) => {
  const canNest = attribute.type.trim().toLowerCase() === 'object';

  return (
    <div className="attribute-card" style={{ marginLeft: depth * 16 }}>
      <div className="attribute-grid">
        <label className="field">
          <span>Name</span>
          <input
            type="text"
            value={attribute.name}
            onChange={(event) => onChange(attribute.localId, { name: event.target.value })}
            required
          />
        </label>
        <label className="field">
          <span>Type</span>
          <select
            value={attribute.type}
            onChange={(event) => onChange(attribute.localId, { type: event.target.value })}
            required
          >
            <option value="" disabled>
              Select type
            </option>
            {TYPE_OPTIONS.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Constraints</span>
          <input
            type="text"
            value={attribute.constraints}
            onChange={(event) =>
              onChange(attribute.localId, { constraints: event.target.value })
            }
            placeholder="Optional, e.g. required"
          />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea
            value={attribute.description}
            onChange={(event) =>
              onChange(attribute.localId, { description: event.target.value })
            }
            rows={2}
          />
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={attribute.readOnly}
            onChange={(event) => onChange(attribute.localId, { readOnly: event.target.checked })}
          />
          <span>Read-only</span>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={attribute.encrypted}
            onChange={(event) => onChange(attribute.localId, { encrypted: event.target.checked })}
          />
          <span>Encrypted</span>
        </label>
      </div>
      <div className="attribute-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => onAddChild(attribute.localId)}
          disabled={!canNest}
        >
          Add sub-attribute
        </button>
        <button type="button" className="danger" onClick={() => onRemove(attribute.localId)}>
          Remove
        </button>
      </div>
      {attribute.attributes.length > 0 && (
        <div className="attribute-children">
          {attribute.attributes.map((child) => (
            <AttributeEditor
              key={child.localId}
              attribute={child}
              depth={depth + 1}
              onChange={onChange}
              onAddChild={onAddChild}
              onRemove={onRemove}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default DataModelDesigner;

