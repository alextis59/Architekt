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
  toDataModelPayload
} from './DataModelDesigner.helpers.js';

const TYPE_OPTIONS = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'date'];

const STRING_CONSTRAINTS: AttributeConstraintDraft['type'][] = ['regex', 'minLength', 'maxLength'];
const NUMERIC_CONSTRAINTS: AttributeConstraintDraft['type'][] = ['min', 'max'];

const getConstraintTypesForAttribute = (type: string): AttributeConstraintDraft['type'][] => {
  const normalized = type.trim().toLowerCase();
  if (normalized === 'string') {
    return STRING_CONSTRAINTS;
  }
  if (normalized === 'number' || normalized === 'integer') {
    return NUMERIC_CONSTRAINTS;
  }
  return [];
};

const formatConstraintDisplay = (constraint: AttributeConstraintDraft): string => {
  const value = constraint.value.trim();
  switch (constraint.type) {
    case 'regex':
      return value ? `Regex: ${value}` : 'Regex';
    case 'minLength':
      return value ? `Min length: ${value}` : 'Min length';
    case 'maxLength':
      return value ? `Max length: ${value}` : 'Max length';
    case 'min':
      return value ? `Min: ${value}` : 'Min';
    case 'max':
      return value ? `Max: ${value}` : 'Max';
    default:
      return value || constraint.type;
  }
};

const cloneAttributeDraft = (attribute: AttributeDraft): AttributeDraft => ({
  ...attribute,
  constraints: attribute.constraints.map((constraint) => ({ ...constraint })),
  attributes: attribute.attributes.map(cloneAttributeDraft)
});

const cloneDraft = (draft: DataModelDraft): DataModelDraft => ({
  ...draft,
  attributes: draft.attributes.map(cloneAttributeDraft)
});

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

