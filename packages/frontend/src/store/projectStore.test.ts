import { describe, expect, it } from 'vitest';
import { useProjectStore } from './projectStore.js';

describe('project store', () => {
  it('resets dependent selections when project changes', () => {
    const { selectProject, selectSystem, selectFlow, selectDataModel, selectComponent } = useProjectStore.getState();

    selectSystem('system-1');
    selectFlow('flow-1');
    selectDataModel('data-1');
    selectComponent('component-1');

    selectProject('project-1');
    expect(useProjectStore.getState()).toMatchObject({
      selectedProjectId: 'project-1',
      selectedSystemId: null,
      selectedFlowId: null,
      selectedDataModelId: null,
      selectedComponentId: null
    });

    selectProject(null);
    expect(useProjectStore.getState()).toMatchObject({
      selectedProjectId: null,
      selectedSystemId: null,
      selectedFlowId: null,
      selectedDataModelId: null,
      selectedComponentId: null
    });
  });

  it('updates individual selections without affecting others', () => {
    const store = useProjectStore.getState();
    store.selectProject('project-1');
    store.selectSystem('system-1');
    store.selectFlow('flow-1');
    store.selectDataModel('data-1');
    store.selectComponent('component-1');

    expect(useProjectStore.getState()).toMatchObject({
      selectedProjectId: 'project-1',
      selectedSystemId: 'system-1',
      selectedFlowId: 'flow-1',
      selectedDataModelId: 'data-1',
      selectedComponentId: 'component-1'
    });
  });
});
