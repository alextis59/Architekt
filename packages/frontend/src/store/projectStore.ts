import { create } from 'zustand';

type ProjectState = {
  selectedProjectId: string | null;
  selectedSystemId: string | null;
  selectedFlowId: string | null;
  selectProject: (projectId: string | null) => void;
  selectSystem: (systemId: string | null) => void;
  selectFlow: (flowId: string | null) => void;
};

export const useProjectStore = create<ProjectState>((set) => ({
  selectedProjectId: null,
  selectedSystemId: null,
  selectedFlowId: null,
  selectProject: (projectId) =>
    set(() => ({
      selectedProjectId: projectId,
      selectedSystemId: null,
      selectedFlowId: null
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
    }))
}));

export const selectSelectedProjectId = (state: ProjectState) => state.selectedProjectId;
export const selectSelectedSystemId = (state: ProjectState) => state.selectedSystemId;
export const selectSelectedFlowId = (state: ProjectState) => state.selectedFlowId;