const findAttributeInList = (
  attributes: AttributeDraft[],
  targetId: string
): AttributeDraft | null => {
  for (const attribute of attributes) {
    if (attribute.localId === targetId) {
      return attribute;
    }

    const nestedMatch = findAttributeInList(attribute.attributes, targetId);
    if (nestedMatch) {
      return nestedMatch;
    }
  }

  return null;
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
  const [expandedAttributeIds, setExpandedAttributeIds] = useState<Set<string>>(() => new Set());
  const [activeAttributeId, setActiveAttributeId] = useState<string | null>(null);
  const [pendingAutoSave, setPendingAutoSave] = useState(false);
  const previousDraftStateRef = useRef<{ draft: DataModelDraft | null; isDirty: boolean } | null>(null);

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
      return;
    }

    setDraft(createDataModelDraft(project.dataModels[selectedDataModelId]));
    setIsDirty(false);
    setExpandedAttributeIds(new Set());
    setActiveAttributeId(null);
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
      setExpandedAttributeIds(new Set());
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
    setPendingAutoSave(true);
  };

  const handleRemoveAttribute = (attributeId: string) => {
    const attributeToRemove = draft ? findAttributeInList(draft.attributes, attributeId) : null;
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

type AttributeItemProps = {
  attribute: AttributeDraft;
  depth: number;
  expandedAttributeIds: Set<string>;
  onToggle: (attributeId: string) => void;
  onEdit: (attributeId: string) => void;
  onAddChild: (parentId: string) => void;
  onRemove: (attributeId: string) => void;
};

const AttributeItem = ({
  attribute,
  depth,
  expandedAttributeIds,
  onToggle,
  onEdit,
  onAddChild,
  onRemove
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
            <div className="attribute-detail attribute-detail-description">
              <dt>Description</dt>
              <dd>{displayDescription}</dd>
            </div>
            <div className="attribute-detail">
              <dt>Flags</dt>
              <dd>
                <div className="attribute-flags">
                  <span className={clsx('attribute-flag', { active: attribute.required })}>Required</span>
                  <span className={clsx('attribute-flag', { active: attribute.unique })}>Unique</span>
                  <span className={clsx('attribute-flag', { active: attribute.readOnly })}>
                    Read-only
                  </span>
                  <span className={clsx('attribute-flag', { active: attribute.encrypted })}>
                    Encrypted
                  </span>
                </div>
              </dd>
            </div>
          </dl>
          <div className="attribute-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => onAddChild(attribute.localId)}
              disabled={!canNest}
            >
              Add sub-attribute
            </button>
            <button type="button" className="secondary" onClick={() => onEdit(attribute.localId)}>
              Edit attribute
            </button>
            <button type="button" className="danger" onClick={() => onRemove(attribute.localId)}>
              Remove
            </button>
          </div>
          {attribute.attributes.length > 0 && (
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

type AttributeModalProps = {
  attribute: AttributeDraft;
  onClose: () => void;
  onSubmit: (attributeId: string, updates: Partial<AttributeDraft>) => void;
  nameFieldRef: RefObject<HTMLInputElement>;
};

const AttributeModal = ({ attribute, onClose, onSubmit, nameFieldRef }: AttributeModalProps) => {
  const cloneConstraints = useCallback(
    (constraints: AttributeDraft['constraints']) => constraints.map((constraint) => ({ ...constraint })),
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
    encrypted: attribute.encrypted
  }));

  const [constraintDraft, setConstraintDraft] = useState<{
    type: AttributeConstraintDraft['type'] | '';
    value: string;
  }>({ type: '', value: '' });

  const [constraintError, setConstraintError] = useState<string | null>(null);

  useEffect(() => {
    setFormState({
      name: attribute.name,
      type: attribute.type,
      description: attribute.description,
      required: attribute.required,
      unique: attribute.unique,
      constraints: cloneConstraints(attribute.constraints),
      readOnly: attribute.readOnly,
      encrypted: attribute.encrypted
    });
  }, [attribute, cloneConstraints]);

  const constraintTypes = useMemo(
    () => getConstraintTypesForAttribute(formState.type),
    [formState.type]
  );

  const availableConstraintTypes = useMemo(
    () =>
      constraintTypes.filter(
        (type) => !formState.constraints.some((constraint) => constraint.type === type)
      ),
    [constraintTypes, formState.constraints]
  );

  useEffect(() => {
    setConstraintDraft((previous) => {
      const nextType = previous.type && availableConstraintTypes.includes(previous.type)
        ? previous.type
        : availableConstraintTypes[0] ?? '';
      return { type: nextType, value: '' };
    });
    setConstraintError(null);
  }, [availableConstraintTypes]);

  const removeConstraint = (typeToRemove: AttributeConstraintDraft['type']) => {
    setFormState((previous) => ({
      ...previous,
      constraints: previous.constraints.filter((constraint) => constraint.type !== typeToRemove)
    }));
    setConstraintError(null);
  };

  const handleAddConstraint = () => {
    if (!constraintDraft.type) {
      setConstraintError('Select a constraint type.');
      return;
    }

    const trimmedValue = constraintDraft.value.trim();
    if (!trimmedValue) {
      setConstraintError('Enter a constraint value.');
      return;
    }

    if (constraintDraft.type === 'regex') {
      setFormState((previous) => ({
        ...previous,
        constraints: [...previous.constraints, { type: 'regex', value: trimmedValue }]
      }));
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
      setFormState((previous) => ({
        ...previous,
        constraints: [...previous.constraints, { type: constraintDraft.type, value: String(integer) }]
      }));
      setConstraintDraft((previous) => ({ ...previous, value: '' }));
      setConstraintError(null);
      return;
    }

    setFormState((previous) => ({
      ...previous,
      constraints: [...previous.constraints, { type: constraintDraft.type, value: String(numeric) }]
    }));
    setConstraintDraft((previous) => ({ ...previous, value: '' }));
    setConstraintError(null);
  };

  const constraintValueInputType =
    !constraintDraft.type || constraintDraft.type === 'regex' ? 'text' : 'number';
  const constraintValueStep =
    constraintDraft.type === 'minLength' || constraintDraft.type === 'maxLength'
      ? 1
      : constraintDraft.type === 'min' || constraintDraft.type === 'max'
      ? 'any'
      : undefined;
  const constraintPlaceholder =
    constraintDraft.type === 'regex'
      ? 'Pattern, e.g. ^[A-Z]+$'
      : constraintDraft.type
      ? 'Value'
      : 'Select a constraint';

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(attribute.localId, {
      name: formState.name,
      type: formState.type,
      description: formState.description,
      required: formState.required,
      unique: formState.unique,
      constraints: cloneConstraints(formState.constraints),
      readOnly: formState.readOnly,
      encrypted: formState.encrypted
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
                setConstraintDraft({ type: '', value: '' });
                setConstraintError(null);
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
            <div className="constraint-editor">
              {formState.constraints.length > 0 ? (
                <ul className="constraint-list">
                  {formState.constraints.map((constraint) => (
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
                  <button
                    type="button"
                    className="secondary"
                    onClick={handleAddConstraint}
                    disabled={!constraintDraft.type}
                  >
                    Add constraint
                  </button>
                </div>
              ) : (
                <p className="status">No additional constraints available for this type.</p>
              )}
            </div>
          </div>
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
  );
};

export default DataModelDesigner;

