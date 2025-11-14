import { create } from 'zustand';

type ProjectState = {
  selectedProjectId: string | null;
  selectedSystemId: string | null;
  selectedFlowId: string | null;
  selectedDataModelId: string | null;
  selectedComponentId: string | null;
  selectProject: (projectId: string | null) => void;
  selectSystem: (systemId: string | null) => void;
  selectFlow: (flowId: string | null) => void;
  selectDataModel: (dataModelId: string | null) => void;
  selectComponent: (componentId: string | null) => void;
};

export const useProjectStore = create<ProjectState>((set) => ({
  selectedProjectId: null,
  selectedSystemId: null,
  selectedFlowId: null,
  selectedDataModelId: null,
  selectedComponentId: null,
  selectProject: (projectId) =>
    set(() => ({
      selectedProjectId: projectId,
      selectedSystemId: null,
      selectedFlowId: null,
      selectedDataModelId: null,
      selectedComponentId: null
    })),
  selectSystem: (systemId) =>
    set((state) => ({
      ...state,
      selectedSystemId: systemId
    })),
  selectFlow: (flowId) =>
    set((state) => ({
      ...state,
      selectedFlowId: flowId
    })),
  selectDataModel: (dataModelId) =>
    set((state) => ({
      ...state,
      selectedDataModelId: dataModelId
    })),
  selectComponent: (componentId) =>
    set((state) => ({
      ...state,
      selectedComponentId: componentId
    }))
}));

export const selectSelectedProjectId = (state: ProjectState) => state.selectedProjectId;
export const selectSelectedSystemId = (state: ProjectState) => state.selectedSystemId;
export const selectSelectedFlowId = (state: ProjectState) => state.selectedFlowId;
export const selectSelectedDataModelId = (state: ProjectState) => state.selectedDataModelId;
export const selectSelectedComponentId = (state: ProjectState) => state.selectedComponentId;

