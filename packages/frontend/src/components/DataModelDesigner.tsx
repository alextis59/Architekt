import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { FormEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  AttributeConstraintDraft,
  DataModelDraft,
  createDataModelDraft,
  createEmptyAttributeDraft,
  cloneAttributeDraft,
  retainExpandedAttributeIds,
  updateAttributeInList,
  removeAttributeFromList,
  addAttributeToList,
  findAttributeInList,
  getConstraintTypesForAttribute,
  formatConstraintDisplay,
  toDataModelPayload,
  toExportableDataModelPayload
} from './DataModelDesigner.helpers.js';

const TYPE_OPTIONS = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'date'];

const cloneDraft = (draft: DataModelDraft): DataModelDraft => ({
  ...draft,
  attributes: draft.attributes.map(cloneAttributeDraft)
});

const DataModelDesigner = () => {
  const queryClient = useQueryClient();
  const selectedProjectId = useProjectStore(selectSelectedProjectId);
  const selectedDataModelId = useProjectStore(selectSelectedDataModelId);
  const selectDataModel = useProjectStore((state) => state.selectDataModel);

  const [draft, setDraft] = useState<DataModelDraft | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [creationForm, setCreationForm] = useState({ name: '', description: '' });
  const [activeModal, setActiveModal] = useState<'create' | 'edit' | null>(null);
  const [expandedAttributeIds, setExpandedAttributeIds] = useState<Set<string>>(() => new Set());
  const [activeAttributeId, setActiveAttributeId] = useState<string | null>(null);
  const [pendingAutoSave, setPendingAutoSave] = useState(false);
  const previousDraftStateRef = useRef<{ draft: DataModelDraft | null; isDirty: boolean } | null>(null);
  const previousDataModelIdRef = useRef<string | null>(null);

  const createNameFieldRef = useRef<HTMLInputElement | null>(null);
  const editNameFieldRef = useRef<HTMLInputElement | null>(null);
  const attributeNameFieldRef = useRef<HTMLInputElement | null>(null);

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
      setExpandedAttributeIds(new Set());
      setActiveAttributeId(null);
      previousDataModelIdRef.current = selectedDataModelId ?? null;
      return;
    }

    const nextDraft = createDataModelDraft(project.dataModels[selectedDataModelId]);
    setDraft(nextDraft);
    setIsDirty(false);
    setExpandedAttributeIds((previous) =>
      selectedDataModelId !== previousDataModelIdRef.current
        ? new Set<string>()
        : retainExpandedAttributeIds(previous, nextDraft)
    );
    setActiveAttributeId((current) =>
      selectedDataModelId !== previousDataModelIdRef.current ? null : current
    );
    previousDataModelIdRef.current = selectedDataModelId;
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
      setPendingAutoSave(false);
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
      const nextDraft = createDataModelDraft(dataModel);
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
      setDraft(nextDraft);
      setIsDirty(false);
      setExpandedAttributeIds((previous) => retainExpandedAttributeIds(previous, nextDraft));
      setActiveAttributeId(null);
      previousDraftStateRef.current = null;
      setActiveModal(null);
      setPendingAutoSave(false);
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
      setExpandedAttributeIds(new Set());
      setActiveAttributeId(null);
      setActiveModal(null);
      setPendingAutoSave(false);
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(variables.projectId) });
    }
  });

  const resetDraftToSelected = useCallback(() => {
    if (!selectedDataModel || !project) {
      setDraft(null);
      setIsDirty(false);
      setExpandedAttributeIds(new Set());
      setActiveAttributeId(null);
      return;
    }

    setDraft(createDataModelDraft(project.dataModels[selectedDataModel.id]));
    setIsDirty(false);
    setExpandedAttributeIds(new Set());
    setActiveAttributeId(null);
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
    setExpandedAttributeIds(new Set());
    setActiveAttributeId(null);
    setActiveModal('create');
  };

  const openEditModal = () => {
    if (!selectedDataModel) {
      return;
    }
    updateDataModelMutation.reset();
    createDataModelMutation.reset();
    deleteDataModelMutation.reset();
    previousDraftStateRef.current = { draft: draft ? cloneDraft(draft) : null, isDirty };
    setActiveModal('edit');
  };

  const toggleAttributeExpansion = (attributeId: string) => {
    setExpandedAttributeIds((previous) => {
      const next = new Set(previous);
      if (next.has(attributeId)) {
        next.delete(attributeId);
      } else {
        next.add(attributeId);
      }
      return next;
    });
  };

  const openAttributeModal = (attributeId: string) => {
    setExpandedAttributeIds((previous) => {
      const next = new Set(previous);
      next.add(attributeId);
      return next;
    });
    setActiveAttributeId(attributeId);
  };

  const closeAttributeModal = () => {
    setActiveAttributeId(null);
  };

  const activeAttribute = useMemo(() => {
    if (!activeAttributeId || !draft) {
      return null;
    }

    return findAttributeInList(draft.attributes, activeAttributeId);
  }, [activeAttributeId, draft]);

  useEffect(() => {
    if (activeAttribute && attributeNameFieldRef.current) {
      attributeNameFieldRef.current.focus();
      attributeNameFieldRef.current.select();
    }
  }, [activeAttribute]);

  const isAttributeModalOpen = Boolean(activeAttribute);

  const dismissModal = useCallback(() => {
    createDataModelMutation.reset();
    updateDataModelMutation.reset();
    deleteDataModelMutation.reset();
    if (activeModal === 'edit' && previousDraftStateRef.current) {
      const { draft: previousDraft, isDirty: previousIsDirty } = previousDraftStateRef.current;
      setDraft(previousDraft ? cloneDraft(previousDraft) : previousDraft);
      setIsDirty(previousIsDirty);
    }
    setActiveModal(null);
    previousDraftStateRef.current = null;
  }, [activeModal, createDataModelMutation, updateDataModelMutation, deleteDataModelMutation]);

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
    setPendingAutoSave(true);
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
    setExpandedAttributeIds((previous) => {
      const next = new Set(previous);
      if (parentId) {
        next.add(parentId);
      }
      next.add(newAttribute.localId);
      return next;
    });
    setActiveAttributeId(newAttribute.localId);
    setIsDirty(true);
  };

  const handleRemoveAttribute = (attributeId: string) => {
    const attributeToRemove = draft ? findAttributeInList(draft.attributes, attributeId) : null;
    const attributeLabel = attributeToRemove?.name?.trim() || 'this attribute';

    if (
      !window.confirm(
        `Are you sure you want to remove ${attributeLabel}? This will also delete any nested attributes.`
      )
    ) {
      return;
    }
    setDraft((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        attributes: removeAttributeFromList(previous.attributes, attributeId)
      };
    });
    let idsToRemove: Set<string> | null = null;
    if (attributeToRemove) {
      const collectIds = (attribute: AttributeDraft, accumulator: Set<string>) => {
        accumulator.add(attribute.localId);
        attribute.attributes.forEach((child) => collectIds(child, accumulator));
      };
      idsToRemove = new Set<string>();
      collectIds(attributeToRemove, idsToRemove);
      setExpandedAttributeIds((previous) => {
        if (idsToRemove.size === 0) {
          return previous;
        }
        const next = new Set(previous);
        idsToRemove.forEach((id) => next.delete(id));
        return next;
      });
    }
    setActiveAttributeId((previous) => {
      if (!previous) {
        return previous;
      }
      if (idsToRemove?.has(previous)) {
        return null;
      }
      return previous === attributeId ? null : previous;
    });
    setIsDirty(true);
    setPendingAutoSave(true);
  };

  const handleResetDraft = () => {
    resetDraftToSelected();
    setPendingAutoSave(false);
  };

  const saveDraft = () => {
    if (!selectedProjectId || !draft || !draft.id) {
      return;
    }

    updateDataModelMutation.mutate({
      projectId: selectedProjectId,
      dataModelId: draft.id,
      payload: toDataModelPayload(draft)
    });
  };

  const handleSaveDraft = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    saveDraft();
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
    const payload = toExportableDataModelPayload(currentDraft);
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

  const handleCopy = async () => {
    if (!draft && !selectedDataModel) {
      return;
    }

    const currentDraft = draft ?? createDataModelDraft(selectedDataModel!);
    const payload = JSON.stringify(toExportableDataModelPayload(currentDraft), null, 2);

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

  const { mutate: autoSaveDataModel } = updateDataModelMutation;

  useEffect(() => {
    if (!pendingAutoSave || !draft || !selectedProjectId || !draft.id) {
      return;
    }

    if (updateDataModelMutation.isPending) {
      return;
    }

    autoSaveDataModel({
      projectId: selectedProjectId,
      dataModelId: draft.id,
      payload: toDataModelPayload(draft)
    });
    setPendingAutoSave(false);
  }, [autoSaveDataModel, draft, pendingAutoSave, selectedProjectId, updateDataModelMutation.isPending]);

  const isCreateModalOpen = activeModal === 'create';
  const isEditModalOpen = activeModal === 'edit';
  const isModalOpen = activeModal !== null;
  const modalTitleId = isEditModalOpen ? 'edit-data-model-title' : 'create-data-model-title';
  const modalDescriptionId = isEditModalOpen
    ? 'edit-data-model-description'
    : 'create-data-model-description';
  const modalHeading = isEditModalOpen ? 'Edit data model' : 'Create data model';
  const modalDescription = isEditModalOpen
    ? 'Update model name and description. Attribute changes are saved automatically.'
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
            {selectedDataModel && draft && (
              <div className="data-model-detail">
                <div className="data-model-summary">
                  <header className="data-model-summary-header">
                    <h3>{draft.name}</h3>
                    {draft.description.trim() && (
                      <p className="data-model-summary-description">{draft.description}</p>
                    )}
                  </header>
                  <dl className="data-model-summary-stats">
                    <div>
                      <dt>Attributes</dt>
                      <dd>{draft.attributes.length}</dd>
                    </div>
                  </dl>
                  <div className="data-model-summary-actions">
                    <button type="button" className="secondary" onClick={handleExport}>
                      Export JSON
                    </button>
                    <button type="button" className="secondary" onClick={() => void handleCopy()}>
                      Copy JSON
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
                      Edit model details
                    </button>
                  </div>
                  {deleteDataModelMutation.isError && (
                    <p className="status error" role="alert">
                      Unable to delete data model.
                    </p>
                  )}
                </div>
                <section className="data-model-attributes">
                  <header className="data-model-attributes-header">
                    <h4>Attributes</h4>
                    <p className="status">Expand attributes to review and edit their details.</p>
                  </header>
                  <div className="attribute-toolbar attribute-toolbar-top">
                    <button type="button" className="secondary" onClick={() => handleAddAttribute(null)}>
                      Add attribute
                    </button>
                  </div>
                  <div className="attribute-list">
                    {draft.attributes.length === 0 && (
                      <p className="status">No attributes yet. Add your first attribute.</p>
                    )}
                    {draft.attributes.map((attribute) => (
                      <AttributeItem
                        key={attribute.localId}
                        attribute={attribute}
                        depth={0}
                        expandedAttributeIds={expandedAttributeIds}
                        onToggle={toggleAttributeExpansion}
                        onEdit={openAttributeModal}
                        onAddChild={handleAddAttribute}
                        onRemove={handleRemoveAttribute}
                      />
                    ))}
                  </div>
                  <div className="attribute-toolbar attribute-toolbar-bottom">
                    <button type="button" className="secondary" onClick={() => handleAddAttribute(null)}>
                      Add attribute
                    </button>
                  </div>
                  <div className="data-model-footer">
                    <button
                      type="button"
                      className="secondary"
                      onClick={handleResetDraft}
                      disabled={!isDirty || updateDataModelMutation.isPending}
                    >
                      Reset changes
                    </button>
                    <p className="status" role="status">
                      {updateDataModelMutation.isPending
                        ? 'Saving changes…'
                        : isDirty
                          ? 'Pending changes will be saved automatically.'
                          : 'All changes saved.'}
                    </p>
                    {updateDataModelMutation.isError && (
                      <p className="status error" role="alert">
                        Unable to save data model.
                      </p>
                    )}
                  </div>
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
                <form className="modal-form" onSubmit={handleSaveDraft}>
                  <label className="field">
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
                  <label className="field">
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
                  {updateDataModelMutation.isError && (
                    <p className="status error" role="alert">
                      Unable to save data model.
                    </p>
                  )}
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="secondary"
                      onClick={dismissModal}
                      disabled={updateDataModelMutation.isPending || deleteDataModelMutation.isPending}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary"
                      type="submit"
                      disabled={!canSave || updateDataModelMutation.isPending}
                    >
                      {updateDataModelMutation.isPending ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
      {isAttributeModalOpen && activeAttribute && (
        <AttributeModal
          attribute={activeAttribute}
          onClose={closeAttributeModal}
          onSubmit={handleAttributeChange}
          nameFieldRef={attributeNameFieldRef}
        />
      )}
    </section>
  );
};

export type AttributeItemProps = {
  attribute: AttributeDraft;
  depth: number;
  expandedAttributeIds: Set<string>;
  onToggle: (attributeId: string) => void;
  onEdit: (attributeId: string) => void;
  onAddChild: (parentId: string) => void;
  onRemove: (attributeId: string) => void;
  showFlags?: boolean;
};

export const AttributeItem = ({
  attribute,
  depth,
  expandedAttributeIds,
  onToggle,
  onEdit,
  onAddChild,
  onRemove,
  showFlags = true
}: AttributeItemProps) => {
  const isExpanded = expandedAttributeIds.has(attribute.localId);
  const canNest = attribute.type.trim().toLowerCase() === 'object';
  const displayName = attribute.name.trim() || 'Unnamed attribute';
  const displayType = attribute.type.trim() || '—';
  const displayConstraints =
    attribute.constraints.length > 0
      ? attribute.constraints.map((constraint) => formatConstraintDisplay(constraint)).join(', ')
      : '—';
  const displayDescription = attribute.description.trim() || '—';
  const displayElement =
    attribute.type.trim().toLowerCase() === 'array'
      ? attribute.element
        ? `${attribute.element.name.trim() || 'Element'} (${attribute.element.type.trim() || '—'})`
        : '—'
      : null;
  const activeFlags = [
    { label: 'Required', active: attribute.required },
    { label: 'Unique', active: attribute.unique },
    { label: 'Read-only', active: attribute.readOnly },
    { label: 'Encrypted', active: attribute.encrypted },
    { label: 'Private', active: attribute.private }
  ].filter((flag) => flag.active);

  return (
    <div className="attribute-card" style={{ marginLeft: depth * 16 }}>
      <div className="attribute-item-header">
        <button
          type="button"
          className="attribute-toggle"
          onClick={() => onToggle(attribute.localId)}
          aria-expanded={isExpanded}
        >
          <span className="attribute-toggle-icon" aria-hidden="true">
            {isExpanded ? '▾' : '▸'}
          </span>
          <span className="attribute-title">{displayName}</span>
        </button>
      </div>
      {isExpanded && (
        <div className="attribute-details">
          <dl className="attribute-details-grid">
            <div className="attribute-detail">
              <dt>Type</dt>
              <dd>{displayType}</dd>
            </div>
            <div className="attribute-detail">
              <dt>Constraints</dt>
              <dd>{displayConstraints}</dd>
            </div>
            {displayElement !== null && (
              <div className="attribute-detail">
                <dt>Element</dt>
                <dd>{displayElement}</dd>
              </div>
            )}
            <div className="attribute-detail attribute-detail-description">
              <dt>Description</dt>
              <dd>{displayDescription}</dd>
            </div>
            {showFlags && (
              <div className="attribute-detail">
                <dt>Flags</dt>
                <dd>
                  {activeFlags.length > 0 ? (
                    <div className="attribute-flags">
                      {activeFlags.map((flag) => (
                        <span key={flag.label} className="attribute-flag active">
                          {flag.label}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="attribute-flags-empty">No flags enabled</span>
                  )}
                </dd>
              </div>
            )}
          </dl>
          <div className="attribute-actions">
            {canNest && (
              <button
                type="button"
                className="secondary"
                onClick={() => onAddChild(attribute.localId)}
              >
                Add sub-attribute
              </button>
            )}
            <button type="button" className="secondary" onClick={() => onEdit(attribute.localId)}>
              Edit attribute
            </button>
            <button type="button" className="danger" onClick={() => onRemove(attribute.localId)}>
              Remove
            </button>
          </div>
          {canNest && attribute.attributes.length > 0 && (
            <div className="attribute-children">
              {attribute.attributes.map((child) => (
                <AttributeItem
                  key={child.localId}
                  attribute={child}
                  depth={depth + 1}
                  expandedAttributeIds={expandedAttributeIds}
                  onToggle={onToggle}
                  onEdit={onEdit}
                  onAddChild={onAddChild}
                  onRemove={onRemove}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export type AttributeModalProps = {
  attribute: AttributeDraft;
  onClose: () => void;
  onSubmit: (attributeId: string, updates: Partial<AttributeDraft>) => void;
  nameFieldRef: RefObject<HTMLInputElement>;
  showFlags?: boolean;
};

type ConstraintEditorProps = {
  attributeType: string;
  constraints: AttributeConstraintDraft[];
  onChange: (constraints: AttributeConstraintDraft[]) => void;
};

const ConstraintEditor = ({ attributeType, constraints, onChange }: ConstraintEditorProps) => {
  const constraintTypes = useMemo(
    () => getConstraintTypesForAttribute(attributeType),
    [attributeType]
  );

  const availableConstraintTypes = useMemo(
    () =>
      constraintTypes.filter(
        (type) => !constraints.some((constraint) => constraint.type === type)
      ),
    [constraintTypes, constraints]
  );

  const [constraintDraft, setConstraintDraft] = useState<{
    type: AttributeConstraintDraft['type'] | '';
    value: string;
  }>({ type: availableConstraintTypes[0] ?? '', value: '' });

  const [constraintError, setConstraintError] = useState<string | null>(null);

  const [isRegexBuilderOpen, setIsRegexBuilderOpen] = useState(false);
  const [regexBuilderOptions, setRegexBuilderOptions] = useState({
    alphaLowercase: true,
    alphaUppercase: false,
    numeric: false,
    ascii: false,
    hexadecimal: false,
    lengthMode: 'none' as 'none' | 'exact' | 'range',
    lengthExact: '',
    lengthMin: '',
    lengthMax: ''
  });
  const [regexBuilderError, setRegexBuilderError] = useState<string | null>(null);

  useEffect(() => {
    setConstraintDraft((previous) => {
      const nextType = previous.type && availableConstraintTypes.includes(previous.type)
        ? previous.type
        : availableConstraintTypes[0] ?? '';
      return { type: nextType, value: '' };
    });
    setConstraintError(null);
    setIsRegexBuilderOpen(false);
    setRegexBuilderError(null);
  }, [availableConstraintTypes, attributeType]);

  useEffect(() => {
    if (constraintDraft.type !== 'regex') {
      setIsRegexBuilderOpen(false);
      setRegexBuilderError(null);
    }
  }, [constraintDraft.type]);

  const buildRegexPattern = () => {
    const characterParts: string[] = [];
    if (regexBuilderOptions.alphaLowercase) {
      characterParts.push('a-z');
    }
    if (regexBuilderOptions.alphaUppercase) {
      characterParts.push('A-Z');
    }
    if (regexBuilderOptions.numeric) {
      characterParts.push('0-9');
    }
    if (regexBuilderOptions.hexadecimal) {
      characterParts.push('A-Fa-f0-9');
    }
    if (regexBuilderOptions.ascii) {
      characterParts.push('\\x20-\\x7E');
    }

    if (characterParts.length === 0) {
      return { error: 'Select at least one character option.' } as const;
    }

    const quantifier = (() => {
      if (regexBuilderOptions.lengthMode === 'none') {
        return '+';
      }

      if (regexBuilderOptions.lengthMode === 'exact') {
        const value = Number(regexBuilderOptions.lengthExact);
        if (!Number.isInteger(value) || value <= 0) {
          return { error: 'Enter a positive integer for exact length.' } as const;
        }
        return `{${value}}` as const;
      }

      const min = regexBuilderOptions.lengthMin.trim();
      const max = regexBuilderOptions.lengthMax.trim();
      const parsedMin = Number(min);
      const parsedMax = Number(max);

      if (!Number.isInteger(parsedMin) || parsedMin < 0) {
        return { error: 'Enter a non-negative integer for minimum length.' } as const;
      }

      if (max) {
        if (!Number.isInteger(parsedMax) || parsedMax < parsedMin) {
          return { error: 'Maximum length must be an integer greater than or equal to minimum length.' } as const;
        }
        return `{${parsedMin},${parsedMax}}` as const;
      }

      return `{${parsedMin},}` as const;
    })();

    if (typeof quantifier === 'object' && 'error' in quantifier) {
      return quantifier;
    }

    const merged = Array.from(new Set(characterParts)).join('');
    return { pattern: `^[${merged}]${quantifier}$` } as const;
  };

  const applyRegexBuilder = () => {
    const result = buildRegexPattern();
    if ('error' in result) {
      setRegexBuilderError(result.error);
      return;
    }

    setConstraintDraft((previous) => ({ ...previous, value: result.pattern }));
    setRegexBuilderError(null);
    setConstraintError(null);
    setIsRegexBuilderOpen(false);
  };

  const removeConstraint = (typeToRemove: AttributeConstraintDraft['type']) => {
    onChange(constraints.filter((constraint) => constraint.type !== typeToRemove));
    setConstraintError(null);
  };

  const handleAddConstraint = () => {
    if (!constraintDraft.type) {
      setConstraintError('Select a constraint type.');
      return;
    }

    if (constraintDraft.type === 'enum') {
      const values = constraintDraft.value
        .split(/,|\n/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      const unique = Array.from(new Set(values));
      if (unique.length === 0) {
        setConstraintError('Enter at least one value.');
        return;
      }
      onChange([...constraints, { type: 'enum', values: unique }]);
      setConstraintDraft((previous) => ({ ...previous, value: '' }));
      setConstraintError(null);
      return;
    }

    const trimmedValue = constraintDraft.value.trim();
    if (!trimmedValue) {
      setConstraintError('Enter a constraint value.');
      return;
    }

    if (constraintDraft.type === 'regex') {
      onChange([...constraints, { type: 'regex', value: trimmedValue }]);
      setConstraintDraft((previous) => ({ ...previous, value: '' }));
      setConstraintError(null);
      return;
    }

    const numeric = Number(trimmedValue);
    if (!Number.isFinite(numeric)) {
      setConstraintError('Enter a valid numeric value.');
      return;
    }

    if (constraintDraft.type === 'minLength' || constraintDraft.type === 'maxLength') {
      const integer = Math.trunc(numeric);
      if (!Number.isFinite(integer) || integer < 0) {
        setConstraintError('Enter a non-negative integer value.');
        return;
      }
      onChange([...constraints, { type: constraintDraft.type, value: String(integer) }]);
      setConstraintDraft((previous) => ({ ...previous, value: '' }));
      setConstraintError(null);
      return;
    }

    onChange([...constraints, { type: constraintDraft.type, value: String(numeric) }]);
    setConstraintDraft((previous) => ({ ...previous, value: '' }));
    setConstraintError(null);
  };

  const constraintValueInputType =
    !constraintDraft.type || constraintDraft.type === 'regex' || constraintDraft.type === 'enum'
      ? 'text'
      : 'number';
  const constraintValueStep =
    constraintDraft.type === 'minLength' || constraintDraft.type === 'maxLength'
      ? 1
      : constraintDraft.type === 'min' || constraintDraft.type === 'max'
        ? 'any'
        : undefined;
  const constraintPlaceholder =
    constraintDraft.type === 'regex'
      ? 'Pattern, e.g. ^[A-Z]+$'
      : constraintDraft.type === 'enum'
        ? 'Comma-separated values'
        : constraintDraft.type
          ? 'Value'
          : 'Select a constraint';

  return (
    <div className="constraint-editor">
      {constraints.length > 0 ? (
        <ul className="constraint-list">
          {constraints.map((constraint) => (
            <li key={constraint.type} className="constraint-item">
              <span>{formatConstraintDisplay(constraint)}</span>
              <button
                type="button"
                className="icon-button"
                onClick={() => removeConstraint(constraint.type)}
                aria-label={`Remove ${constraint.type} constraint`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="status">No constraints added.</p>
      )}
      {constraintError && (
        <p className="status error" role="alert">
          {constraintError}
        </p>
      )}
      {availableConstraintTypes.length > 0 ? (
        <>
          <div className="constraint-form">
            <select
              value={constraintDraft.type}
              onChange={(event) => {
                const nextType = event.target.value as AttributeConstraintDraft['type'] | '';
                setConstraintDraft({ type: nextType, value: '' });
              }}
              aria-label="Constraint type"
            >
              <option value="">Select constraint</option>
              {availableConstraintTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <div className="constraint-value-wrapper">
              <input
                type={constraintValueInputType}
                value={constraintDraft.value}
                onChange={(event) =>
                  setConstraintDraft((previous) => ({ ...previous, value: event.target.value }))
                }
                aria-label="Constraint value"
                placeholder={constraintPlaceholder}
                disabled={!constraintDraft.type}
                step={constraintValueStep}
              />
              {constraintDraft.type === 'regex' && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`${isRegexBuilderOpen ? 'Hide' : 'Open'} regex builder`}
                  onClick={() => {
                    setIsRegexBuilderOpen((previous) => !previous);
                    setRegexBuilderError(null);
                  }}
                >
                  🔧
                </button>
              )}
            </div>
            <button
              type="button"
              className="secondary"
              onClick={handleAddConstraint}
              disabled={!constraintDraft.type}
            >
              Add constraint
            </button>
          </div>
          {constraintDraft.type === 'regex' && isRegexBuilderOpen && (
            <div className="regex-builder" aria-label="Regex builder" role="group">
              <div className="regex-builder-grid">
                <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={regexBuilderOptions.alphaLowercase}
                  onChange={(event) => {
                    setRegexBuilderOptions((previous) => ({
                      ...previous,
                      alphaLowercase: event.target.checked
                    }));
                    setRegexBuilderError(null);
                  }}
                />
                <span>Alpha lowercase</span>
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={regexBuilderOptions.alphaUppercase}
                  onChange={(event) => {
                    setRegexBuilderOptions((previous) => ({
                      ...previous,
                      alphaUppercase: event.target.checked
                    }));
                    setRegexBuilderError(null);
                  }}
                />
                <span>Alpha uppercase</span>
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={regexBuilderOptions.numeric}
                  onChange={(event) => {
                    setRegexBuilderOptions((previous) => ({
                      ...previous,
                      numeric: event.target.checked
                    }));
                    setRegexBuilderError(null);
                  }}
                />
                <span>Numeric</span>
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={regexBuilderOptions.hexadecimal}
                  onChange={(event) => {
                    setRegexBuilderOptions((previous) => ({
                      ...previous,
                      hexadecimal: event.target.checked
                    }));
                    setRegexBuilderError(null);
                  }}
                />
                <span>Hexadecimal</span>
              </label>
              <label className="checkbox-field">
                <input
                  type="checkbox"
                  checked={regexBuilderOptions.ascii}
                  onChange={(event) => {
                    setRegexBuilderOptions((previous) => ({
                      ...previous,
                      ascii: event.target.checked
                    }));
                    setRegexBuilderError(null);
                  }}
                />
                <span>ASCII (printable)</span>
              </label>
            </div>
            <div className="regex-builder-length">
              <span className="length-label">Length</span>
              <label className="radio-field">
                <input
                  type="radio"
                  name="regex-length"
                  value="none"
                  checked={regexBuilderOptions.lengthMode === 'none'}
                  onChange={(event) => {
                    setRegexBuilderOptions((previous) => ({
                      ...previous,
                      lengthMode: event.target.value as 'none' | 'exact' | 'range'
                    }));
                    setRegexBuilderError(null);
                  }}
                />
                <span>Any length</span>
              </label>
              <label className="radio-field">
                <input
                  type="radio"
                  name="regex-length"
                  value="exact"
                  checked={regexBuilderOptions.lengthMode === 'exact'}
                  onChange={(event) => {
                    setRegexBuilderOptions((previous) => ({
                      ...previous,
                      lengthMode: event.target.value as 'none' | 'exact' | 'range'
                    }));
                    setRegexBuilderError(null);
                  }}
                />
                <span>Exact</span>
              </label>
              <input
                type="number"
                aria-label="Exact length"
                min={1}
                disabled={regexBuilderOptions.lengthMode !== 'exact'}
                value={regexBuilderOptions.lengthExact}
                onChange={(event) =>
                  setRegexBuilderOptions((previous) => ({
                    ...previous,
                    lengthExact: event.target.value
                  }))
                }
              />
              <label className="radio-field">
                <input
                  type="radio"
                  name="regex-length"
                  value="range"
                  checked={regexBuilderOptions.lengthMode === 'range'}
                  onChange={(event) => {
                    setRegexBuilderOptions((previous) => ({
                      ...previous,
                      lengthMode: event.target.value as 'none' | 'exact' | 'range'
                    }));
                    setRegexBuilderError(null);
                  }}
                />
                <span>Min/Max</span>
              </label>
              <input
                type="number"
                aria-label="Minimum length"
                min={0}
                disabled={regexBuilderOptions.lengthMode !== 'range'}
                value={regexBuilderOptions.lengthMin}
                onChange={(event) =>
                  setRegexBuilderOptions((previous) => ({
                    ...previous,
                    lengthMin: event.target.value
                  }))
                }
                placeholder="Min"
              />
              <input
                type="number"
                aria-label="Maximum length"
                min={0}
                disabled={regexBuilderOptions.lengthMode !== 'range'}
                value={regexBuilderOptions.lengthMax}
                onChange={(event) =>
                  setRegexBuilderOptions((previous) => ({
                    ...previous,
                    lengthMax: event.target.value
                  }))
                }
                placeholder="Max"
              />
            </div>
            {regexBuilderError && (
              <p className="status error" role="alert">
                {regexBuilderError}
              </p>
            )}
            <div className="regex-builder-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setIsRegexBuilderOpen(false)}
              >
                Close builder
              </button>
              <button type="button" className="primary" onClick={applyRegexBuilder}>
                Apply pattern
              </button>
            </div>
          </div>
        )}
        </>
      ) : (
        <p className="status">No additional constraints available for this type.</p>
      )}
    </div>
  );
};

export const AttributeModal = ({
  attribute,
  onClose,
  onSubmit,
  nameFieldRef,
  showFlags = true
}: AttributeModalProps) => {
  const cloneConstraints = useCallback(
    (constraints: AttributeDraft['constraints']) =>
      constraints.map((constraint) =>
        constraint.type === 'enum' ? { type: 'enum', values: [...constraint.values] } : { ...constraint }
      ),
    []
  );

  const [formState, setFormState] = useState(() => ({
    name: attribute.name,
    type: attribute.type,
    description: attribute.description,
    required: attribute.required,
    unique: attribute.unique,
    constraints: cloneConstraints(attribute.constraints),
    readOnly: attribute.readOnly,
    encrypted: attribute.encrypted,
    private: attribute.private
  }));

  const [elementState, setElementState] = useState<AttributeDraft | null>(() =>
    attribute.element ? cloneAttributeDraft(attribute.element) : null
  );
  const [elementError, setElementError] = useState<string | null>(null);

  useEffect(() => {
    setFormState({
      name: attribute.name,
      type: attribute.type,
      description: attribute.description,
      required: attribute.required,
      unique: attribute.unique,
      constraints: cloneConstraints(attribute.constraints),
      readOnly: attribute.readOnly,
      encrypted: attribute.encrypted,
      private: attribute.private
    });
    setElementState(attribute.element ? cloneAttributeDraft(attribute.element) : null);
    setElementError(null);
  }, [attribute, cloneConstraints]);

  const isArrayType = formState.type.trim().toLowerCase() === 'array';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let element: AttributeDraft | null = null;

    if (isArrayType) {
      if (elementState) {
        const name = elementState.name.trim();
        const type = elementState.type.trim();
        if (!name || !type) {
          setElementError('Array element requires a name and type.');
          return;
        }
        setElementError(null);
        element = cloneAttributeDraft({ ...elementState, name, type });
      }
    }

    onSubmit(attribute.localId, {
      name: formState.name,
      type: formState.type,
      description: formState.description,
      required: formState.required,
      unique: formState.unique,
      constraints: cloneConstraints(formState.constraints),
      readOnly: formState.readOnly,
      encrypted: formState.encrypted,
      private: formState.private,
      element: isArrayType ? element : null
    });
    onClose();
  };

  const modalTitleId = `edit-attribute-title-${attribute.localId}`;
  const modalDescriptionId = `edit-attribute-description-${attribute.localId}`;

  return (
    <div
      className="modal-backdrop attribute-modal-backdrop"
      role="button"
      tabIndex={0}
      aria-label="Dismiss edit attribute dialog"
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
        className="modal attribute-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={modalTitleId}
        aria-describedby={modalDescriptionId}
      >
        <header className="modal-header">
          <h3 id={modalTitleId}>Edit attribute</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close edit attribute dialog">
            ×
          </button>
        </header>
        <p id={modalDescriptionId} className="modal-description">
          Update attribute metadata, validation constraints, and protection flags.
        </p>
        <div className="modal-body">
          <form className="modal-form attribute-modal-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>Name</span>
              <input
                type="text"
                ref={nameFieldRef}
                value={formState.name}
                onChange={(event) =>
                  setFormState((previous) => ({ ...previous, name: event.target.value }))
                }
                required
              />
            </label>
            <label className="field">
              <span>Type</span>
              <select
                value={formState.type}
                onChange={(event) => {
                  const nextType = event.target.value;
                  setFormState((previous) => ({
                    ...previous,
                    type: nextType,
                    constraints: []
                  }));
                  setElementError(null);
                  if (nextType.trim().toLowerCase() !== 'array') {
                    setElementState(null);
                  }
                }}
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
            <div className="field constraint-field">
              <span>Constraints</span>
              <ConstraintEditor
                attributeType={formState.type}
                constraints={formState.constraints}
                onChange={(constraints) =>
                  setFormState((previous) => ({ ...previous, constraints }))
                }
              />
            </div>
            {isArrayType && (
              <div className="field array-element-field">
                <div className="array-element-header">
                  <span>Array elements</span>
                  {elementState ? (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        if (!window.confirm('Remove this array element definition?')) {
                          return;
                        }
                        setElementState(null);
                      }}
                    >
                      Remove element
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setElementState(createEmptyAttributeDraft())}
                    >
                      Define element
                    </button>
                  )}
                </div>
                {elementState ? (
                  <div className="array-element-form">
                    <label className="field">
                      <span>Element name</span>
                      <input
                        type="text"
                        value={elementState.name}
                        onChange={(event) =>
                          setElementState((previous) =>
                            previous ? { ...previous, name: event.target.value } : previous
                          )
                        }
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Element type</span>
                      <select
                        value={elementState.type}
                        onChange={(event) =>
                          setElementState((previous) =>
                            previous
                              ? {
                                  ...previous,
                                  type: event.target.value,
                                  constraints: []
                                }
                              : previous
                          )
                        }
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
                    <div className="field constraint-field">
                      <span>Element constraints</span>
                      <ConstraintEditor
                        attributeType={elementState.type}
                        constraints={elementState.constraints}
                        onChange={(constraints) =>
                          setElementState((previous) =>
                            previous ? { ...previous, constraints } : previous
                          )
                        }
                      />
                    </div>
                    <label className="field">
                      <span>Element description</span>
                      <textarea
                        value={elementState.description}
                        onChange={(event) =>
                          setElementState((previous) =>
                            previous ? { ...previous, description: event.target.value } : previous
                          )
                        }
                        rows={3}
                      />
                    </label>
                    {showFlags && (
                      <>
                        <label className="checkbox-field">
                          <input
                            type="checkbox"
                            checked={elementState.required}
                            onChange={(event) =>
                              setElementState((previous) =>
                                previous ? { ...previous, required: event.target.checked } : previous
                              )
                            }
                          />
                          <span>Required</span>
                        </label>
                        <label className="checkbox-field">
                          <input
                            type="checkbox"
                            checked={elementState.unique}
                            onChange={(event) =>
                              setElementState((previous) =>
                                previous ? { ...previous, unique: event.target.checked } : previous
                              )
                            }
                          />
                          <span>Unique</span>
                        </label>
                        <label className="checkbox-field">
                          <input
                            type="checkbox"
                            checked={elementState.readOnly}
                            onChange={(event) =>
                              setElementState((previous) =>
                                previous ? { ...previous, readOnly: event.target.checked } : previous
                              )
                            }
                          />
                          <span>Read-only</span>
                        </label>
                        <label className="checkbox-field">
                          <input
                            type="checkbox"
                            checked={elementState.encrypted}
                            onChange={(event) =>
                              setElementState((previous) =>
                                previous ? { ...previous, encrypted: event.target.checked } : previous
                              )
                            }
                          />
                          <span>Encrypted</span>
                        </label>
                        <label className="checkbox-field">
                          <input
                            type="checkbox"
                            checked={elementState.private}
                            onChange={(event) =>
                              setElementState((previous) =>
                                previous ? { ...previous, private: event.target.checked } : previous
                              )
                            }
                          />
                          <span>Private</span>
                        </label>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="status">No element definition provided.</p>
                )}
                {elementError && (
                  <p className="status error" role="alert">
                    {elementError}
                  </p>
                )}
              </div>
            )}
            <label className="field">
              <span>Description</span>
              <textarea
                value={formState.description}
                onChange={(event) =>
                  setFormState((previous) => ({ ...previous, description: event.target.value }))
                }
                rows={3}
              />
            </label>
            {showFlags && (
              <>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={formState.required}
                    onChange={(event) =>
                      setFormState((previous) => ({ ...previous, required: event.target.checked }))
                    }
                  />
                  <span>Required</span>
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={formState.unique}
                    onChange={(event) =>
                      setFormState((previous) => ({ ...previous, unique: event.target.checked }))
                    }
                  />
                  <span>Unique</span>
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={formState.readOnly}
                    onChange={(event) =>
                      setFormState((previous) => ({ ...previous, readOnly: event.target.checked }))
                    }
                  />
                  <span>Read-only</span>
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={formState.encrypted}
                    onChange={(event) =>
                      setFormState((previous) => ({ ...previous, encrypted: event.target.checked }))
                    }
                  />
                  <span>Encrypted</span>
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={formState.private}
                    onChange={(event) =>
                      setFormState((previous) => ({ ...previous, private: event.target.checked }))
                    }
                  />
                  <span>Private</span>
                </label>
              </>
            )}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="primary">
                Save attribute
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DataModelDesigner;

