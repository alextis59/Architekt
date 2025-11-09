import { create } from 'zustand';

type ProjectState = {
  selectedProjectId: string | null;
  selectedSystemId: string | null;
  selectProject: (projectId: string | null) => void;
  selectSystem: (systemId: string | null) => void;
};

export const useProjectStore = create<ProjectState>((set) => ({
  selectedProjectId: null,
  selectedSystemId: null,
  selectProject: (projectId) =>
    set(() => ({
      selectedProjectId: projectId,
      selectedSystemId: null
    })),
  selectSystem: (systemId) =>
    set((state) => ({
      ...state,
      selectedSystemId: systemId
    }))
}));

export const selectSelectedProjectId = (state: ProjectState) => state.selectedProjectId;
export const selectSelectedSystemId = (state: ProjectState) => state.selectedSystemId;

